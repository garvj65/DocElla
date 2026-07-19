import type { Response } from "express";

import type { ErrorCode } from "../errors/error-codes.js";
import type { ErrorDetails } from "../errors/app-error.js";

interface ResponseMeta {
  readonly requestId: string;
  readonly [key: string]: string | number | boolean | null;
}

interface SuccessEnvelope {
  readonly success: true;
  readonly data: unknown;
  readonly meta: ResponseMeta;
}

interface ErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly details?: ErrorDetails;
    readonly message: string;
  };
  readonly meta: ResponseMeta;
}

export const sendSuccess = (
  response: Response,
  status: number,
  data: unknown,
  meta: Omit<ResponseMeta, "requestId"> = {},
): void => {
  const body: SuccessEnvelope = {
    data,
    meta: {
      requestId: response.req.requestId,
      ...meta,
    },
    success: true,
  };

  response.status(status).json(body);
};

export const sendError = (
  response: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetails,
): void => {
  const error = details === undefined ? { code, message } : { code, details, message };
  const body: ErrorEnvelope = {
    error,
    meta: {
      requestId: response.req.requestId,
    },
    success: false,
  };

  response.status(status).json(body);
};
