import { z } from "zod";

import {
  discoveredDocumentSchemaSchema,
  GENERIC_DOCUMENT_LIMITS,
  genericDocumentMetadataSchema,
  genericDocumentWarningSchema,
  genericTableReviewSchema,
  genericValueReviewSchema,
  type DiscoveredDocumentSchema,
  type DiscoveredField,
  type DiscoveredTableColumn,
  type GenericDocumentExtractionResult,
  type GenericDocumentReview,
  type GenericDocumentValues,
  type GenericFieldValue,
  type GenericScalarValue,
  type GenericSelectOption,
  type GenericTableCellValue,
} from "../contracts/generic-document.js";

interface GenericValueDefinition {
  readonly description: string;
  readonly options?: readonly GenericSelectOption[];
  readonly valueType:
    | DiscoveredField["valueType"]
    | DiscoveredTableColumn["valueType"];
}

const nonblankString = (maximumLength = GENERIC_DOCUMENT_LIMITS.maxValueLength): z.ZodString =>
  z.string().trim().min(1).max(maximumLength);

const finiteNumber = (): z.ZodNumber =>
  z.number().refine(Number.isFinite, "Expected a finite number.");

const selectValues = (options: readonly GenericSelectOption[]): [string, ...string[]] =>
  options.map((option) => option.value) as [string, ...string[]];

const buildGenericScalarSchema = (
  definition: GenericValueDefinition,
): z.ZodType<GenericScalarValue> => {
  switch (definition.valueType) {
    case "text":
    case "long_text":
    case "address":
      return nonblankString().describe(definition.description);
    case "identifier":
      return nonblankString(500).describe(definition.description);
    case "email":
      return z.email().max(254).describe(definition.description);
    case "phone":
      return nonblankString(100).describe(definition.description);
    case "date":
      return z.iso.date().describe(definition.description);
    case "number":
    case "currency":
      return finiteNumber().describe(definition.description);
    case "boolean":
      return z.boolean().describe(definition.description);
    case "select": {
      if (definition.options === undefined || definition.options.length === 0) {
        throw new Error("Select fields must define at least one option.");
      }
      return z.enum(selectValues(definition.options)).describe(definition.description);
    }
  }
};

const buildExtractionFieldValueSchema = (field: DiscoveredField): z.ZodType<GenericFieldValue> => {
  const scalarSchema = buildGenericScalarSchema(field);
  return field.repeatable
    ? z
        .array(scalarSchema)
        .min(1)
        .max(GENERIC_DOCUMENT_LIMITS.maxRepeatableValues)
        .readonly()
        .nullable()
    : scalarSchema.nullable();
};

const buildSubmissionFieldValueSchema = (field: DiscoveredField): z.ZodType => {
  const scalarSchema = buildGenericScalarSchema(field);
  if (field.repeatable) {
    const repeatedSchema = z
      .array(scalarSchema)
      .min(1)
      .max(GENERIC_DOCUMENT_LIMITS.maxRepeatableValues)
      .readonly();
    return field.required ? repeatedSchema : repeatedSchema.nullable();
  }
  return field.required ? scalarSchema : scalarSchema.nullable();
};

const buildExtractionTableCellSchema = (
  column: DiscoveredTableColumn,
): z.ZodType<GenericTableCellValue> => buildGenericScalarSchema(column).nullable();

const buildSubmissionTableCellSchema = (column: DiscoveredTableColumn): z.ZodType => {
  const scalarSchema = buildGenericScalarSchema(column);
  return column.required ? scalarSchema : scalarSchema.nullable();
};

const buildFieldShape = (
  schema: DiscoveredDocumentSchema,
  mode: "extraction" | "submission",
): z.ZodRawShape => {
  const shape: z.ZodRawShape = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      shape[field.id] =
        mode === "extraction"
          ? buildExtractionFieldValueSchema(field)
          : buildSubmissionFieldValueSchema(field);
    }
  }
  return shape;
};

const buildTableShape = (
  schema: DiscoveredDocumentSchema,
  mode: "extraction" | "submission",
): z.ZodRawShape => {
  const tables: z.ZodRawShape = {};

  for (const table of schema.tables) {
    const rowShape: z.ZodRawShape = {};
    for (const column of table.columns) {
      rowShape[column.id] =
        mode === "extraction"
          ? buildExtractionTableCellSchema(column)
          : buildSubmissionTableCellSchema(column);
    }
    tables[table.id] = z
      .array(z.object(rowShape).strict())
      .max(GENERIC_DOCUMENT_LIMITS.maxRowsPerTable)
      .readonly();
  }

  return tables;
};

const buildValuesSchema = (
  schema: DiscoveredDocumentSchema,
  mode: "extraction" | "submission",
): z.ZodType<GenericDocumentValues> =>
  z
    .object({
      fields: z.object(buildFieldShape(schema, mode)).strict(),
      tables: z.object(buildTableShape(schema, mode)).strict(),
    })
    .strict() as unknown as z.ZodType<GenericDocumentValues>;

export const buildGenericDocumentExtractionValuesSchema = (
  input: DiscoveredDocumentSchema,
): z.ZodType<GenericDocumentValues> => {
  const schema = discoveredDocumentSchemaSchema.parse(input);
  return buildValuesSchema(schema, "extraction");
};

