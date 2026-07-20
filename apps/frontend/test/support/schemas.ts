import type {
  FieldReview,
  PublicDocumentConfig,
  PublicDocumentSummary,
  PublicExtractionResult,
} from "@docella/schemas/public";

export const everyFieldConfig: PublicDocumentConfig = {
  description: "Synthetic schema for frontend tests.",
  fields: [
    {
      description: "Your full legal name.",
      key: "fullName",
      kind: "text",
      label: "Full name",
      placeholder: "Alex Morgan",
      required: true,
    },
    {
      description: "A longer note.",
      key: "notes",
      kind: "textarea",
      label: "Notes",
      placeholder: "Add context",
      required: false,
    },
    {
      description: "Contact email.",
      key: "email",
      kind: "email",
      label: "Email",
      placeholder: "alex@example.com",
      required: true,
    },
    {
      description: "Contact phone.",
      key: "phone",
      kind: "phone",
      label: "Phone",
      placeholder: "555-0100",
      required: false,
    },
    {
      description: "Start date.",
      key: "startDate",
      kind: "date",
      label: "Start date",
      required: false,
    },
    {
      description: "Years of experience.",
      key: "years",
      kind: "number",
      label: "Years",
      required: false,
    },
    {
      description: "Expected amount.",
      key: "amount",
      kind: "currency",
      label: "Amount",
      required: false,
    },
    {
      description: "Current status.",
      key: "status",
      kind: "select",
      label: "Status",
      options: [
        { label: "Open", value: "open" },
        { label: "Closed", value: "closed" },
      ],
      required: true,
    },
  ],
  id: "synthetic",
  label: "Synthetic Document",
  templates: [
    {
      flattenByDefault: true,
      id: "synthetic-default",
      label: "Synthetic Default",
    },
  ],
  version: 1,
};

export const everyFieldSummary: PublicDocumentSummary = {
  description: everyFieldConfig.description,
  id: everyFieldConfig.id,
  label: everyFieldConfig.label,
  templates: everyFieldConfig.templates,
  version: everyFieldConfig.version,
};

export const successEnvelope = (data: unknown) => ({
  data,
  meta: { requestId: "req_test" },
  success: true,
});

const verified: FieldReview = { confidence: 1, matchType: "exact", status: "verified" };

export const buildExtractionResult = (
  config: PublicDocumentConfig,
  overrides: Partial<PublicExtractionResult> = {},
): PublicExtractionResult => {
  const values: Record<string, string | number | null> = {};
  const review: Record<string, FieldReview> = {};

  for (const field of config.fields) {
    values[field.key] =
      field.kind === "number" || field.kind === "currency"
        ? 12
        : field.kind === "email"
          ? "alex@example.com"
          : field.kind === "date"
            ? "2026-07-20"
            : field.kind === "select"
              ? (field.options?.[0]?.value ?? null)
              : "Extracted value";
    review[field.key] = verified;
  }

  return {
    data: {
      documentVersion: config.version,
      review,
      schemaType: config.id,
      values,
    },
    meta: {
      confidence: 1,
      extractedCharacters: 300,
      missingFields: 0,
      model: "hidden-model",
      needsReviewFields: 0,
      pageCount: 1,
      requestId: "req_extract",
      requiredMissingFields: 0,
      reviewRequired: false,
      verifiedFields: config.fields.length,
      warnings: [],
    },
    ...overrides,
  };
};
