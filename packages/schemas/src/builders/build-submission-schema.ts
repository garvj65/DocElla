import { z } from "zod";

import type { DocumentDefinition } from "../contracts/document-definition.js";
import { buildSubmissionFieldSchema } from "./field-schema.js";

type SchemaShape = Record<string, z.ZodType>;

export type SubmissionSchema = z.ZodObject<SchemaShape>;
export type SubmissionData = z.output<SubmissionSchema>;

export const buildSubmissionSchema = (documentDefinition: DocumentDefinition): SubmissionSchema => {
  const shape: SchemaShape = {};

  for (const field of documentDefinition.fields) {
    shape[field.key] = buildSubmissionFieldSchema(field);
  }

  return z.object(shape).strict();
};
