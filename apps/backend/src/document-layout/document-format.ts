import { extname } from "node:path";

import type { GenericSourceFormat } from "@docella/schemas";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { DOCUMENT_LAYOUT_LIMITS, type ValidatedDocumentInput } from "./document-layout-types.js";

const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;

interface FormatDefinition {
  readonly extensions: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly sourceFormat: GenericSourceFormat;
  readonly validateSignature: (bytes: Uint8Array) => boolean;
}

interface OpenXmlPackageInfo {
  readonly entryNames: ReadonlySet<string>;
}

const invalidSignature = (): AppError =>
  new AppError({
    code: ERROR_CODES.DOCUMENT_SIGNATURE_INVALID,
    message: "The uploaded file content does not match its declared document type.",
    status: 422,
  });

const unsupportedFormat = (): AppError =>
  new AppError({
    code: ERROR_CODES.DOCUMENT_FORMAT_UNSUPPORTED,
    message: "This document format is not supported.",
    status: 415,
  });

const hasBytes = (bytes: Uint8Array, offset: number, expected: readonly number[]): boolean =>
  expected.every((value, index) => bytes[offset + index] === value);

const hasPdfSignature = (bytes: Uint8Array): boolean =>
  Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-");

const hasJpegSignature = (bytes: Uint8Array): boolean => hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
const hasPngSignature = (bytes: Uint8Array): boolean =>
  hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const hasBmpSignature = (bytes: Uint8Array): boolean => hasBytes(bytes, 0, [0x42, 0x4d]);
const hasTiffSignature = (bytes: Uint8Array): boolean =>
  hasBytes(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || hasBytes(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a]);

const hasHeifSignature = (bytes: Uint8Array): boolean => {
  if (bytes.length < 12 || Buffer.from(bytes.subarray(4, 8)).toString("ascii") !== "ftyp") {
    return false;
  }

  const brand = Buffer.from(bytes.subarray(8, 12)).toString("ascii");
  return new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]).has(brand);
};

const decodeUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
};

const hasHtmlSignature = (bytes: Uint8Array): boolean => {
  if (bytes.length > DOCUMENT_LAYOUT_LIMITS.maxHtmlCharacters * 4) {
    return false;
  }

  const decoded = decodeUtf8(bytes);
  if (decoded === undefined || decoded.length > DOCUMENT_LAYOUT_LIMITS.maxHtmlCharacters) {
    return false;
  }

  const start = decoded
    .replace(/^\uFEFF/u, "")
    .trimStart()
    .slice(0, 4_096)
    .toLocaleLowerCase();
  return (
    start.startsWith("<!doctype html") ||
    start.startsWith("<html") ||
    /<(?:head|body|main|article|section)(?:\s|>)/u.test(start)
  );
};

const findEndOfCentralDirectory = (bytes: Uint8Array): number => {
  const minimumOffset = Math.max(
    0,
    bytes.length - ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES - ZIP_MAX_COMMENT_BYTES,
  );

  for (
    let offset = bytes.length - ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (
      Buffer.from(bytes.buffer, bytes.byteOffset + offset, 4).readUInt32LE(0) ===
      ZIP_END_OF_CENTRAL_DIRECTORY
    ) {
      return offset;
    }
  }

  return -1;
};

const isUnsafeArchivePath = (entryName: string): boolean => {
  const normalized = entryName.replace(/\\/gu, "/");
  return (
    normalized.includes("\u0000") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  );
};

export const inspectOpenXmlPackage = (bytes: Uint8Array): OpenXmlPackageInfo => {
  if (
    bytes.length > DOCUMENT_LAYOUT_LIMITS.maxOfficePackageBytes ||
    !hasBytes(bytes, 0, [0x50, 0x4b])
  ) {
    throw invalidSignature();
  }

  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) {
    throw invalidSignature();
  }

  const endRecord = Buffer.from(
    bytes.buffer,
    bytes.byteOffset + endOffset,
    bytes.length - endOffset,
  );
  const entryCount = endRecord.readUInt16LE(10);
  const centralDirectorySize = endRecord.readUInt32LE(12);
  const centralDirectoryOffset = endRecord.readUInt32LE(16);

  if (
    entryCount < 1 ||
    entryCount > DOCUMENT_LAYOUT_LIMITS.maxOfficeEntries ||
    centralDirectoryOffset + centralDirectorySize > bytes.length ||
    centralDirectoryOffset >= endOffset
  ) {
    throw invalidSignature();
  }

  const entryNames = new Set<string>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset) {
      throw invalidSignature();
    }

    const header = Buffer.from(bytes.buffer, bytes.byteOffset + offset, endOffset - offset);
    if (header.readUInt32LE(0) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER) {
      throw invalidSignature();
    }

    const filenameLength = header.readUInt16LE(28);
    const extraLength = header.readUInt16LE(30);
    const commentLength = header.readUInt16LE(32);
    const nextOffset = offset + 46 + filenameLength + extraLength + commentLength;

    if (
      filenameLength < 1 ||
      filenameLength > DOCUMENT_LAYOUT_LIMITS.maxOfficeEntryNameBytes ||
      nextOffset > endOffset
    ) {
      throw invalidSignature();
    }

    const filenameBytes = bytes.subarray(offset + 46, offset + 46 + filenameLength);
    const entryName = decodeUtf8(filenameBytes);
    if (entryName === undefined || isUnsafeArchivePath(entryName)) {
      throw invalidSignature();
    }

    entryNames.add(entryName.replace(/\\/gu, "/"));
    offset = nextOffset;
  }

  if (
    entryNames.has("word/vbaProject.bin") ||
    entryNames.has("xl/vbaProject.bin") ||
    entryNames.has("ppt/vbaProject.bin")
  ) {
    throw unsupportedFormat();
  }

  return { entryNames };
};

