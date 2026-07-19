import { z } from "zod";

import type { DocumentDefinition } from "../contracts/document-definition";
import { buildExtractionSchema } from "./build-extraction-schema";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject extends Readonly<Record<string, JsonValue>> {
  readonly jsonObjectBrand?: "JsonObject";
}

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const buildJsonSchema = (documentDefinition: DocumentDefinition): JsonObject => {
  const schema = z.toJSONSchema(buildExtractionSchema(documentDefinition), {
    target: "draft-2020-12",
    unrepresentable: "throw",
    cycles: "throw",
    reused: "inline",
  });

  const jsonValue = JSON.parse(JSON.stringify(schema)) as JsonValue;

  if (!isJsonObject(jsonValue)) {
    throw new Error(
      `JSON Schema conversion for "${documentDefinition.id}" did not return an object.`,
    );
  }

  const { "~standard": _standard, ...jsonSchema } = jsonValue;
  void _standard;

  return jsonSchema;
};
