import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import {
  inspectOpenXmlPackage,
  validateDocumentInput,
} from "../src/document-layout/document-format.js";

const uint16 = (value: number): Buffer => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};

const uint32 = (value: number): Buffer => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};

const createOpenXmlPackage = (entryNames: readonly string[]): Uint8Array => {
  const localPrefix = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const centralEntries = entryNames.map((entryName) => {
    const filename = Buffer.from(entryName, "utf8");
    return Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      Buffer.alloc(24),
      uint16(filename.length),
      uint16(0),
      uint16(0),
      Buffer.alloc(12),
      filename,
    ]);
  });
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    uint16(0),
    uint16(0),
    uint16(entryNames.length),
    uint16(entryNames.length),
    uint32(centralDirectory.length),
    uint32(localPrefix.length),
    uint16(0),
  ]);
  return new Uint8Array(Buffer.concat([localPrefix, centralDirectory, end]));
};

const expectCode = (operation: () => unknown, code: string): void => {
  try {
    operation();
    throw new Error("Expected validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
};

describe("validateDocumentInput", () => {
  it.each([
    ["sample.pdf", "application/pdf", Buffer.from("%PDF-1.7\ncontent"), "pdf"],
    ["sample.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image"],
    [
      "sample.png",
      "image/png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image",
    ],
    ["sample.bmp", "image/bmp", Buffer.from("BMcontent"), "image"],
    ["sample.tiff", "image/tiff", Buffer.from([0x49, 0x49, 0x2a, 0x00]), "image"],
    [
      "sample.heic",
      "image/heic",
      Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
      "image",
    ],
    [
      "sample.html",
      "text/html",
      Buffer.from("<!doctype html><html><body>Data</body></html>"),
      "html",
    ],
  ])("accepts %s using content signatures", (filename, mediaType, bytes, sourceFormat) => {
    expect(validateDocumentInput({ bytes, filename, mediaType }).sourceFormat).toBe(sourceFormat);
  });

  it.each([
    [
      "sample.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "word/document.xml",
      "docx",
    ],
    [
      "sample.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "xl/workbook.xml",
      "xlsx",
    ],
    [
      "sample.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "ppt/presentation.xml",
      "pptx",
    ],
  ])(
    "accepts structurally valid %s packages",
    (filename, mediaType, requiredEntry, sourceFormat) => {
      const bytes = createOpenXmlPackage(["[Content_Types].xml", requiredEntry]);
      expect(validateDocumentInput({ bytes, filename, mediaType }).sourceFormat).toBe(sourceFormat);
    },
  );

  it("rejects extension, MIME, and content mismatches", () => {
    expectCode(
      () =>
        validateDocumentInput({
          bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          filename: "spoofed.pdf",
          mediaType: "application/pdf",
        }),
      ERROR_CODES.DOCUMENT_SIGNATURE_INVALID,
    );
    expectCode(
      () =>
        validateDocumentInput({
          bytes: Buffer.from("%PDF-1.7"),
          filename: "sample.pdf",
          mediaType: "image/png",
        }),
      ERROR_CODES.DOCUMENT_FORMAT_UNSUPPORTED,
    );
    expectCode(
      () =>
        validateDocumentInput({
          bytes: Buffer.from("plain text"),
          filename: "sample.txt",
          mediaType: "text/plain",
        }),
      ERROR_CODES.DOCUMENT_FORMAT_UNSUPPORTED,
    );
  });

  it("rejects unsafe filenames and invalid UTF-8 HTML", () => {
    expectCode(
      () =>
        validateDocumentInput({
          bytes: Buffer.from("<!doctype html>"),
          filename: "../sample.html",
          mediaType: "text/html",
        }),
      ERROR_CODES.DOCUMENT_FORMAT_UNSUPPORTED,
    );
    expectCode(
      () =>
        validateDocumentInput({
          bytes: Buffer.from([0xff, 0xfe, 0xfd]),
          filename: "sample.html",
          mediaType: "text/html",
        }),
      ERROR_CODES.DOCUMENT_SIGNATURE_INVALID,
    );
  });
});

describe("inspectOpenXmlPackage", () => {
  it("returns central-directory entry names without extracting files", () => {
    const packageInfo = inspectOpenXmlPackage(
      createOpenXmlPackage(["[Content_Types].xml", "word/document.xml"]),
    );
    expect([...packageInfo.entryNames]).toEqual(["[Content_Types].xml", "word/document.xml"]);
  });

  it("rejects traversal entries and macro-enabled packages", () => {
    expectCode(
      () => inspectOpenXmlPackage(createOpenXmlPackage(["[Content_Types].xml", "../secret"])),
      ERROR_CODES.DOCUMENT_SIGNATURE_INVALID,
    );
    expectCode(
      () =>
        inspectOpenXmlPackage(
          createOpenXmlPackage(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]),
        ),
      ERROR_CODES.DOCUMENT_FORMAT_UNSUPPORTED,
    );
  });
});
