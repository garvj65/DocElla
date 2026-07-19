import { z } from "zod";

import type { FieldDefinition, SelectFieldDefinition } from "../contracts/field-definition.js";

const nonblank = (value: string): boolean => value.trim().length > 0;
const finiteNumber = (): z.ZodNumber =>
  z.number().refine(Number.isFinite, "Expected a finite number.");

const enumValues = (field: SelectFieldDefinition): [string, ...string[]] =>
  field.options.map((option) => option.value) as [string, ...string[]];

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
      return z.enum(enumValues(field)).describe(field.description);
  }
};

export const buildSubmissionFieldSchema = (field: FieldDefinition): z.ZodType => {
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
      return field.required
        ? z.enum(enumValues(field))
        : z
            .union([z.literal(""), z.enum(enumValues(field))])
            .nullable()
            .optional();
  }
};
