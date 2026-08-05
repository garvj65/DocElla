import { describe, expect, it } from "vitest";

import {
  GENERIC_DOCUMENT_LIMITS,
  GENERIC_DOCUMENT_SCHEMA_VERSION,
  buildGenericDocumentExtractionResultSchema,
  buildGenericDocumentExtractionValuesSchema,
  buildGenericDocumentSubmissionSchema,
  discoveredDocumentSchemaSchema,
  genericEvidenceAnchorSchema,
  type DiscoveredDocumentSchema,
  type GenericDocumentExtractionResult,
} from "../src/index";

const discoveredInvoiceSchema = {
  documentType: "invoice",
  documentTypeLabel: "Invoice",
  language: "en",
  schemaVersion: GENERIC_DOCUMENT_SCHEMA_VERSION,
  sections: [
    {
      description: "Invoice header and parties.",
      fields: [
        {
          description: "Stable invoice identifier.",
          id: "invoice_number",
          label: "Invoice number",
          repeatable: false,
          required: true,
          valueType: "identifier",
        },
        {
          description: "Customer email address.",
          id: "customer_email",
          label: "Customer email",
          repeatable: false,
          required: false,
          valueType: "email",
        },
        {
          description: "Document tags.",
          id: "tags",
          label: "Tags",
          repeatable: true,
          required: true,
          valueType: "text",
        },
        {
          description: "Invoice workflow state.",
          id: "status",
          label: "Status",
          options: [
            { label: "Open", value: "open" },
            { label: "Paid", value: "paid" },
          ],
          repeatable: false,
          required: true,
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
          description: "Line item description.",
          id: "description",
          label: "Description",
          required: true,
          valueType: "text",
        },
        {
          description: "Line item quantity.",
          id: "quantity",
          label: "Quantity",
          required: true,
          valueType: "number",
        },
        {
          description: "Line item amount.",
          id: "amount",
          label: "Amount",
          required: true,
          valueType: "currency",
        },
      ],
      description: "Invoice line items.",
      id: "line_items",
      label: "Line items",
    },
  ],
  title: "Invoice INV-1001",
} as const satisfies DiscoveredDocumentSchema;

const pageEvidence = {
  boundingPolygon: [
    { x: 0.1, y: 0.1 },
    { x: 0.3, y: 0.1 },
    { x: 0.3, y: 0.2 },
    { x: 0.1, y: 0.2 },
  ],
  location: { kind: "page", pageNumber: 1 },
  providerConfidence: 0.98,
  text: "Invoice number: INV-1001",
} as const;

const validValues = {
  fields: {
    customer_email: null,
    invoice_number: "INV-1001",
    status: "open",
    tags: ["priority", "international"],
  },
  tables: {
    line_items: [{ amount: 10_000, description: "Consulting", quantity: 2 }],
  },
} as const;

const validResult: GenericDocumentExtractionResult = {
  confidence: 0.82,
  document: {
    contentUnit: "page",
    contentUnitCount: 1,
    detectedType: "invoice",
    language: "en",
    sourceFormat: "pdf",
    title: "Invoice INV-1001",
  },
  review: {
    fields: {
      customer_email: {
        confidence: 0,
        evidence: [],
        status: "missing",
      },
      invoice_number: {
        confidence: 1,
        evidence: [pageEvidence],
        status: "verified",
      },
      status: {
        confidence: 0.9,
        evidence: [{ ...pageEvidence, text: "Status: Open" }],
        status: "verified",
      },
      tags: {
        confidence: 0.6,
        evidence: [{ ...pageEvidence, text: "Priority international account" }],
        status: "needs_review",
      },
    },
    tables: {
      line_items: {
        confidence: 0.95,
        evidence: [{ ...pageEvidence, text: "Consulting 2 10000" }],
        rowCount: 1,
        status: "verified",
      },
    },
  },
  reviewRequired: true,
  schema: discoveredInvoiceSchema,
  values: validValues,
  warnings: [
    {
      code: "field_missing",
      fieldIds: ["customer_email"],
      message: "Customer email was not found.",
    },
  ],
};

