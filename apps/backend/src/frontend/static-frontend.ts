import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import express, { Router, type RequestHandler } from "express";

export interface StaticFrontendOptions {
  readonly rootUrl?: URL;
}

export const defaultFrontendDistUrl = new URL("../../../frontend/dist/", import.meta.url);

const noCache: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "no-cache");
  next();
};

export const createStaticFrontendRouter = ({
  rootUrl = defaultFrontendDistUrl,
}: StaticFrontendOptions = {}): Router => {
  const rootPath = fileURLToPath(rootUrl);
  const indexPath = join(rootPath, "index.html");
  const assetsPath = join(rootPath, "assets");

  if (!existsSync(indexPath)) {
    throw new Error("The production frontend build is unavailable.");
  }

  const router = Router();

  router.use(
    "/assets",
    express.static(assetsPath, {
      dotfiles: "deny",
      fallthrough: true,
      immutable: true,
      index: false,
      maxAge: "1y",
      redirect: false,
    }),
  );
  router.use(
    noCache,
    express.static(rootPath, {
      dotfiles: "deny",
      fallthrough: true,
      index: false,
      maxAge: 0,
      redirect: false,
    }),
  );
  router.use((request, response, next) => {
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      request.path.startsWith("/assets/")
    ) {
      next();
      return;
    }

    response.setHeader("Cache-Control", "no-cache");
    response.sendFile(indexPath);
  });

  return router;
};
