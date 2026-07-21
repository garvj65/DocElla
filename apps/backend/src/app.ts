import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";

import type { Environment } from "./config/environment.js";
import type { ExtractionLimits } from "./config/extraction-limits.js";
import { createHttpLogger } from "./config/logger.js";
import { AppError } from "./errors/app-error.js";
import { ERROR_CODES } from "./errors/error-codes.js";
import type { DocumentExtractionService } from "./extraction/extraction-types.js";
import { createStaticFrontendRouter } from "./frontend/static-frontend.js";
import type { PdfGenerationService } from "./pdf-generation/pdf-generation-types.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import { createExtractRouter } from "./routes/extract.js";
import { createGeneratePdfRouter } from "./routes/generate-pdf.js";
import { createHealthRouter } from "./routes/health.js";
import { createSchemaRouter } from "./routes/schemas.js";

export interface CreateAppOptions {
  readonly environment: Environment;
  readonly extractionService: DocumentExtractionService;
  readonly frontendDistUrl?: URL;
  readonly pdfGenerationService: PdfGenerationService;
  readonly logger: Logger;
  readonly uploadLimits?: Partial<ExtractionLimits>;
}

export const createApp = ({
  environment,
  extractionService,
  frontendDistUrl,
  pdfGenerationService,
  logger,
  uploadLimits,
}: CreateAppOptions): Express => {
  const app = express();

  app.disable("x-powered-by");
  if (environment.trustProxyHops > 0) {
    app.set("trust proxy", environment.trustProxyHops);
  }

  app.use(requestContext);
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      allowedHeaders: ["Content-Type", "X-Request-Id"],
      methods: ["GET", "POST", "OPTIONS"],
      origin: (origin, callback) => {
        if (origin === undefined || origin === environment.frontendOrigin) {
          callback(null, true);
          return;
        }

        callback(
          new AppError({
            code: ERROR_CODES.CORS_ORIGIN_DENIED,
            message: "The request origin is not allowed.",
            status: 403,
          }),
        );
      },
    }),
  );
  app.use(
    "/api/generate-pdf",
    createGeneratePdfRouter({ environment, logger, pdfGenerationService }),
  );
  app.use(express.json({ limit: "1mb", strict: true, type: "application/json" }));
  app.use(
    "/api/extract",
    createExtractRouter(
      uploadLimits === undefined
        ? { environment, extractionService, logger }
        : { environment, extractionService, logger, uploadLimits },
    ),
  );
  app.use("/api/health", createHealthRouter());
  app.use("/api/schemas", createSchemaRouter());
  app.use("/api", notFound);

  if (environment.nodeEnv === "production") {
    app.use(
      frontendDistUrl === undefined
        ? createStaticFrontendRouter()
        : createStaticFrontendRouter({ rootUrl: frontendDistUrl }),
    );
  }

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
};
