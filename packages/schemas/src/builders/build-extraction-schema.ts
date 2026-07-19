import { z } from "zod";

import type { DocumentDefinition } from "../contracts/document-definition";
import { buildExtractionFieldSchema } from "./field-schema";

type SchemaShape = Record<string, z.ZodType>;

export type ExtractionSchema = z.ZodObject<SchemaShape>;
export type ExtractionData = z.output<ExtractionSchema>;

export const buildExtractionSchema = (documentDefinition: DocumentDefinition): ExtractionSchema => {
  const shape: SchemaShape = {};

  for (const field of documentDefinition.fields) {
    shape[field.key] = buildExtractionFieldSchema(field).nullable();
  }

  return z.object(shape).strict();
};
