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
  readonly fieldKeys?: readonly string[];
}
