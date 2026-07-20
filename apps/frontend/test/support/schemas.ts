import type { PublicDocumentConfig, PublicDocumentSummary } from "@docella/schemas/public";

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
