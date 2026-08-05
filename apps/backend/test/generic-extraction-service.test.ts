import type {
  DiscoveredDocumentSchema,
  GenericDocumentExtractionResult,
  GenericDocumentValues,
} from "@docella/schemas";
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";
import type {
  DocumentLayoutResult,
  DocumentLayoutService,
} from "../src/document-layout/document-layout-types.js";
import { ExtractionAbortedError } from "../src/errors/extraction-aborted-error.js";
import { createGenericDocumentExtractionService } from "../src/generic-extraction/generic-extraction-service.js";
import type {
  GenericGroundingService,
  GenericSchemaDiscoverer,
  GenericValueExtractor,
} from "../src/generic-extraction/generic-extraction-types.js";

const environment = parseEnvironment({
  FRONTEND_ORIGIN: "http://localhost:5173",
  GROQ_API_KEY: "test-secret",
  GROQ_MAX_INPUT_CHARACTERS: "1000",
});

const layout: DocumentLayoutResult = {
  content: "A".repeat(1001),
  contentUnit: "page",
  contentUnitCount: 1,
  paragraphs: [],
  provider: "pdfjs",
  sourceFormat: "pdf",
  tables: [],
};

const documentSchema = {
  documentType: "report",
  documentTypeLabel: "Report",
  language: "en",
  schemaVersion: 1,
  sections: [
    {
      description: "Report fields.",
      fields: [
        {
          description: "Report title.",
          id: "report_title",
          label: "Report title",
          repeatable: false,
          required: true,
          valueType: "text",
        },
      ],
      id: "summary",
      label: "Summary",
    },
  ],
  tables: [],
  title: "Quarterly report",
} as const satisfies DiscoveredDocumentSchema;

const values = {
  fields: { report_title: "Quarterly report" },
  tables: {},
} as const satisfies GenericDocumentValues;

const finalResult = {
  confidence: 1,
  document: {
    contentUnit: "page",
    contentUnitCount: 1,
    detectedType: "report",
    language: "en",
    sourceFormat: "pdf",
    title: "Quarterly report",
  },
  review: {
    fields: {
      report_title: {
        confidence: 1,
        evidence: [
          {
            location: { kind: "page", pageNumber: 1 },
            text: "Quarterly report",
          },
        ],
        status: "verified",
      },
    },
    tables: {},
  },
  reviewRequired: false,
  schema: documentSchema,
  values,
  warnings: [],
} as const satisfies GenericDocumentExtractionResult;

describe("createGenericDocumentExtractionService", () => {
  it("orchestrates layout, discovery, extraction, and grounding in order", async () => {
    const order: string[] = [];
    const layoutService: DocumentLayoutService = {
      analyze: async (request) => {
        order.push("layout");
        expect(request.sourceFormat).toBe("pdf");
        return layout;
      },
    };
    const schemaDiscoverer: GenericSchemaDiscoverer = {
      discover: async (request) => {
        order.push("discovery");
        expect(request.layout).toBe(layout);
        return documentSchema;
      },
    };
    const valueExtractor: GenericValueExtractor = {
      extract: async (request) => {
        order.push("values");
        expect(request.documentSchema).toBe(documentSchema);
        return values;
      },
    };
    const groundingService: GenericGroundingService = {
      ground: (request) => {
        order.push("grounding");
        expect(request.inputTruncated).toBe(true);
        expect(request.values).toBe(values);
        return finalResult;
      },
    };

    const service = createGenericDocumentExtractionService({
      environment,
      groundingService,
      layoutService,
      schemaDiscoverer,
      valueExtractor,
    });

    await expect(
      service.extract({
        bytes: new Uint8Array(Buffer.from("%PDF-1.7")),
        filename: "report.pdf",
        mediaType: "application/pdf",
        sourceFormat: "pdf",
      }),
    ).resolves.toBe(finalResult);
    expect(order).toEqual(["layout", "discovery", "values", "grounding"]);
  });

  it("stops before processing when the caller already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    let layoutCalled = false;
    const service = createGenericDocumentExtractionService({
      environment,
      groundingService: { ground: () => finalResult },
      layoutService: {
        analyze: async () => {
          layoutCalled = true;
          return layout;
        },
      },
      schemaDiscoverer: { discover: async () => documentSchema },
      valueExtractor: { extract: async () => values },
    });

    await expect(
      service.extract({
        bytes: new Uint8Array(Buffer.from("%PDF-1.7")),
        filename: "report.pdf",
        mediaType: "application/pdf",
        signal: controller.signal,
        sourceFormat: "pdf",
      }),
    ).rejects.toBeInstanceOf(ExtractionAbortedError);
    expect(layoutCalled).toBe(false);
  });
});
