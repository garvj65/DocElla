import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  createFakeExtractionService,
  createSilentLogger,
  testEnvironment,
} from "./support/create-test-app.js";

const validValues = {
  additionalNotes: null,
  address: "1 Test Street",
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "release@example.test",
  fullName: "Release Test",
  highestEducation: null,
  phone: "+1 555 010 2200",
  positionAppliedFor: "Analyst",
  salaryExpectation: null,
  yearsOfExperience: null,
};

describe("generation middleware order", () => {
  it("rate limits before malformed JSON parsing or generation", async () => {
    const generate = vi.fn(async () => ({
      bytes: new TextEncoder().encode("%PDF-FAKE"),
      filename: "release.pdf",
      flattened: true,
      schemaType: "job-application",
      templateId: "job-application-default",
    }));
    const app = createApp({
      environment: { ...testEnvironment, generateRateLimitMax: 1 },
      extractionService: createFakeExtractionService(),
      logger: createSilentLogger(),
      pdfGenerationService: { generate },
    });

    await request(app)
      .post("/api/generate-pdf")
      .send({
        schemaType: "job-application",
        templateId: "job-application-default",
        values: validValues,
      })
      .expect(200);

    const response = await request(app)
      .post("/api/generate-pdf")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(429);

    expect(response.body.error.code).toBe("GENERATION_RATE_LIMITED");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
