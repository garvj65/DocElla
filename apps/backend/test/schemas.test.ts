import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./support/create-test-app.js";

const serialized = (value: unknown): string => JSON.stringify(value);

describe("schema routes", () => {
  it("lists public schema summaries in registry order", async () => {
    const response = await request(createTestApp()).get("/api/schemas").expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((schema: { id: string }) => schema.id)).toEqual([
      "job-application",
      "basic-invoice",
    ]);
    expect(serialized(response.body)).not.toContain("assetPath");
    expect(serialized(response.body)).not.toContain("pdfFieldName");
  });

  it("returns the job application detail with ordered fields", async () => {
    const response = await request(createTestApp()).get("/api/schemas/job-application").expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe("job-application");
    expect(response.body.data.fields.map((field: { key: string }) => field.key)).toEqual([
      "fullName",
      "email",
      "phone",
      "address",
      "currentEmployer",
      "currentJobTitle",
      "yearsOfExperience",
      "highestEducation",
      "positionAppliedFor",
      "availableStartDate",
      "salaryExpectation",
      "additionalNotes",
    ]);
    expect(serialized(response.body.data)).not.toContain("assetPath");
    expect(serialized(response.body.data)).not.toContain("pdfFieldName");
  });

  it("returns the basic invoice detail with ordered fields", async () => {
    const response = await request(createTestApp()).get("/api/schemas/basic-invoice").expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe("basic-invoice");
    expect(response.body.data.fields.map((field: { key: string }) => field.key)).toEqual([
      "issuerName",
      "issuerAddress",
      "customerName",
      "customerAddress",
      "invoiceNumber",
      "issueDate",
      "dueDate",
      "currency",
      "subtotal",
      "tax",
      "total",
      "paymentTerms",
      "notes",
    ]);
    expect(serialized(response.body.data)).not.toContain("assetPath");
    expect(serialized(response.body.data)).not.toContain("pdfFieldName");
  });

  it("returns a typed error for an unknown schema", async () => {
    const response = await request(createTestApp()).get("/api/schemas/unknown").expect(404);

    expect(response.body).toEqual({
      error: {
        code: "UNKNOWN_SCHEMA",
        message: "The requested document schema does not exist.",
      },
      meta: {
        requestId: response.headers["x-request-id"],
      },
      success: false,
    });
  });
});
