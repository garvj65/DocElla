import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createPdfTextExtractor } from "../src/extraction/pdf-text-extractor.js";
import { AppError } from "../src/errors/app-error.js";
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
});
