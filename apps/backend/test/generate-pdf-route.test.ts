import { PDFDocument } from "pdf-lib";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import { createPdfGenerationService } from "../src/pdf-generation/pdf-generation-service.js";
import { createFilePdfTemplateRepository } from "../src/pdf-generation/pdf-template-repository.js";
import type { PdfGenerationService } from "../src/pdf-generation/pdf-generation-types.js";
import {
  createFakeExtractionService,
  createFakePdfGenerationService,
  createSilentLogger,
  createTestApp,
  testEnvironment,
} from "./support/create-test-app.js";

const jobValues = {
  additionalNotes: null,
  address: "PRIVATE_GENERATION_ADDRESS",
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "PRIVATE_GENERATION_EMAIL@example.test",
  fullName: "PRIVATE_GENERATION_NAME",
  highestEducation: null,
  phone: "+1 555 010 2200",
  positionAppliedFor: "Product Analyst",
  salaryExpectation: 75000,
  yearsOfExperience: 5,
};

const invoiceValues = {
  currency: "USD",
  customerAddress: null,
  customerName: "Example Customer",
  dueDate: null,
  invoiceNumber: "PRIVATE_INVOICE_NUMBER",
  issueDate: "2026-07-19",
  issuerAddress: "100 Sample Ave",
  issuerName: "Example Services",
  notes: null,
  paymentTerms: null,
  subtotal: 1000,
  tax: 80,
  total: 1080,
};

const pdfBytes = new TextEncoder().encode("%PDF-FAKE");

const createRecordingGenerationService = (): PdfGenerationService & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    generate: async (call) => {
      calls.push(call);
      return {
        bytes: pdfBytes,
        filename: `docella-${call.documentDefinition.id}-${call.template.id}.pdf`,
        flattened: call.flatten ?? call.template.flattenByDefault,
        schemaType: call.documentDefinition.id,
        templateId: call.template.id,
      };
    },
  };
};

