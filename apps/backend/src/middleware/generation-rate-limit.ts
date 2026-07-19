import rateLimit, { MemoryStore, type Options } from "express-rate-limit";

import type { Environment } from "../config/environment.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { sendError } from "../http/responses.js";

export interface GenerationRateLimitOptions {
  readonly store?: Options["store"];
}

export const createGenerationRateLimit = (
  environment: Environment,
  options: GenerationRateLimitOptions = {},
) =>
  rateLimit({
    handler: (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      sendError(
        response,
        429,
        ERROR_CODES.GENERATION_RATE_LIMITED,
        "Too many PDF generation requests. Please try again later.",
      );
    },
    legacyHeaders: false,
    limit: environment.generateRateLimitMax,
    standardHeaders: "draft-8",
    store: options.store ?? new MemoryStore(),
    windowMs: environment.generateRateLimitWindowMs,
  } satisfies Partial<Options>);
