import { getDocumentDefinition } from "@docella/schemas";
import { Router } from "express";

import { AppError } from "../errors/app-error.js";
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

export const createExtractRouter = ({
  environment,
  extractionService,
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
        });

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
        next(error);
      }
    },
  );

  return router;
};
