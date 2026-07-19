import { describe, expect, it } from "vitest";

import {
  basicInvoiceDefinition,
  buildDefaultValues,
  buildExtractionSchema,
  buildJsonSchema,
  buildPublicDocumentConfig,
  buildSubmissionSchema,
  defineDocument,
  jobApplicationDefinition,
} from "../src/index";

const realDefinitions = [jobApplicationDefinition, basicInvoiceDefinition] as const;

const validExtractionValue = (kind: string): string | number => {
  switch (kind) {
    case "email":
      return "person@example.com";
    case "date":
      return "2026-07-19";
    case "number":
    case "currency":
      return 42;
    default:
      return "value";
  }
};

const wrongExtractionValue = (kind: string): string | number => {
  switch (kind) {
    case "number":
    case "currency":
      return "42";
    default:
      return 42;
  }
};

describe("buildExtractionSchema", () => {
  it("requires every key, allows null, rejects unknown keys, and validates primitive types", () => {
    for (const definition of realDefinitions) {
      const schema = buildExtractionSchema(definition);
      const allNulls = Object.fromEntries(definition.fields.map((field) => [field.key, null]));

      expect(schema.safeParse(allNulls).success).toBe(true);

      const validValues = Object.fromEntries(
        definition.fields.map((field) => [field.key, validExtractionValue(field.kind)]),
      );
      expect(schema.safeParse(validValues).success).toBe(true);

      for (const field of definition.fields) {
        const withoutField = { ...allNulls };
        Reflect.deleteProperty(withoutField, field.key);
        expect(schema.safeParse(withoutField).success).toBe(false);

        expect(
          schema.safeParse({
            ...validValues,
            [field.key]: wrongExtractionValue(field.kind),
          }).success,
        ).toBe(false);
      }

      expect(schema.safeParse({ ...allNulls, extra: null }).success).toBe(false);
    }
  });

  it("rejects invalid non-null emails, dates, NaN, and infinity", () => {
    const jobSchema = buildExtractionSchema(jobApplicationDefinition);
    const jobNulls = Object.fromEntries(
      jobApplicationDefinition.fields.map((field) => [field.key, null]),
    );

    expect(jobSchema.safeParse({ ...jobNulls, email: "not-email" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...jobNulls, availableStartDate: "07/19/2026" }).success).toBe(
      false,
    );
    expect(jobSchema.safeParse({ ...jobNulls, yearsOfExperience: Number.NaN }).success).toBe(false);
    expect(
      jobSchema.safeParse({ ...jobNulls, yearsOfExperience: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });
});

describe("buildSubmissionSchema", () => {
  it("enforces required and optional field behavior", () => {
    const schema = buildSubmissionSchema(jobApplicationDefinition);

    expect(schema.safeParse({}).success).toBe(false);
    expect(
      schema.safeParse({
        fullName: " ",
        email: "person@example.com",
        phone: "555-0100",
        address: "123 Main",
        positionAppliedFor: "Analyst",
      }).success,
    ).toBe(false);

    const validRequiredOnly = {
      fullName: "Alex Morgan",
      email: "alex@example.com",
      phone: "555-0100",
      address: "123 Main",
      positionAppliedFor: "Analyst",
    };

    expect(schema.safeParse(validRequiredOnly).success).toBe(true);
    expect(
      schema.safeParse({
        ...validRequiredOnly,
        currentEmployer: null,
        currentJobTitle: "",
        yearsOfExperience: 5,
        availableStartDate: "2026-08-01",
        salaryExpectation: null,
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ ...validRequiredOnly, availableStartDate: "tomorrow" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...validRequiredOnly, yearsOfExperience: "5" }).success).toBe(false);
    expect(schema.safeParse({ ...validRequiredOnly, yearsOfExperience: Number.NaN }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        ...validRequiredOnly,
        yearsOfExperience: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...validRequiredOnly, extra: "nope" }).success).toBe(false);
  });

  it("requires finite numbers for required numeric fields", () => {
    const schema = buildSubmissionSchema(basicInvoiceDefinition);
    const valid = {
      issuerName: "Acme Services LLC",
      issuerAddress: "123 Market St",
      customerName: "Globex",
      invoiceNumber: "INV-1001",
      issueDate: "2026-07-19",
      currency: "USD",
      subtotal: 1000,
      total: 1080,
    };

    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, subtotal: "1000" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, subtotal: null }).success).toBe(false);
    expect(schema.safeParse({ ...valid, subtotal: Number.NaN }).success).toBe(false);
    expect(schema.safeParse({ ...valid, tax: null }).success).toBe(true);
    expect(schema.safeParse({ ...valid, tax: 80 }).success).toBe(true);
    expect(schema.safeParse({ ...valid, tax: "" }).success).toBe(false);
  });

  it("validates select values from configured options", () => {
    const definition = defineDocument({
      id: "select-document",
      version: 1,
      label: "Select Document",
      description: "A document with select fields.",
      fields: [
        {
          key: "requiredStatus",
          label: "Required status",
          description: "A required status.",
          kind: "select",
          required: true,
          options: [{ label: "Open", value: "open" }],
          pdfFieldName: "select.required_status",
        },
        {
          key: "optionalStatus",
          label: "Optional status",
          description: "An optional status.",
          kind: "select",
          required: false,
          options: [{ label: "Closed", value: "closed" }],
          pdfFieldName: "select.optional_status",
        },
      ],
      templates: [
        {
          id: "select-default",
          label: "Select Default",
          assetPath: "templates/select.pdf",
          flattenByDefault: true,
        },
      ],
    } as const);
    const schema = buildSubmissionSchema(definition);

    expect(schema.safeParse({ requiredStatus: "open" }).success).toBe(true);
    expect(schema.safeParse({ requiredStatus: "open", optionalStatus: "" }).success).toBe(true);
    expect(schema.safeParse({ requiredStatus: "open", optionalStatus: null }).success).toBe(true);
    expect(schema.safeParse({ requiredStatus: "" }).success).toBe(false);
    expect(schema.safeParse({ requiredStatus: "pending" }).success).toBe(false);
    expect(schema.safeParse({ requiredStatus: "open", optionalStatus: "pending" }).success).toBe(
      false,
    );
  });
});

