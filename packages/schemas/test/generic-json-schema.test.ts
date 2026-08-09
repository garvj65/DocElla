import { describe, expect, it } from "vitest";

import {
  GENERIC_DOCUMENT_SCHEMA_VERSION,
  buildGenericDiscoveryJsonSchema,
  buildGenericExtractionJsonSchema,
  type DiscoveredDocumentSchema,
  type JsonObject,
  type JsonValue,
} from "../src/index";

const schema = {
  documentType: "purchase_order",
  documentTypeLabel: "Purchase order",
  language: "en",
  schemaVersion: GENERIC_DOCUMENT_SCHEMA_VERSION,
  sections: [
    {
      description: "Purchase order header.",
      fields: [
        {
          description: "Purchase order number.",
          id: "order_number",
          label: "Order number",
          repeatable: false,
          required: true,
          valueType: "identifier",
        },
        {
          description: "Contact email.",
          id: "contact_email",
          label: "Contact email",
          repeatable: false,
          required: false,
          valueType: "email",
        },
        {
          description: "Approval states.",
          id: "approval_states",
          label: "Approval states",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
          ],
          repeatable: true,
          required: false,
          valueType: "select",
        },
      ],
      id: "header",
      label: "Header",
    },
  ],
  tables: [
    {
      columns: [
        {
          description: "Item description.",
          id: "description",
          label: "Description",
          required: true,
          valueType: "text",
        },
        {
          description: "Item amount.",
          id: "amount",
          label: "Amount",
          required: true,
          valueType: "currency",
        },
      ],
      description: "Ordered items.",
      id: "items",
      label: "Items",
    },
  ],
  title: "Purchase order PO-1001",
} as const satisfies DiscoveredDocumentSchema;

const isObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertGroqStrictCompatible = (schemaValue: JsonValue, path = "$root"): void => {
  if (Array.isArray(schemaValue)) {
    schemaValue.forEach((item, index) =>
      assertGroqStrictCompatible(item, `${path}[${String(index)}]`),
    );
    return;
  }
  if (!isObject(schemaValue)) return;

  const properties = schemaValue.properties;
  if (isObject(properties)) {
    expect(
      Object.keys(properties).length,
      `${path} must not be an empty object schema`,
    ).toBeGreaterThan(0);
    expect(schemaValue.additionalProperties, `${path} must be closed`).toBe(false);
    const expectedRequired = Object.keys(properties).sort();
    const required = schemaValue.required;
    expect(Array.isArray(required), `${path} must define required`).toBe(true);
    expect(
      [...(required as JsonValue[])].map(String).sort(),
      `${path} must require all properties`,
    ).toEqual(expectedRequired);
  }

  for (const [key, value] of Object.entries(schemaValue)) {
    if (key === "required") continue;
    assertGroqStrictCompatible(value, `${path}.${key}`);
  }
};

const rootProperties = (value: JsonObject): JsonObject => {
  if (!isObject(value.properties)) throw new Error("Expected root schema properties.");
  return value.properties;
};

describe("generic provider JSON Schemas", () => {
  it("generates a simple Groq strict-compatible discovery schema", () => {
    const discovery = buildGenericDiscoveryJsonSchema();
    const serialized = JSON.stringify(discovery);

    expect(discovery.type).toBe("object");
    expect(discovery.additionalProperties).toBe(false);
    expect(serialized).toContain("documentType");
    expect(serialized).toContain("sections");
    expect(serialized).toContain("tables");
    expect(serialized).toContain("options");
    expect(serialized).not.toContain("~standard");
    expect(serialized).not.toContain('"format"');
    expect(serialized).not.toContain('"anyOf"');
    assertGroqStrictCompatible(discovery);
  });

  it("generates an exact simple Groq strict-compatible values schema", () => {
    const extraction = buildGenericExtractionJsonSchema(schema);
    const serialized = JSON.stringify(extraction);
    const properties = rootProperties(extraction);
    const fieldsSchema = properties.fields;
    if (!isObject(fieldsSchema)) throw new Error("Expected fields schema.");
    const fields = rootProperties(fieldsSchema);
    const repeatableField = fields.approval_states;
    if (!isObject(repeatableField)) throw new Error("Expected repeatable field schema.");

    expect(extraction.type).toBe("object");
    expect(extraction.additionalProperties).toBe(false);
    expect(serialized).toContain("order_number");
    expect(serialized).toContain("contact_email");
    expect(serialized).toContain("approval_states");
    expect(serialized).toContain("items");
    expect(serialized).toContain("description");
    expect(serialized).toContain("amount");
    expect(serialized).not.toContain("~standard");
    expect(serialized).not.toContain('"format"');
    expect(serialized).not.toContain('"anyOf"');
    expect(serialized).not.toContain('"type":["array","null"]');
    expect(repeatableField.type).toBe("array");
    assertGroqStrictCompatible(extraction);
  });

  it("omits the empty tables object for field-only documents", () => {
    const fieldOnlySchema = {
      ...schema,
      tables: [],
    } as const satisfies DiscoveredDocumentSchema;
    const extraction = buildGenericExtractionJsonSchema(fieldOnlySchema);
    const properties = rootProperties(extraction);

    expect(properties).toHaveProperty("fields");
    expect(properties).not.toHaveProperty("tables");
    expect(extraction.required).toEqual(["fields"]);
    assertGroqStrictCompatible(extraction);
  });

  it("omits the empty fields object for table-only documents", () => {
    const tableOnlySchema = {
      ...schema,
      sections: [],
    } as const satisfies DiscoveredDocumentSchema;
    const extraction = buildGenericExtractionJsonSchema(tableOnlySchema);
    const properties = rootProperties(extraction);

    expect(properties).not.toHaveProperty("fields");
    expect(properties).toHaveProperty("tables");
    expect(extraction.required).toEqual(["tables"]);
    assertGroqStrictCompatible(extraction);
  });
});
