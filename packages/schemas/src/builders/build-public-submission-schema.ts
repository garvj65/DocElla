import { z } from "zod";

import type { PublicDocumentConfig } from "../contracts/public-document-config.js";
import { buildSubmissionFieldSchema } from "./field-schema.js";

type SchemaShape = Record<string, z.ZodType>;

export type PublicSubmissionSchema = z.ZodObject<SchemaShape>;
export type PublicSubmissionData = z.output<PublicSubmissionSchema>;
export type PublicDefaultValue = string | number | null;
export type PublicDefaultValues = Readonly<Record<string, PublicDefaultValue>>;

export const buildPublicSubmissionSchema = (
  config: PublicDocumentConfig,
): PublicSubmissionSchema => {
  const shape: SchemaShape = {};

  for (const field of config.fields) {
    shape[field.key] = buildSubmissionFieldSchema(field);
  }

  return z.object(shape).strict();
};

export const buildPublicDefaultValues = (config: PublicDocumentConfig): PublicDefaultValues => {
  const values: Record<string, PublicDefaultValue> = {};

  for (const field of config.fields) {
    values[field.key] = field.kind === "number" || field.kind === "currency" ? null : "";
  }

  return Object.freeze(values);
};
