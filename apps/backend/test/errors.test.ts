import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";

describe("AppError", () => {
  it("stores safe error metadata", () => {
    const cause = new Error("internal");
    const error = new AppError({
      cause,
      code: ERROR_CODES.UNKNOWN_SCHEMA,
      details: { schemaType: "unknown" },
      message: "The requested document schema does not exist.",
      status: 404,
    });

    expect(error.status).toBe(404);
    expect(error.code).toBe("UNKNOWN_SCHEMA");
    expect(error.message).toBe("The requested document schema does not exist.");
    expect(error.details).toEqual({ schemaType: "unknown" });
    expect(error.cause).toBe(cause);
    expect(error.isOperational).toBe(true);
  });
});
