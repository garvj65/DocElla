import type { FieldDefinition, FieldReview, SelectFieldDefinition } from "@docella/schemas";

import {
  buildDateCandidates,
  canonicalizeNumber,
  digitsOnly,
  extractNumericMentions,
  extractPhoneDigitSequences,
  normalizeEmail,
  normalizeEmailSource,
  normalizeMinimal,
  normalizeSearch,
  numbersMatch,
  parseIsoDate,
} from "./normalization.js";
import { fuzzyTokenWindowMatch } from "./text-similarity.js";
import type {
  GroundingRequest,
  GroundingService,
  GroundingSummary,
  SourceRepresentations,
} from "./grounding-types.js";
import { buildExtractionWarnings } from "./warning-builder.js";

const CONFIDENCE = {
  exact: 1,
  fuzzy: 0.6,
  missing: 0,
  normalized: 0.9,
  unmatched: 0.25,
} as const;

const missingReview = Object.freeze({
  confidence: CONFIDENCE.missing,
  matchType: "none",
  status: "missing",
} satisfies FieldReview);

const unmatchedReview = Object.freeze({
  confidence: CONFIDENCE.unmatched,
  matchType: "none",
  status: "needs_review",
} satisfies FieldReview);

const exactReview = Object.freeze({
  confidence: CONFIDENCE.exact,
  matchType: "exact",
  status: "verified",
} satisfies FieldReview);

const normalizedReview = Object.freeze({
  confidence: CONFIDENCE.normalized,
  matchType: "normalized",
  status: "verified",
} satisfies FieldReview);

const fuzzyReview = Object.freeze({
  confidence: CONFIDENCE.fuzzy,
  matchType: "fuzzy",
  status: "needs_review",
} satisfies FieldReview);

const roundTwo = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const isPresentValue = (value: unknown): value is string | number =>
  value !== null && value !== undefined;

const scoreRank = (review: FieldReview): number => {
  if (review.matchType === "exact") return 4;
  if (review.matchType === "normalized") return 3;
  if (review.matchType === "fuzzy") return 2;
  if (review.status === "needs_review") return 1;
  return 0;
};

const bestReview = (reviews: readonly FieldReview[]): FieldReview =>
  reviews.reduce(
    (best, review) => (scoreRank(review) > scoreRank(best) ? review : best),
    missingReview,
  );

const buildSourceRepresentations = (documentText: string): SourceRepresentations => ({
  email: normalizeEmailSource(documentText),
  minimal: normalizeMinimal(documentText),
  numericMentions: extractNumericMentions(documentText),
  phoneDigitSequences: extractPhoneDigitSequences(documentText),
  search: normalizeSearch(documentText),
});

const matchTextCandidate = (
  candidate: string,
  source: SourceRepresentations,
  allowFuzzy: boolean,
): FieldReview => {
  const minimalCandidate = normalizeMinimal(candidate);
  if (minimalCandidate.length === 0) {
    return unmatchedReview;
  }

  if (source.minimal.includes(minimalCandidate)) {
    return exactReview;
  }

  const searchCandidate = normalizeSearch(candidate);
  if (searchCandidate.length > 0 && source.search.includes(searchCandidate)) {
    return normalizedReview;
  }

  if (allowFuzzy && fuzzyTokenWindowMatch(searchCandidate, source.search).matched) {
    return fuzzyReview;
  }

  return unmatchedReview;
};

const matchEmail = (candidate: string, source: SourceRepresentations): FieldReview => {
  const normalized = normalizeEmail(candidate);
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z0-9.-]+$/.test(normalized)) {
    return unmatchedReview;
  }

  return source.email.includes(normalized) ? normalizedReview : unmatchedReview;
};

const matchPhone = (candidate: string, source: SourceRepresentations): FieldReview => {
  const digits = digitsOnly(candidate);
  if (digits.length < 7 || digits.length > 15) {
    return unmatchedReview;
  }

  return source.phoneDigitSequences.some((sequence) => sequence === digits)
    ? normalizedReview
    : unmatchedReview;
};

