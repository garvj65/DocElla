import type {
  DiscoveredDocumentSchema,
  DiscoveredField,
  DiscoveredTableColumn,
  GenericSelectOption,
} from "../contracts/generic-document.js";
import type { JsonObject, JsonValue } from "./build-json-schema.js";

type JsonProperties = Readonly<Record<string, JsonValue>>;

const closedObject = (properties: JsonProperties): JsonObject => ({
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
  type: "object",
});

const nullable = (schema: JsonObject): JsonObject => ({
  anyOf: [schema, { type: "null" }],
});

const stringSchema = (): JsonObject => ({ type: "string" });
const numberSchema = (): JsonObject => ({ type: "number" });
const booleanSchema = (): JsonObject => ({ type: "boolean" });

const enumSchema = (values: readonly string[]): JsonObject => ({
  enum: [...values],
  type: "string",
});

const genericIdentifierProviderSchema = (): JsonObject => stringSchema();
const boundedLabelProviderSchema = (): JsonObject => stringSchema();
const boundedDescriptionProviderSchema = (): JsonObject => stringSchema();

const selectOptionProviderSchema = (): JsonObject =>
  closedObject({
    label: stringSchema(),
    value: stringSchema(),
  });

const nonSelectFieldProviderSchema = (): JsonObject =>
  closedObject({
    description: boundedDescriptionProviderSchema(),
    id: genericIdentifierProviderSchema(),
    label: boundedLabelProviderSchema(),
    repeatable: booleanSchema(),
    required: booleanSchema(),
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
    ]),
  });

const selectFieldProviderSchema = (): JsonObject =>
  closedObject({
    description: boundedDescriptionProviderSchema(),
    id: genericIdentifierProviderSchema(),
    label: boundedLabelProviderSchema(),
    options: {
      items: selectOptionProviderSchema(),
      type: "array",
    },
    repeatable: booleanSchema(),
    required: booleanSchema(),
    valueType: enumSchema(["select"]),
  });

const discoveredFieldProviderSchema = (): JsonObject => ({
  anyOf: [nonSelectFieldProviderSchema(), selectFieldProviderSchema()],
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
    required: booleanSchema(),
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
    language: nullable(stringSchema()),
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
    title: nullable(stringSchema()),
  });

const scalarProviderSchema = (definition: DiscoveredField | DiscoveredTableColumn): JsonObject => {
  switch (definition.valueType) {
    case "number":
    case "currency":
      return numberSchema();
    case "boolean":
      return booleanSchema();
    case "select":
      return enumSchema(definition.options.map((option: GenericSelectOption) => option.value));
    case "text":
    case "long_text":
    case "date":
    case "email":
    case "phone":
    case "address":
    case "identifier":
      return stringSchema();
  }
};

const fieldValueProviderSchema = (field: DiscoveredField): JsonObject => {
  const scalar = scalarProviderSchema(field);
  if (!field.repeatable) return nullable(scalar);
  return nullable({
    items: scalar,
    type: "array",
  });
};

const tableRowProviderSchema = (columns: readonly DiscoveredTableColumn[]): JsonObject =>
  closedObject(
    Object.fromEntries(
      columns.map((column) => [column.id, nullable(scalarProviderSchema(column))]),
    ),
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

  return closedObject({
    fields: closedObject(fieldProperties),
    tables: closedObject(tableProperties),
  });
};
