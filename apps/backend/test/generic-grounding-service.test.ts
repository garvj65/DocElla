import type {
  DiscoveredDocumentSchema,
  GenericDocumentValues,
} from "@docella/schemas";
import { describe, expect, it } from "vitest";

import type { DocumentLayoutResult } from "../src/document-layout/document-layout-types.js";
import { createGenericGroundingService } from "../src/generic-extraction/generic-grounding-service.js";

const schema = {
  documentType: "invoice",
  documentTypeLabel: "Invoice",
  language: "en",
  schemaVersion: 1,
  sections: [
    {
      description: "Invoice details.",
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
          description: "Invoice total.",
          id: "total",
          label: "Total",
          repeatable: false,
          required: true,
          valueType: "currency",
        },
        {
          description: "Customer email.",
          id: "customer_email",
          label: "Customer email",
          repeatable: false,
          required: false,
          valueType: "email",
        },
      ],
      id: "details",
      label: "Details",
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
          description: "Amount.",
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

const layout: DocumentLayoutResult = {
  content: "Invoice number INV-1001. Total INR 11800. Consulting 11800.",
  contentUnit: "page",
  contentUnitCount: 1,
  paragraphs: [
    {
      content: "Invoice number INV-1001",
      regions: [
        {
          boundingPolygon: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.1 },
            { x: 0.4, y: 0.15 },
            { x: 0.1, y: 0.15 },
          ],
          location: { kind: "page", pageNumber: 1 },
        },
      ],
      spans: [{ length: 23, offset: 0 }],
    },
    {
      content: "Total INR 11800",
      regions: [{ location: { kind: "page", pageNumber: 1 } }],
      spans: [{ length: 15, offset: 25 }],
    },
  ],
  provider: "azure-document-intelligence",
  sourceFormat: "pdf",
  tables: [
    {
      cells: [
        {
          columnIndex: 0,
          columnSpan: 1,
          confidence: 0.98,
          content: "Consulting",
          regions: [{ location: { kind: "page", pageNumber: 1 } }],
          rowIndex: 0,
          rowSpan: 1,
          spans: [{ length: 10, offset: 41 }],
        },
        {
          columnIndex: 1,
          columnSpan: 1,
          confidence: 0.98,
          content: "11800",
          regions: [{ location: { kind: "page", pageNumber: 1 } }],
          rowIndex: 0,
          rowSpan: 1,
          spans: [{ length: 5, offset: 52 }],
        },
      ],
      columnCount: 2,
      regions: [{ location: { kind: "page", pageNumber: 1 } }],
      rowCount: 1,
      spans: [{ length: 16, offset: 41 }],
    },
  ],
};

const values = {
  fields: {
    customer_email: null,
    invoice_number: "INV-1001",
    total: 11_800,
  },
  tables: {
    items: [{ amount: 11_800, description: "Consulting" }],
  },
} as const satisfies GenericDocumentValues;

describe("createGenericGroundingService", () => {
  it("grounds scalar and table values against page evidence", () => {
    const result = createGenericGroundingService().ground({
      documentSchema: schema,
      inputTruncated: false,
      layout,
      values,
    });

    expect(result.document).toMatchObject({
      detectedType: "invoice",
      sourceFormat: "pdf",
      title: "Invoice INV-1001",
    });
    expect(result.review.fields.invoice_number?.status).toBe("verified");
    expect(result.review.fields.invoice_number?.evidence[0]).toMatchObject({
      location: { kind: "page", pageNumber: 1 },
      text: "Invoice number INV-1001",
    });
    expect(result.review.fields.total?.status).toBe("verified");
    expect(result.review.fields.customer_email?.status).toBe("missing");
    expect(result.review.tables.items?.status).toBe("verified");
    expect(result.review.tables.items?.rowCount).toBe(1);
    expect(result.reviewRequired).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "field_missing", fieldIds: ["customer_email"] }),
    );
  });

  it("marks unsupported values for review and records provider-input truncation", () => {
    const result = createGenericGroundingService().ground({
      documentSchema: schema,
      inputTruncated: true,
      layout,
      values: {
        ...values,
        fields: { ...values.fields, invoice_number: "INVENTED-999" },
      },
    });

    expect(result.review.fields.invoice_number?.status).toBe("needs_review");
    expect(result.review.fields.invoice_number?.evidence).toEqual([]);
    expect(result.reviewRequired).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "field_needs_review" }),
        expect.objectContaining({ code: "truncated_input" }),
      ]),
    );
  });

  it("uses low OCR confidence instead of verified when evidence is uncertain", () => {
    const lowConfidenceLayout: DocumentLayoutResult = {
      ...layout,
      paragraphs: [],
      tables: [
        {
          ...layout.tables[0]!,
          cells: layout.tables[0]!.cells.map((cell) => ({ ...cell, confidence: 0.3 })),
        },
      ],
    };
    const result = createGenericGroundingService().ground({
      documentSchema: schema,
      inputTruncated: false,
      layout: lowConfidenceLayout,
      values,
    });

    expect(result.review.tables.items?.status).toBe("low_ocr_confidence");
    expect(result.reviewRequired).toBe(true);
  });
});
