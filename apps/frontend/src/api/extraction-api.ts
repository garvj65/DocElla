import {
  buildPublicExtractionResultSchema,
  type PublicDocumentConfig,
  type PublicExtractionResult,
} from "@docella/schemas/public";

import type { FrontendEnvironment } from "../config/environment";
import { FrontendApiError } from "./api-error";
import { buildUrl, parseJsonEnvelopeResponse } from "./api-client";

export interface ExtractionApi {
  extract(input: {
    readonly config: PublicDocumentConfig;
    readonly file: File;
    readonly signal?: AbortSignal;
  }): Promise<PublicExtractionResult>;
}

const parseExtractionResult = (
  config: PublicDocumentConfig,
  data: unknown,
  status: number,
): PublicExtractionResult => {
  const result = buildPublicExtractionResultSchema(config).safeParse(data);

  if (!result.success) {
    throw new FrontendApiError({
      code: "MALFORMED_EXTRACTION_RESULT",
      status,
      message: "The extraction service returned an invalid structured result.",
    });
  }

  return result.data;
};

export const createExtractionApi = (environment: FrontendEnvironment): ExtractionApi => ({
  async extract({ config, file, signal }) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("schemaType", config.id);

    const requestInit: RequestInit =
      signal === undefined
        ? {
            body: formData,
            headers: {
              Accept: "application/json",
            },
            method: "POST",
          }
        : {
            body: formData,
            headers: {
              Accept: "application/json",
            },
            method: "POST",
            signal,
          };

    const response = await fetch(buildUrl(environment.apiBaseUrl, "/api/extract"), requestInit);
    const envelope = await parseJsonEnvelopeResponse(response, "extraction service");

    return parseExtractionResult(
      config,
      {
        data: envelope.data,
        meta: envelope.meta,
      },
      response.status,
    );
  },
});
