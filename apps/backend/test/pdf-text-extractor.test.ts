import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createPdfTextExtractor } from "../src/extraction/pdf-text-extractor.js";
import type {
  PdfDocumentProxyLike,
  PdfLoadingTaskLike,
} from "../src/extraction/pdf-text-extractor.js";
import { AppError } from "../src/errors/app-error.js";
import { ExtractionAbortedError } from "../src/errors/extraction-aborted-error.js";
import { createTestPdf } from "./support/create-test-pdf.js";

const extractor = createPdfTextExtractor();

const expectPdfError = async (input: Promise<unknown>, code: string): Promise<void> => {
  await expect(input).rejects.toMatchObject({ code });
};

describe("PDF text extractor", () => {
  it("extracts text and returns page and character counts", async () => {
    const result = await extractor.extract(await createTestPdf(), {
      maxInputCharacters: 30_000,
    });

    expect(result.text).toContain("Alex Morgan");
    expect(result.text).toContain("alex@example.test");
    expect(result.pageCount).toBe(1);
    expect(result.characterCount).toBe(result.text.length);
  });

  it("preserves page order with readable page boundaries", async () => {
    const result = await extractor.extract(
      await createTestPdf(["First page text", "Second page text"]),
      {
        maxInputCharacters: 30_000,
      },
    );

    expect(result.pageCount).toBe(2);
    expect(result.text.indexOf("First page text")).toBeLessThan(
      result.text.indexOf("Second page text"),
    );
    expect(result.text).toContain("--- Page 2 ---");
  });

  it("rejects blank, corrupted, over-page, and over-text PDFs", async () => {
    const blank = await PDFDocument.create();
    blank.addPage([612, 792]);

    await expectPdfError(
      extractor.extract(Buffer.from(await blank.save()), { maxInputCharacters: 30_000 }),
      "PDF_NO_EXTRACTABLE_TEXT",
    );
    await expectPdfError(
      extractor.extract(Buffer.from("not a pdf"), { maxInputCharacters: 30_000 }),
      "PDF_INVALID",
    );
    await expectPdfError(
      extractor.extract(await createTestPdf(["one", "two"]), {
        maxInputCharacters: 30_000,
        maxPages: 1,
      }),
      "PDF_PAGE_LIMIT_EXCEEDED",
    );
    await expectPdfError(
      extractor.extract(await createTestPdf(["Alex Morgan ".repeat(50)]), {
        maxInputCharacters: 40,
      }),
      "PDF_TEXT_LIMIT_EXCEEDED",
    );
  });

  it("maps timeout without leaking parser internals", async () => {
    try {
      await extractor.extract(await createTestPdf(), {
        maxInputCharacters: 30_000,
        timeoutMs: 1,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("PDF_PARSE_TIMEOUT");
      expect((error as AppError).message).not.toContain("pdfjs");
    }
  });

  it("awaits loading-task destruction on timeout and avoids late rejections", async () => {
    let destroyCompleted = false;
    let destroyResolve: (() => void) | undefined;
    let rejectLoading: ((error: Error) => void) | undefined;
    const loadingTask: PdfLoadingTaskLike = {
      destroy: async () => {
        await new Promise<void>((resolve) => {
          destroyResolve = resolve;
          setImmediate(resolve);
        });
        destroyCompleted = true;
        rejectLoading?.(new Error("destroyed"));
      },
      promise: new Promise((_resolve, reject) => {
        rejectLoading = reject;
      }),
    };
    const timedExtractor = createPdfTextExtractor({
      loadDocument: () => loadingTask,
    });

    await expect(
      timedExtractor.extract(Buffer.from("%PDF-1.7"), {
        maxInputCharacters: 30_000,
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: "PDF_PARSE_TIMEOUT" });

    destroyResolve?.();
    expect(destroyCompleted).toBe(true);
  });

  it("destroys the loading task on abort and stops before processing more pages", async () => {
    const controller = new AbortController();
    let destroyCalled = false;
    let processedPages = 0;
    const pdf: PdfDocumentProxyLike = {
      cleanup: async () => undefined,
      getPage: async () => {
        processedPages += 1;
        controller.abort();
        return {
          getTextContent: async () => ({
            items: [{ str: "Alex Morgan" }],
          }),
        };
      },
      numPages: 2,
    };
    const loadingTask: PdfLoadingTaskLike = {
      destroy: async () => {
        destroyCalled = true;
      },
      promise: Promise.resolve(pdf),
    };
    const abortingExtractor = createPdfTextExtractor({ loadDocument: () => loadingTask });

    await expect(
      abortingExtractor.extract(Buffer.from("%PDF-1.7"), {
        maxInputCharacters: 30_000,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ExtractionAbortedError);

    expect(destroyCalled).toBe(true);
    expect(processedPages).toBe(1);
  });

  it("cleans up PDF resources on success and failure", async () => {
    let successCleanup = false;
    const successExtractor = createPdfTextExtractor({
      loadDocument: () => ({
        destroy: async () => undefined,
        promise: Promise.resolve({
          cleanup: async () => {
            successCleanup = true;
          },
          getPage: async () => ({
            getTextContent: async () => ({
              items: [{ str: "Alex Morgan alex@example.test Product Analyst" }],
            }),
          }),
          numPages: 1,
        }),
      }),
    });

    await successExtractor.extract(Buffer.from("%PDF-1.7"), { maxInputCharacters: 30_000 });
    expect(successCleanup).toBe(true);

    let failureCleanup = false;
    const failureExtractor = createPdfTextExtractor({
      loadDocument: () => ({
        destroy: async () => undefined,
        promise: Promise.resolve({
          cleanup: async () => {
            failureCleanup = true;
          },
          getPage: async () => ({
            getTextContent: async () => ({
              items: [{ str: "" }],
            }),
          }),
          numPages: 1,
        }),
      }),
    });

    await expect(
      failureExtractor.extract(Buffer.from("%PDF-1.7"), { maxInputCharacters: 30_000 }),
    ).rejects.toMatchObject({ code: "PDF_NO_EXTRACTABLE_TEXT" });
    expect(failureCleanup).toBe(true);
  });
});
