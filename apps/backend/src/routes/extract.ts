import { getDocumentDefinition } from "@docella/schemas";
import { Router, type Request, type Response } from "express";
import type { Logger } from "pino";

import { AppError } from "../errors/app-error.js";
import { isAbortLikeError } from "../errors/extraction-aborted-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { sendSuccess } from "../http/responses.js";
import { createExtractionRateLimit } from "../middleware/extraction-rate-limit.js";
import { createPdfUploadMiddleware, SCHEMA_TYPE_FIELD } from "../middleware/pdf-upload.js";
import type { DocumentExtractionService } from "../extraction/extraction-types.js";
import type { Environment } from "../config/environment.js";
import type { ExtractionLimits } from "../config/extraction-limits.js";

export interface CreateExtractRouterOptions {
  readonly environment: Environment;
  readonly extractionService: DocumentExtractionService;
  readonly logger: Logger;
  readonly uploadLimits?: Partial<ExtractionLimits>;
}

const parseSchemaType = (body: unknown): string => {
  if (typeof body !== "object" || body === null || !(SCHEMA_TYPE_FIELD in body)) {
    throw new AppError({
      code: ERROR_CODES.UNKNOWN_SCHEMA,
      message: "The requested document schema does not exist.",
      status: 404,
    });
  }

  const value = (body as Readonly<Record<typeof SCHEMA_TYPE_FIELD, unknown>>)[SCHEMA_TYPE_FIELD];

  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 100) {
    throw new AppError({
      code: ERROR_CODES.UNKNOWN_SCHEMA,
      message: "The requested document schema does not exist.",
      status: 404,
    });
  }

  return value.trim();
};

export interface ExtractionCancellation {
  readonly cleanup: () => void;
  readonly closedBeforeCompletion: () => boolean;
  readonly signal: AbortSignal;
}

export const bindExtractionCancellation = (
  request: Request,
  response: Response,
): ExtractionCancellation => {
  const abortController = new AbortController();
  let closedBeforeCompletion = false;
  const abort = (): void => {
    abortController.abort();
  };
  const abortOnClose = (): void => {
    if (!response.writableEnded) {
      closedBeforeCompletion = true;
      abortController.abort();
    }
  };
  const cleanup = (): void => {
    request.off("aborted", abort);
    response.off("close", abortOnClose);
  };

  request.once("aborted", abort);
  response.once("close", abortOnClose);

  return {
    cleanup,
    closedBeforeCompletion: () => closedBeforeCompletion,
    signal: abortController.signal,
  };
};

export const createExtractRouter = ({
  environment,
  extractionService,
  logger,
  uploadLimits,
}: CreateExtractRouterOptions): Router => {
  const router = Router();

  router.post(
    "/",
    (_request, response, next) => {
      response.setHeader("Cache-Control", "no-store");
      next();
    },
    createExtractionRateLimit(environment),
    createPdfUploadMiddleware(uploadLimits === undefined ? {} : { limits: uploadLimits }),
    async (request, response, next) => {
      const cancellation = bindExtractionCancellation(request, response);

      try {
        const schemaType = parseSchemaType(request.body);
        const documentDefinition = getDocumentDefinition(schemaType);

        if (documentDefinition === undefined) {
          throw new AppError({
            code: ERROR_CODES.UNKNOWN_SCHEMA,
            message: "The requested document schema does not exist.",
            status: 404,
          });
        }

        const file = request.file;

        if (file === undefined) {
          throw new AppError({
            code: ERROR_CODES.UPLOAD_REQUIRED,
            message: "A PDF file is required.",
            status: 400,
          });
        }

        const result = await extractionService.extract({
          documentDefinition,
          pdfBytes: new Uint8Array(file.buffer),
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
              event: "extraction_client_disconnected",
              path: request.path,
              requestId: request.requestId,
            },
            "Extraction response skipped after client disconnect",
          );
          return;
        }

        sendSuccess(
          response,
          200,
          {
            documentVersion: result.documentVersion,
            schemaType: result.schemaType,
            values: result.values,
          },
          {
            extractedCharacters: result.extractedCharacters,
            model: result.model,
            pageCount: result.pageCount,
          },
        );
      } catch (error) {
        if (
          cancellation.signal.aborted ||
          cancellation.closedBeforeCompletion() ||
          isAbortLikeError(error)
        ) {
          logger.info(
            {
              event: "extraction_cancelled",
              path: request.path,
              requestId: request.requestId,
            },
            "Extraction cancelled",
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
