import { z } from "zod";

export const GENERIC_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const GENERIC_DOCUMENT_LIMITS = Object.freeze({
  maxBoundingPolygonPoints: 8,
  maxColumnsPerTable: 30,
  maxDescriptionLength: 500,
  maxEvidenceItemsPerValue: 10,
  maxEvidenceTextLength: 1_000,
  maxFieldsPerSection: 50,
  maxIdentifierLength: 100,
  maxLabelLength: 120,
  maxOptionsPerField: 100,
  maxRepeatableValues: 100,
  maxRowsPerTable: 500,
  maxSections: 20,
  maxTables: 20,
  maxTitleLength: 200,
  maxTotalFields: 200,
  maxValueLength: 10_000,
  maxWarnings: 100,
});

const identifierPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const languagePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

export const genericIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(GENERIC_DOCUMENT_LIMITS.maxIdentifierLength)
  .regex(identifierPattern, "Expected a stable lowercase identifier.");

const boundedLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(GENERIC_DOCUMENT_LIMITS.maxLabelLength);

const boundedDescriptionSchema = z
  .string()
  .trim()
  .max(GENERIC_DOCUMENT_LIMITS.maxDescriptionLength);

export const genericValueTypeSchema = z.enum([
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "boolean",
  "email",
  "phone",
  "address",
  "identifier",
  "select",
]);

export type GenericValueType = z.infer<typeof genericValueTypeSchema>;

export const genericTableCellValueTypeSchema = genericValueTypeSchema.exclude([
  "long_text",
  "select",
]);

export type GenericTableCellValueType = z.infer<typeof genericTableCellValueTypeSchema>;

export const genericSelectOptionSchema = z
  .object({
    label: boundedLabelSchema,
    value: z.string().trim().min(1).max(GENERIC_DOCUMENT_LIMITS.maxLabelLength),
  })
  .strict();

export type GenericSelectOption = z.infer<typeof genericSelectOptionSchema>;

const genericFieldBaseSchema = z
  .object({
    description: boundedDescriptionSchema,
    id: genericIdentifierSchema,
    label: boundedLabelSchema,
    repeatable: z.boolean(),
    required: z.boolean(),
  })
  .strict();

const genericSelectFieldSchema = genericFieldBaseSchema
  .extend({
    options: z
      .array(genericSelectOptionSchema)
      .min(1)
      .max(GENERIC_DOCUMENT_LIMITS.maxOptionsPerField)
      .readonly(),
    valueType: z.literal("select"),
  })
  .strict()
  .superRefine((field, context) => {
    const values = new Set<string>();
    const labels = new Set<string>();

    for (const [index, option] of field.options.entries()) {
      if (values.has(option.value)) {
        context.addIssue({
          code: "custom",
          message: "Select option values must be unique.",
          path: ["options", index, "value"],
        });
      }
      if (labels.has(option.label.toLocaleLowerCase())) {
        context.addIssue({
          code: "custom",
          message: "Select option labels must be unique.",
          path: ["options", index, "label"],
        });
      }
      values.add(option.value);
      labels.add(option.label.toLocaleLowerCase());
    }
  });

const genericNonSelectFieldSchema = genericFieldBaseSchema
  .extend({
    options: z.never().optional(),
    valueType: z.enum([
      "text",
      "long_text",
      "number",
      "currency",
      "date",
      "boolean",
      "email",
      "phone",
      "address",
      "identifier",
    ]),
  })
  .strict();

export const discoveredFieldSchema = z.discriminatedUnion("valueType", [
  genericNonSelectFieldSchema,
  genericSelectFieldSchema,
]);

export type DiscoveredField = z.infer<typeof discoveredFieldSchema>;

export const discoveredSectionSchema = z
  .object({
    description: boundedDescriptionSchema,
    fields: z
      .array(discoveredFieldSchema)
      .min(1)
      .max(GENERIC_DOCUMENT_LIMITS.maxFieldsPerSection)
      .readonly(),
    id: genericIdentifierSchema,
    label: boundedLabelSchema,
  })
  .strict();

export type DiscoveredSection = z.infer<typeof discoveredSectionSchema>;

export const discoveredTableColumnSchema = z
  .object({
    description: boundedDescriptionSchema,
    id: genericIdentifierSchema,
    label: boundedLabelSchema,
    required: z.boolean(),
    valueType: genericTableCellValueTypeSchema,
  })
  .strict();

export type DiscoveredTableColumn = z.infer<typeof discoveredTableColumnSchema>;

