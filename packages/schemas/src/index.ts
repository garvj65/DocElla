export const DOCELLA_PROJECT_NAME = "DocElla" as const;
export const DOCELLA_VERSION = "1.0.0" as const;

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
export {
  fieldKindSchema,
  publicDocumentConfigSchema,
  publicDocumentSummarySchema,
  publicFieldConfigSchema,
  publicTemplateConfigSchema,
  selectOptionSchema,
} from "./contracts/public-runtime-schemas.js";
export {
  EXTRACTION_WARNING_CODES,
  GROUNDING_MATCH_TYPES,
  GROUNDING_STATUSES,
  buildPublicExtractionResultSchema,
  extractionWarningCodeSchema,
  extractionWarningSchema,
  fieldReviewSchema,
  groundingMatchTypeSchema,
  groundingStatusSchema,
  type ExtractionWarning,
  type ExtractionWarningCode,
  type FieldReview,
  type FieldReviewMap,
  type GroundingMatchType,
  type GroundingStatus,
  type PublicExtractionData,
  type PublicExtractionMeta,
  type PublicExtractionResult,
} from "./contracts/extraction-review.js";

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
  buildPublicDefaultValues,
  buildPublicSubmissionSchema,
  type PublicDefaultValue,
  type PublicDefaultValues,
  type PublicSubmissionData,
  type PublicSubmissionSchema,
} from "./builders/build-public-submission-schema.js";
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
