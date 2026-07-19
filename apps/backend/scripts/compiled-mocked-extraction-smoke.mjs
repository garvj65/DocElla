import assert from "node:assert/strict";

import pino from "pino";
import request from "supertest";

const { createApp } = await import("../dist/app.js");
const { jobApplicationDefinition } = await import("../../../packages/schemas/dist/index.js");

const environment = {
  extractRateLimitMax: 1000,
  extractRateLimitWindowMs: 60_000,
  frontendOrigin: "http://localhost:5173",
  groqApiKey: "not-used",
  groqMaxInputCharacters: 30_000,
  groqMaxRetries: 0,
  groqModel: "openai/gpt-oss-20b",
  groqTimeoutMs: 30_000,
  logLevel: "silent",
  nodeEnv: "test",
  port: 3001,
};

const values = Object.fromEntries(
  jobApplicationDefinition.fields.map((field) => [field.key, null]),
);
values.fullName = "Alex Morgan";
values.email = "alex@example.test";

const review = Object.fromEntries(
  jobApplicationDefinition.fields.map((field) => [
    field.key,
    field.key === "fullName" || field.key === "email"
      ? { confidence: 0.9, matchType: "normalized", status: "verified" }
      : { confidence: 0, matchType: "none", status: "missing" },
  ]),
);

const extractionService = {
  extract: async ({ documentDefinition }) => ({
    confidence: 0.9,
    documentVersion: documentDefinition.version,
    extractedCharacters: 84,
    missingFields: documentDefinition.fields.length - 2,
    model: environment.groqModel,
    needsReviewFields: 0,
    pageCount: 1,
    requiredMissingFields: 3,
    review,
    reviewRequired: true,
    schemaType: documentDefinition.id,
    values,
    verifiedFields: 2,
    warnings: [
      {
        code: "REQUIRED_FIELDS_MISSING",
        fieldKeys: ["phone", "address", "positionAppliedFor"],
        message: "One or more required fields are missing.",
      },
    ],
  }),
};

const app = createApp({
  environment,
  extractionService,
  logger: pino({ level: "silent" }),
});

const response = await request(app)
  .post("/api/extract")
  .set("X-Request-Id", "compiled-mocked-smoke")
  .field("schemaType", "job-application")
  .attach("file", Buffer.from("%PDF-1.4\n% mocked smoke\n"), {
    contentType: "application/pdf",
    filename: "mock.pdf",
  })
  .expect(200);

assert.equal(response.headers["cache-control"], "no-store");
assert.equal(response.body.success, true);
assert.equal(response.body.meta.requestId, "compiled-mocked-smoke");
assert.equal(response.body.meta.model, "openai/gpt-oss-20b");
assert.equal(response.body.meta.confidence, 0.9);
assert.equal(response.body.meta.verifiedFields, 2);
assert.equal(response.body.data.schemaType, "job-application");
assert.deepEqual(response.body.data.values, values);
assert.deepEqual(Object.keys(response.body.data.review).sort(), Object.keys(values).sort());
assert.deepEqual(response.body.data.review.fullName, {
  confidence: 0.9,
  matchType: "normalized",
  status: "verified",
});
