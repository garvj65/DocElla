import express from "express";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { requestContext } from "../src/middleware/request-context.js";
import { createGenericExtractRouter } from "../src/routes/extract-generic.js";
import type { GenericDocumentExtractionService } from "../src/generic-extraction/generic-extraction-types.js";

const environment = parseEnvironment({
  EXTRACT_RATE_LIMIT_MAX: "10",
  EXTRACT_RATE_LIMIT_WINDOW_MS: "60000",
  FRONTEND_ORIGIN: "http://localhost:5173",
  GROQ_API_KEY: "test-secret",
});
const logger = pino({ enabled: false });

const result = {
  confidence: 0.95,
  document: {
    contentUnit: "page" as const,
    contentUnitCount: 1,
    detectedType: "receipt",
    language: "en",
    sourceFormat: "pdf" as const,
    title: "Receipt R-1001",
  },
  review: {
    fields: {
      receipt_number: {
        confidence: 0.95,
        evidence: [
          {
            location: { kind: "page" as const, pageNumber: 1 },
            text: "Receipt R-1001",
          },
        ],
        status: "verified" as const,
      },
    },
    tables: {},
  },
  reviewRequired: false,
  schema: {
    documentType: "receipt",
    documentTypeLabel: "Receipt",
    language: "en",
    schemaVersion: 1 as const,
    sections: [
      {
        description: "Receipt details.",
        fields: [
          {
            description: "Receipt number.",
            id: "receipt_number",
            label: "Receipt number",
            repeatable: false,
            required: true,
            valueType: "identifier" as const,
          },
        ],
        id: "details",
        label: "Details",
      },
    ],
    tables: [],
    title: "Receipt R-1001",
  },
  values: { fields: { receipt_number: "R-1001" }, tables: {} },
  warnings: [],
};

const createApp = (service: GenericDocumentExtractionService) => {
  const app = express();
  app.use(requestContext);
  app.use(
    "/api/documents/extract",
    createGenericExtractRouter({ environment, extractionService: service, logger }),
  );
  app.use(errorHandler(logger));
  return app;
};

describe("POST /api/documents/extract", () => {
  it("returns a validated structured result without raw source content", async () => {
    let receivedBytes = 0;
    const service: GenericDocumentExtractionService = {
      extract: async (input) => {
        receivedBytes = input.bytes.length;
        expect(input.filename).toBe("receipt.pdf");
        expect(input.sourceFormat).toBe("pdf");
        return result;
      },
    };

    const response = await request(createApp(service))
      .post("/api/documents/extract")
      .attach("file", Buffer.from("%PDF-1.7\nReceipt R-1001"), {
        contentType: "application/pdf",
        filename: "receipt.pdf",
      });

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(receivedBytes).toBeGreaterThan(0);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(result);
    expect(response.body.meta).toMatchObject({
      contentUnitCount: 1,
      documentType: "receipt",
      fieldCount: 1,
      reviewRequired: false,
      sourceFormat: "pdf",
      tableCount: 0,
    });
    expect(JSON.stringify(response.body)).not.toContain("%PDF-1.7");
  });

  it("rejects spoofed files before invoking extraction", async () => {
    let called = false;
    const service: GenericDocumentExtractionService = {
      extract: async () => {
        called = true;
        return result;
      },
    };

    const response = await request(createApp(service))
      .post("/api/documents/extract")
      .attach("file", Buffer.from("not a pdf"), {
        contentType: "application/pdf",
        filename: "spoofed.pdf",
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("DOCUMENT_SIGNATURE_INVALID");
    expect(called).toBe(false);
  });

  it("requires exactly one file", async () => {
    const service: GenericDocumentExtractionService = { extract: async () => result };
    const response = await request(createApp(service)).post("/api/documents/extract");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UPLOAD_REQUIRED");
  });
});
