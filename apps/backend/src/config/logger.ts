import type { Request, Response } from "express";
import pino, { type Logger } from "pino";
import { pinoHttp } from "pino-http";

import type { Environment } from "./environment.js";

const pathOnly = (url: string | undefined): string => {
  if (url === undefined) {
    return "";
  }

  return url.split("?", 1)[0] ?? "";
};

export const createLogger = (environment: Environment): Logger =>
  pino({
    base: {
      environment: environment.nodeEnv,
      service: "docella-backend",
    },
    level: environment.logLevel,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-api-key",
        "req.headers.x-groq-api-key",
        "res.headers.set-cookie",
      ],
      remove: true,
    },
  });

export const createHttpLogger = (logger: Logger) =>
  pinoHttp<Request, Response>({
    customLogLevel: (_request, response, error) => {
      if (error !== undefined || response.statusCode >= 500) {
        return "error";
      }

      if (response.statusCode >= 400) {
        return "warn";
      }

      return "info";
    },
    customProps: (request) => ({
      requestId: request.requestId,
    }),
    genReqId: (request, response) => {
      response.setHeader("X-Request-Id", request.requestId);
      return request.requestId;
    },
    logger,
    serializers: {
      err: pino.stdSerializers.err,
      req: (request: Request) => ({
        id: request.id,
        method: request.method,
        remoteAddress: request.socket.remoteAddress,
        url: pathOnly(request.url),
      }),
      res: (response: Response) => ({
        statusCode: response.statusCode,
      }),
    },
    wrapSerializers: false,
  });
