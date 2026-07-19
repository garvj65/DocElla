import {
  getDocument,
  InvalidPDFException,
  PasswordException,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { EXTRACTION_LIMITS } from "../config/extraction-limits.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { ExtractionAbortedError } from "../errors/extraction-aborted-error.js";
import type {
  PdfTextExtractionOptions,
  PdfTextExtractionResult,
  PdfTextExtractor,
} from "./extraction-types.js";

interface PdfTextContent {
  readonly items: readonly unknown[];
}

interface PdfPageProxy {
  readonly getTextContent: () => Promise<PdfTextContent>;
}

export interface PdfDocumentProxyLike {
  readonly numPages: number;
  readonly cleanup: () => unknown;
  readonly getPage: (pageNumber: number) => Promise<PdfPageProxy>;
}

export interface PdfLoadingTaskLike {
  readonly promise: Promise<PdfDocumentProxyLike>;
  readonly destroy: () => unknown;
}

export interface CreatePdfTextExtractorOptions {
  readonly loadDocument?: (pdfBytes: Uint8Array) => PdfLoadingTaskLike;
}

const nullCharactersPattern = new RegExp(String.fromCharCode(0), "g");
const harmfulControlCharactersPattern = new RegExp(
  `[${String.fromCharCode(
    ...[
      1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
      29, 30, 31, 127,
    ],
  )}]`,
  "g",
);

const normalizeText = (value: string): string =>
  value
    .replace(nullCharactersPattern, "")
    .replace(harmfulControlCharactersPattern, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

interface PdfTextItem {
  readonly str?: unknown;
}

const textItemValue = (item: unknown): string => {
  const value = (item as PdfTextItem).str;
  return typeof value === "string" ? value : "";
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ExtractionAbortedError();
  }
};

const timeoutError = (): AppError =>
  new AppError({
    code: ERROR_CODES.PDF_PARSE_TIMEOUT,
    message: "The PDF could not be parsed before the timeout.",
    status: 422,
  });

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("PDF cleanup failed.");

const mapPdfError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof PasswordException) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.PDF_PASSWORD_PROTECTED,
      message: "Password-protected PDFs are not supported.",
      status: 422,
    });
  }

  if (error instanceof InvalidPDFException) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.PDF_INVALID,
      message: "The uploaded file is not a valid text-based PDF.",
      status: 422,
    });
  }

  return new AppError({
    cause: error,
    code: ERROR_CODES.PDF_INVALID,
    message: "The uploaded file is not a valid text-based PDF.",
    status: 422,
  });
};

const defaultLoadDocument = (pdfBytes: Uint8Array): PdfLoadingTaskLike =>
  getDocument({ data: pdfBytes });

const cleanupPdf = async (
  loadingTask: PdfLoadingTaskLike | undefined,
  pdf: PdfDocumentProxyLike | undefined,
  forceDestroyLoadingTask: boolean,
): Promise<void> => {
  await pdf?.cleanup();

  if (forceDestroyLoadingTask) {
    await loadingTask?.destroy();
  }
};

