import { afterEach, describe, expect, it, vi } from "vitest";

import { FrontendApiError } from "../src/api/api-error";
import { createExtractionApi } from "../src/api/extraction-api";
import { buildExtractionResult, everyFieldConfig } from "./support/schemas";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });

const extractionEnvelope = (body = buildExtractionResult(everyFieldConfig)) => ({
  data: body.data,
  meta: body.meta,
  success: true,
});

describe("extraction API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends exactly the multipart extraction request shape", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(extractionEnvelope())));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const file = new File(["%PDF-1.7"], "Sentinel Secret.pdf", { type: "application/pdf" });

    await createExtractionApi({ apiBaseUrl: "http://localhost:3001/" }).extract({
      config: everyFieldConfig,
      file,
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/extract",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
      }),
    );
    const call = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const init = call[1];
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect(init.body).toBeInstanceOf(FormData);
    expect(Array.from((init.body as FormData).keys())).toEqual(["file", "schemaType"]);
    expect((init.body as FormData).get("schemaType")).toBe(everyFieldConfig.id);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("validates successful responses and rejects mismatched schema metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(extractionEnvelope()))),
    );
    await expect(
      createExtractionApi({ apiBaseUrl: "" }).extract({
        config: everyFieldConfig,
        file: new File(["%PDF"], "ok.pdf", { type: "application/pdf" }),
      }),
    ).resolves.toMatchObject({ data: { schemaType: everyFieldConfig.id } });

    const malformed = buildExtractionResult(everyFieldConfig);
    (malformed.data as { schemaType: string }).schemaType = "other";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(extractionEnvelope(malformed)))),
    );
    await expect(
      createExtractionApi({ apiBaseUrl: "" }).extract({
        config: everyFieldConfig,
        file: new File(["%PDF"], "ok.pdf", { type: "application/pdf" }),
      }),
    ).rejects.toMatchObject({ code: "MALFORMED_EXTRACTION_RESULT" });
  });

  it("maps backend and non-json errors without raw bodies or filenames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: { code: "PDF_INVALID", message: "raw Sentinel Secret.pdf body" },
              meta: { requestId: "req_bad" },
              success: false,
            },
            { status: 400 },
          ),
        ),
      ),
    );
    await expect(
      createExtractionApi({ apiBaseUrl: "" }).extract({
        config: everyFieldConfig,
        file: new File(["bad"], "Sentinel Secret.pdf", { type: "application/pdf" }),
      }),
    ).rejects.toMatchObject({ code: "PDF_INVALID", requestId: "req_bad" });
    await expect(
      createExtractionApi({ apiBaseUrl: "" }).extract({
        config: everyFieldConfig,
        file: new File(["bad"], "Sentinel Secret.pdf", { type: "application/pdf" }),
      }),
    ).rejects.not.toThrow("Sentinel Secret.pdf");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("raw sentinel body"))),
    );
    await expect(
      createExtractionApi({ apiBaseUrl: "" }).extract({
        config: everyFieldConfig,
        file: new File(["bad"], "bad.pdf", { type: "application/pdf" }),
      }),
    ).rejects.toBeInstanceOf(FrontendApiError);
  });
});
