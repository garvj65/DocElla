import { describe, expect, it } from "vitest";

import {
  DOCELLA_PROJECT_NAME,
  getDocumentDefinition,
  getPublicDocumentConfig,
  listDocumentDefinitions,
  listPublicDocumentSummaries,
} from "../src/index";

describe("registry", () => {
  it("keeps the scaffold export available", () => {
    expect(DOCELLA_PROJECT_NAME).toBe("DocElla");
  });

  it("lists exactly the two known definitions in deterministic order", () => {
    const definitions = listDocumentDefinitions();

    expect(definitions).toHaveLength(2);
    expect(definitions.map((definition) => definition.id)).toEqual([
      "job-application",
      "basic-invoice",
    ]);
  });

  it("looks up known documents and returns undefined for unknown ids", () => {
    expect(getDocumentDefinition("job-application")?.label).toBe("Job Application");
    expect(getDocumentDefinition("basic-invoice")?.label).toBe("Basic Invoice");
    expect(getDocumentDefinition("unknown")).toBeUndefined();
    expect(getPublicDocumentConfig("unknown")).toBeUndefined();
  });

  it("generates frontend-safe summaries", () => {
    const summaries = listPublicDocumentSummaries();

    expect(summaries.map((summary) => summary.id)).toEqual(["job-application", "basic-invoice"]);
    expect(JSON.stringify(summaries)).not.toContain("assetPath");
    expect(JSON.stringify(summaries)).not.toContain("pdfFieldName");
  });
});
