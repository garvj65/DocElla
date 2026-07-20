import { describe, expect, it } from "vitest";

import { buildReviewedFormValues } from "../src/features/extraction-review/reviewed-form-values";
import { buildExtractionResult, everyFieldConfig } from "./support/schemas";

describe("buildReviewedFormValues", () => {
  it("maps extracted values into editable defaults without mutating the extraction", () => {
    const extraction = {
      ...buildExtractionResult(everyFieldConfig).data,
      values: { ...buildExtractionResult(everyFieldConfig).data.values },
    };
    extraction.values.notes = null;
    extraction.values.phone = null;
    extraction.values.startDate = null;
    extraction.values.years = null;
    extraction.values.amount = null;

    const values = buildReviewedFormValues(everyFieldConfig, extraction);

    expect(values.fullName).toBe("Extracted value");
    expect(values.email).toBe("alex@example.com");
    expect(values.status).toBe("open");
    expect(values.notes).toBe("");
    expect(values.phone).toBe("");
    expect(values.startDate).toBe("");
    expect(values.years).toBeNull();
    expect(values.amount).toBeNull();
    expect(Object.keys(values)).toEqual(everyFieldConfig.fields.map((field) => field.key));
    expect(extraction.values.notes).toBeNull();
  });
});
