import { describe, expect, it } from "vitest";

import {
  GENERIC_DOCUMENT_MAX_BYTES,
  validateGenericDocumentFile,
} from "../src/features/generic-extraction/generic-document-file";

describe("generic document file validation", () => {
  it.each([
    [new File(["%PDF-1.7\ncontent"], "report.pdf", { type: "application/pdf" }), true],
    [
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "scan.png", {
        type: "image/png",
      }),
      true,
    ],
    [new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "form.docx"), true],
    [new File(["<!doctype html><html><body>Report</body></html>"], "report.html"), true],
  ])("accepts supported document signatures", async (file, expected) => {
    await expect(validateGenericDocumentFile(file)).resolves.toMatchObject({ valid: expected });
  });

  it("rejects unsupported extensions, empty files, spoofed signatures, and oversized files", async () => {
    await expect(validateGenericDocumentFile(new File(["text"], "notes.txt"))).resolves.toMatchObject({
      valid: false,
    });
    await expect(validateGenericDocumentFile(new File([], "empty.pdf"))).resolves.toMatchObject({
      valid: false,
    });
    await expect(
      validateGenericDocumentFile(
        new File(["not a pdf"], "spoofed.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toMatchObject({ valid: false });
    await expect(
      validateGenericDocumentFile(
        new File([new Uint8Array(GENERIC_DOCUMENT_MAX_BYTES + 1)], "large.pdf", {
          type: "application/pdf",
        }),
      ),
    ).resolves.toMatchObject({ valid: false });
  });
});
