import type { DocumentDefinition } from "./contracts/document-definition";
import type { FieldDefinition } from "./contracts/field-definition";

const identifierPattern = /^[A-Za-z][A-Za-z0-9-]*$/;

const isBlank = (value: string): boolean => value.trim().length === 0;

const assertNotBlank = (value: string, message: string): void => {
  if (isBlank(value)) {
    throw new Error(message);
  }
};

const assertUnique = (
  values: readonly string[],
  messageForDuplicate: (value: string) => string,
): void => {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(messageForDuplicate(value));
    }

    seen.add(value);
  }
};

const validateField = (documentId: string, field: FieldDefinition): void => {
  const fieldLabel = `${documentId}.${field.key}`;

  assertNotBlank(field.key, `Document "${documentId}" has a field with an empty key.`);
  if (!identifierPattern.test(field.key)) {
    throw new Error(
      `Document "${documentId}" field key "${field.key}" must be a stable identifier.`,
    );
  }

  assertNotBlank(field.label, `Field "${fieldLabel}" must have a nonblank label.`);
  assertNotBlank(field.description, `Field "${fieldLabel}" must have a nonblank description.`);
  assertNotBlank(field.pdfFieldName, `Field "${fieldLabel}" must have a nonblank PDF field name.`);

  if (field.kind !== "select") {
    return;
  }

  if (field.options.length === 0) {
    throw new Error(`Select field "${fieldLabel}" must define at least one option.`);
  }

  for (const option of field.options) {
    assertNotBlank(option.label, `Select field "${fieldLabel}" has an option with a blank label.`);
    assertNotBlank(option.value, `Select field "${fieldLabel}" has an option with a blank value.`);
  }

  assertUnique(
    field.options.map((option) => option.value),
    (value) => `Select field "${fieldLabel}" has duplicate option value "${value}".`,
  );
};

export const defineDocument = <const TDocument extends DocumentDefinition>(
  definition: TDocument,
): TDocument => {
  assertNotBlank(definition.id, "Document definition must have a nonblank id.");
  if (!identifierPattern.test(definition.id)) {
    throw new Error(`Document id "${definition.id}" must be a stable identifier.`);
  }

  if (!Number.isInteger(definition.version) || definition.version <= 0) {
    throw new Error(`Document "${definition.id}" version must be a positive integer.`);
  }

  assertNotBlank(definition.label, `Document "${definition.id}" must have a nonblank label.`);
  assertNotBlank(
    definition.description,
    `Document "${definition.id}" must have a nonblank description.`,
  );

  if (definition.fields.length === 0) {
    throw new Error(`Document "${definition.id}" must define at least one field.`);
  }

  if (definition.templates.length === 0) {
    throw new Error(`Document "${definition.id}" must define at least one template.`);
  }

  for (const field of definition.fields) {
    validateField(definition.id, field);
  }

  for (const template of definition.templates) {
    assertNotBlank(template.id, `Document "${definition.id}" has a template with an empty id.`);
    assertNotBlank(
      template.label,
      `Template "${definition.id}.${template.id}" must have a nonblank label.`,
    );
    assertNotBlank(
      template.assetPath,
      `Template "${definition.id}.${template.id}" must have a nonblank asset path.`,
    );
  }

  assertUnique(
    definition.fields.map((field) => field.key),
    (key) => `Document "${definition.id}" has duplicate field key "${key}".`,
  );
  assertUnique(
    definition.fields.map((field) => field.pdfFieldName),
    (pdfFieldName) => `Document "${definition.id}" has duplicate PDF field name "${pdfFieldName}".`,
  );
  assertUnique(
    definition.templates.map((template) => template.id),
    (id) => `Document "${definition.id}" has duplicate template id "${id}".`,
  );

  return definition;
};
