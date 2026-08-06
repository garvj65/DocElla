export const GENERIC_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const GENERIC_DOCUMENT_ACCEPT = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".docx",
  ".xlsx",
  ".pptx",
  ".html",
  ".htm",
].join(",");

const supportedExtensions = new Set(GENERIC_DOCUMENT_ACCEPT.split(","));

export interface GenericDocumentFileValidation {
  readonly message?: string;
  readonly valid: boolean;
}

const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLocaleLowerCase();
};

const hasBytes = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  expected.every((value, index) => bytes[index] === value);

const signatureMatches = async (file: File, extension: string): Promise<boolean> => {
  const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  switch (extension) {
    case ".pdf":
      return new TextDecoder("latin1").decode(bytes).includes("%PDF-");
    case ".jpg":
    case ".jpeg":
      return hasBytes(bytes, [0xff, 0xd8, 0xff]);
    case ".png":
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case ".bmp":
      return hasBytes(bytes, [0x42, 0x4d]);
    case ".tif":
    case ".tiff":
      return hasBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) || hasBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
    case ".heic":
    case ".heif":
      return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
    case ".docx":
    case ".xlsx":
    case ".pptx":
      return hasBytes(bytes, [0x50, 0x4b]);
    case ".html":
    case ".htm": {
      const start = new TextDecoder().decode(bytes).trimStart().toLocaleLowerCase();
      return (
        start.startsWith("<!doctype html") ||
        start.startsWith("<html") ||
        /<(?:head|body|main|article|section)(?:\s|>)/u.test(start)
      );
    }
    default:
      return false;
  }
};

export const validateGenericDocumentFile = async (
  file: File,
): Promise<GenericDocumentFileValidation> => {
  const extension = extensionOf(file.name);
  if (!supportedExtensions.has(extension)) {
    return {
      message: "Choose a PDF, image, DOCX, XLSX, PPTX, or HTML document.",
      valid: false,
    };
  }
  if (file.size < 1) {
    return { message: "The selected document is empty.", valid: false };
  }
  if (file.size > GENERIC_DOCUMENT_MAX_BYTES) {
    return { message: "The selected document exceeds the 10 MiB limit.", valid: false };
  }

  try {
    if (!(await signatureMatches(file, extension))) {
      return {
        message: "The document content does not match its file extension.",
        valid: false,
      };
    }
  } catch {
    return { message: "The selected document could not be read.", valid: false };
  }

  return { valid: true };
};
