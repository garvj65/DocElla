import { describe, expect, it } from "vitest";

import { containsTokenSequence } from "../src/grounding/text-similarity.js";

describe("text similarity helpers", () => {
  it("finds exact token sequences in the middle, beginning, and end of source text", () => {
    expect(containsTokenSequence("issued 2026 07 19 today", "2026 07 19")).toBe(true);
    expect(containsTokenSequence("2026 07 19 issued today", "2026 07 19")).toBe(true);
    expect(containsTokenSequence("issued today 2026 07 19", "2026 07 19")).toBe(true);
  });

  it("rejects empty and overlong candidates", () => {
    expect(containsTokenSequence("issued 2026 07 19", "")).toBe(false);
    expect(containsTokenSequence("issued 2026", "issued 2026 07")).toBe(false);
  });

  it("rejects digit and word prefixes", () => {
    expect(containsTokenSequence("reference 2026 07 1901", "2026 07 19")).toBe(false);
    expect(containsTokenSequence("contact alexander morgan", "alex")).toBe(false);
  });

  it("handles repeated tokens by position", () => {
    expect(containsTokenSequence("paid paid due paid", "paid due paid")).toBe(true);
    expect(containsTokenSequence("paid due paid", "paid paid")).toBe(false);
  });
});
