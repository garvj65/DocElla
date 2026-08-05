import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import {
  createDocumentUploadMiddleware,
  getValidatedDocumentUpload,
} from "../src/middleware/document-upload.js";

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  response.status(500).json({ code: "INTERNAL_ERROR" });
};

const createUploadApp = () => {
  const app = express();
  app.post("/upload", createDocumentUploadMiddleware(), (incoming, response) => {
    const uploaded = getValidatedDocumentUpload(incoming);
    response.status(200).json({
      bytes: uploaded.bytes.length,
      filename: uploaded.filename,
      mediaType: uploaded.mediaType,
      sourceFormat: uploaded.sourceFormat,
    });
  });
  app.use(errorHandler);
  return app;
};

describe("createDocumentUploadMiddleware", () => {
  it("keeps a validated document in memory for downstream services", async () => {
    const response = await request(createUploadApp())
      .post("/upload")
      .attach(
        "file",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        { contentType: "image/png", filename: "scan.png" },
      );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      bytes: 8,
      filename: "scan.png",
      mediaType: "image/png",
      sourceFormat: "image",
    });
  });

  it("requires exactly one file in the expected field", async () => {
    expect((await request(createUploadApp()).post("/upload")).body.code).toBe("UPLOAD_REQUIRED");
    expect(
      (
        await request(createUploadApp())
          .post("/upload")
          .attach("wrong", Buffer.from("%PDF-1.7"), {
            contentType: "application/pdf",
            filename: "sample.pdf",
          })
      ).body.code,
    ).toBe("UPLOAD_UNEXPECTED_FILE");
  });

  it("rejects spoofed content before downstream analysis", async () => {
    const response = await request(createUploadApp())
      .post("/upload")
      .attach("file", Buffer.from("not a PDF"), {
        contentType: "application/pdf",
        filename: "spoofed.pdf",
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("DOCUMENT_SIGNATURE_INVALID");
  });
});
