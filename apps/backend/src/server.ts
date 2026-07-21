import { fileURLToPath } from "node:url";

import { config as loadEnvironmentFile } from "dotenv";

import { createApp } from "./app.js";
import { EnvironmentValidationError, parseEnvironment } from "./config/environment.js";
import { createLogger } from "./config/logger.js";
import { createDocumentExtractionService } from "./extraction/extraction-service.js";
import { createGroqClient } from "./extraction/groq-client.js";
import { createGroqStructuredExtractor } from "./extraction/groq-structured-extractor.js";
import { createPdfTextExtractor } from "./extraction/pdf-text-extractor.js";
import { createGroundingService } from "./grounding/grounding-service.js";
import { createPdfGenerationService } from "./pdf-generation/pdf-generation-service.js";
import { createFilePdfTemplateRepository } from "./pdf-generation/pdf-template-repository.js";
import { startServer } from "./runtime/start-server.js";

loadEnvironmentFile({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const start = (): void => {
  const environment = parseEnvironment(process.env);
  const logger = createLogger(environment);
  const groqClient = createGroqClient(environment);
  const pdfTextExtractor = createPdfTextExtractor();
  const groundingService = createGroundingService();
  const structuredExtractor = createGroqStructuredExtractor({
    client: groqClient,
    environment,
    logger,
  });
  const extractionService = createDocumentExtractionService({
    environment,
    groundingService,
    pdfTextExtractor,
    structuredExtractor,
  });
  const templateRepository = createFilePdfTemplateRepository(
    new URL("../assets/", import.meta.url),
  );
  const pdfGenerationService = createPdfGenerationService(templateRepository);
  const app = createApp({ environment, extractionService, logger, pdfGenerationService });

  startServer({ app, environment, logger });
};

try {
  start();
} catch (error) {
  if (error instanceof EnvironmentValidationError) {
    process.stderr.write(`${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`Failed to start server: ${error.message}\n`);
  } else {
    process.stderr.write("Failed to start server.\n");
  }

  process.exitCode = 1;
}
