import { EXTRACTION_LIMITS } from "../config/extraction-limits.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { createPdfTextExtractor } from "../extraction/pdf-text-extractor.js";
import type { PdfTextExtractor } from "../extraction/extraction-types.js";
import {
  DOCUMENT_LAYOUT_LIMITS,
  type DocumentLayoutProvider,
  type DocumentLayoutRequest,
  type DocumentLayoutResult,
} from "./document-layout-types.js";

export interface PdfDocumentLayoutProviderOptions {
  readonly pdfTextExtractor?: PdfTextExtractor;
}

export const createPdfDocumentLayoutProvider = ({
  pdfTextExtractor = createPdfTextExtractor(),
}: PdfDocumentLayoutProviderOptions = {}): DocumentLayoutProvider => ({
  analyze: async (request: DocumentLayoutRequest): Promise<DocumentLayoutResult> => {
    if (request.sourceFormat !== "pdf") {
      throw new AppError({
        code: ERROR_CODES.DOCUMENT_FORMAT_UNSUPPORTED,
        message: "The local layout provider supports PDF documents only.",
        status: 415,
      });
    }

    const extracted = await pdfTextExtractor.extract(request.bytes, {
      maxInputCharacters: DOCUMENT_LAYOUT_LIMITS.maxContentCharacters,
      maxPages: EXTRACTION_LIMITS.maxPages,
      minExtractedNonWhitespaceCharacters: EXTRACTION_LIMITS.minExtractedNonWhitespaceCharacters,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      timeoutMs: EXTRACTION_LIMITS.pdfParseTimeoutMs,
    });

    return {
      content: extracted.text,
      contentUnit: "page",
      contentUnitCount: extracted.pageCount,
      paragraphs: [
        {
          content: extracted.text,
          regions: [{ location: { kind: "page", pageNumber: 1 } }],
          spans: [{ length: extracted.text.length, offset: 0 }],
        },
      ],
      provider: "pdfjs",
      sourceFormat: "pdf",
      tables: [],
    };
  },
});
