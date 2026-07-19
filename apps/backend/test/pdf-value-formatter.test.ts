import { jobApplicationDefinition } from "@docella/schemas";
import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import { formatPdfFieldValue } from "../src/pdf-generation/pdf-value-formatter.js";

const field = (key: string) => {
  const result = jobApplicationDefinition.fields.find((candidate) => candidate.key === key);
  if (result === undefined) {
    throw new Error(`Missing field ${key}.`);
  }
  return result;
};

const selectField = {
  description: "Choice",
  kind: "select",
  key: "choice",
  label: "Choice",
  options: [
    { label: "First Option", value: "first" },
    { label: "Second Option", value: "second" },
  ],
  pdfFieldName: "choice",
  required: false,
} as const;

describe("formatPdfFieldValue", () => {
  it("formats supported field kinds", () => {
    expect(formatPdfFieldValue(field("fullName"), "Alex Morgan")).toBe("Alex Morgan");
    expect(formatPdfFieldValue(field("currentEmployer"), undefined)).toBe("");
    expect(formatPdfFieldValue(field("currentEmployer"), null)).toBe("");
    expect(formatPdfFieldValue(field("email"), "alex@example.test")).toBe("alex@example.test");
    expect(formatPdfFieldValue(field("phone"), "+1 555 010 2200")).toBe("+1 555 010 2200");
    expect(formatPdfFieldValue(field("availableStartDate"), "2026-08-01")).toBe("2026-08-01");
    expect(formatPdfFieldValue(field("yearsOfExperience"), 5)).toBe("5");
    expect(formatPdfFieldValue(field("salaryExpectation"), 75000.5)).toBe("75000.5");
    expect(formatPdfFieldValue(selectField, "second")).toBe("Second Option");
  });

  it("rejects unsupported values without mutation", () => {
    const objectValue = { nested: true };
    expect(() => formatPdfFieldValue(selectField, "missing")).toThrow(AppError);
    expect(() => formatPdfFieldValue(field("yearsOfExperience"), Number.NaN)).toThrow(AppError);
    expect(() => formatPdfFieldValue(field("fullName"), objectValue)).toThrow(AppError);
    expect(objectValue).toEqual({ nested: true });
  });
});
