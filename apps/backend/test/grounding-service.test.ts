import { defineDocument } from "@docella/schemas";
import { describe, expect, it } from "vitest";

import { createGroundingService } from "../src/grounding/grounding-service.js";

const definition = defineDocument({
  description: "Grounding test document.",
  fields: [
    {
      description: "Name",
      key: "name",
      kind: "text",
      label: "Name",
      pdfFieldName: "name",
      required: true,
    },
    {
      description: "Company",
      key: "company",
      kind: "text",
      label: "Company",
      pdfFieldName: "company",
      required: false,
    },
    {
      description: "Notes",
      key: "notes",
      kind: "textarea",
      label: "Notes",
      pdfFieldName: "notes",
      required: false,
    },
    {
      description: "Email",
      key: "email",
      kind: "email",
      label: "Email",
      pdfFieldName: "email",
      required: true,
    },
    {
      description: "Phone",
      key: "phone",
      kind: "phone",
      label: "Phone",
      pdfFieldName: "phone",
      required: true,
    },
    {
      description: "Date",
      key: "date",
      kind: "date",
      label: "Date",
      pdfFieldName: "date",
      required: true,
    },
    {
      description: "Amount",
      key: "amount",
      kind: "currency",
      label: "Amount",
      pdfFieldName: "amount",
      required: true,
    },
    {
      description: "Status",
      key: "status",
      kind: "select",
      label: "Status",
      options: [
        { label: "Ready for Review", value: "ready" },
        { label: "Needs Follow Up", value: "follow_up" },
      ],
      pdfFieldName: "status",
      required: false,
    },
  ],
  id: "grounding-test",
  label: "Grounding Test",
  templates: [{ assetPath: "test.pdf", flattenByDefault: true, id: "default", label: "Default" }],
  version: 1,
} as const);

const ground = (documentText: string, values: Record<string, unknown>) =>
  createGroundingService().ground({
    documentDefinition: definition,
    documentText,
    values,
  });

describe("grounding service", () => {
  it("grounds exact, normalized, email, phone, date, number, and select values", () => {
    const summary = ground(
      [
        "Applicant:   ALEX   MORGAN",
        "Company: Acme Services, LLC",
        "Email: alex @ example . test",
        "Phone: (1) 555-010-2200",
        "Date: July 19th 2026",
        "Amount due: USD 75,000.00",
        "Status: Ready for Review",
      ].join("\n"),
      {
        amount: "75000",
        company: "Acme Services LLC",
        date: "2026-07-19",
        email: "Alex@Example.Test",
        name: "Alex Morgan",
        notes: null,
        phone: "+1 555 010 2200",
        status: "ready",
      },
    );

    expect(summary.fields.name).toEqual({ confidence: 1, matchType: "exact", status: "verified" });
    expect(summary.fields.company).toEqual({
      confidence: 0.9,
      matchType: "normalized",
      status: "verified",
    });
    expect(summary.fields.email).toEqual({
      confidence: 0.9,
      matchType: "normalized",
      status: "verified",
    });
    expect(summary.fields.phone).toEqual({
      confidence: 0.9,
      matchType: "normalized",
      status: "verified",
    });
    expect(summary.fields.date).toEqual({
      confidence: 0.9,
      matchType: "normalized",
      status: "verified",
    });
    expect(summary.fields.amount).toEqual({
      confidence: 0.9,
      matchType: "normalized",
      status: "verified",
    });
    expect(summary.fields.status).toEqual({
      confidence: 1,
      matchType: "exact",
      status: "verified",
    });
    expect(summary.fields.notes).toEqual({ confidence: 0, matchType: "none", status: "missing" });
    expect(Object.keys(summary.fields)).toEqual(definition.fields.map((field) => field.key));
  });

  it("uses conservative fuzzy matching only for textual fields", () => {
    const summary = ground("Senior product analyst role with portfolio ownership.", {
      amount: "100",
      company: "X",
      date: "2026-03-04",
      email: "senior.product@example.test",
      name: "product analyst role portfolio",
      notes: "product analyst role portfolio ownership",
      phone: "5550100",
      status: "follow_up",
    });

    expect(summary.fields.name).toEqual({
      confidence: 0.6,
      matchType: "fuzzy",
      status: "needs_review",
    });
    expect(summary.fields.email?.matchType).toBe("none");
    expect(summary.fields.phone?.matchType).toBe("none");
    expect(summary.fields.date?.matchType).toBe("none");
    expect(summary.fields.amount?.matchType).toBe("none");
  });

  it("handles missing values, confidence, counts, and warnings deterministically", () => {
    const summary = ground("PRIVATE_PDF_SOURCE_TEXT", {
      amount: null,
      company: null,
      date: null,
      email: "private-person@example.test",
      name: "PRIVATE_EXTRACTED_VALUE",
      notes: null,
      phone: null,
      status: null,
      unexpected: "ignored",
    });

    expect(summary.confidence).toBe(0.1);
    expect(summary.verifiedFields + summary.needsReviewFields + summary.missingFields).toBe(
      definition.fields.length,
    );
    expect(summary.requiredMissingFields).toBe(3);
    expect(summary.reviewRequired).toBe(true);
    expect(summary.warnings.map((warning) => warning.code)).toEqual([
      "REQUIRED_FIELDS_MISSING",
      "FIELDS_REQUIRE_REVIEW",
      "LOW_CONFIDENCE",
    ]);
    expect(JSON.stringify(summary.warnings)).not.toContain("PRIVATE_EXTRACTED_VALUE");
    expect(JSON.stringify(summary.warnings)).not.toContain("PRIVATE_PDF_SOURCE_TEXT");
  });

  it("returns zero confidence when no values are included", () => {
    const optionalDefinition = {
      ...definition,
      fields: definition.fields.map((field) => ({ ...field, required: false })),
    };
    const summary = createGroundingService().ground({
      documentDefinition: optionalDefinition,
      documentText: "",
      values: Object.fromEntries(definition.fields.map((field) => [field.key, null])),
    });

    expect(summary.confidence).toBe(0);
    expect(summary.warnings.map((warning) => warning.code)).toEqual([
      "NO_VALUES_EXTRACTED",
      "LOW_CONFIDENCE",
    ]);
  });
});
