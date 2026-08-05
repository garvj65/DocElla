import { Router } from "express";
import type { Logger } from "pino";

import type { Environment } from "../config/environment.js";
import { isAbortLikeError } from "../errors/extraction-aborted-error.js";
import { bindRequestCancellation } from "../http/request-cancellation.js";
import { sendSuccess } from "../http/responses.js";
import type { GenericDocumentExtractionService } from "../generic-extraction/generic-extraction-types.js";
import { createExtractionRateLimit } from "../middleware/extraction-rate-limit.js";
import {
  createDocumentUploadMiddleware,
  getValidatedDocumentUpload,
} from "../middleware/document-upload.js";

export interface CreateGenericExtractRouterOptions {
  readonly environment: Environment;
  readonly extractionService: GenericDocumentExtractionService;
  readonly logger: Logger;
}

export const createGenericExtractRouter = ({
  environment,
  extractionService,
  logger,
}: CreateGenericExtractRouterOptions): Router => {
  const router = Router();

  router.post(
    "/",
    (_request, response, next) => {
      response.setHeader("Cache-Control", "no-store");
      next();
    },
    createExtractionRateLimit(environment),
    createDocumentUploadMiddleware(),
    async (request, response, next) => {
      const cancellation = bindRequestCancellation(request, response);

      try {
        const upload = getValidatedDocumentUpload(request);
        const result = await extractionService.extract({
          ...upload,
          signal: cancellation.signal,
        });

        if (
          cancellation.signal.aborted ||
          cancellation.closedBeforeCompletion() ||
          response.writableEnded ||
          response.destroyed
        ) {
          logger.info(
            {
              event: "generic_extraction_client_disconnected",
              path: request.path,
              requestId: request.requestId,
            },
            "Generic extraction response skipped after client disconnect",
          );
          return;
        }

        sendSuccess(response, 200, result, {
          contentUnitCount: result.document.contentUnitCount,
          documentType: result.document.detectedType,
          fieldCount: Object.keys(result.values.fields).length,
          reviewRequired: result.reviewRequired,
          sourceFormat: result.document.sourceFormat,
          tableCount: Object.keys(result.values.tables).length,
        });
      } catch (error) {
        if (
          cancellation.signal.aborted ||
          cancellation.closedBeforeCompletion() ||
          isAbortLikeError(error)
        ) {
          logger.info(
            {
              event: "generic_extraction_cancelled",
              path: request.path,
              requestId: request.requestId,
            },
            "Generic extraction cancelled",
          );
          return;
        }
        next(error);
      } finally {
        cancellation.cleanup();
      }
    },
  );

  return router;
};