describe("discoveredDocumentSchemaSchema", () => {
  it("accepts bounded sections, fields, tables, and select options", () => {
    expect(discoveredDocumentSchemaSchema.parse(discoveredInvoiceSchema)).toEqual(
      discoveredInvoiceSchema,
    );
  });

  it("rejects unknown properties, duplicate identifiers, and invalid select options", () => {
    expect(
      discoveredDocumentSchemaSchema.safeParse({ ...discoveredInvoiceSchema, executable: true })
        .success,
    ).toBe(false);

    const duplicateField = structuredClone(discoveredInvoiceSchema);
    duplicateField.sections[0]?.fields.push({
      description: "Duplicate identifier.",
      id: "invoice_number",
      label: "Duplicate",
      repeatable: false,
      required: false,
      valueType: "text",
    });
    expect(discoveredDocumentSchemaSchema.safeParse(duplicateField).success).toBe(false);

    const duplicateOption = structuredClone(discoveredInvoiceSchema);
    const statusField = duplicateOption.sections[0]?.fields.find(
      (field) => field.id === "status" && field.valueType === "select",
    );
    statusField?.options.push({ label: "Open again", value: "open" });
    expect(discoveredDocumentSchemaSchema.safeParse(duplicateOption).success).toBe(false);
  });

  it("rejects empty schemas and schemas beyond the total-field limit", () => {
    expect(
      discoveredDocumentSchemaSchema.safeParse({
        ...discoveredInvoiceSchema,
        sections: [],
        tables: [],
      }).success,
    ).toBe(false);

    const oversized = {
      ...discoveredInvoiceSchema,
      sections: Array.from({ length: 5 }, (_, sectionIndex) => ({
        description: "Generated section.",
        fields: Array.from({ length: 50 }, (_, fieldIndex) => ({
          description: "Generated field.",
          id: `field_${String(sectionIndex)}_${String(fieldIndex)}`,
          label: `Field ${String(sectionIndex)} ${String(fieldIndex)}`,
          repeatable: false,
          required: false,
          valueType: "text" as const,
        })),
        id: `section_${String(sectionIndex)}`,
        label: `Section ${String(sectionIndex)}`,
      })),
      tables: [],
    };

    expect(oversized.sections.flatMap((section) => section.fields)).toHaveLength(250);
    expect(250).toBeGreaterThan(GENERIC_DOCUMENT_LIMITS.maxTotalFields);
    expect(discoveredDocumentSchemaSchema.safeParse(oversized).success).toBe(false);
  });
});

describe("generic document value builders", () => {
  it("requires every discovered key, accepts nullable extraction values, and rejects extras", () => {
    const schema = buildGenericDocumentExtractionValuesSchema(discoveredInvoiceSchema);

    expect(schema.safeParse(validValues).success).toBe(true);
    expect(
      schema.safeParse({
        ...validValues,
        fields: { ...validValues.fields, unexpected: "value" },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validValues,
        fields: { ...validValues.fields, invoice_number: 1001 },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validValues,
        fields: { ...validValues.fields, status: "unknown" },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validValues,
        tables: {
          line_items: [{ amount: "10000", description: "Consulting", quantity: 2 }],
        },
      }).success,
    ).toBe(false);
  });

  it("requires non-null required submission values while preserving optional nulls", () => {
    const schema = buildGenericDocumentSubmissionSchema(discoveredInvoiceSchema);

    expect(schema.safeParse(validValues).success).toBe(true);
    expect(
      schema.safeParse({
        ...validValues,
        fields: { ...validValues.fields, invoice_number: null },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validValues,
        fields: { ...validValues.fields, tags: null },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validValues,
        fields: { ...validValues.fields, tags: [] },
      }).success,
    ).toBe(false);
  });
});

describe("generic evidence and extraction results", () => {
  it("supports page, sheet, slide, and HTML evidence locations", () => {
    for (const location of [
      { kind: "page", pageNumber: 2 },
      { cellRange: "A1:C4", kind: "sheet", sheetName: "Summary" },
      { kind: "slide", slideNumber: 3 },
      { elementPath: "main > section:nth-child(2)", kind: "html" },
    ] as const) {
      expect(
        genericEvidenceAnchorSchema.safeParse({
          location,
          text: "Grounded source text",
        }).success,
      ).toBe(true);
    }

    expect(
      genericEvidenceAnchorSchema.safeParse({
        ...pageEvidence,
        boundingPolygon: [
          { x: -0.1, y: 0 },
          { x: 0.2, y: 0 },
          { x: 0.2, y: 0.2 },
          { x: 0, y: 0.2 },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates exact schema identity, review consistency, warnings, and table row counts", () => {
    const schema = buildGenericDocumentExtractionResultSchema(discoveredInvoiceSchema);

    expect(schema.safeParse(validResult).success).toBe(true);

    expect(
      schema.safeParse({
        ...validResult,
        review: {
          ...validResult.review,
          fields: {
            ...validResult.review.fields,
            customer_email: {
              confidence: 1,
              evidence: [pageEvidence],
              status: "verified",
            },
          },
        },
      }).success,
    ).toBe(false);

    expect(
      schema.safeParse({
        ...validResult,
        review: {
          ...validResult.review,
          tables: {
            line_items: { ...validResult.review.tables.line_items, rowCount: 2 },
          },
        },
      }).success,
    ).toBe(false);

    expect(
      schema.safeParse({
        ...validResult,
        reviewRequired: false,
      }).success,
    ).toBe(false);

    expect(
      schema.safeParse({
        ...validResult,
        warnings: [
          {
            code: "field_missing",
            fieldIds: ["unknown_field"],
            message: "Unknown field.",
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      schema.safeParse({
        ...validResult,
        schema: { ...validResult.schema, documentType: "receipt" },
      }).success,
    ).toBe(false);
  });
});
