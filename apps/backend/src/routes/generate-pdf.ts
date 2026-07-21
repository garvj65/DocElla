import { buildSubmissionSchema, getDocumentDefinition } from "@docella/schemas";
import express, { Router } from "express";
import type { Logger } from "pino";
import { z } from "zod";

import type { Environment } from "../config/environment.js";
import { AppError } from "../errors/app-error.js";
import { isAbortLikeError } from "../errors/extraction-aborted-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { bindRequestCancellation } from "../http/request-cancellation.js";
import {
  createGenerationRateLimit,
  type GenerationRateLimitOptions,
} from "../middleware/generation-rate-limit.js";
import type { PdfGenerationService } from "../pdf-generation/pdf-generation-types.js";
import { resolveTemplate } from "../pdf-generation/template-resolver.js";

const plainValuesSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.getPrototypeOf(value) === Object.prototype, "values must be an object");

const generatePdfRequestSchema = z
  .object({
    flatten: z.boolean().optional(),
    schemaType: z.string().trim().min(1).max(100),
    templateId: z.string().trim().min(1).max(100),
    values: plainValuesSchema,
  })
  .strict();

const safeValidationDetails = (
  error: z.ZodError,
): { readonly field: string; readonly reason: string } | undefined => {
  const issue = error.issues[0];
  if (issue === undefined) {
    return undefined;
  }

  const field = issue.path.find((segment): segment is string => typeof segment === "string");
  return {
    field: field ?? "request",
    reason: issue.code,
  };
};

const validationErrorOptions = (
  code:
    | typeof ERROR_CODES.INVALID_GENERATION_REQUEST
    | typeof ERROR_CODES.INVALID_GENERATION_VALUES,
  message: string,
  status: number,
  error: z.ZodError,
) => {
  const details = safeValidationDetails(error);
  return details === undefined ? { code, message, status } : { code, details, message, status };
};

export interface CreateGeneratePdfRouterOptions {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly pdfGenerationService: PdfGenerationService;
  readonly rateLimit?: GenerationRateLimitOptions;
}

export const createGeneratePdfRouter = ({
  environment,
  logger,
  pdfGenerationService,
  rateLimit,
}: CreateGeneratePdfRouterOptions): Router => {
  const router = Router();

  router.post(
    "/",
    (_request, response, next) => {
      response.setHeader("Cache-Control", "no-store");
      next();
    },
    createGenerationRateLimit(environment, rateLimit),
    express.json({ limit: "1mb", strict: true, type: "application/json" }),
    async (request, response, next) => {
      const cancellation = bindRequestCancellation(request, response);
      try {
        const parsedRequest = generatePdfRequestSchema.safeParse(request.body);
        if (!parsedRequest.success) {
          throw new AppError(
            validationErrorOptions(
              ERROR_CODES.INVALID_GENERATION_REQUEST,
              "The PDF generation request is invalid.",
              400,
              parsedRequest.error,
            ),
          );
        }

        const documentDefinition = getDocumentDefinition(parsedRequest.data.schemaType);
        if (documentDefinition === undefined) {
          throw new AppError({
            code: ERROR_CODES.UNKNOWN_SCHEMA,
            message: "The requested document schema does not exist.",
            status: 404,
          });
        }

        const template = resolveTemplate(documentDefinition, parsedRequest.data.templateId);
        const submissionSchema = buildSubmissionSchema(documentDefinition);
        const parsedValues = submissionSchema.safeParse(parsedRequest.data.values);
        if (!parsedValues.success) {
          throw new AppError(
            validationErrorOptions(
              ERROR_CODES.INVALID_GENERATION_VALUES,
              "The submitted values are invalid for the requested schema.",
              422,
              parsedValues.error,
            ),
          );
        }

        const generationRequest = {
          documentDefinition,
          signal: cancellation.signal,
          template,
          values: parsedValues.data,
        };
        const generated = await pdfGenerationService.generate(
          parsedRequest.data.flatten === undefined
            ? generationRequest
            : { ...generationRequest, flatten: parsedRequest.data.flatten },
        );

        if (
          cancellation.signal.aborted ||
          cancellation.closedBeforeCompletion() ||
          response.writableEnded ||
          response.destroyed
        ) {
          logger.info(
            {
              event: "generation_client_disconnected",
              path: request.path,
              requestId: request.requestId,
            },
            "PDF generation response skipped after client disconnect",
          );
          return;
        }

        logger.info(
          {
            bytes: generated.bytes.byteLength,
            event: "pdf_generated",
            flattened: generated.flattened,
            requestId: request.requestId,
            schemaType: generated.schemaType,
            templateId: generated.templateId,
          },
          "PDF generated",
        );
        response.status(200);
        response.setHeader("Content-Type", "application/pdf");
        response.setHeader("Content-Disposition", `attachment; filename="${generated.filename}"`);
        response.setHeader("Content-Length", String(generated.bytes.byteLength));
        response.setHeader("Cache-Control", "no-store");
        response.send(Buffer.from(generated.bytes));
      } catch (error) {
        if (
          cancellation.signal.aborted ||
          cancellation.closedBeforeCompletion() ||
          isAbortLikeError(error)
        ) {
          logger.info(
            {
              event: "generation_cancelled",
              path: request.path,
              requestId: request.requestId,
            },
            "PDF generation cancelled",
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
