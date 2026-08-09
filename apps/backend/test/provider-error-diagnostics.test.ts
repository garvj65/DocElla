import { describe, expect, it } from "vitest";

import { providerErrorDiagnosticContext } from "../src/extraction/provider-error-diagnostics.js";

describe("providerErrorDiagnosticContext", () => {
  it("extracts actionable Groq metadata without failed-generation content", () => {
    const context = providerErrorDiagnosticContext({
      error: {
        error: {
          code: "invalid_json_schema",
          failed_generation: "PRIVATE_DOCUMENT_CONTENT Alex Morgan",
          message: "Invalid JSON schema: every object property must be required.",
          type: "invalid_request_error",
        },
      },
      headers: new Headers({ "x-request-id": "req_123" }),
      status: 400,
    });

    expect(context).toMatchObject({
      providerErrorCode: "invalid_json_schema",
      providerErrorMessage: "Invalid JSON schema: every object property must be required.",
      providerErrorReason: "invalid_schema",
      providerErrorType: "invalid_request_error",
      providerHttpStatus: 400,
      providerRequestId: "req_123",
    });
    expect(JSON.stringify(context)).not.toContain("PRIVATE_DOCUMENT_CONTENT");
    expect(JSON.stringify(context)).not.toContain("Alex Morgan");
  });

  it("redacts common sensitive values from provider messages", () => {
    const context = providerErrorDiagnosticContext({
      error: {
        message:
          "Rejected alex@example.test, +91 9743011840, and gsk_1234567890abcdef while validating the request.",
        type: "invalid_request_error",
      },
      status: 400,
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("alex@example.test");
    expect(serialized).not.toContain("9743011840");
    expect(serialized).not.toContain("gsk_1234567890abcdef");
    expect(serialized).toContain("[redacted-email]");
    expect(serialized).toContain("[redacted-phone]");
    expect(serialized).toContain("[redacted-secret]");
  });

  it("does not promote an arbitrary Error message into safe logs", () => {
    const error = new Error("PRIVATE_PROVIDER_BODY Alex Morgan alex@example.test") as Error & {
      status: number;
    };
    error.status = 400;

    const context = providerErrorDiagnosticContext(error);

    expect(context).toEqual({
      providerErrorReason: "bad_request",
      providerHttpStatus: 400,
    });
    expect(JSON.stringify(context)).not.toContain("PRIVATE_PROVIDER_BODY");
  });
});
