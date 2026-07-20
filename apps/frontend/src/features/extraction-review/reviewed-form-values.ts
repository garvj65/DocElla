import type {
  PublicDefaultValues,
  PublicDocumentConfig,
  PublicExtractionData,
} from "@docella/schemas/public";

export const buildReviewedFormValues = (
  config: PublicDocumentConfig,
  extracted: PublicExtractionData,
): PublicDefaultValues => {
  const values: Record<string, string | number | null> = {};

  for (const field of config.fields) {
    const value = extracted.values[field.key] ?? null;
    if (value !== null) {
      values[field.key] = value;
    } else {
      values[field.key] = field.kind === "number" || field.kind === "currency" ? null : "";
    }
  }

  return Object.freeze(values);
};
