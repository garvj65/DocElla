import type { Environment } from "../config/environment.js";
import { EXTRACTION_LIMITS } from "../config/extraction-limits.js";
import type {
  DocumentExtractionRequest,
  DocumentExtractionResult,
  DocumentExtractionService,
  PdfTextExtractor,
  StructuredExtractor,
} from "./extraction-types.js";

export interface CreateDocumentExtractionServiceOptions {
  readonly environment: Environment;
  readonly pdfTextExtractor: PdfTextExtractor;
  readonly structuredExtractor: StructuredExtractor;
}

export const createDocumentExtractionService = ({
  environment,
  pdfTextExtractor,
  structuredExtractor,
}: CreateDocumentExtractionServiceOptions): DocumentExtractionService => ({
  extract: async ({
    documentDefinition,
    pdfBytes,
    signal,
  }: DocumentExtractionRequest): Promise<DocumentExtractionResult> => {
    const pdfOptions =
      signal === undefined
        ? {
            maxInputCharacters: environment.groqMaxInputCharacters,
            maxPages: EXTRACTION_LIMITS.maxPages,
            minExtractedNonWhitespaceCharacters:
              EXTRACTION_LIMITS.minExtractedNonWhitespaceCharacters,
            timeoutMs: EXTRACTION_LIMITS.pdfParseTimeoutMs,
          }
        : {
            maxInputCharacters: environment.groqMaxInputCharacters,
            maxPages: EXTRACTION_LIMITS.maxPages,
            minExtractedNonWhitespaceCharacters:
              EXTRACTION_LIMITS.minExtractedNonWhitespaceCharacters,
            signal,
            timeoutMs: EXTRACTION_LIMITS.pdfParseTimeoutMs,
          };
    const pdfText = await pdfTextExtractor.extract(pdfBytes, pdfOptions);
    const structuredRequest =
      signal === undefined
        ? {
            documentDefinition,
            documentText: pdfText.text,
          }
        : {
            documentDefinition,
            documentText: pdfText.text,
            signal,
          };
    const values = await structuredExtractor.extract(structuredRequest);

    return {
      documentVersion: documentDefinition.version,
      extractedCharacters: pdfText.characterCount,
      model: environment.groqModel,
      pageCount: pdfText.pageCount,
      schemaType: documentDefinition.id,
      values,
    };
  },
});
