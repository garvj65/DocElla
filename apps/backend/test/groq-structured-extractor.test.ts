import { getDocumentDefinition } from "@docella/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  createGroqStructuredExtractor,
  type GroqCompletionCreateRequest,
} from "../src/extraction/groq-structured-extractor.js";
import { createSilentLogger, testEnvironment } from "./support/create-test-app.js";

const definition = getDocumentDefinition("job-application");
if (definition === undefined) {
  throw new Error("Missing job application schema.");
}

const validValues = {
  additionalNotes: null,
  address: null,
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "alex@example.test",
  fullName: "Alex Morgan",
  highestEducation: null,
  phone: null,
  positionAppliedFor: "Product Analyst",
  salaryExpectation: null,
  yearsOfExperience: null,
};

const createClient = (contents: readonly (string | null)[]) => {
  const requests: GroqCompletionCreateRequest[] = [];
  const create = vi.fn(async (request: GroqCompletionCreateRequest) => {
    requests.push(request);
    const content = contents[Math.min(requests.length - 1, contents.length - 1)] ?? null;
    return { choices: [{ message: { content } }] };
  });

  return {
    client: { chat: { completions: { create } } },
    create,
    requests,
  };
};

describe("Groq structured extractor", () => {
  it("uses strict JSON Schema output with the configured model", async () => {
    const { client, requests } = createClient([JSON.stringify(validValues)]);
    const extractor = createGroqStructuredExtractor({
      client,
      environment: testEnvironment,
      logger: createSilentLogger(),
    });

    const values = await extractor.extract({
      documentDefinition: definition,
      documentText: "Alex Morgan\nalex@example.test",
    });

    expect(values).toEqual(validValues);
    expect(requests[0]).toMatchObject({
      model: "openai/gpt-oss-20b",
      response_format: {
        json_schema: {
          strict: true,
        },
        type: "json_schema",
      },
      temperature: 0,
    });
    expect(requests[0]?.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(requests[0]?.response_format.json_schema.schema.required).toEqual(
      definition.fields.map((field) => field.key),
    );
    expect(JSON.stringify(requests[0])).not.toContain('"tools"');
    expect(JSON.stringify(requests[0])).not.toContain('"stream"');
  });

  it("retries once after invalid content and does not retry provider failures", async () => {
    const { client, create } = createClient(["{}", JSON.stringify(validValues)]);
    const extractor = createGroqStructuredExtractor({
      client,
      environment: testEnvironment,
      logger: createSilentLogger(),
    });

    await expect(
      extractor.extract({ documentDefinition: definition, documentText: "text" }),
    ).resolves.toEqual(validValues);
    expect(create).toHaveBeenCalledTimes(2);

    const failingClient = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw { status: 429 };
          }),
        },
      },
    };
    const failingExtractor = createGroqStructuredExtractor({
      client: failingClient,
      environment: testEnvironment,
      logger: createSilentLogger(),
    });

    await expect(
      failingExtractor.extract({ documentDefinition: definition, documentText: "text" }),
    ).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_RATE_LIMITED" });
    expect(failingClient.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("maps empty content, refusal, and invalid output safely", async () => {
    const empty = createGroqStructuredExtractor({
      client: createClient([null, null]).client,
      environment: testEnvironment,
      logger: createSilentLogger(),
    });
    await expect(
      empty.extract({ documentDefinition: definition, documentText: "text" }),
    ).rejects.toMatchObject({ code: "EXTRACTION_OUTPUT_INVALID" });

    const refusal = createGroqStructuredExtractor({
      client: {
        chat: {
          completions: {
            create: async () => ({ choices: [{ message: { content: null, refusal: "no" } }] }),
          },
        },
      },
      environment: testEnvironment,
      logger: createSilentLogger(),
    });
    await expect(
      refusal.extract({ documentDefinition: definition, documentText: "text" }),
    ).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_REJECTED" });
  });
});
