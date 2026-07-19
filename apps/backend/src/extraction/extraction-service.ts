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
  }: DocumentExtractionRequest): Promise<DocumentExtractionResult> => {
    const pdfText = await pdfTextExtractor.extract(pdfBytes, {
      maxInputCharacters: environment.groqMaxInputCharacters,
      maxPages: EXTRACTION_LIMITS.maxPages,
      minExtractedNonWhitespaceCharacters: EXTRACTION_LIMITS.minExtractedNonWhitespaceCharacters,
      timeoutMs: EXTRACTION_LIMITS.pdfParseTimeoutMs,
    });
    const values = await structuredExtractor.extract({
      documentDefinition,
      documentText: pdfText.text,
    });

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
