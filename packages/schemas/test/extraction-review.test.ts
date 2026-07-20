import {
  buildPublicDocumentConfig,
  buildPublicExtractionResultSchema,
  basicInvoiceDefinition,
  EXTRACTION_WARNING_CODES,
  GROUNDING_MATCH_TYPES,
  GROUNDING_STATUSES,
  jobApplicationDefinition,
  type FieldReview,
  type PublicDocumentConfig,
  type PublicExtractionResult,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("extraction review contracts", () => {
  it("exports stable grounding statuses and match types", () => {
    expect(GROUNDING_STATUSES).toEqual(["verified", "needs_review", "missing"]);
    expect(GROUNDING_MATCH_TYPES).toEqual(["exact", "normalized", "fuzzy", "none"]);
  });

  it("exports stable warning codes", () => {
    expect(EXTRACTION_WARNING_CODES).toEqual({
      FIELDS_REQUIRE_REVIEW: "FIELDS_REQUIRE_REVIEW",
      LOW_CONFIDENCE: "LOW_CONFIDENCE",
      NO_VALUES_EXTRACTED: "NO_VALUES_EXTRACTED",
      REQUIRED_FIELDS_MISSING: "REQUIRED_FIELDS_MISSING",
    });
  });
});

const verified: FieldReview = { confidence: 1, matchType: "exact", status: "verified" };
const normalized: FieldReview = { confidence: 0.9, matchType: "normalized", status: "verified" };
const fuzzy: FieldReview = { confidence: 0.6, matchType: "fuzzy", status: "needs_review" };
const missing: FieldReview = { confidence: 0, matchType: "none", status: "missing" };

const valueForField = (field: PublicDocumentConfig["fields"][number]): string | number | null => {
  switch (field.kind) {
    case "email":
      return "alex@example.com";
    case "date":
      return "2026-07-20";
    case "number":
    case "currency":
      return 42;
    case "select":
      return field.options?.[0]?.value ?? null;
    case "text":
    case "textarea":
    case "phone":
      return `${field.label} value`;
  }
};

const buildValidResult = (config: PublicDocumentConfig): PublicExtractionResult => {
  const values: Record<string, string | number | null> = {};
  const review: Record<string, FieldReview> = {};

  config.fields.forEach((field, index) => {
    values[field.key] = valueForField(field);
    review[field.key] = index === 0 ? normalized : verified;
  });

  return {
    data: {
      documentVersion: config.version,
      review,
      schemaType: config.id,
      values,
    },
    meta: {
      confidence: 0.95,
      extractedCharacters: 500,
      missingFields: 0,
      model: "safe-hidden-model",
      needsReviewFields: 0,
      pageCount: 2,
      requestId: "req_contract",
      requiredMissingFields: 0,
      reviewRequired: false,
      verifiedFields: config.fields.length,
      warnings: [
        {
          code: "LOW_CONFIDENCE",
          fieldKeys: [config.fields[0]?.key ?? ""],
          message: "Some fields may need review.",
        },
      ],
    },
  };
};

describe("public extraction result runtime schema", () => {
  const jobConfig = buildPublicDocumentConfig(jobApplicationDefinition);
  const invoiceConfig = buildPublicDocumentConfig(basicInvoiceDefinition);

  it("accepts valid Job Application and Basic Invoice results", () => {
    expect(
      buildPublicExtractionResultSchema(jobConfig).parse(buildValidResult(jobConfig)),
    ).toBeTruthy();
    expect(
      buildPublicExtractionResultSchema(invoiceConfig).parse(buildValidResult(invoiceConfig)),
    ).toBeTruthy();
  });

  it("rejects missing and extra value keys", () => {
    const missingValue = buildValidResult(jobConfig);
    delete (missingValue.data.values as Record<string, unknown>).fullName;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(missingValue).success).toBe(
      false,
    );

    const extraValue = buildValidResult(jobConfig);
    (extraValue.data.values as Record<string, unknown>).pdfFieldName = "job.full_name";
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(extraValue).success).toBe(false);
  });

  it("rejects missing and extra review keys", () => {
    const missingReview = buildValidResult(jobConfig);
    delete (missingReview.data.review as Record<string, unknown>).fullName;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(missingReview).success).toBe(
      false,
    );

    const extraReview = buildValidResult(jobConfig);
    (extraReview.data.review as Record<string, unknown>).assetPath = verified;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(extraReview).success).toBe(false);
  });

  it("rejects wrong schema identity and document version", () => {
    const wrongSchema = buildValidResult(jobConfig);
    (wrongSchema.data as { schemaType: string }).schemaType = "basic-invoice";
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(wrongSchema).success).toBe(false);

    const wrongVersion = buildValidResult(jobConfig);
    (wrongVersion.data as { documentVersion: number }).documentVersion = 99;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(wrongVersion).success).toBe(
      false,
    );
  });

  it("rejects invalid review combinations and inconsistent counts", () => {
    const invalidCombination = buildValidResult(jobConfig);
    (invalidCombination.data.review as Record<string, FieldReview>).fullName = fuzzy;
    invalidCombination.meta.verifiedFields -= 1;
    invalidCombination.meta.needsReviewFields += 1;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(invalidCombination).success).toBe(
      true,
    );

    (invalidCombination.data.review as Record<string, FieldReview>).fullName = {
      confidence: 1,
      matchType: "fuzzy",
      status: "verified",
    };
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(invalidCombination).success).toBe(
      false,
    );

    const inconsistentCounts = buildValidResult(jobConfig);
    inconsistentCounts.meta.missingFields = 1;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(inconsistentCounts).success).toBe(
      false,
    );
  });

  it("rejects invalid warning field keys and internal field/path properties", () => {
    const badWarning = buildValidResult(invoiceConfig);
    badWarning.meta.warnings = [
      { code: "FIELDS_REQUIRE_REVIEW", fieldKeys: ["invoice.total"], message: "Review fields." },
    ];
    expect(buildPublicExtractionResultSchema(invoiceConfig).safeParse(badWarning).success).toBe(
      false,
    );

    const internalProperties = buildValidResult(invoiceConfig);
    (internalProperties.data.values as Record<string, unknown>).assetPath =
      "templates/basic-invoice-default.pdf";
    (internalProperties.data.review as Record<string, FieldReview>).pdfFieldName = missing;
    expect(
      buildPublicExtractionResultSchema(invoiceConfig).safeParse(internalProperties).success,
    ).toBe(false);
  });
});
