import { z } from "zod";

import type { PublicFieldConfig } from "../contracts/public-document-config.js";
import type { FieldDefinition, SelectOption } from "../contracts/field-definition.js";

const nonblank = (value: string): boolean => value.trim().length > 0;
const finiteNumber = (): z.ZodNumber =>
  z.number().refine(Number.isFinite, "Expected a finite number.");

const enumValues = (options: readonly SelectOption[]): [string, ...string[]] =>
  options.map((option) => option.value) as [string, ...string[]];

export const buildExtractionFieldSchema = (field: FieldDefinition): z.ZodType => {
  switch (field.kind) {
    case "text":
    case "textarea":
    case "phone":
      return z.string().describe(field.description);
    case "email":
      return z.email().describe(field.description);
    case "date":
      return z.iso.date().describe(field.description);
    case "number":
    case "currency":
      return finiteNumber().describe(field.description);
    case "select":
      return z.enum(enumValues(field.options)).describe(field.description);
  }
};

export const buildSubmissionFieldSchema = (
  field: FieldDefinition | PublicFieldConfig,
): z.ZodType => {
  switch (field.kind) {
    case "text":
    case "textarea":
    case "phone":
      return field.required
        ? z.string().refine(nonblank, "Required fields cannot be blank.")
        : z.string().nullable().optional();
    case "email":
      return field.required
        ? z.email()
        : z
            .union([z.literal(""), z.email()])
            .nullable()
            .optional();
    case "date":
      return field.required
        ? z.iso.date()
        : z
            .union([z.literal(""), z.iso.date()])
            .nullable()
            .optional();
    case "number":
    case "currency":
      return field.required ? finiteNumber() : finiteNumber().nullable().optional();
    case "select":
      if (field.options === undefined || field.options.length === 0) {
        throw new Error("Select fields must define at least one option.");
      }

      return field.required
        ? z.enum(enumValues(field.options))
        : z
            .union([z.literal(""), z.enum(enumValues(field.options))])
            .nullable()
            .optional();
  }
};
