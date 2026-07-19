import { createApp } from "../../src/app.js";
import type { Environment } from "../../src/config/environment.js";
import type { DocumentExtractionService } from "../../src/extraction/extraction-types.js";
import pino, { type Logger } from "pino";

export const testEnvironment: Environment = {
  extractRateLimitMax: 1000,
  extractRateLimitWindowMs: 60_000,
  frontendOrigin: "http://localhost:5173",
  groqApiKey: "test-key-not-used",
  groqMaxInputCharacters: 30_000,
  groqMaxRetries: 0,
  groqModel: "openai/gpt-oss-20b",
  groqTimeoutMs: 30_000,
  logLevel: "info",
  nodeEnv: "test",
  port: 3001,
};

export const createSilentLogger = (): Logger => pino({ level: "silent" });

export const createFakeExtractionService = (): DocumentExtractionService => ({
  extract: async ({ documentDefinition }) => ({
    confidence: 0,
    documentVersion: documentDefinition.version,
    extractedCharacters: 84,
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
    ) as Awaited<ReturnType<DocumentExtractionService["extract"]>>["review"],
    reviewRequired: false,
    schemaType: documentDefinition.id,
    verifiedFields: 0,
    values: Object.fromEntries(
      documentDefinition.fields.map((field) => [field.key, null]),
    ) as Awaited<ReturnType<DocumentExtractionService["extract"]>>["values"],
    warnings: [],
  }),
});

export const createTestApp = (
  extractionService: DocumentExtractionService = createFakeExtractionService(),
) =>
  createApp({
    environment: testEnvironment,
    extractionService,
    logger: createSilentLogger(),
  });
