import type { DocumentDefinition, TemplateDefinition } from "@docella/schemas";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";

export const resolveTemplate = (
  documentDefinition: DocumentDefinition,
  templateId: string,
): TemplateDefinition => {
  const template = documentDefinition.templates.find((candidate) => candidate.id === templateId);

  if (template === undefined) {
    throw new AppError({
      code: ERROR_CODES.UNKNOWN_TEMPLATE,
      message: "The requested PDF template does not exist.",
      status: 404,
    });
  }

  return template;
};