const matchDate = (candidate: string, source: SourceRepresentations): FieldReview => {
  const parsed = parseIsoDate(candidate);
  if (parsed === undefined) {
    return unmatchedReview;
  }

  return buildDateCandidates(parsed).some((dateCandidate) =>
    source.search.includes(normalizeSearch(dateCandidate)),
  )
    ? normalizedReview
    : unmatchedReview;
};

const matchNumber = (candidate: string | number, source: SourceRepresentations): FieldReview => {
  const expected = canonicalizeNumber(candidate);
  if (expected === undefined) {
    return unmatchedReview;
  }

  return source.numericMentions.some((mention) => numbersMatch(mention, expected))
    ? normalizedReview
    : unmatchedReview;
};

const matchSelect = (
  field: SelectFieldDefinition,
  candidate: string,
  source: SourceRepresentations,
): FieldReview => {
  const option = field.options.find((item) => item.value === candidate);
  const candidates = option === undefined ? [candidate] : [option.value, option.label];
  return bestReview(candidates.map((item) => matchTextCandidate(item, source, true)));
};

const groundField = (
  field: FieldDefinition,
  value: string | number,
  source: SourceRepresentations,
): FieldReview => {
  switch (field.kind) {
    case "text":
    case "textarea":
      return matchTextCandidate(String(value), source, true);
    case "select":
      return matchSelect(field, String(value), source);
    case "email":
      return matchEmail(String(value), source);
    case "phone":
      return matchPhone(String(value), source);
    case "date":
      return matchDate(String(value), source);
    case "number":
    case "currency":
      return matchNumber(value, source);
  }
};

export const createGroundingService = (): GroundingService => ({
  ground: ({ documentDefinition, documentText, values }: GroundingRequest): GroundingSummary => {
    const source = buildSourceRepresentations(documentText);
    const fields: Record<string, FieldReview> = {};
    const requiredMissingFieldKeys: string[] = [];
    const needsReviewFieldKeys: string[] = [];
    let verifiedFields = 0;
    let needsReviewFields = 0;
    let missingFields = 0;
    let requiredMissingFields = 0;
    let includedScore = 0;
    let includedFieldCount = 0;
    let nonNullValueCount = 0;

    for (const field of documentDefinition.fields) {
      const value = (values as Readonly<Record<string, unknown>>)[field.key];
      const review = isPresentValue(value) ? groundField(field, value, source) : missingReview;
      fields[field.key] = review;

      if (review.status === "verified") {
        verifiedFields += 1;
      } else if (review.status === "needs_review") {
        needsReviewFields += 1;
        needsReviewFieldKeys.push(field.key);
      } else {
        missingFields += 1;
        if (field.required) {
          requiredMissingFields += 1;
          requiredMissingFieldKeys.push(field.key);
        }
      }

      if (isPresentValue(value)) {
        nonNullValueCount += 1;
        includedFieldCount += 1;
        includedScore += review.confidence;
      } else if (field.required) {
        includedFieldCount += 1;
      }
    }

    const confidence = roundTwo(includedFieldCount === 0 ? 0 : includedScore / includedFieldCount);
    const warnings = buildExtractionWarnings({
      confidence,
      needsReviewFieldKeys,
      noValuesExtracted: nonNullValueCount === 0,
      requiredMissingFieldKeys,
    });

    return {
      confidence,
      fields: Object.freeze(fields),
      missingFields,
      needsReviewFields,
      requiredMissingFields,
      reviewRequired: needsReviewFields > 0 || requiredMissingFields > 0 || confidence < 0.75,
      verifiedFields,
      warnings,
    };
  },
});

export type { GroundingRequest, GroundingService, GroundingSummary } from "./grounding-types.js";
