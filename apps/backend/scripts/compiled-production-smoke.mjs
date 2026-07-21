import assert from "node:assert/strict";

import pino from "pino";
import request from "supertest";

const { createApp } = await import("../dist/app.js");
const { createPdfGenerationService } = await import(
  "../dist/pdf-generation/pdf-generation-service.js"
);
const { createFilePdfTemplateRepository } = await import(
  "../dist/pdf-generation/pdf-template-repository.js"
);

const environment = {
  extractRateLimitMax: 1000,
  extractRateLimitWindowMs: 60_000,
  frontendOrigin: "http://localhost:3001",
  generateRateLimitMax: 1000,
  generateRateLimitWindowMs: 60_000,
  groqApiKey: "not-used-by-production-smoke",
  groqMaxInputCharacters: 30_000,
  groqMaxRetries: 0,
  groqModel: "openai/gpt-oss-20b",
  groqTimeoutMs: 30_000,
  logLevel: "silent",
  nodeEnv: "production",
  port: 3001,
  shutdownTimeoutMs: 10_000,
  trustProxyHops: 0,
};

const extractionService = {
  extract: async () => {
    throw new Error("Production smoke must not call extraction or Groq.");
  },
};

const templateRepository = createFilePdfTemplateRepository(new URL("../assets/", import.meta.url));
const pdfGenerationService = createPdfGenerationService(templateRepository);
const app = createApp({
  environment,
  extractionService,
  frontendDistUrl: new URL("../../frontend/dist/", import.meta.url),
  logger: pino({ level: "silent" }),
  pdfGenerationService,
});

const frontend = await request(app).get("/").expect(200);
assert.match(frontend.headers["content-type"], /text\/html/u);
assert.match(frontend.text, /DocElla/u);
assert.equal(frontend.headers["cache-control"], "no-cache");

const health = await request(app).get("/api/health").expect(200);
assert.deepEqual(health.body.data, {
  service: "DocElla API",
  status: "ok",
  version: "1.0.0",
});
assert.equal(health.headers["cache-control"], "no-store");

const schemas = await request(app).get("/api/schemas").expect(200);
assert.equal(schemas.body.success, true);
assert.equal(Array.isArray(schemas.body.data), true);
assert.equal(schemas.body.data.length >= 2, true);

const missingApi = await request(app).get("/api/release-smoke-missing").expect(404);
assert.equal(missingApi.body.error.code, "ROUTE_NOT_FOUND");

const values = {
  additionalNotes: null,
  address: "1 Release Test Street",
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "release@example.test",
  fullName: "Release Candidate",
  highestEducation: null,
  phone: "+1 555 010 2200",
  positionAppliedFor: "Product Analyst",
  salaryExpectation: null,
  yearsOfExperience: null,
};

for (const flatten of [false, true]) {
  const generated = await request(app)
    .post("/api/generate-pdf")
    .send({
      flatten,
      schemaType: "job-application",
      templateId: "job-application-default",
      values,
    })
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);

  assert.equal(generated.headers["content-type"], "application/pdf");
  assert.equal(generated.headers["cache-control"], "no-store");
  assert.equal(Buffer.from(generated.body).subarray(0, 5).toString(), "%PDF-");
  assert.equal(Buffer.from(generated.body).byteLength > 1000, true);
}

console.log("Compiled production smoke passed.");
