import { z } from "zod";

import type { PublicDocumentConfig, PublicFieldConfig } from "./public-document-config.js";

export const GROUNDING_STATUSES = ["verified", "needs_review", "missing"] as const;

export type GroundingStatus = (typeof GROUNDING_STATUSES)[number];

export const GROUNDING_MATCH_TYPES = ["exact", "normalized", "fuzzy", "none"] as const;

export type GroundingMatchType = (typeof GROUNDING_MATCH_TYPES)[number];

export interface FieldReview {
  readonly status: GroundingStatus;
  readonly matchType: GroundingMatchType;
  readonly confidence: number;
}

export type FieldReviewMap = Readonly<Record<string, FieldReview>>;

export const EXTRACTION_WARNING_CODES = {
  FIELDS_REQUIRE_REVIEW: "FIELDS_REQUIRE_REVIEW",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  NO_VALUES_EXTRACTED: "NO_VALUES_EXTRACTED",
  REQUIRED_FIELDS_MISSING: "REQUIRED_FIELDS_MISSING",
} as const;

export type ExtractionWarningCode =
  (typeof EXTRACTION_WARNING_CODES)[keyof typeof EXTRACTION_WARNING_CODES];

export interface ExtractionWarning {
  readonly code: ExtractionWarningCode;
  readonly message: string;
  readonly fieldKeys?: readonly string[] | undefined;
}

export interface PublicExtractionData {
  readonly schemaType: string;
  readonly documentVersion: number;
  readonly values: Readonly<Record<string, string | number | null>>;
  readonly review: FieldReviewMap;
}

export interface PublicExtractionMeta {
  readonly requestId: string;
  readonly model: string;
  readonly pageCount: number;
  readonly extractedCharacters: number;
  readonly confidence: number;
  readonly reviewRequired: boolean;
  readonly verifiedFields: number;
  readonly needsReviewFields: number;
  readonly missingFields: number;
  readonly requiredMissingFields: number;
  readonly warnings: readonly ExtractionWarning[];
}

export interface PublicExtractionResult {
  readonly data: PublicExtractionData;
  readonly meta: PublicExtractionMeta;
}

export const groundingStatusSchema = z.enum(GROUNDING_STATUSES);
export const groundingMatchTypeSchema = z.enum(GROUNDING_MATCH_TYPES);

export const fieldReviewSchema = z
  .object({
    status: groundingStatusSchema,
    matchType: groundingMatchTypeSchema,
    confidence: z
      .number()
      .refine(Number.isFinite)
      .refine((value) => [1, 0.9, 0.6, 0.25, 0].includes(value)),
  })
  .strict()
  .superRefine((review, context) => {
    const valid =
      (review.status === "verified" && review.matchType === "exact" && review.confidence === 1) ||
      (review.status === "verified" &&
        review.matchType === "normalized" &&
        review.confidence === 0.9) ||
      (review.status === "needs_review" &&
        review.matchType === "fuzzy" &&
        review.confidence === 0.6) ||
      (review.status === "needs_review" &&
        review.matchType === "none" &&
        review.confidence === 0.25) ||
      (review.status === "missing" && review.matchType === "none" && review.confidence === 0);

    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Review status, match type, and confidence are inconsistent.",
      });
    }
  });

export const extractionWarningCodeSchema = z.enum([
  EXTRACTION_WARNING_CODES.FIELDS_REQUIRE_REVIEW,
  EXTRACTION_WARNING_CODES.LOW_CONFIDENCE,
  EXTRACTION_WARNING_CODES.NO_VALUES_EXTRACTED,
  EXTRACTION_WARNING_CODES.REQUIRED_FIELDS_MISSING,
]);

export const extractionWarningSchema = z
  .object({
    code: extractionWarningCodeSchema,
    message: z.string().min(1),
    fieldKeys: z.array(z.string().min(1)).readonly().optional(),
  })
  .strict();

const finiteNumber = (): z.ZodNumber => z.number().refine(Number.isFinite);

const extractionValueSchemaForField = (
  field: PublicFieldConfig,
): z.ZodType<string | number | null> => {
  switch (field.kind) {
    case "email":
      return z.email().nullable();
    case "date":
      return z.iso.date().nullable();
    case "number":
    case "currency":
      return finiteNumber().nullable();
    case "select": {
      const values = (field.options ?? []).map((option) => option.value) as [string, ...string[]];
      return z.enum(values).nullable();
    }
    case "text":
    case "textarea":
    case "phone":
      return z.string().nullable();
  }
};

const buildFieldShape = <T extends z.ZodType>(
  config: PublicDocumentConfig,
  schemaForField: (field: PublicFieldConfig) => T,
): Record<string, T> => {
  const shape: Record<string, T> = {};

  for (const field of config.fields) {
    shape[field.key] = schemaForField(field);
  }

  return shape;
};

export const buildPublicExtractionResultSchema = (
  config: PublicDocumentConfig,
): z.ZodType<PublicExtractionResult> => {
  const fieldKeys = new Set(config.fields.map((field) => field.key));
  const requiredFieldKeys = new Set(
    config.fields.filter((field) => field.required).map((field) => field.key),
  );

  const valuesSchema = z.object(buildFieldShape(config, extractionValueSchemaForField)).strict();
  const reviewSchema = z.object(buildFieldShape(config, () => fieldReviewSchema)).strict();
  const warningSchema = extractionWarningSchema.superRefine((warning, context) => {
    for (const fieldKey of warning.fieldKeys ?? []) {
      if (!fieldKeys.has(fieldKey)) {
        context.addIssue({
          code: "custom",
          message: "Warning field key is not part of the public document schema.",
          path: ["fieldKeys"],
        });
      }
    }
  });

  return z
    .object({
      data: z
        .object({
          schemaType: z.literal(config.id),
          documentVersion: z.literal(config.version),
          values: valuesSchema,
          review: reviewSchema,
        })
        .strict(),
      meta: z
        .object({
          requestId: z.string().min(1),
          model: z.string().min(1),
          pageCount: z.number().int().positive(),
          extractedCharacters: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1).refine(Number.isFinite),
          reviewRequired: z.boolean(),
          verifiedFields: z.number().int().nonnegative(),
          needsReviewFields: z.number().int().nonnegative(),
          missingFields: z.number().int().nonnegative(),
          requiredMissingFields: z.number().int().nonnegative(),
          warnings: z.array(warningSchema).readonly(),
        })
        .strict(),
    })
    .strict()
    .superRefine((result, context) => {
      const reviews = Object.entries(result.data.review);
      const verifiedFields = reviews.filter(([, review]) => review.status === "verified").length;
      const needsReviewFields = reviews.filter(
        ([, review]) => review.status === "needs_review",
      ).length;
      const missingFields = reviews.filter(([, review]) => review.status === "missing").length;
      const requiredMissingFields = reviews.filter(
        ([key, review]) => review.status === "missing" && requiredFieldKeys.has(key),
      ).length;

      const expectedCounts = {
        verifiedFields,
        needsReviewFields,
        missingFields,
        requiredMissingFields,
      };

      for (const [key, expected] of Object.entries(expectedCounts)) {
        if (result.meta[key as keyof typeof expectedCounts] !== expected) {
          context.addIssue({
            code: "custom",
            message: "Extraction review metadata is inconsistent with field review states.",
            path: ["meta", key],
          });
        }
      }
    });
};
