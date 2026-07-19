import { DOCELLA_PROJECT_NAME } from "@docella/schemas";
import express from "express";

export const app = express();

app.get("/api/health", (_request, response) => {
  response.json({
    success: true,
    data: {
      service: `${DOCELLA_PROJECT_NAME} API`,
      status: "ok",
    },
  });
});
