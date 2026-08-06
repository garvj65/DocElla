import {
  buildGenericDocumentExtractionResultSchema,
  discoveredDocumentSchemaSchema,
  type GenericDocumentExtractionResult,
} from "@docella/schemas/public";

import type { FrontendEnvironment } from "../config/environment";
import { FrontendApiError } from "./api-error";
import { buildUrl, parseJsonEnvelopeResponse } from "./api-client";

export interface GenericDocumentApi {
  extract(input: {
    readonly file: File;
    readonly signal?: AbortSignal;
  }): Promise<GenericDocumentExtractionResult>;
}

const parseResult = (data: unknown, status: number): GenericDocumentExtractionResult => {
  if (typeof data !== "object" || data === null || !("schema" in data)) {
    throw new FrontendApiError({
      code: "MALFORMED_GENERIC_EXTRACTION_RESULT",
      message: "The extraction service returned an invalid document result.",
      status,
    });
  }

  const schemaResult = discoveredDocumentSchemaSchema.safeParse(
    (data as Readonly<Record<"schema", unknown>>).schema,
  );
  if (!schemaResult.success) {
    throw new FrontendApiError({
      code: "MALFORMED_GENERIC_EXTRACTION_RESULT",
      message: "The extraction service returned an invalid discovered schema.",
      status,
    });
  }

  const result = buildGenericDocumentExtractionResultSchema(schemaResult.data).safeParse(data);
  if (!result.success) {
    throw new FrontendApiError({
      code: "MALFORMED_GENERIC_EXTRACTION_RESULT",
      message: "The extraction service returned an invalid document result.",
      status,
    });
  }

  return result.data;
};

export const createGenericDocumentApi = (environment: FrontendEnvironment): GenericDocumentApi => ({
  async extract({ file, signal }) {
    const formData = new FormData();
    formData.append("file", file);

    const request: RequestInit = {
      body: formData,
      headers: { Accept: "application/json" },
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    };
    const response = await fetch(
      buildUrl(environment.apiBaseUrl, "/api/documents/extract"),
      request,
    );
    const envelope = await parseJsonEnvelopeResponse(response, "generic extraction service");
    return parseResult(envelope.data, response.status);
  },
});
