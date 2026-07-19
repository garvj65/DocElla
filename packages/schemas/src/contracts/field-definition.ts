export type FieldKind =
  "text" | "textarea" | "email" | "phone" | "date" | "number" | "currency" | "select";

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

interface BaseFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly pdfFieldName: string;
}

export type SelectFieldDefinition = BaseFieldDefinition & {
  readonly kind: "select";
  readonly options: readonly [SelectOption, ...SelectOption[]];
};

export type NonSelectFieldDefinition = BaseFieldDefinition & {
  readonly kind: Exclude<FieldKind, "select">;
  readonly options?: never;
};

export type FieldDefinition = SelectFieldDefinition | NonSelectFieldDefinition;
