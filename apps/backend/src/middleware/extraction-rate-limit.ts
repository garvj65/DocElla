import rateLimit, { type Options } from "express-rate-limit";

import type { Environment } from "../config/environment.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { sendError } from "../http/responses.js";

export const createExtractionRateLimit = (environment: Environment) =>
  rateLimit({
    handler: (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      sendError(
        response,
        429,
        ERROR_CODES.EXTRACTION_RATE_LIMITED,
        "Too many extraction requests. Please try again later.",
      );
    },
    legacyHeaders: false,
    limit: environment.extractRateLimitMax,
    standardHeaders: "draft-8",
    windowMs: environment.extractRateLimitWindowMs,
  } satisfies Partial<Options>);
