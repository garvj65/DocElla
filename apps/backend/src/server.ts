import { fileURLToPath } from "node:url";

import { config as loadEnvironmentFile } from "dotenv";

import { createApp } from "./app.js";
import { EnvironmentValidationError, parseEnvironment } from "./config/environment.js";
import { createLogger } from "./config/logger.js";
import { createDocumentLayoutServiceFromEnvironment } from "./document-layout/document-layout-service.js";
import { createDocumentExtractionService } from "./extraction/extraction-service.js";
import { createGroqClient } from "./extraction/groq-client.js";
import { createGroqStructuredExtractor } from "./extraction/groq-structured-extractor.js";
import { createPdfTextExtractor } from "./extraction/pdf-text-extractor.js";
import { createGenericDocumentExtractionService } from "./generic-extraction/generic-extraction-service.js";
import { createGenericGroqExtractors } from "./generic-extraction/generic-groq-extractor.js";
import { createGenericGroundingService } from "./generic-extraction/generic-grounding-service.js";
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
  const fixedGroundingService = createGroundingService();
  const structuredExtractor = createGroqStructuredExtractor({
    client: groqClient,
    environment,
    logger,
  });
  const extractionService = createDocumentExtractionService({
    environment,
    groundingService: fixedGroundingService,
    pdfTextExtractor,
    structuredExtractor,
  });
  const documentLayoutService = createDocumentLayoutServiceFromEnvironment(environment);
  const { schemaDiscoverer, valueExtractor } = createGenericGroqExtractors({
    client: groqClient,
    environment,
    logger,
  });
  const genericExtractionService = createGenericDocumentExtractionService({
    environment,
    groundingService: createGenericGroundingService(),
    layoutService: documentLayoutService,
    schemaDiscoverer,
    valueExtractor,
  });
  const templateRepository = createFilePdfTemplateRepository(
    new URL("../assets/", import.meta.url),
  );
  const pdfGenerationService = createPdfGenerationService(templateRepository);
  const app = createApp({
    environment,
    extractionService,
    genericExtractionService,
    logger,
    pdfGenerationService,
  });

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
