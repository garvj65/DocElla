import { describe, expect, it } from "vitest";

import {
  DOCELLA_PROJECT_NAME,
  buildPublicDocumentConfig,
  defineDocument,
  getDocumentDefinition,
  getPublicDocumentConfig,
  listDocumentDefinitions,
  listPublicDocumentSummaries,
} from "../src/index";

interface MutableDocumentList {
  push: (value: unknown) => number;
}

interface MutableDocument {
  id: string;
  label: string;
}

interface MutableFieldList {
  push: (value: unknown) => number;
}

interface MutableTemplateList {
  push: (value: unknown) => number;
}

interface MutableField {
  label: string;
}

interface MutableTemplate {
  label: string;
}

interface MutableOptionList {
  push: (value: unknown) => number;
}

interface MutableOption {
  value: string;
}

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

  it("prevents structural mutation of returned registry lists", () => {
    const definitions = listDocumentDefinitions();

    expect(Object.isFrozen(definitions)).toBe(true);
    expect(() => {
      (definitions as MutableDocumentList).push({ id: "extra" });
    }).toThrow();
    expect(listDocumentDefinitions()).toHaveLength(2);
  });

  it("returns deeply frozen registry definitions", () => {
    const definition = getDocumentDefinition("job-application");

    expect(definition).toBeDefined();
    if (definition === undefined) {
      throw new Error("Expected job application definition.");
    }

    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.fields)).toBe(true);
    expect(Object.isFrozen(definition.templates)).toBe(true);
    expect(Object.isFrozen(definition.fields[0])).toBe(true);
    expect(Object.isFrozen(definition.templates[0])).toBe(true);

    expect(() => {
      (definition as MutableDocument).label = "Changed";
    }).toThrow();
    expect(() => {
      (definition.fields as MutableFieldList).push({ key: "extra" });
    }).toThrow();
    expect(() => {
      (definition.templates as MutableTemplateList).push({ id: "extra" });
    }).toThrow();
    expect(() => {
      (definition.fields[0] as MutableField).label = "Changed";
    }).toThrow();
    expect(() => {
      (definition.templates[0] as MutableTemplate).label = "Changed";
    }).toThrow();

    const nextLookup = getDocumentDefinition("job-application");

    expect(nextLookup?.label).toBe("Job Application");
    expect(nextLookup?.fields[0]?.label).toBe("Full name");
    expect(nextLookup?.templates[0]?.label).toBe("Default Job Application");
  });

  it("freezes select option arrays and option objects", () => {
    const definition = defineDocument({
      id: "select-freeze",
      version: 1,
      label: "Select Freeze",
      description: "A document with a select field.",
      fields: [
        {
          key: "status",
          label: "Status",
          description: "The status value.",
          kind: "select",
          required: true,
          options: [
            { label: "Open", value: "open" },
            { label: "Closed", value: "closed" },
          ],
          pdfFieldName: "select.status",
        },
      ],
      templates: [
        {
          id: "select-freeze-default",
          label: "Select Freeze Default",
          assetPath: "templates/select-freeze.pdf",
          flattenByDefault: true,
        },
      ],
    } as const);
    const field = definition.fields[0];

    expect(field?.kind).toBe("select");
    if (field?.kind !== "select") {
      throw new Error("Expected select field.");
    }

    expect(Object.isFrozen(field.options)).toBe(true);
    expect(Object.isFrozen(field.options[0])).toBe(true);
    expect(() => {
      (field.options as MutableOptionList).push({ label: "Pending", value: "pending" });
    }).toThrow();
    expect(() => {
      (field.options[0] as MutableOption).value = "changed";
    }).toThrow();
    expect(field.options[0].value).toBe("open");
  });

  it("keeps public configuration independently cloned and immutable", () => {
    const definition = defineDocument({
      id: "public-select-freeze",
      version: 1,
      label: "Public Select Freeze",
      description: "A document with public select configuration.",
      fields: [
        {
          key: "status",
          label: "Status",
          description: "The status value.",
          kind: "select",
          required: false,
          options: [{ label: "Open", value: "open" }],
          pdfFieldName: "public.status",
        },
      ],
      templates: [
        {
          id: "public-select-freeze-default",
          label: "Public Select Freeze Default",
          assetPath: "templates/public-select-freeze.pdf",
          flattenByDefault: true,
        },
      ],
    } as const);
    const config = buildPublicDocumentConfig(definition);
    const field = config.fields[0];

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.fields)).toBe(true);
    expect(Object.isFrozen(config.templates)).toBe(true);
    expect(Object.isFrozen(field)).toBe(true);
    expect(field?.options).toBeDefined();

    if (field?.options === undefined) {
      throw new Error("Expected public select options.");
    }

    expect(field.options).not.toBe(definition.fields[0].options);
    expect(field.options[0]).not.toBe(definition.fields[0].options[0]);
    expect(Object.isFrozen(field.options)).toBe(true);
    expect(Object.isFrozen(field.options[0])).toBe(true);

    expect(() => {
      (field.options[0] as MutableOption).value = "changed";
    }).toThrow();
    expect(definition.fields[0].options[0].value).toBe("open");
  });
});
