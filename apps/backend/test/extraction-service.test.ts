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

const validValues = Object.fromEntries(definition.fields.map((field) => [field.key, null]));

const groundingSummary = {
  confidence: 0,
  fields: Object.fromEntries(
    definition.fields.map((field) => [
      field.key,
      { confidence: 0, matchType: "none", status: "missing" },
    ]),
  ),
  missingFields: definition.fields.length,
  needsReviewFields: 0,
  requiredMissingFields: definition.fields.filter((field) => field.required).length,
  reviewRequired: true,
  verifiedFields: 0,
  warnings: [],
} as const;

describe("document extraction service", () => {
  it("calls PDF parsing, structured extraction, and grounding once with validated values", async () => {
    const pdfText = "Alex Morgan\nalex@example.test";
    const pdfTextExtractor = {
      extract: vi.fn(async () => ({ characterCount: pdfText.length, pageCount: 1, text: pdfText })),
    };
    const structuredExtractor = {
      extract: vi.fn(async () => validValues),
    };
    const groundingService = {
      ground: vi.fn(() => groundingSummary),
    };
    const service = createDocumentExtractionService({
      environment: testEnvironment,
      groundingService,
      pdfTextExtractor,
      structuredExtractor,
    });

    const result = await service.extract({
      documentDefinition: definition,
      pdfBytes: new Uint8Array([1, 2, 3]),
    });

    expect(pdfTextExtractor.extract).toHaveBeenCalledTimes(1);
    expect(structuredExtractor.extract).toHaveBeenCalledTimes(1);
    expect(groundingService.ground).toHaveBeenCalledTimes(1);
    expect(groundingService.ground).toHaveBeenCalledWith({
      documentDefinition: definition,
      documentText: pdfText,
      values: validValues,
    });
    expect(result.review).toBe(groundingSummary.fields);
    expect(result.values).toBe(validValues);
  });

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
      const groundingService = {
        ground: vi.fn(() => groundingSummary),
      };
      const service = createDocumentExtractionService({
        environment: testEnvironment,
        groundingService,
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
      expect(groundingService.ground).not.toHaveBeenCalled();
    }
  });

  it("does not ground after provider failure", async () => {
    const providerError = new AppError({
      code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      message: "The extraction provider is unavailable.",
      status: 503,
    });
    const groundingService = { ground: vi.fn(() => groundingSummary) };
    const service = createDocumentExtractionService({
      environment: testEnvironment,
      groundingService,
      pdfTextExtractor: {
        extract: async () => ({ characterCount: 4, pageCount: 1, text: "text" }),
      },
      structuredExtractor: {
        extract: async () => {
          throw providerError;
        },
      },
    });

    await expect(
      service.extract({ documentDefinition: definition, pdfBytes: new Uint8Array() }),
    ).rejects.toBe(providerError);
    expect(groundingService.ground).not.toHaveBeenCalled();
  });

  it("prevents stale responses when cancelled before or after grounding", async () => {
    const beforeGrounding = new AbortController();
    const firstService = createDocumentExtractionService({
      environment: testEnvironment,
      groundingService: { ground: vi.fn(() => groundingSummary) },
      pdfTextExtractor: {
        extract: async () => ({ characterCount: 4, pageCount: 1, text: "text" }),
      },
      structuredExtractor: {
        extract: async () => {
          beforeGrounding.abort();
          return validValues;
        },
      },
    });

    await expect(
      firstService.extract({
        documentDefinition: definition,
        pdfBytes: new Uint8Array(),
        signal: beforeGrounding.signal,
      }),
    ).rejects.toBeInstanceOf(ExtractionAbortedError);

    const afterGrounding = new AbortController();
    const secondService = createDocumentExtractionService({
      environment: testEnvironment,
      groundingService: {
        ground: () => {
          afterGrounding.abort();
          return groundingSummary;
        },
      },
      pdfTextExtractor: {
        extract: async () => ({ characterCount: 4, pageCount: 1, text: "text" }),
      },
      structuredExtractor: { extract: async () => validValues },
    });

    await expect(
      secondService.extract({
        documentDefinition: definition,
        pdfBytes: new Uint8Array(),
        signal: afterGrounding.signal,
      }),
    ).rejects.toBeInstanceOf(ExtractionAbortedError);
  });
});
