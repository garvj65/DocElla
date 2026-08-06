import { afterEach, describe, expect, it, vi } from "vitest";

import { createGenericDocumentApi } from "../src/api/generic-document-api";
import { genericDocumentResult, successEnvelope } from "./support/generic-document";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });

describe("generic document API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends exactly one multipart file to the arbitrary document endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(successEnvelope(genericDocumentResult))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const file = new File(["%PDF-1.7"], "invoice.pdf", { type: "application/pdf" });

    await createGenericDocumentApi({ apiBaseUrl: "http://localhost:3001/" }).extract({
      file,
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/documents/extract",
      expect.objectContaining({ method: "POST", signal: controller.signal }),
    );
    const call = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const request = call[1];
    expect(request.headers).toEqual({ Accept: "application/json" });
    expect(request.headers).not.toHaveProperty("Content-Type");
    expect(request.body).toBeInstanceOf(FormData);
    expect(Array.from((request.body as FormData).keys())).toEqual(["file"]);
    expect((request.body as FormData).get("file")).toBe(file);
  });

  it("validates the discovered schema and exact schema-shaped result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(successEnvelope(genericDocumentResult)))),
    );

    await expect(
      createGenericDocumentApi({ apiBaseUrl: "" }).extract({
        file: new File(["%PDF-1.7"], "invoice.pdf", { type: "application/pdf" }),
      }),
    ).resolves.toEqual(genericDocumentResult);
  });

  it("rejects malformed generic results without exposing raw response data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            successEnvelope({
              ...genericDocumentResult,
              schema: { documentType: "invalid" },
            }),
          ),
        ),
      ),
    );

    await expect(
      createGenericDocumentApi({ apiBaseUrl: "" }).extract({
        file: new File(["%PDF-1.7"], "private-invoice.pdf", {
          type: "application/pdf",
        }),
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_GENERIC_EXTRACTION_RESULT" });
  });
});
