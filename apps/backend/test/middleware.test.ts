import express from "express";
import pino from "pino";
import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
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
});
