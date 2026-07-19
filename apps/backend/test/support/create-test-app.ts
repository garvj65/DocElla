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
    documentVersion: documentDefinition.version,
    extractedCharacters: 84,
    model: testEnvironment.groqModel,
    pageCount: 1,
    schemaType: documentDefinition.id,
    values: Object.fromEntries(
      documentDefinition.fields.map((field) => [field.key, null]),
    ) as Awaited<ReturnType<DocumentExtractionService["extract"]>>["values"],
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
