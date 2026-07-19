import { getDocumentDefinition } from "@docella/schemas";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";

import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import { createApp } from "../src/app.js";
import { bindExtractionCancellation } from "../src/routes/extract.js";
import { createTestPdf } from "./support/create-test-pdf.js";
import { createSilentLogger, createTestApp, testEnvironment } from "./support/create-test-app.js";
import { createFakeExtractionService } from "./support/fake-extraction-service.js";

const jobValues = {
  additionalNotes: null,
  address: null,
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "alex@example.test",
  fullName: "Alex Morgan",
  highestEducation: null,
  phone: null,
  positionAppliedFor: "Product Analyst",
  salaryExpectation: null,
  yearsOfExperience: null,
};

const jobDefinition = getDocumentDefinition("job-application");
if (jobDefinition === undefined) {
  throw new Error("Missing job application schema.");
}

const jobReview = Object.fromEntries(
  jobDefinition.fields.map((field) => [
    field.key,
    field.key === "fullName"
      ? { confidence: 1, matchType: "exact", status: "verified" }
      : field.key === "positionAppliedFor"
        ? { confidence: 0.25, matchType: "none", status: "needs_review" }
        : { confidence: 0, matchType: "none", status: "missing" },
  ]),
);

describe("POST /api/extract", () => {
  it("returns a validated extraction envelope for a job application", async () => {
    const service = createFakeExtractionService({
      confidence: 0.42,
      extractedCharacters: 84,
      missingFields: 10,
      model: testEnvironment.groqModel,
      needsReviewFields: 1,
      pageCount: 1,
      requiredMissingFields: 3,
      review: jobReview,
      reviewRequired: true,
      values: jobValues,
      verifiedFields: 1,
      warnings: [
        {
          code: "REQUIRED_FIELDS_MISSING",
          fieldKeys: ["phone", "address"],
          message: "One or more required fields are missing.",
        },
        {
          code: "FIELDS_REQUIRE_REVIEW",
          fieldKeys: ["positionAppliedFor"],
          message: "One or more extracted values require review.",
        },
        {
          code: "LOW_CONFIDENCE",
          message: "The extraction confidence is below the review threshold.",
        },
      ],
    });

    const response = await request(createTestApp(service))
      .post("/api/extract")
      .set("X-Request-Id", "extract-route-test")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      data: {
        documentVersion: 1,
        review: jobReview,
        schemaType: "job-application",
        values: jobValues,
      },
      meta: {
        confidence: 0.42,
        extractedCharacters: 84,
        missingFields: 10,
        model: "openai/gpt-oss-20b",
        needsReviewFields: 1,
        pageCount: 1,
        requiredMissingFields: 3,
        requestId: "extract-route-test",
        reviewRequired: true,
        verifiedFields: 1,
        warnings: [
          {
            code: "REQUIRED_FIELDS_MISSING",
            fieldKeys: ["phone", "address"],
            message: "One or more required fields are missing.",
          },
          {
            code: "FIELDS_REQUIRE_REVIEW",
            fieldKeys: ["positionAppliedFor"],
            message: "One or more extracted values require review.",
          },
          {
            code: "LOW_CONFIDENCE",
            message: "The extraction confidence is below the review threshold.",
          },
        ],
      },
      success: true,
    });
    expect(service.calls).toHaveLength(1);
  });

  it("supports the basic invoice schema", async () => {
    const definition = getDocumentDefinition("basic-invoice");
    if (definition === undefined) {
      throw new Error("Missing test schema.");
    }

    const service = createFakeExtractionService({
      extractedCharacters: 64,
      model: testEnvironment.groqModel,
      pageCount: 1,
      values: Object.fromEntries(definition.fields.map((field) => [field.key, null])),
    });

    const response = await request(createTestApp(service))
      .post("/api/extract")
      .field("schemaType", "basic-invoice")
      .attach("file", await createTestPdf(["Acme Services LLC\nInvoice INV-1001"]), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(200);

    expect(response.body.data.schemaType).toBe("basic-invoice");
    expect(Object.keys(response.body.data.values).sort()).toEqual(
      definition.fields.map((field) => field.key).sort(),
    );
    expect(Object.keys(response.body.data.review).sort()).toEqual(
      definition.fields.map((field) => field.key).sort(),
    );
    expect(response.body.meta).toMatchObject({
      confidence: 0,
      missingFields: definition.fields.length,
      needsReviewFields: 0,
      requiredMissingFields: 0,
      reviewRequired: false,
      verifiedFields: 0,
      warnings: [],
    });
  });

  it("rejects unknown schema before calling the extraction service", async () => {
    const service = createFakeExtractionService({
      extractedCharacters: 0,
      model: testEnvironment.groqModel,
      pageCount: 0,
      values: {},
    });

    const response = await request(createTestApp(service))
      .post("/api/extract")
      .field("schemaType", "unknown")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(404);

    expect(response.body.error.code).toBe("UNKNOWN_SCHEMA");
    expect(service.calls).toHaveLength(0);
  });

  it("maps extraction failures through safe envelopes", async () => {
    const service = {
      extract: async () => {
        throw new AppError({
          code: ERROR_CODES.EXTRACTION_PROVIDER_TIMEOUT,
          message: "The extraction provider timed out.",
          status: 503,
        });
      },
    };

    const response = await request(createTestApp(service))
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(503);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.error).toEqual({
      code: "EXTRACTION_PROVIDER_TIMEOUT",
      message: "The extraction provider timed out.",
    });
  });

  it("rate limits extraction requests before invoking extraction again", async () => {
    const service = createFakeExtractionService({
      extractedCharacters: 84,
      model: testEnvironment.groqModel,
      pageCount: 1,
      values: jobValues,
    });
    const app = createApp({
      environment: { ...testEnvironment, extractRateLimitMax: 1 },
      extractionService: service,
      logger: createSilentLogger(),
    });

    await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(200);

    const limited = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(429);

    expect(limited.body.error.code).toBe("EXTRACTION_RATE_LIMITED");
    expect(limited.headers["cache-control"]).toBe("no-store");
    expect(service.calls).toHaveLength(1);
  });

  it("passes the same AbortSignal to the extraction service and leaves it active on success", async () => {
    let observedSignal: AbortSignal | undefined;
    const service = {
      extract: async ({ documentDefinition, signal }) => {
        observedSignal = signal;
        return {
          confidence: 0,
          documentVersion: documentDefinition.version,
          extractedCharacters: 84,
          missingFields: jobDefinition.fields.length,
          model: testEnvironment.groqModel,
          needsReviewFields: 0,
          pageCount: 1,
          requiredMissingFields: 0,
          review: Object.fromEntries(
            documentDefinition.fields.map((field) => [
              field.key,
              { confidence: 0, matchType: "none", status: "missing" },
            ]),
          ),
          reviewRequired: false,
          schemaType: documentDefinition.id,
          values: jobValues,
          verifiedFields: 0,
          warnings: [],
        };
      },
    };

    await request(createTestApp(service))
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(200);

    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(false);
  });

  it("aborts on premature response close and ignores normal completion", () => {
    const requestEmitter = new EventEmitter() as EventEmitter & {
      readonly off: EventEmitter["off"];
      readonly once: EventEmitter["once"];
    };
    const responseEmitter = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
    }) as EventEmitter & Response;
    const cancellation = bindExtractionCancellation(
      requestEmitter as unknown as Request,
      responseEmitter,
    );

    responseEmitter.emit("close");

    expect(cancellation.signal.aborted).toBe(true);
    expect(cancellation.closedBeforeCompletion()).toBe(true);
    cancellation.cleanup();

    const completedResponse = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: true,
    }) as EventEmitter & Response;
    const completed = bindExtractionCancellation(
      requestEmitter as unknown as Request,
      completedResponse,
    );

    completedResponse.emit("close");

    expect(completed.signal.aborted).toBe(false);
    expect(completed.closedBeforeCompletion()).toBe(false);
    completed.cleanup();
  });
});
