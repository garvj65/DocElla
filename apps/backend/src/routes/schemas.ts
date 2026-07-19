import { getPublicDocumentConfig, listPublicDocumentSummaries } from "@docella/schemas";
import { Router } from "express";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { sendSuccess } from "../http/responses.js";

const listSchemaSummaries = listPublicDocumentSummaries as () => unknown;
const getSchemaConfig = getPublicDocumentConfig as (schemaType: string) => unknown;

export const createSchemaRouter = (): Router => {
  const router = Router();

  router.get("/", (_request, response) => {
    sendSuccess(response, 200, listSchemaSummaries());
  });

  router.get("/:schemaType", (request, response) => {
    const schemaType = request.params.schemaType;
    const config = getSchemaConfig(schemaType);

    if (config === undefined) {
      throw new AppError({
        code: ERROR_CODES.UNKNOWN_SCHEMA,
        message: "The requested document schema does not exist.",
        status: 404,
      });
    }

    sendSuccess(response, 200, config);
  });

  return router;
};
