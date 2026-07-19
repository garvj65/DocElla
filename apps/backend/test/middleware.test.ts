import express from "express";
import pino from "pino";
import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import type { DocumentExtractionService } from "../src/extraction/extraction-types.js";
import {
  createGroqStructuredExtractor,
  mapProviderError,
} from "../src/extraction/groq-structured-extractor.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { requestContext } from "../src/middleware/request-context.js";
import { createTestPdf } from "./support/create-test-pdf.js";
import {
  createFakeExtractionService,
  createSilentLogger,
  testEnvironment,
} from "./support/create-test-app.js";

class MemoryLogStream extends Writable {
  public readonly entries: string[] = [];

  public override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.entries.push(chunk.toString());
    callback();
  }
}

const createInvalidOutputExtractionService = (
  contents: readonly (string | null)[],
): DocumentExtractionService => {
  let callIndex = 0;
  const extractor = createGroqStructuredExtractor({
    client: {
      chat: {
        completions: {
          create: async () => {
            const content = contents[Math.min(callIndex, contents.length - 1)] ?? null;
            callIndex += 1;
            return { choices: [{ message: { content } }] };
          },
        },
      },
    },
    environment: testEnvironment,
    logger: createSilentLogger(),
  });

  return {
    extract: async ({ documentDefinition, signal }) => ({
      confidence: 0,
      documentVersion: documentDefinition.version,
      extractedCharacters: 64,
      missingFields: documentDefinition.fields.length,
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
      verifiedFields: 0,
      values: await extractor.extract({
        documentDefinition,
        documentText: "Synthetic PDF text",
        signal,
      }),
      warnings: [],
    }),
  };
};

