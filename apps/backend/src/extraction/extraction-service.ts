import type { Environment } from "../config/environment.js";
import { EXTRACTION_LIMITS } from "../config/extraction-limits.js";
import { ExtractionAbortedError } from "../errors/extraction-aborted-error.js";
import type { GroundingService } from "../grounding/grounding-types.js";
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
  readonly groundingService: GroundingService;
}

export const createDocumentExtractionService = ({
  environment,
  groundingService,
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
    if (signal?.aborted) {
      throw new ExtractionAbortedError();
    }

    const grounding = groundingService.ground({
      documentDefinition,
      documentText: pdfText.text,
      values,
    });
    if (signal?.aborted) {
      throw new ExtractionAbortedError();
    }

    return {
      confidence: grounding.confidence,
      documentVersion: documentDefinition.version,
      extractedCharacters: pdfText.characterCount,
      missingFields: grounding.missingFields,
      model: environment.groqModel,
      needsReviewFields: grounding.needsReviewFields,
      pageCount: pdfText.pageCount,
      requiredMissingFields: grounding.requiredMissingFields,
      review: grounding.fields,
      reviewRequired: grounding.reviewRequired,
      schemaType: documentDefinition.id,
      values,
      verifiedFields: grounding.verifiedFields,
      warnings: grounding.warnings,
    };
  },
});
