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
const unmatched: FieldReview = { confidence: 0.25, matchType: "none", status: "needs_review" };
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

  return withCoherentMeta(config, {
    data: {
      documentVersion: config.version,
      review,
      schemaType: config.id,
      values,
    },
    meta: {
      confidence: 0,
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
  });
};

const roundTwo = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const withCoherentMeta = (
  config: PublicDocumentConfig,
  result: PublicExtractionResult,
): PublicExtractionResult => {
  let verifiedFields = 0;
  let needsReviewFields = 0;
  let missingFields = 0;
  let requiredMissingFields = 0;
  let includedFieldCount = 0;
  let includedScore = 0;

  for (const field of config.fields) {
    const review = result.data.review[field.key];
    const value = result.data.values[field.key];

    if (review.status === "verified") verifiedFields += 1;
    if (review.status === "needs_review") needsReviewFields += 1;
    if (review.status === "missing") {
      missingFields += 1;
      if (field.required) requiredMissingFields += 1;
    }

    if (value !== null) {
      includedFieldCount += 1;
      includedScore += review.confidence;
    } else if (field.required) {
      includedFieldCount += 1;
    }
  }

  const confidence = roundTwo(includedFieldCount === 0 ? 0 : includedScore / includedFieldCount);

  return {
    ...result,
    meta: {
      ...result.meta,
      confidence,
      missingFields,
      needsReviewFields,
      requiredMissingFields,
      reviewRequired: needsReviewFields > 0 || requiredMissingFields > 0 || confidence < 0.75,
      verifiedFields,
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
    const coherentNeedsReview = withCoherentMeta(jobConfig, invalidCombination);
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(coherentNeedsReview).success,
    ).toBe(true);

    (coherentNeedsReview.data.review as Record<string, FieldReview>).fullName = {
      confidence: 1,
      matchType: "fuzzy",
      status: "verified",
    };
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(coherentNeedsReview).success,
    ).toBe(false);

    const inconsistentCounts = buildValidResult(jobConfig);
    inconsistentCounts.meta.missingFields = 1;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(inconsistentCounts).success).toBe(
      false,
    );
  });

  it("rejects value and review contradictions", () => {
    const nullVerified = buildValidResult(jobConfig);
    nullVerified.data.values.fullName = null;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(nullVerified).success).toBe(
      false,
    );

    const nullNeedsReview = buildValidResult(jobConfig);
    nullNeedsReview.data.values.fullName = null;
    nullNeedsReview.data.review.fullName = fuzzy;
    const coherentNullNeedsReview = withCoherentMeta(jobConfig, nullNeedsReview);
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(coherentNullNeedsReview).success,
    ).toBe(false);

    const presentMissing = buildValidResult(jobConfig);
    presentMissing.data.review.fullName = missing;
    const coherentPresentMissing = withCoherentMeta(jobConfig, presentMissing);
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(coherentPresentMissing).success,
    ).toBe(false);
  });

  it("rejects inconsistent aggregate confidence and review-required metadata", () => {
    const badConfidence = buildValidResult(jobConfig);
    badConfidence.meta.confidence = 0.42;
    expect(buildPublicExtractionResultSchema(jobConfig).safeParse(badConfidence).success).toBe(
      false,
    );

    const needsReview = buildValidResult(jobConfig);
    needsReview.data.review.fullName = unmatched;
    const coherentNeedsReview = withCoherentMeta(jobConfig, needsReview);
    coherentNeedsReview.meta.reviewRequired = false;
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(coherentNeedsReview).success,
    ).toBe(false);

    const requiredMissing = buildValidResult(jobConfig);
    requiredMissing.data.values.fullName = null;
    requiredMissing.data.review.fullName = missing;
    const coherentRequiredMissing = withCoherentMeta(jobConfig, requiredMissing);
    coherentRequiredMissing.meta.reviewRequired = false;
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(coherentRequiredMissing).success,
    ).toBe(false);

    const lowConfidenceConfig: PublicDocumentConfig = {
      ...jobConfig,
      fields: [{ ...jobConfig.fields[0], required: false }],
    };
    const lowConfidence = withCoherentMeta(lowConfidenceConfig, {
      ...buildValidResult(lowConfidenceConfig),
      data: {
        ...buildValidResult(lowConfidenceConfig).data,
        values: { fullName: null },
        review: { fullName: missing },
      },
    });
    lowConfidence.meta.reviewRequired = false;
    expect(
      buildPublicExtractionResultSchema(lowConfidenceConfig).safeParse(lowConfidence).success,
    ).toBe(false);

    const cleanHighConfidence = buildValidResult(jobConfig);
    cleanHighConfidence.meta.reviewRequired = true;
    expect(
      buildPublicExtractionResultSchema(jobConfig).safeParse(cleanHighConfidence).success,
    ).toBe(false);
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
