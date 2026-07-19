export const DOCELLA_PROJECT_NAME = "DocElla" as const;

export type { DocumentDefinition, TemplateDefinition } from "./contracts/document-definition";
export type {
  FieldDefinition,
  FieldKind,
  NonSelectFieldDefinition,
  SelectFieldDefinition,
  SelectOption,
} from "./contracts/field-definition";
export type {
  PublicDocumentConfig,
  PublicDocumentSummary,
  PublicFieldConfig,
  PublicTemplateConfig,
} from "./contracts/public-document-config";

export { defineDocument } from "./define-document";
export {
  buildDefaultValues,
  type DefaultFieldValue,
  type DefaultValues,
} from "./builders/build-default-values";
export {
  buildExtractionSchema,
  type ExtractionData,
  type ExtractionSchema,
} from "./builders/build-extraction-schema";
export {
  buildJsonSchema,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from "./builders/build-json-schema";
export {
  buildPublicDocumentConfig,
  buildPublicDocumentSummary,
} from "./builders/build-public-config";
export {
  buildSubmissionSchema,
  type SubmissionData,
  type SubmissionSchema,
} from "./builders/build-submission-schema";
export { basicInvoiceDefinition } from "./definitions/basic-invoice";
export { jobApplicationDefinition } from "./definitions/job-application";
export {
  assertUniqueDocumentDefinitions,
  getDocumentDefinition,
  getPublicDocumentConfig,
  listDocumentDefinitions,
  listPublicDocumentSummaries,
} from "./registry";
