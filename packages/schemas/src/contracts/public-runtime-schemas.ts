import { z } from "zod";

export const fieldKindSchema = z.enum([
  "text",
  "textarea",
  "email",
  "phone",
  "date",
  "number",
  "currency",
  "select",
]);

export const selectOptionSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

export const publicTemplateConfigSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().min(1),
    flattenByDefault: z.boolean(),
  })
  .strict();

const publicFieldBaseSchema = z
  .object({
    key: z.string().trim().min(1),
    label: z.string().min(1),
    description: z.string(),
    required: z.boolean(),
    placeholder: z.string().optional(),
  })
  .strict();

const publicSelectFieldConfigSchema = publicFieldBaseSchema
  .extend({
    kind: z.literal("select"),
    options: z.tuple([selectOptionSchema]).rest(selectOptionSchema),
  })
  .strict();

const publicNonSelectFieldConfigSchema = publicFieldBaseSchema
  .extend({
    kind: z.enum(["text", "textarea", "email", "phone", "date", "number", "currency"]),
    options: z.never().optional(),
  })
  .strict();

export const publicFieldConfigSchema = z.discriminatedUnion("kind", [
  publicNonSelectFieldConfigSchema,
  publicSelectFieldConfigSchema,
]);

export const publicDocumentSummarySchema = z
  .object({
    id: z.string().trim().min(1),
    version: z.number().int().positive(),
    label: z.string().min(1),
    description: z.string(),
    templates: z.array(publicTemplateConfigSchema).readonly(),
  })
  .strict();

export const publicDocumentConfigSchema = publicDocumentSummarySchema
  .extend({
    fields: z.array(publicFieldConfigSchema).readonly(),
  })
  .strict();
