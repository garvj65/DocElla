import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

const normalizeRequestId = (value: unknown): string => {
  if (typeof value === "string" && requestIdPattern.test(value)) {
    return value;
  }

  return randomUUID();
};

export const requestContext = (request: Request, response: Response, next: NextFunction): void => {
  const requestId = normalizeRequestId(request.header("X-Request-Id"));

  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
};
