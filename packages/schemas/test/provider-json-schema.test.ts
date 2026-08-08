import { describe, expect, it } from "vitest";

import {
  basicInvoiceDefinition,
  buildProviderExtractionJsonSchema,
  jobApplicationDefinition,
  type JsonObject,
  type JsonValue,
} from "../src/index";

const isObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertClosedAndRequired = (schemaValue: JsonValue, path = "$root"): void => {
  if (Array.isArray(schemaValue)) {
    schemaValue.forEach((item, index) =>
      assertClosedAndRequired(item, `${path}[${String(index)}]`),
    );
    return;
  }
  if (!isObject(schemaValue)) return;

  const properties = schemaValue.properties;
  if (isObject(properties)) {
    expect(schemaValue.additionalProperties, `${path} must be closed`).toBe(false);
    expect(schemaValue.required, `${path} must require every property`).toEqual(
      Object.keys(properties),
    );
  }

  for (const [key, value] of Object.entries(schemaValue)) {
    if (key === "required") continue;
    assertClosedAndRequired(value, `${path}.${key}`);
  }
};

describe("buildProviderExtractionJsonSchema", () => {
  it("builds minimal strict schemas for registered fixed document definitions", () => {
    for (const definition of [jobApplicationDefinition, basicInvoiceDefinition]) {
      const schema = buildProviderExtractionJsonSchema(definition);
      const serialized = JSON.stringify(schema);

      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(definition.fields.map((field) => field.key));
      expect(serialized).not.toContain('"format"');
      expect(serialized).not.toContain('"anyOf"');
      expect(serialized).not.toContain('"$ref"');
      assertClosedAndRequired(schema);
    }
  });

  it("keeps nullable primitives and select values provider-safe", () => {
    const schema = buildProviderExtractionJsonSchema(jobApplicationDefinition);
    const properties = schema.properties;
    if (!isObject(properties)) throw new Error("Expected fixed provider properties.");

    expect(properties.email).toEqual({ type: ["string", "null"] });
    expect(properties.availableStartDate).toEqual({ type: ["string", "null"] });
    expect(properties.yearsOfExperience).toEqual({ type: ["number", "null"] });
  });
});
