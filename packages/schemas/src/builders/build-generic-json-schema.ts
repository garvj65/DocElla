import type {
  DiscoveredDocumentSchema,
  DiscoveredField,
  DiscoveredTableColumn,
  GenericSelectOption,
} from "../contracts/generic-document.js";
import type { JsonObject, JsonValue } from "./build-json-schema.js";

type JsonProperties = Readonly<Record<string, JsonValue>>;

type PrimitiveJsonType = "string" | "number" | "boolean";

const closedObject = (properties: JsonProperties): JsonObject => ({
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
  type: "object",
});

const primitiveSchema = (type: PrimitiveJsonType): JsonObject => ({ type });

const nullablePrimitiveSchema = (type: PrimitiveJsonType): JsonObject => ({
  type: [type, "null"],
});

const enumSchema = (values: readonly string[]): JsonObject => ({
  enum: [...values],
  type: "string",
});

const nullableEnumSchema = (values: readonly string[]): JsonObject => ({
  enum: [...values, null],
  type: ["string", "null"],
});

const genericIdentifierProviderSchema = (): JsonObject => primitiveSchema("string");
const boundedLabelProviderSchema = (): JsonObject => primitiveSchema("string");
const boundedDescriptionProviderSchema = (): JsonObject => primitiveSchema("string");

const selectOptionProviderSchema = (): JsonObject =>
  closedObject({
    label: primitiveSchema("string"),
    value: primitiveSchema("string"),
  });

const discoveredFieldProviderSchema = (): JsonObject =>
  closedObject({
    description: boundedDescriptionProviderSchema(),
    id: genericIdentifierProviderSchema(),
    label: boundedLabelProviderSchema(),
    options: {
      items: selectOptionProviderSchema(),
      type: "array",
    },
    repeatable: primitiveSchema("boolean"),
    required: primitiveSchema("boolean"),
    valueType: enumSchema([
      "text",
      "long_text",
      "number",
      "currency",
      "date",
      "boolean",
      "email",
      "phone",
      "address",
      "identifier",
      "select",
    ]),
  });

const discoveredSectionProviderSchema = (): JsonObject =>
  closedObject({
    description: boundedDescriptionProviderSchema(),
    fields: {
      items: discoveredFieldProviderSchema(),
      type: "array",
    },
    id: genericIdentifierProviderSchema(),
    label: boundedLabelProviderSchema(),
  });

const tableColumnProviderSchema = (): JsonObject =>
  closedObject({
    description: boundedDescriptionProviderSchema(),
    id: genericIdentifierProviderSchema(),
    label: boundedLabelProviderSchema(),
    required: primitiveSchema("boolean"),
    valueType: enumSchema([
      "text",
      "number",
      "currency",
      "date",
      "boolean",
      "email",
      "phone",
      "address",
      "identifier",
    ]),
  });

const discoveredTableProviderSchema = (): JsonObject =>
  closedObject({
    columns: {
      items: tableColumnProviderSchema(),
      type: "array",
    },
    description: boundedDescriptionProviderSchema(),
    id: genericIdentifierProviderSchema(),
    label: boundedLabelProviderSchema(),
  });

export const buildGenericDiscoveryJsonSchema = (): JsonObject =>
  closedObject({
    documentType: genericIdentifierProviderSchema(),
    documentTypeLabel: boundedLabelProviderSchema(),
    language: nullablePrimitiveSchema("string"),
    schemaVersion: {
      enum: [1],
      type: "integer",
    },
    sections: {
      items: discoveredSectionProviderSchema(),
      type: "array",
    },
    tables: {
      items: discoveredTableProviderSchema(),
      type: "array",
    },
    title: nullablePrimitiveSchema("string"),
  });

const scalarProviderSchema = (definition: DiscoveredField | DiscoveredTableColumn): JsonObject => {
  switch (definition.valueType) {
    case "number":
    case "currency":
      return primitiveSchema("number");
    case "boolean":
      return primitiveSchema("boolean");
    case "select":
      return enumSchema(definition.options.map((option: GenericSelectOption) => option.value));
    case "text":
    case "long_text":
    case "date":
    case "email":
    case "phone":
    case "address":
    case "identifier":
      return primitiveSchema("string");
  }
};

const nullableScalarProviderSchema = (
  definition: DiscoveredField | DiscoveredTableColumn,
): JsonObject => {
  switch (definition.valueType) {
    case "number":
    case "currency":
      return nullablePrimitiveSchema("number");
    case "boolean":
      return nullablePrimitiveSchema("boolean");
    case "select":
      return nullableEnumSchema(
        definition.options.map((option: GenericSelectOption) => option.value),
      );
    case "text":
    case "long_text":
    case "date":
    case "email":
    case "phone":
    case "address":
    case "identifier":
      return nullablePrimitiveSchema("string");
  }
};

const fieldValueProviderSchema = (field: DiscoveredField): JsonObject => {
  if (!field.repeatable) return nullableScalarProviderSchema(field);
  return {
    items: scalarProviderSchema(field),
    type: "array",
  };
};

const tableRowProviderSchema = (columns: readonly DiscoveredTableColumn[]): JsonObject =>
  closedObject(
    Object.fromEntries(columns.map((column) => [column.id, nullableScalarProviderSchema(column)])),
  );

export const buildGenericExtractionJsonSchema = (
  documentSchema: DiscoveredDocumentSchema,
): JsonObject => {
  const fieldProperties: Record<string, JsonValue> = {};
  for (const section of documentSchema.sections) {
    for (const field of section.fields) {
      fieldProperties[field.id] = fieldValueProviderSchema(field);
    }
  }

  const tableProperties: Record<string, JsonValue> = {};
  for (const table of documentSchema.tables) {
    tableProperties[table.id] = {
      items: tableRowProviderSchema(table.columns),
      type: "array",
    };
  }

  const valueProperties: Record<string, JsonValue> = {};
  if (Object.keys(fieldProperties).length > 0) {
    valueProperties.fields = closedObject(fieldProperties);
  }
  if (Object.keys(tableProperties).length > 0) {
    valueProperties.tables = closedObject(tableProperties);
  }

  if (Object.keys(valueProperties).length === 0) {
    throw new Error("A discovered document schema must contain at least one field or table.");
  }

  return closedObject(valueProperties);
};