describe("buildJsonSchema", () => {
  it("converts extraction schemas to closed JSON Schema objects", () => {
    for (const definition of realDefinitions) {
      const jsonSchema = buildJsonSchema(definition);
      const required = jsonSchema.required;
      const properties = jsonSchema.properties;
      const keys = definition.fields.map((field) => field.key);

      expect(jsonSchema.type).toBe("object");
      expect(jsonSchema.additionalProperties).toBe(false);
      expect(jsonSchema.$ref).toBeUndefined();
      expect(required).toEqual(keys);
      expect(properties).toBeTypeOf("object");

      if (properties === null || Array.isArray(properties) || typeof properties !== "object") {
        throw new Error("Expected JSON Schema properties to be an object.");
      }

      expect(Object.keys(properties)).toEqual(keys);

      for (const field of definition.fields) {
        const property = properties[field.key];

        expect(property).toBeTypeOf("object");
        expect(JSON.stringify(property)).toContain("null");
        expect(property).not.toEqual({});
      }
    }

    const jobSchema = buildJsonSchema(jobApplicationDefinition);
    const jobProperties = jobSchema.properties;

    if (
      jobProperties === null ||
      Array.isArray(jobProperties) ||
      typeof jobProperties !== "object"
    ) {
      throw new Error("Expected job JSON Schema properties to be an object.");
    }

    expect(JSON.stringify(jobProperties.email)).toContain("email");
    expect(JSON.stringify(jobProperties.availableStartDate)).toContain("date");
  });
});

describe("buildPublicDocumentConfig", () => {
  it("omits private definition details and preserves order", () => {
    const config = buildPublicDocumentConfig(jobApplicationDefinition);

    expect(config.fields.map((field) => field.key)).toEqual(
      jobApplicationDefinition.fields.map((field) => field.key),
    );
    expect(config.templates.map((template) => template.id)).toEqual(["job-application-default"]);
    expect(JSON.stringify(config)).not.toContain("assetPath");
    expect(JSON.stringify(config)).not.toContain("pdfFieldName");
  });

  it("preserves select options and protects definitions from public mutation", () => {
    const definition = defineDocument({
      id: "public-select",
      version: 1,
      label: "Public Select",
      description: "A public select document.",
      fields: [
        {
          key: "status",
          label: "Status",
          description: "The status.",
          kind: "select",
          required: false,
          options: [{ label: "Open", value: "open" }],
          pdfFieldName: "public.status",
        },
      ],
      templates: [
        {
          id: "public-default",
          label: "Public Default",
          assetPath: "templates/public.pdf",
          flattenByDefault: true,
        },
      ],
    } as const);
    const config = buildPublicDocumentConfig(definition);
    const selectField = config.fields[0];

    expect(selectField?.options).toEqual([{ label: "Open", value: "open" }]);
    expect(() => {
      (config.fields as { push: (value: unknown) => number }).push({ key: "bad" });
    }).toThrow();
    expect(definition.fields).toHaveLength(1);
  });
});

describe("buildDefaultValues", () => {
  it("creates deterministic defaults for every field", () => {
    const first = buildDefaultValues(jobApplicationDefinition);
    const second = buildDefaultValues(jobApplicationDefinition);

    expect(Object.keys(first)).toEqual(jobApplicationDefinition.fields.map((field) => field.key));
    expect(first.fullName).toBe("");
    expect(first.availableStartDate).toBe("");
    expect(first.yearsOfExperience).toBeNull();
    expect(first.salaryExpectation).toBeNull();
    expect(second).toEqual(first);
  });
});
