import { getDocumentDefinition } from "@docella/schemas";
import { describe, expect, it, vi } from "vitest";

import { createDocumentExtractionService } from "../src/extraction/extraction-service.js";
import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import { ExtractionAbortedError } from "../src/errors/extraction-aborted-error.js";
import { testEnvironment } from "./support/create-test-app.js";

const definition = getDocumentDefinition("job-application");
if (definition === undefined) {
  throw new Error("Missing job application schema.");
}

describe("document extraction service", () => {
  it("does not call the structured extractor after PDF timeout or cancellation", async () => {
    for (const error of [
      new AppError({
        code: ERROR_CODES.PDF_PARSE_TIMEOUT,
        message: "The PDF could not be parsed before the timeout.",
        status: 422,
      }),
      new ExtractionAbortedError(),
    ]) {
      const structuredExtractor = {
        extract: vi.fn(async () => ({})),
      };
      const service = createDocumentExtractionService({
        environment: testEnvironment,
        pdfTextExtractor: {
          extract: async () => {
            throw error;
          },
        },
        structuredExtractor,
      });

      await expect(
        service.extract({
          documentDefinition: definition,
          pdfBytes: new Uint8Array(),
          signal: new AbortController().signal,
        }),
      ).rejects.toBe(error);
      expect(structuredExtractor.extract).not.toHaveBeenCalled();
    }
  });
});
