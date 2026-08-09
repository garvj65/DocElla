import {
  buildGenericExtractionJsonSchema,
  type DiscoveredDocumentSchema,
  type DiscoveredField,
  type DiscoveredSection,
} from "@docella/schemas";

export const GENERIC_EXTRACTION_MAX_FIELDS_PER_BATCH = 25 as const;
export const GENERIC_EXTRACTION_MAX_SCHEMA_CHARACTERS = 12_000 as const;

export interface GenericExtractionBatch {
  readonly id: string;
  readonly schema: DiscoveredDocumentSchema;
}

const schemaWith = (
  documentSchema: DiscoveredDocumentSchema,
  sections: DiscoveredDocumentSchema["sections"],
  tables: DiscoveredDocumentSchema["tables"],
): DiscoveredDocumentSchema => ({
  documentType: documentSchema.documentType,
  documentTypeLabel: documentSchema.documentTypeLabel,
  language: documentSchema.language,
  schemaVersion: documentSchema.schemaVersion,
  sections,
  tables,
  title: documentSchema.title,
});

const providerSchemaCharacters = (schema: DiscoveredDocumentSchema): number =>
  JSON.stringify(buildGenericExtractionJsonSchema(schema)).length;

const fieldBatchSchema = (
  documentSchema: DiscoveredDocumentSchema,
  section: DiscoveredSection,
  fields: readonly DiscoveredField[],
): DiscoveredDocumentSchema =>
  schemaWith(
    documentSchema,
    [
      {
        ...section,
        fields,
      },
    ],
    [],
  );

const splitSectionFields = (
  documentSchema: DiscoveredDocumentSchema,
  section: DiscoveredSection,
): readonly DiscoveredDocumentSchema[] => {
  const batches: DiscoveredDocumentSchema[] = [];
  let fields: DiscoveredField[] = [];

  const flush = (): void => {
    if (fields.length === 0) return;
    batches.push(fieldBatchSchema(documentSchema, section, fields));
    fields = [];
  };

  for (const field of section.fields) {
    const candidate = [...fields, field];
    const candidateSchema = fieldBatchSchema(documentSchema, section, candidate);
    const exceedsFieldLimit = candidate.length > GENERIC_EXTRACTION_MAX_FIELDS_PER_BATCH;
    const exceedsSchemaLimit =
      providerSchemaCharacters(candidateSchema) > GENERIC_EXTRACTION_MAX_SCHEMA_CHARACTERS;

    if (fields.length > 0 && (exceedsFieldLimit || exceedsSchemaLimit)) {
      flush();
      fields.push(field);
      continue;
    }

    fields = candidate;
  }

  flush();
  return batches;
};

export const buildGenericExtractionBatches = (
  documentSchema: DiscoveredDocumentSchema,
): readonly GenericExtractionBatch[] => {
  const batches: GenericExtractionBatch[] = [];
  let fieldBatchIndex = 0;
  let tableBatchIndex = 0;

  for (const section of documentSchema.sections) {
    for (const schema of splitSectionFields(documentSchema, section)) {
      fieldBatchIndex += 1;
      batches.push({
        id: `fields_${String(fieldBatchIndex)}`,
        schema,
      });
    }
  }

  for (const table of documentSchema.tables) {
    tableBatchIndex += 1;
    batches.push({
      id: `table_${String(tableBatchIndex)}`,
      schema: schemaWith(documentSchema, [], [table]),
    });
  }

  return batches;
};
