import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import { createTestPdf } from "./support/create-test-pdf.js";
import { createFakeExtractionService } from "./support/fake-extraction-service.js";
import { createSilentLogger, testEnvironment } from "./support/create-test-app.js";

const createUploadTestApp = (maxFileBytes = 1024 * 1024) => {
  const service = createFakeExtractionService({
    extractedCharacters: 1,
    model: testEnvironment.groqModel,
    pageCount: 1,
    values: {},
  });
  const app = createApp({
    environment: testEnvironment,
    extractionService: service,
    logger: createSilentLogger(),
    uploadLimits: { maxFileBytes },
  });

  return { app, service };
};

describe("PDF upload middleware", () => {
  it("accepts one PDF file and schemaType field", async () => {
    const { app, service } = createUploadTestApp();

    await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", await createTestPdf(), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(200);

    expect(service.calls).toHaveLength(1);
  });

  it("rejects missing files", async () => {
    const { app, service } = createUploadTestApp();
    const response = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .expect(400);

    expect(response.body.error.code).toBe("UPLOAD_REQUIRED");
    expect(service.calls).toHaveLength(0);
  });

  it("rejects wrong file field names and duplicate files", async () => {
    const pdf = await createTestPdf();
    const { app, service } = createUploadTestApp();

    const wrongField = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("document", pdf, { contentType: "application/pdf", filename: "synthetic.pdf" })
      .expect(400);

    const duplicate = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", pdf, { contentType: "application/pdf", filename: "synthetic.pdf" })
      .attach("file", pdf, { contentType: "application/pdf", filename: "synthetic-2.pdf" })
      .expect(400);

    expect(wrongField.body.error.code).toBe("UPLOAD_UNEXPECTED_FILE");
    expect(duplicate.body.error.code).toBe("UPLOAD_UNEXPECTED_FILE");
    expect(service.calls).toHaveLength(0);
  });

  it("rejects extra text fields, invalid MIME types, large files, and invalid signatures", async () => {
    const pdf = await createTestPdf();
    const { app, service } = createUploadTestApp();

    const extraField = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .field("extra", "nope")
      .attach("file", pdf, { contentType: "application/pdf", filename: "synthetic.pdf" })
      .expect(400);
    const invalidType = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", Buffer.from("not a pdf"), {
        contentType: "text/plain",
        filename: "synthetic.txt",
      })
      .expect(415);
    const tooLarge = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", Buffer.concat([pdf, Buffer.alloc(1024 * 1024)]), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(413);
    const invalidSignature = await request(app)
      .post("/api/extract")
      .field("schemaType", "job-application")
      .attach("file", Buffer.from("no header"), {
        contentType: "application/pdf",
        filename: "synthetic.pdf",
      })
      .expect(422);

    expect(extraField.body.error.code).toBe("UPLOAD_INVALID_MULTIPART");
    expect(invalidType.body.error.code).toBe("UPLOAD_INVALID_TYPE");
    expect(tooLarge.body.error.code).toBe("UPLOAD_TOO_LARGE");
    expect(invalidSignature.body.error.code).toBe("PDF_INVALID");
    expect(service.calls).toHaveLength(0);
  });
});
