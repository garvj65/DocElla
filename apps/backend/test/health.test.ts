import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app";

describe("GET /api/health", () => {
  it("returns the health payload", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        service: "DocElla API",
        status: "ok",
      },
    });
  });
});