describe("POST /api/generate-pdf", () => {
  it("returns binary PDF bytes with safe download headers", async () => {
    const service = createRecordingGenerationService();
    const response = await request(createTestApp(createFakeExtractionService(), service))
      .post("/api/generate-pdf")
      .set("X-Request-Id", "pdf-route-test")
      .send({
        flatten: false,
        schemaType: "job-application",
        templateId: "job-application-default",
        values: jobValues,
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="docella-job-application-job-application-default.pdf"',
    );
    expect(response.headers["content-length"]).toBe(String(pdfBytes.byteLength));
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-request-id"]).toBe("pdf-route-test");
    expect(Buffer.from(response.body).subarray(0, 5).toString()).toBe("%PDF-");
    expect(service.calls).toHaveLength(1);
  });

  it("supports basic invoice and flatten options", async () => {
    const service = createRecordingGenerationService();
    await request(createTestApp(createFakeExtractionService(), service))
      .post("/api/generate-pdf")
      .send({
        flatten: true,
        schemaType: "basic-invoice",
        templateId: "basic-invoice-default",
        values: invoiceValues,
      })
      .expect(200);

    expect(service.calls).toHaveLength(1);
  });

  it("returns an inspectable unflattened PDF from the real generation service", async () => {
    const app = createApp({
      environment: testEnvironment,
      extractionService: createFakeExtractionService(),
      logger: createSilentLogger(),
      pdfGenerationService: createPdfGenerationService(
        createFilePdfTemplateRepository(new URL("../assets/", import.meta.url)),
      ),
    });

    const response = await request(app)
      .post("/api/generate-pdf")
      .send({
        flatten: false,
        schemaType: "job-application",
        templateId: "job-application-default",
        values: jobValues,
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const pdfDocument = await PDFDocument.load(response.body as Buffer);
    const form = pdfDocument.getForm();
    expect(form.getFields().length).toBeGreaterThan(0);
    expect(form.getTextField("job.full_name").getText()).toBe("PRIVATE_GENERATION_NAME");
  });

  it("rejects unsafe request and submission shapes before invoking generation", async () => {
    const cases = [
      [{ templateId: "job-application-default", values: jobValues }, "INVALID_GENERATION_REQUEST"],
      [
        {
          extra: true,
          schemaType: "job-application",
          templateId: "job-application-default",
          values: jobValues,
        },
        "INVALID_GENERATION_REQUEST",
      ],
      [
        {
          schemaType: "unknown",
          templateId: "job-application-default",
          values: jobValues,
        },
        "UNKNOWN_SCHEMA",
      ],
      [
        {
          schemaType: "job-application",
          templateId: "basic-invoice-default",
          values: jobValues,
        },
        "UNKNOWN_TEMPLATE",
      ],
      [
        {
          schemaType: "job-application",
          templateId: "job-application-default",
          values: { ...jobValues, email: "not-an-email" },
        },
        "INVALID_GENERATION_VALUES",
      ],
      [
        {
          schemaType: "job-application",
          templateId: "job-application-default",
          values: { ...jobValues, extra: "nope" },
        },
        "INVALID_GENERATION_VALUES",
      ],
    ] as const;

    for (const [body, code] of cases) {
      const service = createRecordingGenerationService();
      const response = await request(createTestApp(createFakeExtractionService(), service))
        .post("/api/generate-pdf")
        .send(body)
        .expect(
          code === "UNKNOWN_SCHEMA" || code === "UNKNOWN_TEMPLATE"
            ? 404
            : code === "INVALID_GENERATION_VALUES"
              ? 422
              : 400,
        );
      expect(response.body.error.code).toBe(code);
      expect(JSON.stringify(response.body)).not.toContain("PRIVATE_GENERATION_NAME");
      expect(service.calls).toHaveLength(0);
    }
  });

  it("maps internal generation failure and rate limits before service invocation", async () => {
    const failing: PdfGenerationService = {
      generate: async () => {
        throw new AppError({
          code: ERROR_CODES.PDF_GENERATION_FAILED,
          logCause: false,
          message: "The PDF could not be generated.",
          status: 500,
        });
      },
    };
    const failed = await request(createTestApp(createFakeExtractionService(), failing))
      .post("/api/generate-pdf")
      .send({
        schemaType: "job-application",
        templateId: "job-application-default",
        values: jobValues,
      })
      .expect(500);
    expect(failed.body.error.code).toBe("PDF_GENERATION_FAILED");
    expect(failed.headers["cache-control"]).toBe("no-store");

    const service = createRecordingGenerationService();
    const app = createApp({
      environment: { ...testEnvironment, generateRateLimitMax: 1 },
      extractionService: createFakeExtractionService(),
      logger: createSilentLogger(),
      pdfGenerationService: service,
    });
    const body = {
      schemaType: "job-application",
      templateId: "job-application-default",
      values: jobValues,
    };
    await request(app).post("/api/generate-pdf").send(body).expect(200);
    const limited = await request(app).post("/api/generate-pdf").send(body).expect(429);
    expect(limited.body.error.code).toBe("GENERATION_RATE_LIMITED");
    expect(service.calls).toHaveLength(1);
  });

  it("does not log submitted values or PDF bytes", async () => {
    const logs: string[] = [];
    const logger = pino(
      { level: "info" },
      {
        write: (chunk: string) => {
          logs.push(chunk);
        },
      },
    );
    const app = createApp({
      environment: testEnvironment,
      extractionService: createFakeExtractionService(),
      logger,
      pdfGenerationService: createFakePdfGenerationService(),
    });

    await request(app)
      .post("/api/generate-pdf")
      .send({
        schemaType: "job-application",
        templateId: "job-application-default",
        values: jobValues,
      })
      .expect(200);

    const serializedLogs = logs.join("\n");
    expect(serializedLogs).not.toContain("PRIVATE_GENERATION_NAME");
    expect(serializedLogs).not.toContain("PRIVATE_GENERATION_EMAIL@example.test");
    expect(serializedLogs).not.toContain("PRIVATE_GENERATION_ADDRESS");
    expect(serializedLogs).not.toContain("PRIVATE_INVOICE_NUMBER");
    expect(serializedLogs).not.toContain("%PDF-");
  });

  it("keeps existing health and schema routes functional", async () => {
    await request(createTestApp()).get("/api/health").expect(200);
    await request(createTestApp()).get("/api/schemas").expect(200);
  });
});
