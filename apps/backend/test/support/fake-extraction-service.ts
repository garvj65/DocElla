import type { FieldReviewMap } from "@docella/schemas";

import type {
  DocumentExtractionResult,
  DocumentExtractionService,
} from "../../src/extraction/extraction-types.js";

export interface FakeExtractionService extends DocumentExtractionService {
  readonly calls: readonly Uint8Array[];
  readonly signals: readonly (AbortSignal | undefined)[];
}

export const createFakeExtractionService = (
  result: Partial<Omit<DocumentExtractionResult, "documentVersion" | "schemaType">> &
    Pick<DocumentExtractionResult, "extractedCharacters" | "model" | "pageCount" | "values">,
): FakeExtractionService => {
  const calls: Uint8Array[] = [];
  const signals: (AbortSignal | undefined)[] = [];

  return {
    calls,
    signals,
    extract: async ({ documentDefinition, pdfBytes, signal }) => {
      calls.push(pdfBytes);
      signals.push(signal);
      const review =
        result.review ??
        Object.fromEntries(
          documentDefinition.fields.map((field) => [
            field.key,
            { confidence: 0, matchType: "none", status: "missing" },
          ]),
        );
      return {
        confidence: result.confidence ?? 0,
        ...result,
        documentVersion: documentDefinition.version,
        missingFields: result.missingFields ?? documentDefinition.fields.length,
        needsReviewFields: result.needsReviewFields ?? 0,
        requiredMissingFields: result.requiredMissingFields ?? 0,
        review: review as FieldReviewMap,
        reviewRequired: result.reviewRequired ?? false,
        schemaType: documentDefinition.id,
        verifiedFields: result.verifiedFields ?? 0,
        warnings: result.warnings ?? [],
      };
    },
  };
};
