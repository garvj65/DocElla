import { DOCELLA_PROJECT_NAME, DOCELLA_VERSION } from "@docella/schemas";
import { Router } from "express";

import { sendSuccess } from "../http/responses.js";

export const createHealthRouter = (): Router => {
  const router = Router();

  router.get("/", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    sendSuccess(response, 200, {
      service: `${DOCELLA_PROJECT_NAME} API`,
      status: "ok",
      version: DOCELLA_VERSION,
    });
  });

  return router;
};
