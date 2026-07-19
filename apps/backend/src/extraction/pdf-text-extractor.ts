import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { EXTRACTION_LIMITS } from "../config/extraction-limits.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import type {
  PdfTextExtractionOptions,
  PdfTextExtractionResult,
  PdfTextExtractor,
} from "./extraction-types.js";

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

const destroyQuietly = async (
  loadingTask: PDFDocumentLoadingTask | undefined,
  pdf: PDFDocumentProxy | undefined,
): Promise<void> => {
  try {
    await pdf?.cleanup();
  } finally {
    void loadingTask?.destroy();
  }
};

const timeoutError = (): AppError =>
  new AppError({
    code: ERROR_CODES.PDF_PARSE_TIMEOUT,
    message: "The PDF could not be parsed before the timeout.",
    status: 422,
  });

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(timeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error("PDF parsing failed."));
      },
    );
  });

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

export const createPdfTextExtractor = (): PdfTextExtractor => ({
  extract: async (
    pdfBytes: Uint8Array,
    {
      maxInputCharacters,
      maxPages = EXTRACTION_LIMITS.maxPages,
      minExtractedNonWhitespaceCharacters = EXTRACTION_LIMITS.minExtractedNonWhitespaceCharacters,
      timeoutMs = EXTRACTION_LIMITS.pdfParseTimeoutMs,
    }: PdfTextExtractionOptions,
  ): Promise<PdfTextExtractionResult> => {
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let pdf: PDFDocumentProxy | undefined;

    const parse = async (): Promise<PdfTextExtractionResult> => {
      loadingTask = getDocument({ data: new Uint8Array(pdfBytes) });
      pdf = await loadingTask.promise;

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
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
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

    try {
      return await withTimeout(parse(), timeoutMs);
    } catch (error) {
      throw mapPdfError(error);
    } finally {
      await destroyQuietly(loadingTask, pdf);
    }
  },
});
