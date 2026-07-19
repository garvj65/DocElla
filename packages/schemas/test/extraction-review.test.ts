import {
  EXTRACTION_WARNING_CODES,
  GROUNDING_MATCH_TYPES,
  GROUNDING_STATUSES,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("extraction review contracts", () => {
  it("exports stable grounding statuses and match types", () => {
    expect(GROUNDING_STATUSES).toEqual(["verified", "needs_review", "missing"]);
    expect(GROUNDING_MATCH_TYPES).toEqual(["exact", "normalized", "fuzzy", "none"]);
  });

  it("exports stable warning codes", () => {
    expect(EXTRACTION_WARNING_CODES).toEqual({
      FIELDS_REQUIRE_REVIEW: "FIELDS_REQUIRE_REVIEW",
      LOW_CONFIDENCE: "LOW_CONFIDENCE",
      NO_VALUES_EXTRACTED: "NO_VALUES_EXTRACTED",
      REQUIRED_FIELDS_MISSING: "REQUIRED_FIELDS_MISSING",
    });
  });
});
