import { describe, expect, it } from "vitest";

import { parseFrontendEnvironment } from "../src/config/environment";

const env = (value: string | undefined): ImportMetaEnv =>
  ({
    BASE_URL: "/",
    DEV: true,
    MODE: "test",
    PROD: false,
    SSR: false,
    VITE_API_BASE_URL: value,
  }) as unknown as ImportMetaEnv;

describe("parseFrontendEnvironment", () => {
  it("supports empty and whitespace-only same-origin URLs", () => {
    expect(parseFrontendEnvironment(env("")).apiBaseUrl).toBe("");
    expect(parseFrontendEnvironment(env("   ")).apiBaseUrl).toBe("");
  });

  it("accepts HTTP and HTTPS URLs while trimming trailing slashes", () => {
    expect(parseFrontendEnvironment(env(" http://localhost:3001/// ")).apiBaseUrl).toBe(
      "http://localhost:3001",
    );
    expect(parseFrontendEnvironment(env("https://example.test/api/")).apiBaseUrl).toBe(
      "https://example.test/api",
    );
  });

  it("rejects non-HTTP protocols and malformed URLs", () => {
    expect(() => parseFrontendEnvironment(env("ftp://example.test"))).toThrow(/http/i);
    expect(() => parseFrontendEnvironment(env("://bad"))).toThrow(/valid/i);
  });
});
