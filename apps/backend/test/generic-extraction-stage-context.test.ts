import type { DiscoveredDocumentSchema, GenericDocumentValues } from "@docella/schemas";
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";
import type { DocumentLayoutResult } from "../src/document-layout/document-layout-types.js";
import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import { createGenericDocumentExtractionService } from "../src/generic-extraction/generic-extraction-service.js";

const environment = parseEnvironment({
  FRONTEND_ORIGIN: "http://localhost:5173",
  GROQ_API_KEY: "test-secret",
});

const layout: DocumentLayoutResult = {
  content: "Invoice INV-1001",
  contentUnit: "page",
  contentUnitCount: 1,
  paragraphs: [],
  provider: "pdfjs",
  sourceFormat: "pdf",
  tables: [],
};

const documentSchema = {
  documentType: "invoice",
  documentTypeLabel: "Invoice",
  language: "en",
  schemaVersion: 1,
  sections: [
    {
      description: "Invoice header.",
      fields: [
        {
          description: "Invoice number.",
          id: "invoice_number",
          label: "Invoice number",
          repeatable: false,
          required: true,
          valueType: "identifier",
        },
      ],
      id: "header",
      label: "Header",
    },
  ],
  tables: [],
  title: "Invoice INV-1001",
} as const satisfies DiscoveredDocumentSchema;

const values = {
  fields: { invoice_number: "INV-1001" },
  tables: {},
} as const satisfies GenericDocumentValues;

const providerFailure = (): AppError =>
  new AppError({
    cause: { status: 400 },
    code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
    logCause: false,
    message: "The extraction provider rejected the request.",
    safeLogContext: {
      providerHttpStatus: 400,
      providerModel: "openai/gpt-oss-20b",
    },
    status: 502,
  });

const extractionRequest = {
  bytes: new Uint8Array(Buffer.from("%PDF-1.7")),
  filename: "invoice.pdf",
  mediaType: "application/pdf",
  sourceFormat: "pdf" as const,
};

describe("generic extraction stage context", () => {
  it("tags schema-discovery provider failures", async () => {
    const service = createGenericDocumentExtractionService({
      environment,
      groundingService: {
        ground: () => {
          throw new Error("grounding should not run");
        },
      },
      layoutService: { analyze: async () => layout },
      schemaDiscoverer: {
        discover: async () => {
          throw providerFailure();
        },
      },
      valueExtractor: { extract: async () => values },
    });

    await expect(service.extract(extractionRequest)).rejects.toMatchObject({
      code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      safeLogContext: {
        genericExtractionStage: "discovery",
        providerHttpStatus: 400,
        providerModel: "openai/gpt-oss-20b",
      },
    });
  });

  it("tags value-extraction provider failures", async () => {
    const service = createGenericDocumentExtractionService({
      environment,
      groundingService: {
        ground: () => {
          throw new Error("grounding should not run");
        },
      },
      layoutService: { analyze: async () => layout },
      schemaDiscoverer: { discover: async () => documentSchema },
      valueExtractor: {
        extract: async () => {
          throw providerFailure();
        },
      },
    });

    await expect(service.extract(extractionRequest)).rejects.toMatchObject({
      code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      safeLogContext: {
        genericExtractionStage: "extraction",
        providerHttpStatus: 400,
        providerModel: "openai/gpt-oss-20b",
      },
    });
  });
});