const openXmlValidator =
  (requiredEntry: string) =>
  (bytes: Uint8Array): boolean => {
    try {
      const packageInfo = inspectOpenXmlPackage(bytes);
      return (
        packageInfo.entryNames.has("[Content_Types].xml") &&
        packageInfo.entryNames.has(requiredEntry)
      );
    } catch {
      return false;
    }
  };

const formats: readonly FormatDefinition[] = [
  {
    extensions: [".pdf"],
    mediaTypes: ["application/pdf", "application/octet-stream"],
    sourceFormat: "pdf",
    validateSignature: hasPdfSignature,
  },
  {
    extensions: [".jpg", ".jpeg"],
    mediaTypes: ["image/jpeg", "application/octet-stream"],
    sourceFormat: "image",
    validateSignature: hasJpegSignature,
  },
  {
    extensions: [".png"],
    mediaTypes: ["image/png", "application/octet-stream"],
    sourceFormat: "image",
    validateSignature: hasPngSignature,
  },
  {
    extensions: [".bmp"],
    mediaTypes: ["image/bmp", "image/x-ms-bmp", "application/octet-stream"],
    sourceFormat: "image",
    validateSignature: hasBmpSignature,
  },
  {
    extensions: [".tif", ".tiff"],
    mediaTypes: ["image/tiff", "application/octet-stream"],
    sourceFormat: "image",
    validateSignature: hasTiffSignature,
  },
  {
    extensions: [".heic", ".heif"],
    mediaTypes: ["image/heic", "image/heif", "application/octet-stream"],
    sourceFormat: "image",
    validateSignature: hasHeifSignature,
  },
  {
    extensions: [".docx"],
    mediaTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ],
    sourceFormat: "docx",
    validateSignature: openXmlValidator("word/document.xml"),
  },
  {
    extensions: [".xlsx"],
    mediaTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ],
    sourceFormat: "xlsx",
    validateSignature: openXmlValidator("xl/workbook.xml"),
  },
  {
    extensions: [".pptx"],
    mediaTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/octet-stream",
    ],
    sourceFormat: "pptx",
    validateSignature: openXmlValidator("ppt/presentation.xml"),
  },
  {
    extensions: [".html", ".htm"],
    mediaTypes: ["text/html", "application/xhtml+xml", "application/octet-stream"],
    sourceFormat: "html",
    validateSignature: hasHtmlSignature,
  },
];

const validateFilename = (filename: string): string => {
  const trimmed = filename.trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 255 ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    /[\u0000-\u001F\u007F]/u.test(trimmed)
  ) {
    throw unsupportedFormat();
  }
  return trimmed;
};

export const validateDocumentInput = (input: {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mediaType: string;
}): ValidatedDocumentInput => {
  if (input.bytes.length < 1 || input.bytes.length > DOCUMENT_LAYOUT_LIMITS.maxFileBytes) {
    throw new AppError({
      code: ERROR_CODES.UPLOAD_TOO_LARGE,
      message: "The uploaded document exceeds the size limit.",
      status: 413,
    });
  }

  const filename = validateFilename(input.filename);
  const extension = extname(filename).toLocaleLowerCase();
  const mediaType = input.mediaType.toLocaleLowerCase().split(";", 1)[0]?.trim() ?? "";
  const format = formats.find((candidate) => candidate.extensions.includes(extension));

  if (format === undefined || !format.mediaTypes.includes(mediaType)) {
    throw unsupportedFormat();
  }
  if (!format.validateSignature(input.bytes)) {
    throw invalidSignature();
  }

  return {
    bytes: new Uint8Array(input.bytes),
    filename,
    mediaType,
    sourceFormat: format.sourceFormat,
  };
};
