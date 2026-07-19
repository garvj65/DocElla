import type {
  DocumentExtractionResult,
  DocumentExtractionService,
} from "../../src/extraction/extraction-types.js";

export interface FakeExtractionService extends DocumentExtractionService {
  readonly calls: readonly Uint8Array[];
  readonly signals: readonly (AbortSignal | undefined)[];
}

export const createFakeExtractionService = (
  result: Omit<DocumentExtractionResult, "documentVersion" | "schemaType">,
): FakeExtractionService => {
  const calls: Uint8Array[] = [];
  const signals: (AbortSignal | undefined)[] = [];

  return {
    calls,
    signals,
    extract: async ({ documentDefinition, pdfBytes, signal }) => {
      calls.push(pdfBytes);
      signals.push(signal);
      return {
        ...result,
        documentVersion: documentDefinition.version,
        schemaType: documentDefinition.id,
      };
    },
  };
};
