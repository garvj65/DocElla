import { describe, expect, it } from "vitest";

import { validatePdfFile } from "../src/features/extraction/pdf-file-validation";

const pdf = (content: string, name = "document.pdf", type = "application/pdf") =>
  new File([content], name, { type });

describe("PDF file validation", () => {
  it("accepts valid PDFs and uppercase extensions", async () => {
    await expect(validatePdfFile([pdf("%PDF-1.7 body")])).resolves.toEqual({ valid: true });
    await expect(validatePdfFile([pdf("%PDF-1.7 body", "DOCUMENT.PDF")])).resolves.toEqual({
      valid: true,
    });
  });

  it("rejects empty, oversized, wrong type, wrong extension, and invalid signatures", async () => {
    await expect(validatePdfFile([pdf("")])).resolves.toMatchObject({ code: "FILE_EMPTY" });
    await expect(
      validatePdfFile([pdf("%PDF-1.7", "large.pdf")], { maxBytes: 2 }),
    ).resolves.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
    await expect(validatePdfFile([pdf("%PDF-1.7", "document.txt")])).resolves.toMatchObject({
      code: "FILE_TYPE_INVALID",
    });
    await expect(
      validatePdfFile([pdf("%PDF-1.7", "document.pdf", "text/plain")]),
    ).resolves.toMatchObject({
      code: "FILE_TYPE_INVALID",
    });
    await expect(validatePdfFile([pdf("not a pdf")])).resolves.toMatchObject({
      code: "FILE_SIGNATURE_INVALID",
    });
  });

  it("checks for the PDF marker only inside the first 1024 bytes", async () => {
    await expect(validatePdfFile([pdf(`${"x".repeat(1019)}%PDF-body`)])).resolves.toEqual({
      valid: true,
    });
    await expect(validatePdfFile([pdf(`${"x".repeat(1024)}%PDF-body`)])).resolves.toMatchObject({
      code: "FILE_SIGNATURE_INVALID",
    });
  });
});
