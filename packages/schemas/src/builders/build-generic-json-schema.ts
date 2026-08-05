import { z } from "zod";

import {
  discoveredDocumentSchemaSchema,
  type DiscoveredDocumentSchema,
} from "../contracts/generic-document.js";
import { buildGenericDocumentExtractionValuesSchema } from "./build-generic-document-schema.js";
import type { JsonObject, JsonValue } from "./build-json-schema.js";

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toJsonObjectSchema = (schema: z.ZodType, description: string): JsonObject => {
  const converted = z.toJSONSchema(schema, {
    cycles: "throw",
    reused: "inline",
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
  const jsonValue = JSON.parse(JSON.stringify(converted)) as JsonValue;

  if (!isJsonObject(jsonValue)) {
    throw new Error(`${description} JSON Schema conversion did not return an object.`);
  }

  const { "~standard": _standard, ...jsonSchema } = jsonValue;
  void _standard;
  return jsonSchema;
};

export const buildGenericDiscoveryJsonSchema = (): JsonObject =>
  toJsonObjectSchema(discoveredDocumentSchemaSchema, "Generic discovery");

export const buildGenericExtractionJsonSchema = (
  documentSchema: DiscoveredDocumentSchema,
): JsonObject =>
  toJsonObjectSchema(
    buildGenericDocumentExtractionValuesSchema(documentSchema),
    `Generic extraction for ${documentSchema.documentType}`,
  );