export const discoveredTableSchema = z
  .object({
    columns: z
      .array(discoveredTableColumnSchema)
      .min(1)
      .max(GENERIC_DOCUMENT_LIMITS.maxColumnsPerTable)
      .readonly(),
    description: boundedDescriptionSchema,
    id: genericIdentifierSchema,
    label: boundedLabelSchema,
  })
  .strict()
  .superRefine((table, context) => {
    const columnIds = new Set<string>();

    for (const [index, column] of table.columns.entries()) {
      if (columnIds.has(column.id)) {
        context.addIssue({
          code: "custom",
          message: "Table column identifiers must be unique within a table.",
          path: ["columns", index, "id"],
        });
      }
      columnIds.add(column.id);
    }
  });

export type DiscoveredTable = z.infer<typeof discoveredTableSchema>;

export const discoveredDocumentSchemaSchema = z
  .object({
    documentType: genericIdentifierSchema,
    documentTypeLabel: boundedLabelSchema,
    language: z
      .string()
      .trim()
      .regex(languagePattern, "Expected a BCP 47-style language tag.")
      .nullable(),
    schemaVersion: z.literal(GENERIC_DOCUMENT_SCHEMA_VERSION),
    sections: z.array(discoveredSectionSchema).max(GENERIC_DOCUMENT_LIMITS.maxSections).readonly(),
    tables: z.array(discoveredTableSchema).max(GENERIC_DOCUMENT_LIMITS.maxTables).readonly(),
    title: z.string().trim().min(1).max(GENERIC_DOCUMENT_LIMITS.maxTitleLength).nullable(),
  })
  .strict()
  .superRefine((schema, context) => {
    const sectionIds = new Set<string>();
    const tableIds = new Set<string>();
    const fieldIds = new Set<string>();
    let totalFields = 0;

    for (const [sectionIndex, section] of schema.sections.entries()) {
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: "custom",
          message: "Section identifiers must be unique.",
          path: ["sections", sectionIndex, "id"],
        });
      }
      sectionIds.add(section.id);

      for (const [fieldIndex, field] of section.fields.entries()) {
        totalFields += 1;
        if (fieldIds.has(field.id)) {
          context.addIssue({
            code: "custom",
            message: "Field identifiers must be unique across the document schema.",
            path: ["sections", sectionIndex, "fields", fieldIndex, "id"],
          });
        }
        fieldIds.add(field.id);
      }
    }

    for (const [tableIndex, table] of schema.tables.entries()) {
      if (tableIds.has(table.id)) {
        context.addIssue({
          code: "custom",
          message: "Table identifiers must be unique.",
          path: ["tables", tableIndex, "id"],
        });
      }
      tableIds.add(table.id);
    }

    if (totalFields > GENERIC_DOCUMENT_LIMITS.maxTotalFields) {
      context.addIssue({
        code: "custom",
        message: `Document schemas may contain at most ${String(
          GENERIC_DOCUMENT_LIMITS.maxTotalFields,
        )} fields.`,
        path: ["sections"],
      });
    }

    const totalTableColumns = schema.tables.reduce((total, table) => total + table.columns.length, 0);
    if (totalFields === 0 && totalTableColumns === 0) {
      context.addIssue({
        code: "custom",
        message: "A discovered document schema must contain at least one field or table column.",
        path: ["sections"],
      });
    }
  });

export type DiscoveredDocumentSchema = z.infer<typeof discoveredDocumentSchemaSchema>;

export const genericSourceFormatSchema = z.enum(["pdf", "image", "docx", "xlsx", "pptx", "html"]);
export type GenericSourceFormat = z.infer<typeof genericSourceFormatSchema>;

export const genericContentUnitSchema = z.enum(["page", "sheet", "slide", "document"]);
export type GenericContentUnit = z.infer<typeof genericContentUnitSchema>;

export const genericDocumentMetadataSchema = z
  .object({
    contentUnit: genericContentUnitSchema,
    contentUnitCount: z.number().int().positive(),
    detectedType: genericIdentifierSchema,
    language: z
      .string()
      .trim()
      .regex(languagePattern, "Expected a BCP 47-style language tag.")
      .nullable(),
    sourceFormat: genericSourceFormatSchema,
    title: z.string().trim().min(1).max(GENERIC_DOCUMENT_LIMITS.maxTitleLength).nullable(),
  })
  .strict();

export type GenericDocumentMetadata = z.infer<typeof genericDocumentMetadataSchema>;

const pageEvidenceLocationSchema = z
  .object({
    kind: z.literal("page"),
    pageNumber: z.number().int().positive(),
  })
  .strict();

const sheetEvidenceLocationSchema = z
  .object({
    cellRange: z.string().trim().min(1).max(100).optional(),
    kind: z.literal("sheet"),
    sheetName: z.string().trim().min(1).max(120),
  })
  .strict();

const slideEvidenceLocationSchema = z
  .object({
    kind: z.literal("slide"),
    slideNumber: z.number().int().positive(),
  })
  .strict();

