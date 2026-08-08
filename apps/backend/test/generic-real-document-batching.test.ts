import {
  buildGenericExtractionJsonSchema,
  type DiscoveredDocumentSchema,
  type JsonObject,
} from "@docella/schemas";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";
import type { DocumentLayoutResult } from "../src/document-layout/document-layout-types.js";
import type {
  GroqChatClient,
  GroqCompletionCreateRequest,
} from "../src/extraction/groq-structured-extractor.js";
import {
  buildGenericExtractionBatches,
  GENERIC_EXTRACTION_MAX_FIELDS_PER_BATCH,
  GENERIC_EXTRACTION_MAX_SCHEMA_CHARACTERS,
} from "../src/generic-extraction/generic-extraction-batches.js";
import { createGenericGroqExtractors } from "../src/generic-extraction/generic-groq-extractor.js";

const environment = parseEnvironment({
  FRONTEND_ORIGIN: "http://localhost:5173",
  GROQ_API_KEY: "test-secret",
  GROQ_MAX_INPUT_CHARACTERS: "12000",
});

const logger = pino({ enabled: false });

const makeField = (index: number) => ({
  description: `Synthetic field ${String(index)} for a larger business document.`,
  id: `field_${String(index).padStart(2, "0")}`,
  label: `Field ${String(index)}`,
  repeatable: false,
  required: false,
  valueType: "text" as const,
});

const largeDocumentSchema = {
  documentType: "business_profile",
  documentTypeLabel: "Business Profile",
  language: "en",
  schemaVersion: 1,
  sections: [
    {
      description: "A deliberately large scalar section.",
      fields: Array.from({ length: 52 }, (_, index) => makeField(index + 1)),
      id: "profile",
      label: "Profile",
    },
  ],
  tables: [],
  title: "Large Business Profile",
} as const satisfies DiscoveredDocumentSchema;

const layout: DocumentLayoutResult = {
  content: Array.from({ length: 52 }, (_, index) => {
    const fieldNumber = index + 1;
    return `Field ${String(fieldNumber)}: value_${String(fieldNumber).padStart(2, "0")}`;
  }).join("\n"),
  contentUnit: "page",
  contentUnitCount: 2,
  paragraphs: [],
  provider: "pdfjs",
  sourceFormat: "pdf",
  tables: [],
};

const asRecord = (value: unknown): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }
  return value as Readonly<Record<string, unknown>>;
};

const providerResponseFor = (schema: JsonObject): string => {
  const rootProperties = asRecord(asRecord(schema).properties);
  const fieldsSchema = rootProperties.fields;
  if (fieldsSchema === undefined) return JSON.stringify({ tables: {} });

  const fieldProperties = asRecord(asRecord(fieldsSchema).properties);
  const fields = Object.fromEntries(
    Object.keys(fieldProperties).map((fieldId) => [fieldId, `value_for_${fieldId}`]),
  );
  return JSON.stringify({ fields });
};

describe("generic real-document extraction batching", () => {
  it("splits large discovered scalar schemas into bounded provider batches", () => {
    const batches = buildGenericExtractionBatches(largeDocumentSchema);

    expect(batches).toHaveLength(3);
    expect(
      batches.map((batch) =>
        batch.schema.sections.reduce((total, section) => total + section.fields.length, 0),
      ),
    ).toEqual([25, 25, 2]);

    for (const batch of batches) {
      const fieldCount = batch.schema.sections.reduce(
        (total, section) => total + section.fields.length,
        0,
      );
      expect(fieldCount).toBeLessThanOrEqual(GENERIC_EXTRACTION_MAX_FIELDS_PER_BATCH);
      expect(JSON.stringify(buildGenericExtractionJsonSchema(batch.schema)).length).toBeLessThanOrEqual(
        GENERIC_EXTRACTION_MAX_SCHEMA_CHARACTERS,
      );
    }
  });

  it("extracts each bounded batch and merges the values into the full document contract", async () => {
    const captured: GroqCompletionCreateRequest[] = [];
    const client: GroqChatClient = {
      chat: {
        completions: {
          create: async (request) => {
            captured.push(request);
            return {
              choices: [
                {
                  message: {
                    content: providerResponseFor(request.response_format.json_schema.schema),
                  },
                },
              ],
            };
          },
        },
      },
    };

    const extractor = createGenericGroqExtractors({ client, environment, logger }).valueExtractor;
    const values = await extractor.extract({ documentSchema: largeDocumentSchema, layout });

    expect(captured).toHaveLength(3);
    expect(Object.keys(values.fields)).toHaveLength(52);
    expect(values.tables).toEqual({});
    expect(values.fields.field_01).toBe("value_for_field_01");
    expect(values.fields.field_52).toBe("value_for_field_52");
    expect(
      captured.every(
        (request) =>
          JSON.stringify(request.response_format.json_schema.schema).length <=
          GENERIC_EXTRACTION_MAX_SCHEMA_CHARACTERS,
      ),
    ).toBe(true);
  });
});
