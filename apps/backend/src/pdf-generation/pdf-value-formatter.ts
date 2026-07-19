import type { FieldDefinition } from "@docella/schemas";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";

const unsupported = (): never => {
  throw new AppError({
    code: ERROR_CODES.PDF_VALUE_UNSUPPORTED,
    logCause: false,
    message: "One or more submitted values cannot be written to the selected PDF template.",
    status: 422,
  });
};

export const formatPdfFieldValue = (field: FieldDefinition, value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  switch (field.kind) {
    case "text":
    case "textarea":
    case "email":
    case "phone":
    case "date":
      return typeof value === "string" ? value : unsupported();
    case "number":
    case "currency":
      return typeof value === "number" && Number.isFinite(value) ? String(value) : unsupported();
    case "select": {
      if (typeof value !== "string") {
        return unsupported();
      }

      const option = field.options.find((candidate) => candidate.value === value);
      return option === undefined ? unsupported() : option.label;
    }
  }
};
