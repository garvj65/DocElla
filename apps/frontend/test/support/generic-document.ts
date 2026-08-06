import type {
  DiscoveredDocumentSchema,
  GenericDocumentExtractionResult,
  GenericDocumentValues,
} from "@docella/schemas/public";

export const genericDocumentSchema = {
  documentType: "invoice",
  documentTypeLabel: "Invoice",
  language: "en",
  schemaVersion: 1,
  sections: [
    {
      description: "Invoice header fields.",
      fields: [
        {
          description: "Invoice number.",
          id: "invoice_number",
          label: "Invoice number",
          repeatable: false,
          required: true,
          valueType: "identifier",
        },
        {
          description: "Invoice categories.",
          id: "tags",
          label: "Tags",
          repeatable: true,
          required: false,
          valueType: "text",
        },
        {
          description: "Related monetary amounts.",
          id: "amounts",
          label: "Amounts",
          repeatable: true,
          required: false,
          valueType: "currency",
        },
        {
          description: "Boolean review flags.",
          id: "flags",
          label: "Flags",
          repeatable: true,
          required: false,
          valueType: "boolean",
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
          description: "Line description.",
          id: "description",
          label: "Description",
          required: true,
          valueType: "text",
        },
        {
          description: "Line amount.",
          id: "amount",
          label: "Amount",
          required: true,
          valueType: "currency",
        },
      ],
      description: "Invoice line items.",
      id: "items",
      label: "Items",
    },
  ],
  title: "Invoice INV-1001",
} as const satisfies DiscoveredDocumentSchema;

export const genericDocumentValues = {
  fields: {
    amounts: [100, 25.5],
    flags: [true, false],
    invoice_number: "INV-1001",
    tags: ["priority", "approved"],
  },
  tables: {
    items: [{ amount: 125.5, description: "Consulting" }],
  },
} as const satisfies GenericDocumentValues;

const evidence = [
  {
    location: { kind: "page" as const, pageNumber: 1 },
    text: "Invoice INV-1001 priority approved Consulting 125.5",
  },
];

export const genericDocumentResult = {
  confidence: 0.95,
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
      amounts: { confidence: 0.95, evidence, status: "verified" },
      flags: { confidence: 0.95, evidence, status: "verified" },
      invoice_number: { confidence: 0.95, evidence, status: "verified" },
      tags: { confidence: 0.95, evidence, status: "verified" },
    },
    tables: {
      items: { confidence: 0.95, evidence, rowCount: 1, status: "verified" },
    },
  },
  reviewRequired: false,
  schema: genericDocumentSchema,
  values: genericDocumentValues,
  warnings: [],
} as const satisfies GenericDocumentExtractionResult;

export const successEnvelope = (data: unknown) => ({
  data,
  meta: { requestId: "req_generic_test" },
  success: true,
});
