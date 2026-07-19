export const DOCELLA_PROJECT_NAME = "DocElla" as const;

export type { DocumentDefinition, TemplateDefinition } from "./contracts/document-definition.js";
export type {
  FieldDefinition,
  FieldKind,
  NonSelectFieldDefinition,
  SelectFieldDefinition,
  SelectOption,
} from "./contracts/field-definition.js";
export type {
  PublicDocumentConfig,
  PublicDocumentSummary,
  PublicFieldConfig,
  PublicTemplateConfig,
} from "./contracts/public-document-config.js";

export { defineDocument } from "./define-document.js";
export {
  buildDefaultValues,
  type DefaultFieldValue,
  type DefaultValues,
} from "./builders/build-default-values.js";
export {
  buildExtractionSchema,
  type ExtractionData,
  type ExtractionSchema,
} from "./builders/build-extraction-schema.js";
export {
  buildJsonSchema,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from "./builders/build-json-schema.js";
export {
  buildPublicDocumentConfig,
  buildPublicDocumentSummary,
} from "./builders/build-public-config.js";
export {
  buildSubmissionSchema,
  type SubmissionData,
  type SubmissionSchema,
} from "./builders/build-submission-schema.js";
export { basicInvoiceDefinition } from "./definitions/basic-invoice.js";
export { jobApplicationDefinition } from "./definitions/job-application.js";
export {
  assertUniqueDocumentDefinitions,
  getDocumentDefinition,
  getPublicDocumentConfig,
  listDocumentDefinitions,
  listPublicDocumentSummaries,
} from "./registry.js";
