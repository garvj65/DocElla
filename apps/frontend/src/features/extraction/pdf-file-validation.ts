export const maxFileBytes = 10 * 1024 * 1024;

export type PdfFileValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code:
        | "FILE_REQUIRED"
        | "FILE_EMPTY"
        | "FILE_TOO_LARGE"
        | "FILE_TYPE_INVALID"
        | "FILE_SIGNATURE_INVALID";
      readonly message: string;
    };

const invalid = (
  code: Exclude<PdfFileValidationResult, { readonly valid: true }>["code"],
  message: string,
): PdfFileValidationResult => ({ code, message, valid: false });

export const validatePdfFile = async (
  files: readonly File[],
  options: { readonly maxBytes?: number } = {},
): Promise<PdfFileValidationResult> => {
  if (files.length !== 1 || files[0] === undefined) {
    return invalid("FILE_REQUIRED", "Choose one PDF file to extract.");
  }

  const file = files[0];
  const limit = options.maxBytes ?? maxFileBytes;

  if (file.size === 0) {
    return invalid("FILE_EMPTY", "The selected PDF is empty.");
  }

  if (file.size > limit) {
    return invalid("FILE_TOO_LARGE", "The PDF is larger than the 10 MiB upload limit.");
  }

  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return invalid("FILE_TYPE_INVALID", "Choose a file saved as a PDF.");
  }

  const headerBytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const marker = [37, 80, 68, 70, 45];
  const hasPdfMarker = headerBytes.some((_, index) =>
    marker.every((byte, markerIndex) => headerBytes[index + markerIndex] === byte),
  );

  if (!hasPdfMarker) {
    return invalid("FILE_SIGNATURE_INVALID", "The selected file could not be read as a valid PDF.");
  }

  return { valid: true };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(bytes / 1024)))} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};
