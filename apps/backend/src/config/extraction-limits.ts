export const EXTRACTION_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 1,
  maxTextFields: 1,
  maxParts: 2,
  maxPages: 50,
  minExtractedNonWhitespaceCharacters: 20,
  pdfParseTimeoutMs: 15_000,
} as const;

export type ExtractionLimits = typeof EXTRACTION_LIMITS;
