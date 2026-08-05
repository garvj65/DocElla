import { describe, expect, it } from "vitest";

import {
  GENERIC_DOCUMENT_SCHEMA_VERSION,
  buildGenericDiscoveryJsonSchema,
  buildGenericExtractionJsonSchema,
  type DiscoveredDocumentSchema,
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

describe("generic provider JSON Schemas", () => {
  it("generates a bounded strict discovery schema", () => {
    const discovery = buildGenericDiscoveryJsonSchema();
    const serialized = JSON.stringify(discovery);

    expect(discovery.type).toBe("object");
    expect(discovery.additionalProperties).toBe(false);
    expect(serialized).toContain("documentType");
    expect(serialized).toContain("sections");
    expect(serialized).toContain("tables");
    expect(serialized).not.toContain("~standard");
  });

  it("generates an exact values schema from discovered fields and tables", () => {
    const extraction = buildGenericExtractionJsonSchema(schema);
    const serialized = JSON.stringify(extraction);

    expect(extraction.type).toBe("object");
    expect(extraction.additionalProperties).toBe(false);
    expect(serialized).toContain("order_number");
    expect(serialized).toContain("contact_email");
    expect(serialized).toContain("items");
    expect(serialized).toContain("description");
    expect(serialized).toContain("amount");
    expect(serialized).not.toContain("~standard");
  });
});
