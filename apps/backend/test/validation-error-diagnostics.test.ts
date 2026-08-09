import { describe, expect, it } from "vitest";

import { validationErrorDiagnosticContext } from "../src/errors/validation-error-diagnostics.js";

describe("validationErrorDiagnosticContext", () => {
  it("exposes only bounded issue codes and paths", () => {
    const context = validationErrorDiagnosticContext({
      issues: [
        { code: "custom", message: "PRIVATE duplicate value", path: ["sections", 1, "fields", 2, "id"] },
        { code: "too_small", minimum: 1, path: ["sections", 3, "fields"] },
      ],
    });

    expect(context).toEqual({
      validationIssueCodes: "custom,too_small",
      validationIssueCount: 2,
      validationIssuePaths: "sections.1.fields.2.id|sections.3.fields",
    });
    expect(JSON.stringify(context)).not.toContain("PRIVATE");
  });

  it("ignores arbitrary causes and unsafe paths", () => {
    expect(validationErrorDiagnosticContext(new Error("PRIVATE_DOCUMENT_TEXT"))).toEqual({});
    expect(
      validationErrorDiagnosticContext({
        issues: [{ code: "custom", path: ["sections", "PRIVATE VALUE WITH SPACES"] }],
      }),
    ).toEqual({ validationIssueCodes: "custom", validationIssueCount: 1 });
  });
});
