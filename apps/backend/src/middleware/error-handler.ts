import type { ErrorRequestHandler, Request } from "express";
import type { Logger } from "pino";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { sendError } from "../http/responses.js";

interface ParserError {
  readonly body?: unknown;
  readonly expose?: boolean;
  readonly message?: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly type?: string;
}

const isParserError = (error: unknown): error is ParserError =>
  typeof error === "object" && error !== null;

const pathOnly = (request: Request): string => request.path;

const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (isParserError(error) && error.type === "entity.parse.failed") {
    return new AppError({
      cause: error,
      code: ERROR_CODES.INVALID_JSON,
      message: "The request body must be valid JSON.",
      status: 400,
    });
  }

  if (isParserError(error) && error.type === "entity.too.large") {
    return new AppError({
      cause: error,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: "The request body is too large.",
      status: 413,
    });
  }

  return new AppError({
    cause: error,
    code: ERROR_CODES.INTERNAL_ERROR,
    isOperational: false,
    message: "An unexpected error occurred.",
    status: 500,
  });
};

export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (error, request, response, next): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const appError = toAppError(error);
    const logPayload = {
      code: appError.code,
      method: request.method,
      path: pathOnly(request),
      requestId: request.requestId,
    };

    if (appError.status >= 500 || !appError.isOperational) {
      logger.error({ ...logPayload, err: appError.cause ?? appError }, "Request failed");
    } else {
      logger.warn(logPayload, "Request rejected");
    }

    sendError(response, appError.status, appError.code, appError.message, appError.details);
  };
