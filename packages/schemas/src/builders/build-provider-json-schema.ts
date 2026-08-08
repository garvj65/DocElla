import type { DocumentDefinition } from "../contracts/document-definition.js";
import type { FieldDefinition } from "../contracts/field-definition.js";
import type { JsonObject, JsonValue } from "./build-json-schema.js";

const closedObject = (properties: Readonly<Record<string, JsonValue>>): JsonObject => ({
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
  type: "object",
});

const nullablePrimitive = (type: "string" | "number"): JsonObject => ({
  type: [type, "null"],
});

const providerFieldSchema = (field: FieldDefinition): JsonObject => {
  switch (field.kind) {
    case "number":
    case "currency":
      return nullablePrimitive("number");
    case "select":
      return {
        enum: [...field.options.map((option) => option.value), null],
        type: ["string", "null"],
      };
    case "text":
    case "textarea":
    case "email":
    case "phone":
    case "date":
      return nullablePrimitive("string");
  }
};

export const buildProviderExtractionJsonSchema = (
  documentDefinition: DocumentDefinition,
): JsonObject =>
  closedObject(
    Object.fromEntries(
      documentDefinition.fields.map((field) => [field.key, providerFieldSchema(field)]),
    ),
  );