describe("middleware", () => {
  it("allows the configured CORS origin", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .get("/api/health")
      .set("Origin", testEnvironment.frontendOrigin)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(testEnvironment.frontendOrigin);
  });

  it("denies a different browser origin with a typed error", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .get("/api/health")
      .set("Origin", "https://evil.example")
      .expect(403);

    expect(response.body.error.code).toBe("CORS_ORIGIN_DENIED");
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
    expect(JSON.stringify(response.body)).not.toContain("Error:");
  });

  it("allows requests without an Origin header", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .get("/api/health")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows preflight from the configured origin", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .options("/api/health")
      .set("Access-Control-Request-Method", "GET")
      .set("Origin", testEnvironment.frontendOrigin)
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(testEnvironment.frontendOrigin);
  });

  it("returns JSON for unknown routes", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .get("/api/does-not-exist")
      .expect(404);

    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
  });

  it("maps malformed JSON to a typed error", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);

    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(JSON.stringify(response.body)).not.toContain("SyntaxError");
  });

  it("maps oversized JSON to a typed error", async () => {
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger: createSilentLogger(),
      }),
    )
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send({ value: "x".repeat(1_048_577) })
      .expect(413);

    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("handles known operational errors", async () => {
    const app = express();
    const logger = createSilentLogger();

    app.use(requestContext);
    app.get("/known", () => {
      throw new AppError({
        code: ERROR_CODES.UNKNOWN_SCHEMA,
        message: "The requested document schema does not exist.",
        status: 404,
      });
    });
    app.use(errorHandler(logger));

    const response = await request(app).get("/known").expect(404);

    expect(response.body.error.code).toBe("UNKNOWN_SCHEMA");
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
  });

  it("handles unexpected errors without returning internals", async () => {
    const app = express();
    const logger = createSilentLogger();

    app.use(requestContext);
    app.get("/unexpected", () => {
      throw new Error("database password leaked");
    });
    app.use(errorHandler(logger));

    const response = await request(app).get("/unexpected").expect(500);

    expect(response.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
    expect(JSON.stringify(response.body)).not.toContain("database password leaked");
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });

  it("logs request metadata without sensitive values or query strings", async () => {
    const stream = new MemoryLogStream();
    const logger = pino({ level: "info" }, stream);
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger,
      }),
    )
      .get("/api/health?token=private-query-value")
      .set("Authorization", "Bearer super-secret-token")
      .set("Cookie", "session=private-cookie")
      .set("X-Api-Key", "private-api-key")
      .set("X-Request-Id", "privacy-test")
      .expect(200);

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    const logs = stream.entries.join("");

    expect(response.headers["x-request-id"]).toBe("privacy-test");
    expect(logs).not.toContain("super-secret-token");
    expect(logs).not.toContain("private-cookie");
    expect(logs).not.toContain("private-api-key");
    expect(logs).not.toContain("private-query-value");
    expect(logs).toContain('"method":"GET"');
    expect(logs).toContain('"url":"/api/health"');
    expect(logs).toContain('"requestId":"privacy-test"');
    expect(logs).toContain('"statusCode":200');
  });

  it("does not log multipart extraction secrets, text, form values, or output values", async () => {
    const stream = new MemoryLogStream();
    const logger = pino({ level: "info" }, stream);
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createFakeExtractionService(),
        logger,
      }),
    )
      .post("/api/extract?token=private-query-value")
      .set("Authorization", "Bearer private-bearer-token")
      .set("Cookie", "session=private-cookie")
      .set("X-Api-Key", "private-api-key")
      .set("X-Groq-Api-Key", "private-groq-key")
      .set("X-Request-Id", "multipart-privacy-test")
      .field("schemaType", "job-application")
      .attach(
        "file",
        await createTestPdf([
          "Alex Morgan\nalex@example.test\nPosition Applied For: Product Analyst",
        ]),
        { contentType: "application/pdf", filename: "sensitive-name.pdf" },
      )
      .expect(200);

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    const logs = stream.entries.join("");

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(logs).toContain('"method":"POST"');
    expect(logs).toContain('"url":"/api/extract"');
    expect(logs).not.toContain("private-bearer-token");
    expect(logs).not.toContain("private-cookie");
    expect(logs).not.toContain("private-api-key");
    expect(logs).not.toContain("private-groq-key");
    expect(logs).not.toContain("private-query-value");
    expect(logs).not.toContain("Alex Morgan");
    expect(logs).not.toContain("alex@example.test");
    expect(logs).not.toContain("job-application");
    expect(logs).not.toContain("Product Analyst");
    expect(logs).not.toContain("sensitive-name.pdf");
  });

  it("logs only safe provider-error metadata for extraction failures", async () => {
    const stream = new MemoryLogStream();
    const logger = pino({ level: "info" }, stream);
    const providerError = new Error(
      "PRIVATE_PROVIDER_BODY Alex Morgan alex@example.test",
    ) as Error & {
      status: number;
    };
    providerError.name = "ProviderBadRequestError";
    providerError.status = 400;
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: {
          extract: async () => {
            throw mapProviderError(testEnvironment, providerError);
          },
        },
        logger,
      }),
    )
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(502);

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    const logs = stream.entries.join("");
    const responseBody = JSON.stringify(response.body);

    expect(logs).toContain('"providerErrorClass":"ProviderBadRequestError"');
    expect(logs).toContain('"providerHttpStatus":400');
    expect(logs).toContain('"providerMappedCode":"EXTRACTION_PROVIDER_UNAVAILABLE"');
    expect(logs).not.toContain("PRIVATE_PROVIDER_BODY");
    expect(logs).not.toContain("Alex Morgan");
    expect(logs).not.toContain("alex@example.test");
    expect(responseBody).not.toContain("PRIVATE_PROVIDER_BODY");
    expect(responseBody).not.toContain("Alex Morgan");
    expect(responseBody).not.toContain("alex@example.test");
  });

  it("does not log malformed completion content or JSON parser details", async () => {
    const stream = new MemoryLogStream();
    const logger = pino({ level: "info" }, stream);
    const sentinel = "PRIVATE_INVALID_COMPLETION Alex Morgan alex@example.test";
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createInvalidOutputExtractionService([sentinel, sentinel]),
        logger,
      }),
    )
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(502);

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    const logs = stream.entries.join("");
    const responseBody = JSON.stringify(response.body);

    expect(response.body.error.code).toBe("EXTRACTION_OUTPUT_INVALID");
    expect(logs).toContain('"outputFailureStage":"invalid_json"');
    expect(logs).toContain('"providerMappedCode":"EXTRACTION_OUTPUT_INVALID"');
    expect(logs).toContain('"providerModel":"openai/gpt-oss-20b"');
    expect(logs).not.toContain("PRIVATE_INVALID_COMPLETION");
    expect(logs).not.toContain("Alex Morgan");
    expect(logs).not.toContain("alex@example.test");
    expect(logs).not.toContain("Unexpected token");
    expect(responseBody).not.toContain("PRIVATE_INVALID_COMPLETION");
    expect(responseBody).not.toContain("Alex Morgan");
    expect(responseBody).not.toContain("alex@example.test");
  });

  it("does not log schema-invalid completion values or Zod details", async () => {
    const stream = new MemoryLogStream();
    const logger = pino({ level: "info" }, stream);
    const invalidValues = JSON.stringify({
      additionalNotes: null,
      address: null,
      availableStartDate: null,
      currentEmployer: null,
      currentJobTitle: null,
      email: "PRIVATE_SCHEMA_INVALID_EMAIL alex@example.test",
      fullName: "PRIVATE_SCHEMA_INVALID_NAME Alex Morgan",
      highestEducation: null,
      phone: null,
      positionAppliedFor: "Product Analyst",
      salaryExpectation: null,
      yearsOfExperience: null,
    });
    const response = await request(
      createApp({
        environment: testEnvironment,
        extractionService: createInvalidOutputExtractionService([invalidValues, invalidValues]),
        logger,
      }),
    )
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(502);

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    const logs = stream.entries.join("");
    const responseBody = JSON.stringify(response.body);

    expect(response.body.error).toEqual({
      code: "EXTRACTION_OUTPUT_INVALID",
      message: "The extraction provider returned invalid output.",
    });
    expect(logs).toContain('"outputFailureStage":"schema_validation"');
    expect(logs).toContain('"providerMappedCode":"EXTRACTION_OUTPUT_INVALID"');
    expect(logs).toContain('"providerModel":"openai/gpt-oss-20b"');
    expect(logs).not.toContain("ZodError");
    expect(logs).not.toContain("PRIVATE_SCHEMA_INVALID_EMAIL");
    expect(logs).not.toContain("PRIVATE_SCHEMA_INVALID_NAME");
    expect(logs).not.toContain("Alex Morgan");
    expect(logs).not.toContain("alex@example.test");
    expect(responseBody).not.toContain("PRIVATE_SCHEMA_INVALID_EMAIL");
    expect(responseBody).not.toContain("PRIVATE_SCHEMA_INVALID_NAME");
    expect(responseBody).not.toContain("Alex Morgan");
    expect(responseBody).not.toContain("alex@example.test");
  });
});
