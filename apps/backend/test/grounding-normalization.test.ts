import { describe, expect, it } from "vitest";

import {
  buildDateCandidates,
  canonicalizeNumber,
  normalizeMinimal,
  normalizeSearch,
  parseIsoDate,
} from "../src/grounding/normalization.js";

describe("grounding normalization", () => {
  it("normalizes minimal text without stripping punctuation", () => {
    expect(normalizeMinimal("  Alex   Morgan ")).toBe("alex morgan");
    expect(normalizeMinimal("INV-1001")).toBe("inv-1001");
  });

  it("normalizes search text across punctuation, diacritics, smart quotes, and dashes", () => {
    expect(normalizeSearch("Acme Services, LLC")).toBe("acme services llc");
    expect(normalizeSearch("Jos\u00e9 \u00c1lvarez")).toBe("jose alvarez");
    expect(normalizeSearch("Alex\u2019s \u201cRole\u201d")).toBe("alex s role");
    expect(normalizeSearch("INV\u20131001")).toBe("inv 1001");
  });

  it("validates strict ISO dates and leap days", () => {
    expect(parseIsoDate("2026-02-29")).toBeUndefined();
    expect(parseIsoDate("2024-02-29")).toEqual({ day: 29, month: 2, year: 2024 });
  });

  it("builds deterministic date candidates", () => {
    const parsed = parseIsoDate("2026-07-19");
    if (parsed === undefined) {
      throw new Error("Expected valid date.");
    }
    const ambiguous = parseIsoDate("2026-03-04");
    if (ambiguous === undefined) {
      throw new Error("Expected valid date.");
    }

    expect(buildDateCandidates(parsed)).toContain("July 19th 2026");
    expect(buildDateCandidates(parsed)).toContain("19/07/2026");
    expect(buildDateCandidates(ambiguous)).not.toContain("04/03/2026");
  });

  it("canonicalizes supported numeric forms", () => {
    expect(canonicalizeNumber("\u20b9 75,000")).toBe(75000);
    expect(canonicalizeNumber("USD 75000")).toBe(75000);
    expect(canonicalizeNumber("(1,250.50)")).toBe(-1250.5);
    expect(canonicalizeNumber(Number.NaN)).toBeUndefined();
    expect(canonicalizeNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
