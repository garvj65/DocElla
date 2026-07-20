import {
  publicDocumentConfigSchema,
  publicDocumentSummarySchema,
  type PublicDocumentConfig,
  type PublicDocumentSummary,
} from "@docella/schemas/public";
import { z } from "zod";

import type { FrontendEnvironment } from "../config/environment";
import { FrontendApiError } from "./api-error";
import { getJson } from "./api-client";

const summaryListSchema = z.array(publicDocumentSummarySchema).readonly();

const parsePublicData = <T>(parser: z.ZodType<T>, data: unknown): T => {
  const result = parser.safeParse(data);
  if (!result.success) {
    throw new FrontendApiError({
      code: "MALFORMED_PUBLIC_SCHEMA",
      status: 502,
      message: "The schema service returned invalid public configuration.",
    });
  }

  return result.data;
};

export const createSchemaApi = (environment: FrontendEnvironment) => ({
  async listDocumentSummaries(signal?: AbortSignal): Promise<readonly PublicDocumentSummary[]> {
    return parsePublicData(
      summaryListSchema,
      await getJson(environment.apiBaseUrl, "/api/schemas", signal),
    );
  },

  async getDocumentConfig(schemaType: string, signal?: AbortSignal): Promise<PublicDocumentConfig> {
    const encodedSchemaType = encodeURIComponent(schemaType);
    return parsePublicData(
      publicDocumentConfigSchema,
      await getJson(environment.apiBaseUrl, `/api/schemas/${encodedSchemaType}`, signal),
    );
  },
});

export type SchemaApi = ReturnType<typeof createSchemaApi>;
