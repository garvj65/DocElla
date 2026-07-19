import type { DocumentDefinition } from "../contracts/document-definition.js";
import type { FieldDefinition, SelectOption } from "../contracts/field-definition.js";
import type {
  PublicDocumentConfig,
  PublicDocumentSummary,
  PublicFieldConfig,
  PublicTemplateConfig,
} from "../contracts/public-document-config.js";

const cloneOptions = (
  options: readonly [SelectOption, ...SelectOption[]],
): readonly SelectOption[] => Object.freeze(options.map((option) => Object.freeze({ ...option })));

const buildPublicTemplateConfig = (
  template: DocumentDefinition["templates"][number],
): PublicTemplateConfig =>
  Object.freeze({
    id: template.id,
    label: template.label,
    flattenByDefault: template.flattenByDefault,
  });

const buildPublicFieldConfig = (field: FieldDefinition): PublicFieldConfig => {
  const base = {
    key: field.key,
    label: field.label,
    description: field.description,
    kind: field.kind,
    required: field.required,
    ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
  };

  if (field.kind === "select") {
    return Object.freeze({
      ...base,
      options: cloneOptions(field.options),
    });
  }

  return Object.freeze(base);
};

export const buildPublicDocumentConfig = (
  documentDefinition: DocumentDefinition,
): PublicDocumentConfig =>
  Object.freeze({
    id: documentDefinition.id,
    version: documentDefinition.version,
    label: documentDefinition.label,
    description: documentDefinition.description,
    fields: Object.freeze(documentDefinition.fields.map(buildPublicFieldConfig)),
    templates: Object.freeze(documentDefinition.templates.map(buildPublicTemplateConfig)),
  });

export const buildPublicDocumentSummary = (
  documentDefinition: DocumentDefinition,
): PublicDocumentSummary =>
  Object.freeze({
    id: documentDefinition.id,
    version: documentDefinition.version,
    label: documentDefinition.label,
    description: documentDefinition.description,
    templates: Object.freeze(documentDefinition.templates.map(buildPublicTemplateConfig)),
  });
