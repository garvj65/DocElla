import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./support/create-test-app.js";

describe("GET /api/health", () => {
  it("returns the versioned health envelope", async () => {
    const app = createTestApp();
    const response = await request(app)
      .get("/api/health")
      .expect(200)
      .expect("Content-Type", /json/);

    expect(response.body).toEqual({
      data: {
        service: "DocElla API",
        status: "ok",
        version: "1.0.0",
      },
      meta: {
        requestId: response.headers["x-request-id"],
      },
      success: true,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("returns a generated request ID", async () => {
    const response = await request(createTestApp()).get("/api/health").expect(200);

    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
  });

  it("preserves a valid request ID", async () => {
    const response = await request(createTestApp())
      .get("/api/health")
      .set("X-Request-Id", "client.request-123")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("client.request-123");
    expect(response.body.meta.requestId).toBe("client.request-123");
  });

  it("replaces an invalid request ID", async () => {
    const response = await request(createTestApp())
      .get("/api/health")
      .set("X-Request-Id", "bad id")
      .expect(200);

    expect(response.headers["x-request-id"]).not.toBe("bad id");
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
  });

  it("replaces an overlong request ID", async () => {
    const requestId = "a".repeat(129);
    const response = await request(createTestApp())
      .get("/api/health")
      .set("X-Request-Id", requestId)
      .expect(200);

    expect(response.headers["x-request-id"]).not.toBe(requestId);
    expect(response.body.meta.requestId).toBe(response.headers["x-request-id"]);
  });

  it("sets representative security headers and hides X-Powered-By", async () => {
    const response = await request(createTestApp()).get("/api/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
