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

describe("generic provider JSON Schemas", () => {
  it("generates a Groq strict-compatible discovery schema", () => {
    const discovery = buildGenericDiscoveryJsonSchema();
    const serialized = JSON.stringify(discovery);

    expect(discovery.type).toBe("object");
    expect(discovery.additionalProperties).toBe(false);
    expect(serialized).toContain("documentType");
    expect(serialized).toContain("sections");
    expect(serialized).toContain("tables");
    expect(serialized).not.toContain("~standard");
    expect(serialized).not.toContain('"format"');
    assertGroqStrictCompatible(discovery);
  });

  it("generates an exact Groq strict-compatible values schema", () => {
    const extraction = buildGenericExtractionJsonSchema(schema);
    const serialized = JSON.stringify(extraction);

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
    assertGroqStrictCompatible(extraction);
  });
});
