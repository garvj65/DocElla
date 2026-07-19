import type { FieldDefinition } from "./field-definition";

export interface TemplateDefinition {
  readonly id: string;
  readonly label: string;
  readonly assetPath: string;
  readonly flattenByDefault: boolean;
}

export interface DocumentDefinition {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly FieldDefinition[];
  readonly templates: readonly TemplateDefinition[];
}
