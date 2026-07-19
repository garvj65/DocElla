import type { FieldKind, SelectOption } from "./field-definition";

export interface PublicTemplateConfig {
  readonly id: string;
  readonly label: string;
  readonly flattenByDefault: boolean;
}

export interface PublicFieldConfig {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly options?: readonly SelectOption[];
}

export interface PublicDocumentConfig {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly PublicFieldConfig[];
  readonly templates: readonly PublicTemplateConfig[];
}

export interface PublicDocumentSummary {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly templates: readonly PublicTemplateConfig[];
}
