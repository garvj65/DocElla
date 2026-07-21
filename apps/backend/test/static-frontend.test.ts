import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  createFakeExtractionService,
  createFakePdfGenerationService,
  createSilentLogger,
  testEnvironment,
} from "./support/create-test-app.js";

const indexHtml = "<!doctype html><html><body><main>DocElla production</main></body></html>";

describe("production frontend delivery", () => {
  let rootPath = "";

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), "docella-frontend-"));
    await mkdir(join(rootPath, "assets"));
    await writeFile(join(rootPath, "index.html"), indexHtml, "utf8");
    await writeFile(join(rootPath, "assets", "app-abc123.js"), "export {};", "utf8");
  });

  const createProductionApp = () =>
    createApp({
      environment: {
        ...testEnvironment,
        frontendOrigin: "https://app.example.test",
        nodeEnv: "production",
      },
      extractionService: createFakeExtractionService(),
      frontendDistUrl: pathToFileURL(`${rootPath}/`),
      logger: createSilentLogger(),
      pdfGenerationService: createFakePdfGenerationService(),
    });

  it("serves the application shell without caching index HTML", async () => {
    const response = await request(createProductionApp()).get("/").expect(200);

    expect(response.text).toContain("DocElla production");
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("uses immutable caching for fingerprinted assets", async () => {
    const response = await request(createProductionApp()).get("/assets/app-abc123.js").expect(200);

    expect(response.headers["cache-control"]).toContain("max-age=31536000");
    expect(response.headers["cache-control"]).toContain("immutable");
  });

  it("keeps unknown API routes as JSON", async () => {
    const response = await request(createProductionApp()).get("/api/does-not-exist").expect(404);

    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("serves a versioned health response", async () => {
    const response = await request(createProductionApp()).get("/api/health").expect(200);

    expect(response.body.data).toEqual({
      service: "DocElla API",
      status: "ok",
      version: "1.0.0",
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
