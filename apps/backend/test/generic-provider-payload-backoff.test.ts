import type { DiscoveredDocumentSchema } from "@docella/schemas";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";
import type { DocumentLayoutResult } from "../src/document-layout/document-layout-types.js";
import type {
  GroqChatClient,
  GroqCompletionCreateRequest,
} from "../src/extraction/groq-structured-extractor.js";
import { createGenericGroqExtractors } from "../src/generic-extraction/generic-groq-extractor.js";
import {
  genericProviderBudgets,
  sampleGenericProviderContent,
} from "../src/generic-extraction/generic-provider-budget.js";

const environment = parseEnvironment({
  FRONTEND_ORIGIN: "http://localhost:5173",
  GROQ_API_KEY: "test-secret",
  GROQ_MAX_INPUT_CHARACTERS: "30000",
});

const logger = pino({ enabled: false });

const discoveredSchema = {
  documentType: "application",
  documentTypeLabel: "Application",
  language: "en",
  schemaVersion: 1,
  sections: [
    {
      description: "Applicant details.",
      fields: [
        {
          description: "Applicant name.",
          id: "full_name",
          label: "Full name",
          repeatable: false,
          required: true,
          valueType: "text",
        },
      ],
      id: "applicant",
      label: "Applicant",
    },
  ],
  tables: [],
  title: "Application",
} as const satisfies DiscoveredDocumentSchema;

const providerDiscoveredSchema = {
  ...discoveredSchema,
  sections: discoveredSchema.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({ ...field, options: [] })),
  })),
};

const longContent = `DOCUMENT_START\n${"A".repeat(18_000)}\nDOCUMENT_END`;
const layout: DocumentLayoutResult = {
  content: longContent,
  contentUnit: "page",
  contentUnitCount: 1,
  paragraphs: [],
  provider: "pdfjs",
  sourceFormat: "pdf",
  tables: [],
};

interface CapturedRequest {
  readonly max_completion_tokens: number;
  readonly messages: readonly { readonly content: string; readonly role: string }[];
}

describe("generic provider payload budgeting", () => {
  it("samples both ends of oversized document content", () => {
    const sampled = sampleGenericProviderContent(longContent, 6_000);

    expect(sampled.length).toBeLessThanOrEqual(6_000);
    expect(sampled).toContain("DOCUMENT_START");
    expect(sampled).toContain("DOCUMENT_END");
    expect(sampled).toContain("DOCELLA_CONTENT_TRUNCATED");
    expect(genericProviderBudgets(environment)).toEqual([12_000, 6_000, 3_000]);
  });

  it("backs off document content after a provider 413 and preserves strict extraction", async () => {
    const captured: CapturedRequest[] = [];
    let callCount = 0;
    const client: GroqChatClient = {
      chat: {
        completions: {
          create: async (request: GroqCompletionCreateRequest) => {
            captured.push(request as unknown as CapturedRequest);
            callCount += 1;
            if (callCount === 1) {
              throw Object.assign(new Error("request body too large"), { status: 413 });
            }
            return { choices: [{ message: { content: JSON.stringify(providerDiscoveredSchema) } }] };
          },
        },
      },
    };

    const extractors = createGenericGroqExtractors({ client, environment, logger });
    await expect(extractors.schemaDiscoverer.discover({ layout })).resolves.toEqual(discoveredSchema);

    expect(captured).toHaveLength(2);
    expect(captured[0]?.max_completion_tokens).toBe(4_096);
    expect(captured[1]?.max_completion_tokens).toBe(4_096);
    expect(captured[0]?.messages[1]?.content.length).toBeGreaterThan(
      captured[1]?.messages[1]?.content.length ?? 0,
    );
    expect(captured[0]?.messages[1]?.content).toContain("DOCUMENT_START");
    expect(captured[0]?.messages[1]?.content).toContain("DOCUMENT_END");
    expect(captured[1]?.messages[1]?.content).toContain("DOCUMENT_START");
    expect(captured[1]?.messages[1]?.content).toContain("DOCUMENT_END");
  });
});
