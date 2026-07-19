import { DOCELLA_PROJECT_NAME } from "@docella/schemas";
import { Router } from "express";

import { sendSuccess } from "../http/responses.js";

export const createHealthRouter = (): Router => {
  const router = Router();

  router.get("/", (_request, response) => {
    sendSuccess(response, 200, {
      service: `${DOCELLA_PROJECT_NAME} API`,
      status: "ok",
    });
  });

  return router;
};
