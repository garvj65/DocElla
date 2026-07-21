import { describe, expect, it } from "vitest";

import { EnvironmentValidationError, parseEnvironment } from "../src/config/environment.js";

const validSource = {
  EXTRACT_RATE_LIMIT_MAX: "10",
  EXTRACT_RATE_LIMIT_WINDOW_MS: "60000",
  FRONTEND_ORIGIN: "http://localhost:5173",
  GENERATE_RATE_LIMIT_MAX: "20",
  GENERATE_RATE_LIMIT_WINDOW_MS: "60000",
  GROQ_API_KEY: "test-secret-key",
  GROQ_MAX_INPUT_CHARACTERS: "30000",
  GROQ_MAX_RETRIES: "1",
  GROQ_MODEL: "openai/gpt-oss-20b",
  GROQ_TIMEOUT_MS: "30000",
  LOG_LEVEL: "info",
  NODE_ENV: "development",
  PORT: "3001",
  SHUTDOWN_TIMEOUT_MS: "10000",
  TRUST_PROXY_HOPS: "0",
} satisfies NodeJS.ProcessEnv;

const expectInvalidField = (source: NodeJS.ProcessEnv, field: string): void => {
  expect(() => parseEnvironment(source)).toThrow(EnvironmentValidationError);

  try {
    parseEnvironment(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect((error as EnvironmentValidationError).issues.map((issue) => issue.field)).toContain(
      field,
    );
  }
};

const expectedDefaults = {
  extractRateLimitMax: 10,
  extractRateLimitWindowMs: 60_000,
  generateRateLimitMax: 20,
  generateRateLimitWindowMs: 60_000,
  groqMaxInputCharacters: 30_000,
  groqMaxRetries: 1,
  groqModel: "openai/gpt-oss-20b",
  groqTimeoutMs: 30_000,
  shutdownTimeoutMs: 10_000,
  trustProxyHops: 0,
} as const;

describe("parseEnvironment", () => {
  it("parses a valid development configuration", () => {
    expect(parseEnvironment(validSource)).toEqual({
      ...expectedDefaults,
      frontendOrigin: "http://localhost:5173",
      groqApiKey: "test-secret-key",
      logLevel: "info",
      nodeEnv: "development",
      port: 3001,
    });
  });

  it("parses a valid production configuration", () => {
    expect(
      parseEnvironment({
        FRONTEND_ORIGIN: "https://app.example.com/",
        GROQ_API_KEY: "production-secret",
        LOG_LEVEL: "warn",
        NODE_ENV: "production",
        PORT: "8080",
        SHUTDOWN_TIMEOUT_MS: "15000",
        TRUST_PROXY_HOPS: "1",
      }),
    ).toEqual({
      ...expectedDefaults,
      frontendOrigin: "https://app.example.com",
      groqApiKey: "production-secret",
      logLevel: "warn",
      nodeEnv: "production",
      port: 8080,
      shutdownTimeoutMs: 15_000,
      trustProxyHops: 1,
    });
  });

  it("applies defaults", () => {
    expect(
      parseEnvironment({
        FRONTEND_ORIGIN: "http://localhost:5173",
        GROQ_API_KEY: "default-secret",
      }),
    ).toEqual({
      ...expectedDefaults,
      frontendOrigin: "http://localhost:5173",
      groqApiKey: "default-secret",
      logLevel: "info",
      nodeEnv: "development",
      port: 3001,
    });
  });

  it("rejects an invalid NODE_ENV", () => {
    expectInvalidField({ ...validSource, NODE_ENV: "preview" }, "NODE_ENV");
  });

  it("rejects invalid ports", () => {
    expectInvalidField({ ...validSource, PORT: "0" }, "PORT");
    expectInvalidField({ ...validSource, PORT: "65536" }, "PORT");
    expectInvalidField({ ...validSource, PORT: "3001.5" }, "PORT");
  });

  it("rejects a missing frontend origin", () => {
    const source: NodeJS.ProcessEnv = { ...validSource };
    delete source.FRONTEND_ORIGIN;
    expectInvalidField(source, "FRONTEND_ORIGIN");
  });

  it("rejects invalid frontend origins", () => {
    expectInvalidField({ ...validSource, FRONTEND_ORIGIN: "not-a-url" }, "FRONTEND_ORIGIN");
    expectInvalidField({ ...validSource, FRONTEND_ORIGIN: "file:///tmp/app" }, "FRONTEND_ORIGIN");
    expectInvalidField(
      { ...validSource, FRONTEND_ORIGIN: "https://example.com/path" },
      "FRONTEND_ORIGIN",
    );
    expectInvalidField(
      { ...validSource, FRONTEND_ORIGIN: "https://user:password@example.com" },
      "FRONTEND_ORIGIN",
    );
  });

  it("rejects an invalid log level", () => {
    expectInvalidField({ ...validSource, LOG_LEVEL: "verbose" }, "LOG_LEVEL");
  });

  it("rejects a missing or blank Groq API key", () => {
    const source: NodeJS.ProcessEnv = { ...validSource };
    delete source.GROQ_API_KEY;
    expectInvalidField(source, "GROQ_API_KEY");
    expectInvalidField({ ...validSource, GROQ_API_KEY: "   " }, "GROQ_API_KEY");
  });

  it("trims the Groq API key", () => {
    expect(parseEnvironment({ ...validSource, GROQ_API_KEY: "  trimmed-key  " }).groqApiKey).toBe(
      "trimmed-key",
    );
  });

  it("accepts supported Groq strict models", () => {
    expect(parseEnvironment({ ...validSource, GROQ_MODEL: "openai/gpt-oss-20b" }).groqModel).toBe(
      "openai/gpt-oss-20b",
    );
    expect(parseEnvironment({ ...validSource, GROQ_MODEL: "openai/gpt-oss-120b" }).groqModel).toBe(
      "openai/gpt-oss-120b",
    );
  });

  it("rejects an unsupported Groq model", () => {
    expectInvalidField({ ...validSource, GROQ_MODEL: "llama-3.3-70b-versatile" }, "GROQ_MODEL");
  });

  it("rejects timeout values outside range or invalid format", () => {
    expectInvalidField({ ...validSource, GROQ_TIMEOUT_MS: "999" }, "GROQ_TIMEOUT_MS");
    expectInvalidField({ ...validSource, GROQ_TIMEOUT_MS: "120001" }, "GROQ_TIMEOUT_MS");
    expectInvalidField({ ...validSource, GROQ_TIMEOUT_MS: "thirty" }, "GROQ_TIMEOUT_MS");
  });

  it("rejects retry counts outside range or invalid format", () => {
    expectInvalidField({ ...validSource, GROQ_MAX_RETRIES: "-1" }, "GROQ_MAX_RETRIES");
    expectInvalidField({ ...validSource, GROQ_MAX_RETRIES: "3" }, "GROQ_MAX_RETRIES");
    expectInvalidField({ ...validSource, GROQ_MAX_RETRIES: "1.5" }, "GROQ_MAX_RETRIES");
  });

  it("rejects invalid rate-limit settings", () => {
    expectInvalidField(
      { ...validSource, EXTRACT_RATE_LIMIT_WINDOW_MS: "999" },
      "EXTRACT_RATE_LIMIT_WINDOW_MS",
    );
    expectInvalidField(
      { ...validSource, EXTRACT_RATE_LIMIT_WINDOW_MS: "3600001" },
      "EXTRACT_RATE_LIMIT_WINDOW_MS",
    );
    expectInvalidField({ ...validSource, EXTRACT_RATE_LIMIT_MAX: "0" }, "EXTRACT_RATE_LIMIT_MAX");
    expectInvalidField({ ...validSource, EXTRACT_RATE_LIMIT_MAX: "101" }, "EXTRACT_RATE_LIMIT_MAX");
    expectInvalidField(
      { ...validSource, GENERATE_RATE_LIMIT_WINDOW_MS: "999" },
      "GENERATE_RATE_LIMIT_WINDOW_MS",
    );
    expectInvalidField(
      { ...validSource, GENERATE_RATE_LIMIT_WINDOW_MS: "3600001" },
      "GENERATE_RATE_LIMIT_WINDOW_MS",
    );
    expectInvalidField({ ...validSource, GENERATE_RATE_LIMIT_MAX: "0" }, "GENERATE_RATE_LIMIT_MAX");
    expectInvalidField(
      { ...validSource, GENERATE_RATE_LIMIT_MAX: "201" },
      "GENERATE_RATE_LIMIT_MAX",
    );
  });

  it("rejects invalid maximum input-character settings", () => {
    expectInvalidField(
      { ...validSource, GROQ_MAX_INPUT_CHARACTERS: "999" },
      "GROQ_MAX_INPUT_CHARACTERS",
    );
    expectInvalidField(
      { ...validSource, GROQ_MAX_INPUT_CHARACTERS: "100001" },
      "GROQ_MAX_INPUT_CHARACTERS",
    );
    expectInvalidField(
      { ...validSource, GROQ_MAX_INPUT_CHARACTERS: "many" },
      "GROQ_MAX_INPUT_CHARACTERS",
    );
  });

  it("rejects invalid trust-proxy settings", () => {
    expectInvalidField({ ...validSource, TRUST_PROXY_HOPS: "-1" }, "TRUST_PROXY_HOPS");
    expectInvalidField({ ...validSource, TRUST_PROXY_HOPS: "11" }, "TRUST_PROXY_HOPS");
    expectInvalidField({ ...validSource, TRUST_PROXY_HOPS: "1.5" }, "TRUST_PROXY_HOPS");
  });

  it("rejects invalid shutdown timeouts", () => {
    expectInvalidField({ ...validSource, SHUTDOWN_TIMEOUT_MS: "999" }, "SHUTDOWN_TIMEOUT_MS");
    expectInvalidField({ ...validSource, SHUTDOWN_TIMEOUT_MS: "60001" }, "SHUTDOWN_TIMEOUT_MS");
    expectInvalidField({ ...validSource, SHUTDOWN_TIMEOUT_MS: "soon" }, "SHUTDOWN_TIMEOUT_MS");
  });

  it("does not include the supplied Groq API key in validation errors", () => {
    const secret = "super-secret-groq-key";
    try {
      parseEnvironment({ ...validSource, GROQ_API_KEY: secret, GROQ_TIMEOUT_MS: "bad" });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect(String((error as Error).message)).not.toContain(secret);
    }
  });
});
