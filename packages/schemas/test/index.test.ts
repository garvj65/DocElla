import { describe, expect, it } from "vitest";

import { DOCELLA_PROJECT_NAME } from "../src/index";

describe("DOCELLA_PROJECT_NAME", () => {
  it("exports the project name", () => {
    expect(DOCELLA_PROJECT_NAME).toBe("DocElla");
  });
});