const htmlEvidenceLocationSchema = z
  .object({
    elementPath: z.string().trim().min(1).max(500).optional(),
    kind: z.literal("html"),
  })
  .strict();

export const genericEvidenceLocationSchema = z.discriminatedUnion("kind", [
  pageEvidenceLocationSchema,
  sheetEvidenceLocationSchema,
  slideEvidenceLocationSchema,
  htmlEvidenceLocationSchema,
]);

export type GenericEvidenceLocation = z.infer<typeof genericEvidenceLocationSchema>;

export const genericBoundingPointSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export type GenericBoundingPoint = z.infer<typeof genericBoundingPointSchema>;

export const genericEvidenceAnchorSchema = z
  .object({
    boundingPolygon: z
      .array(genericBoundingPointSchema)
      .min(4)
      .max(GENERIC_DOCUMENT_LIMITS.maxBoundingPolygonPoints)
      .readonly()
      .optional(),
    location: genericEvidenceLocationSchema,
    providerConfidence: z.number().finite().min(0).max(1).optional(),
    text: z.string().trim().min(1).max(GENERIC_DOCUMENT_LIMITS.maxEvidenceTextLength),
  })
  .strict();

export type GenericEvidenceAnchor = z.infer<typeof genericEvidenceAnchorSchema>;

export const genericReviewStatusSchema = z.enum([
  "verified",
  "needs_review",
  "missing",
  "conflicting",
  "low_ocr_confidence",
]);

export type GenericReviewStatus = z.infer<typeof genericReviewStatusSchema>;

const genericValueReviewShape = {
  confidence: z.number().finite().min(0).max(1),
  evidence: z
    .array(genericEvidenceAnchorSchema)
    .max(GENERIC_DOCUMENT_LIMITS.maxEvidenceItemsPerValue)
    .readonly(),
  message: z.string().trim().min(1).max(500).optional(),
  status: genericReviewStatusSchema,
} as const;

const validateGenericReview = (
  review: {
    readonly confidence: number;
    readonly evidence: readonly unknown[];
    readonly status: GenericReviewStatus;
  },
  context: z.RefinementCtx,
): void => {
  if (review.status === "missing" && review.confidence !== 0) {
    context.addIssue({
      code: "custom",
      message: "Missing values must have zero confidence.",
      path: ["confidence"],
    });
  }
  if (review.status === "verified" && review.evidence.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Verified values require at least one evidence anchor.",
      path: ["evidence"],
    });
  }
};

export const genericValueReviewSchema = z
  .object(genericValueReviewShape)
  .strict()
  .superRefine(validateGenericReview);

export type GenericValueReview = z.infer<typeof genericValueReviewSchema>;

export const genericTableReviewSchema = z
  .object({
    ...genericValueReviewShape,
    rowCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(validateGenericReview);

export type GenericTableReview = z.infer<typeof genericTableReviewSchema>;

export const genericWarningCodeSchema = z.enum([
  "schema_discovery_low_confidence",
  "field_needs_review",
  "field_missing",
  "field_conflict",
  "low_ocr_confidence",
  "table_needs_review",
  "unsupported_structure",
  "truncated_input",
]);

export type GenericWarningCode = z.infer<typeof genericWarningCodeSchema>;

export const genericDocumentWarningSchema = z
  .object({
    code: genericWarningCodeSchema,
    fieldIds: z.array(genericIdentifierSchema).max(GENERIC_DOCUMENT_LIMITS.maxTotalFields).optional(),
    message: z.string().trim().min(1).max(500),
    tableIds: z.array(genericIdentifierSchema).max(GENERIC_DOCUMENT_LIMITS.maxTables).optional(),
  })
  .strict();

export type GenericDocumentWarning = z.infer<typeof genericDocumentWarningSchema>;

export type GenericScalarValue = string | number | boolean;
export type GenericFieldValue = GenericScalarValue | readonly GenericScalarValue[] | null;
export type GenericTableCellValue = GenericScalarValue | null;
export type GenericTableRow = Readonly<Record<string, GenericTableCellValue>>;

export interface GenericDocumentValues {
  readonly fields: Readonly<Record<string, GenericFieldValue>>;
  readonly tables: Readonly<Record<string, readonly GenericTableRow[]>>;
}

export interface GenericDocumentReview {
  readonly fields: Readonly<Record<string, GenericValueReview>>;
  readonly tables: Readonly<Record<string, GenericTableReview>>;
}

export interface GenericDocumentExtractionResult {
  readonly confidence: number;
  readonly document: GenericDocumentMetadata;
  readonly review: GenericDocumentReview;
  readonly reviewRequired: boolean;
  readonly schema: DiscoveredDocumentSchema;
  readonly values: GenericDocumentValues;
  readonly warnings: readonly GenericDocumentWarning[];
}
