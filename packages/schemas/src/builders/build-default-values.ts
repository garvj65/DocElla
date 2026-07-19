import type { DocumentDefinition } from "../contracts/document-definition.js";

export type DefaultFieldValue = string | number | null;
export type DefaultValues = Readonly<Record<string, DefaultFieldValue>>;

export const buildDefaultValues = (documentDefinition: DocumentDefinition): DefaultValues => {
  const values: Record<string, DefaultFieldValue> = {};

  for (const field of documentDefinition.fields) {
    values[field.key] = field.kind === "number" || field.kind === "currency" ? null : "";
  }

  return Object.freeze(values);
};
