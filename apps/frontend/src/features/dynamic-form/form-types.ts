import type { PublicDefaultValue } from "@docella/schemas/public";

export type DynamicFormValues = Record<string, PublicDefaultValue>;
export type ValidationState = "idle" | "invalid" | "valid";
