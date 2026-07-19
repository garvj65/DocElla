import { describe, expect, it } from "vitest";

import { EnvironmentValidationError, parseEnvironment } from "../src/config/environment.js";

const validSource = {
  FRONTEND_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "info",
  NODE_ENV: "development",
  PORT: "3001",
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

describe("parseEnvironment", () => {
  it("parses a valid development configuration", () => {
    expect(parseEnvironment(validSource)).toEqual({
      frontendOrigin: "http://localhost:5173",
      logLevel: "info",
      nodeEnv: "development",
      port: 3001,
    });
  });

  it("parses a valid production configuration", () => {
    expect(
      parseEnvironment({
        FRONTEND_ORIGIN: "https://app.example.com/",
        LOG_LEVEL: "warn",
        NODE_ENV: "production",
        PORT: "8080",
      }),
    ).toEqual({
      frontendOrigin: "https://app.example.com",
      logLevel: "warn",
      nodeEnv: "production",
      port: 8080,
    });
  });

  it("applies defaults", () => {
    expect(parseEnvironment({ FRONTEND_ORIGIN: "http://localhost:5173" })).toEqual({
      frontendOrigin: "http://localhost:5173",
      logLevel: "info",
      nodeEnv: "development",
      port: 3001,
    });
  });

  it("rejects an invalid NODE_ENV", () => {
    expectInvalidField({ ...validSource, NODE_ENV: "preview" }, "NODE_ENV");
  });

  it("rejects a port below range", () => {
    expectInvalidField({ ...validSource, PORT: "0" }, "PORT");
  });

  it("rejects a port above range", () => {
    expectInvalidField({ ...validSource, PORT: "65536" }, "PORT");
  });

  it("rejects a noninteger port", () => {
    expectInvalidField({ ...validSource, PORT: "3001.5" }, "PORT");
  });

  it("rejects a missing frontend origin", () => {
    const source: NodeJS.ProcessEnv = { ...validSource };
    delete source.FRONTEND_ORIGIN;

    expectInvalidField(source, "FRONTEND_ORIGIN");
  });

  it("rejects an invalid origin URL", () => {
    expectInvalidField({ ...validSource, FRONTEND_ORIGIN: "not-a-url" }, "FRONTEND_ORIGIN");
  });

  it("rejects an unsupported origin protocol", () => {
    expectInvalidField({ ...validSource, FRONTEND_ORIGIN: "file:///tmp/app" }, "FRONTEND_ORIGIN");
  });

  it("rejects an origin containing a path", () => {
    expectInvalidField(
      { ...validSource, FRONTEND_ORIGIN: "https://example.com/path" },
      "FRONTEND_ORIGIN",
    );
  });

  it("rejects an origin containing credentials", () => {
    expectInvalidField(
      { ...validSource, FRONTEND_ORIGIN: "https://user:password@example.com" },
      "FRONTEND_ORIGIN",
    );
  });

  it("rejects an invalid log level", () => {
    expectInvalidField({ ...validSource, LOG_LEVEL: "verbose" }, "LOG_LEVEL");
  });

  it("ignores future Groq variables rather than requiring them", () => {
    expect(
      parseEnvironment({
        FRONTEND_ORIGIN: "http://localhost:5173",
        GROQ_API_KEY: "",
        GROQ_MAX_RETRIES: "1",
        GROQ_MODEL: "",
        GROQ_TIMEOUT_MS: "30000",
      }),
    ).toMatchObject({
      frontendOrigin: "http://localhost:5173",
    });
  });
});
