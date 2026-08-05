import { describe, expect, it } from "vitest";

import { EnvironmentValidationError, parseEnvironment } from "../src/config/environment.js";

const base = {
  FRONTEND_ORIGIN: "http://localhost:5173",
  GROQ_API_KEY: "groq-test-secret",
} satisfies NodeJS.ProcessEnv;

const expectInvalid = (source: NodeJS.ProcessEnv, field: string): void => {
  try {
    parseEnvironment(source);
    throw new Error("Expected environment validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect((error as EnvironmentValidationError).issues.map((issue) => issue.field)).toContain(field);
  }
};

describe("optional Azure Document Intelligence configuration", () => {
  it("keeps the existing environment shape when Azure is not configured", () => {
    const parsed = parseEnvironment(base);
    expect(parsed.azureDocumentIntelligenceEndpoint).toBeUndefined();
    expect(parsed.azureDocumentIntelligenceKey).toBeUndefined();
    expect(parsed.azureDocumentIntelligencePollIntervalMs).toBeUndefined();
    expect(parsed.azureDocumentIntelligenceTimeoutMs).toBeUndefined();
  });

  it("parses a complete secret pair with bounded operational defaults", () => {
    expect(
      parseEnvironment({
        ...base,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:
          "https://docella.cognitiveservices.azure.com/",
        AZURE_DOCUMENT_INTELLIGENCE_KEY: "  azure-secret  ",
      }),
    ).toMatchObject({
      azureDocumentIntelligenceEndpoint: "https://docella.cognitiveservices.azure.com",
      azureDocumentIntelligenceKey: "azure-secret",
      azureDocumentIntelligencePollIntervalMs: 500,
      azureDocumentIntelligenceTimeoutMs: 90_000,
    });
  });

  it("requires the endpoint and key together", () => {
    expectInvalid(
      { ...base, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.com" },
      "AZURE_DOCUMENT_INTELLIGENCE_KEY",
    );
    expectInvalid(
      { ...base, AZURE_DOCUMENT_INTELLIGENCE_KEY: "secret" },
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
  });

  it("rejects insecure or path-bearing endpoints and invalid timing values", () => {
    expectInvalid(
      {
        ...base,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "http://example.com",
        AZURE_DOCUMENT_INTELLIGENCE_KEY: "secret",
      },
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    expectInvalid(
      {
        ...base,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.com/path",
        AZURE_DOCUMENT_INTELLIGENCE_KEY: "secret",
      },
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    expectInvalid(
      {
        ...base,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.com",
        AZURE_DOCUMENT_INTELLIGENCE_KEY: "secret",
        AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS: "10",
      },
      "AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS",
    );
    expectInvalid(
      {
        ...base,
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.com",
        AZURE_DOCUMENT_INTELLIGENCE_KEY: "secret",
        AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS: "200000",
      },
      "AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS",
    );
  });
});
