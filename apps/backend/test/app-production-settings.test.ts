import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  createFakeExtractionService,
  createFakePdfGenerationService,
  createSilentLogger,
  testEnvironment,
} from "./support/create-test-app.js";

const createConfiguredApp = (trustProxyHops: number) =>
  createApp({
    environment: { ...testEnvironment, trustProxyHops },
    extractionService: createFakeExtractionService(),
    logger: createSilentLogger(),
    pdfGenerationService: createFakePdfGenerationService(),
  });

describe("production application settings", () => {
  it("does not trust proxy headers by default", () => {
    expect(createConfiguredApp(0).get("trust proxy")).toBe(false);
  });

  it("trusts only the configured proxy hop count", () => {
    expect(createConfiguredApp(1).get("trust proxy")).toBe(1);
    expect(createConfiguredApp(2).get("trust proxy")).toBe(2);
  });
});
