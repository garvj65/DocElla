import { describe, expect, it } from "vitest";

import { mapProviderError } from "../src/extraction/groq-structured-extractor.js";
import { testEnvironment } from "./support/create-test-app.js";

const providerBadRequest = (message: string) => {
  const error = new Error(message) as Error & { status: number };
  error.name = "BadRequestError";
  error.status = 400;
  return error;
};

describe("safe provider rejection diagnostics", () => {
  it("extracts schema metadata without retaining provider message text", () => {
    const privateMarker = "PRIVATE_DOCUMENT_VALUE";
    const error = providerBadRequest(
      `400 ${JSON.stringify({
        error: {
          message: `invalid JSON schema for response_format: ${privateMarker}`,
          param: "response_format",
          schema_kind: "required",
          schema_path: "/properties/tables",
          type: "invalid_request_error",
        },
      })}`,
    );

    const mapped = mapProviderError(testEnvironment, error);

    expect(mapped.safeLogContext).toMatchObject({
      providerErrorParam: "response_format",
      providerErrorReason: "invalid_json_schema",
      providerErrorType: "invalid_request_error",
      providerHttpStatus: 400,
      providerSchemaKind: "required",
      providerSchemaPath: "/properties/tables",
    });
    expect(JSON.stringify(mapped.safeLogContext)).not.toContain(privateMarker);
  });

  it("classifies context-length failures without logging raw provider messages", () => {
    const privateMarker = "PRIVATE_RESUME_TEXT";
    const error = providerBadRequest(
      `400 ${JSON.stringify({
        error: {
          code: "context_length_exceeded",
          message: `context length exceeded ${privateMarker}`,
          type: "invalid_request_error",
        },
      })}`,
    );

    const mapped = mapProviderError(testEnvironment, error);

    expect(mapped.safeLogContext).toMatchObject({
      providerErrorCode: "context_length_exceeded",
      providerErrorReason: "context_length_exceeded",
      providerErrorType: "invalid_request_error",
      providerHttpStatus: 400,
    });
    expect(JSON.stringify(mapped.safeLogContext)).not.toContain(privateMarker);
  });
});
