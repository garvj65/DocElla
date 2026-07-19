import { EXTRACTION_WARNING_CODES, type ExtractionWarning } from "@docella/schemas";

interface BuildWarningsOptions {
  readonly noValuesExtracted: boolean;
  readonly requiredMissingFieldKeys: readonly string[];
  readonly needsReviewFieldKeys: readonly string[];
  readonly confidence: number;
}

export const buildExtractionWarnings = ({
  confidence,
  needsReviewFieldKeys,
  noValuesExtracted,
  requiredMissingFieldKeys,
}: BuildWarningsOptions): readonly ExtractionWarning[] => {
  const warnings: ExtractionWarning[] = [];

  if (noValuesExtracted) {
    warnings.push({
      code: EXTRACTION_WARNING_CODES.NO_VALUES_EXTRACTED,
      message: "No document values could be extracted.",
    });
  }

  if (requiredMissingFieldKeys.length > 0) {
    warnings.push({
      code: EXTRACTION_WARNING_CODES.REQUIRED_FIELDS_MISSING,
      fieldKeys: requiredMissingFieldKeys,
      message: "One or more required fields are missing.",
    });
  }

  if (needsReviewFieldKeys.length > 0) {
    warnings.push({
      code: EXTRACTION_WARNING_CODES.FIELDS_REQUIRE_REVIEW,
      fieldKeys: needsReviewFieldKeys,
      message: "One or more extracted values require review.",
    });
  }

  if (confidence < 0.75) {
    warnings.push({
      code: EXTRACTION_WARNING_CODES.LOW_CONFIDENCE,
      message: "The extraction confidence is below the review threshold.",
    });
  }

  return Object.freeze(warnings.map((warning) => Object.freeze(warning)));
};
