import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createPdfGenerationService } from "../src/pdf-generation/pdf-generation-service.js";
import { createFilePdfTemplateRepository } from "../src/pdf-generation/pdf-template-repository.js";
import {
  createFakeExtractionService,
  createSilentLogger,
  testEnvironment,
} from "./support/create-test-app.js";

const baseValues = {
  additionalNotes: null,
  address: "123 Main Street",
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "candidate@example.test",
  fullName: "Release Candidate",
  highestEducation: "Bachelor's Degree",
  phone: "+91 90000 00000",
  positionAppliedFor: "Forward Deployed Engineer",
  salaryExpectation: 1_400_000,
  yearsOfExperience: 1,
};

const createRealGenerationApp = () =>
  createApp({
    environment: testEnvironment,
    extractionService: createFakeExtractionService(),
    logger: createSilentLogger(),
    pdfGenerationService: createPdfGenerationService(
      createFilePdfTemplateRepository(new URL("../assets/", import.meta.url)),
    ),
  });

const pdfParser = (res: NodeJS.ReadableStream, callback: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
};

describe("multiline PDF generation", () => {
  it("preserves multiline textarea values in editable PDFs", async () => {
    const values = {
      ...baseValues,
      additionalNotes: "Available immediately\nPortfolio available on request",
      address: "123 Main Street\nBengaluru, Karnataka",
    };

    const response = await request(createRealGenerationApp())
      .post("/api/generate-pdf")
      .send({
        flatten: false,
        schemaType: "job-application",
        templateId: "job-application-default",
        values,
      })
      .buffer(true)
      .parse(pdfParser)
      .expect(200);

    const pdfDocument = await PDFDocument.load(response.body as Buffer);
    const form = pdfDocument.getForm();
    expect(form.getTextField("job.address").getText()).toBe(values.address);
    expect(form.getTextField("job.additional_notes").getText()).toBe(values.additionalNotes);
  });

  it("generates flattened PDFs from multiline textarea values", async () => {
    const response = await request(createRealGenerationApp())
      .post("/api/generate-pdf")
      .send({
        flatten: true,
        schemaType: "job-application",
        templateId: "job-application-default",
        values: {
          ...baseValues,
          additionalNotes: "Availability: immediate\nRelocation: open",
          address: "123 Main Street\nBengaluru, Karnataka",
        },
      })
      .buffer(true)
      .parse(pdfParser)
      .expect(200);

    expect(Buffer.from(response.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    const pdfDocument = await PDFDocument.load(response.body as Buffer);
    expect(pdfDocument.getForm().getFields()).toHaveLength(0);
  });

  it("still rejects glyphs outside the selected standard font", async () => {
    const response = await request(createRealGenerationApp())
      .post("/api/generate-pdf")
      .send({
        flatten: false,
        schemaType: "job-application",
        templateId: "job-application-default",
        values: {
          ...baseValues,
          fullName: "Release Candidate Ω",
        },
      })
      .expect(422);

    expect(response.body.error.code).toBe("PDF_VALUE_UNSUPPORTED");
  });
});