export const buildGenericDocumentSubmissionSchema = (
  input: DiscoveredDocumentSchema,
): z.ZodType<GenericDocumentValues> => {
  const schema = discoveredDocumentSchemaSchema.parse(input);
  return buildValuesSchema(schema, "submission");
};

export const buildGenericDocumentReviewSchema = (
  input: DiscoveredDocumentSchema,
): z.ZodType<GenericDocumentReview> => {
  const schema = discoveredDocumentSchemaSchema.parse(input);
  const fieldShape: z.ZodRawShape = {};
  const tableShape: z.ZodRawShape = {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      fieldShape[field.id] = genericValueReviewSchema;
    }
  }
  for (const table of schema.tables) {
    tableShape[table.id] = genericTableReviewSchema;
  }

  return z
    .object({
      fields: z.object(fieldShape).strict(),
      tables: z.object(tableShape).strict(),
    })
    .strict() as unknown as z.ZodType<GenericDocumentReview>;
};

const schemaFingerprint = (schema: DiscoveredDocumentSchema): string =>
  JSON.stringify(discoveredDocumentSchemaSchema.parse(schema));

const buildExactDiscoveredSchema = (
  expectedSchema: DiscoveredDocumentSchema,
): z.ZodType<DiscoveredDocumentSchema> => {
  const expectedFingerprint = schemaFingerprint(expectedSchema);
  return discoveredDocumentSchemaSchema.refine(
    (candidate) => schemaFingerprint(candidate) === expectedFingerprint,
    "The extraction result schema does not match the expected discovered schema.",
  );
};

const allFields = (schema: DiscoveredDocumentSchema): readonly DiscoveredField[] =>
  schema.sections.flatMap((section) => section.fields);

export const buildGenericDocumentExtractionResultSchema = (
  input: DiscoveredDocumentSchema,
): z.ZodType<GenericDocumentExtractionResult> => {
  const schema = discoveredDocumentSchemaSchema.parse(input);
  const valuesSchema = buildGenericDocumentExtractionValuesSchema(schema);
  const reviewSchema = buildGenericDocumentReviewSchema(schema);
  const fieldIds = new Set(allFields(schema).map((field) => field.id));
  const tableIds = new Set(schema.tables.map((table) => table.id));

  return z
    .object({
      confidence: z.number().finite().min(0).max(1),
      document: genericDocumentMetadataSchema,
      review: reviewSchema,
      reviewRequired: z.boolean(),
      schema: buildExactDiscoveredSchema(schema),
      values: valuesSchema,
      warnings: z
        .array(genericDocumentWarningSchema)
        .max(GENERIC_DOCUMENT_LIMITS.maxWarnings)
        .readonly(),
    })
    .strict()
    .superRefine((result, context) => {
      if (result.document.detectedType !== schema.documentType) {
        context.addIssue({
          code: "custom",
          message: "Detected document type must match the discovered schema type.",
          path: ["document", "detectedType"],
        });
      }

      let requiresReview = result.confidence < 0.75;
      const values = result.values.fields as Readonly<Record<string, GenericFieldValue>>;
      const reviews = result.review.fields;

      for (const field of allFields(schema)) {
        const value = values[field.id];
        const review = reviews[field.id];
        if (review === undefined) {
          continue;
        }

        if (value === null && review.status !== "missing") {
          context.addIssue({
            code: "custom",
            message: "Null field values must be marked missing.",
            path: ["review", "fields", field.id, "status"],
          });
        }
        if (value !== null && review.status === "missing") {
          context.addIssue({
            code: "custom",
            message: "Non-null field values cannot be marked missing.",
            path: ["review", "fields", field.id, "status"],
          });
        }
        if (review.status !== "verified") {
          requiresReview = true;
        }
      }

      const tableValues = result.values.tables;
      const tableReviews = result.review.tables;
      for (const table of schema.tables) {
        const rows = tableValues[table.id] ?? [];
        const review = tableReviews[table.id];
        if (review === undefined) {
          continue;
        }
        if (review.rowCount !== rows.length) {
          context.addIssue({
            code: "custom",
            message: "Table review row count must match extracted rows.",
            path: ["review", "tables", table.id, "rowCount"],
          });
        }
        if (review.status !== "verified") {
          requiresReview = true;
        }
      }

      for (const [warningIndex, warning] of result.warnings.entries()) {
        for (const fieldId of warning.fieldIds ?? []) {
          if (!fieldIds.has(fieldId)) {
            context.addIssue({
              code: "custom",
              message: "Warning references an unknown field identifier.",
              path: ["warnings", warningIndex, "fieldIds"],
            });
          }
        }
        for (const tableId of warning.tableIds ?? []) {
          if (!tableIds.has(tableId)) {
            context.addIssue({
              code: "custom",
              message: "Warning references an unknown table identifier.",
              path: ["warnings", warningIndex, "tableIds"],
            });
          }
        }
      }

      if (requiresReview && !result.reviewRequired) {
        context.addIssue({
          code: "custom",
          message: "Review is required when confidence is low or any value is not verified.",
          path: ["reviewRequired"],
        });
      }
    }) as unknown as z.ZodType<GenericDocumentExtractionResult>;
};
