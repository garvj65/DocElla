import type {
  DocumentExtractionResult,
  DocumentExtractionService,
} from "../../src/extraction/extraction-types.js";

export interface FakeExtractionService extends DocumentExtractionService {
  readonly calls: readonly Uint8Array[];
}

export const createFakeExtractionService = (
  result: Omit<DocumentExtractionResult, "documentVersion" | "schemaType">,
): FakeExtractionService => {
  const calls: Uint8Array[] = [];

  return {
    calls,
    extract: async ({ documentDefinition, pdfBytes }) => {
      calls.push(pdfBytes);
      return {
        ...result,
        documentVersion: documentDefinition.version,
        schemaType: documentDefinition.id,
      };
    },
  };
};