export const createPdfTextExtractor = ({
  loadDocument = defaultLoadDocument,
}: CreatePdfTextExtractorOptions = {}): PdfTextExtractor => ({
  extract: async (
    pdfBytes: Uint8Array,
    {
      maxInputCharacters,
      maxPages = EXTRACTION_LIMITS.maxPages,
      minExtractedNonWhitespaceCharacters = EXTRACTION_LIMITS.minExtractedNonWhitespaceCharacters,
      signal,
      timeoutMs = EXTRACTION_LIMITS.pdfParseTimeoutMs,
    }: PdfTextExtractionOptions,
  ): Promise<PdfTextExtractionResult> => {
    throwIfAborted(signal);

    let loadingTask: PdfLoadingTaskLike | undefined;
    let pdf: PdfDocumentProxyLike | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let primaryError: unknown;
    let cleanupError: Error | undefined;
    let result: PdfTextExtractionResult | undefined;
    let errorToThrow: Error | undefined;
    let forceDestroyLoadingTask = false;
    let abortDestroyPromise: Promise<void> | undefined;

    const destroyLoadingTask = async (): Promise<void> => {
      await loadingTask?.destroy();
    };

    const requestLoadingTaskDestroy = (): void => {
      abortDestroyPromise = destroyLoadingTask().catch((error: unknown) => {
        cleanupError = toError(error);
      });
    };

    const abortListener = (): void => {
      forceDestroyLoadingTask = true;
      requestLoadingTaskDestroy();
    };

    const parse = async (): Promise<PdfTextExtractionResult> => {
      loadingTask = loadDocument(new Uint8Array(pdfBytes));
      signal?.addEventListener("abort", abortListener, { once: true });
      pdf = await loadingTask.promise;

      throwIfAborted(signal);

      if (pdf.numPages < 1) {
        throw new AppError({
          code: ERROR_CODES.PDF_NO_EXTRACTABLE_TEXT,
          message: "The PDF has no extractable text. OCR is not supported.",
          status: 422,
        });
      }

      if (pdf.numPages > maxPages) {
        throw new AppError({
          code: ERROR_CODES.PDF_PAGE_LIMIT_EXCEEDED,
          details: { maxPages },
          message: "The PDF exceeds the page limit.",
          status: 422,
        });
      }

      const pageTexts: string[] = [];
      let characterCount = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        throwIfAborted(signal);
        const page = await pdf.getPage(pageNumber);
        throwIfAborted(signal);
        const content = await page.getTextContent();
        throwIfAborted(signal);
        const text = normalizeText(content.items.map(textItemValue).filter(Boolean).join(" "));
        const pageText = text.length > 0 ? text : "";
        const nextText =
          pageTexts.length === 0
            ? pageText
            : `\n\n--- Page ${String(pageNumber)} ---\n\n${pageText}`;

        characterCount += nextText.length;

        if (characterCount > maxInputCharacters) {
          throw new AppError({
            code: ERROR_CODES.PDF_TEXT_LIMIT_EXCEEDED,
            details: { maxCharacters: maxInputCharacters },
            message: "The PDF contains more extractable text than allowed.",
            status: 422,
          });
        }

        pageTexts.push(nextText);
      }

      throwIfAborted(signal);
      const text = normalizeText(pageTexts.join(""));
      const nonWhitespaceCharacters = text.replace(/\s/g, "").length;

      if (nonWhitespaceCharacters < minExtractedNonWhitespaceCharacters) {
        throw new AppError({
          code: ERROR_CODES.PDF_NO_EXTRACTABLE_TEXT,
          message: "The PDF has no extractable text. OCR is not supported.",
          status: 422,
        });
      }

      return {
        characterCount: text.length,
        pageCount: pdf.numPages,
        text,
      };
    };

    const parsePromise = parse();
    const observedParsePromise = parsePromise.then(
      () => undefined,
      (error: unknown) => error,
    );
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        forceDestroyLoadingTask = true;
        requestLoadingTaskDestroy();
        reject(timeoutError());
      }, timeoutMs);
    });
    const abortPromise = new Promise<never>((_resolve, reject) => {
      if (signal === undefined) {
        return;
      }

      const rejectOnAbort = (): void => {
        reject(new ExtractionAbortedError());
      };
      signal.addEventListener("abort", rejectOnAbort, { once: true });
      void observedParsePromise.then(() => {
        signal.removeEventListener("abort", rejectOnAbort);
      });
    });

    try {
      result = await Promise.race([parsePromise, timeoutPromise, abortPromise]);
    } catch (error) {
      primaryError = error;
      if (error instanceof ExtractionAbortedError) {
        errorToThrow = error;
      } else {
        errorToThrow = mapPdfError(error);
      }
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      signal?.removeEventListener("abort", abortListener);

      try {
        await abortDestroyPromise;
        await observedParsePromise;
        await cleanupPdf(loadingTask, pdf, forceDestroyLoadingTask);
      } catch (error) {
        cleanupError = toError(error);
      }
    }

    if (errorToThrow !== undefined) {
      throw errorToThrow;
    }

    if (cleanupError !== undefined && primaryError === undefined) {
      throw cleanupError;
    }

    if (result === undefined) {
      throw new AppError({
        code: ERROR_CODES.PDF_INVALID,
        message: "The uploaded file is not a valid text-based PDF.",
        status: 422,
      });
    }

    return result;
  },
});
