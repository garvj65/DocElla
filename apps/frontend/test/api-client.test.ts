import { afterEach, describe, expect, it, vi } from "vitest";

import { FrontendApiError } from "../src/api/api-error";
import { parseSafePdfFilename } from "../src/api/api-client";
import { createSchemaApi } from "../src/api/schema-api";
import {
  everyFieldConfig,
  everyFieldSummary,
  successEnvelope,
} from "./support/schemas";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("schema API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and validates schema summaries", async () => {
    const fetchMock = mockFetch(
      jsonResponse(successEnvelope([everyFieldSummary])),
    );
    const api = createSchemaApi({ apiBaseUrl: "http://localhost:3001/" });

    await expect(api.listDocumentSummaries()).resolves.toEqual([
      everyFieldSummary,
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/schemas",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads details with encoded schema IDs and abort signals", async () => {
    const fetchMock = mockFetch(
      jsonResponse(successEnvelope(everyFieldConfig)),
    );
    const controller = new AbortController();
    const api = createSchemaApi({ apiBaseUrl: "" });

    await expect(
      api.getDocumentConfig("invoice/basic", controller.signal),
    ).resolves.toEqual(everyFieldConfig);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/schemas/invoice%2Fbasic",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("maps backend errors safely", async () => {
    mockFetch(
      jsonResponse(
        {
          error: { code: "UNKNOWN_SCHEMA", message: "raw server detail" },
          meta: { requestId: "req_123" },
          success: false,
        },
        { status: 404 },
      ),
    );
    const api = createSchemaApi({ apiBaseUrl: "" });

    await expect(api.getDocumentConfig("missing")).rejects.toMatchObject({
      code: "UNKNOWN_SCHEMA",
      requestId: "req_123",
      status: 404,
    });
    await expect(api.getDocumentConfig("missing")).rejects.not.toThrow(
      "raw server detail",
    );
  });

  it("rejects non-JSON, malformed envelopes, and malformed public config", async () => {
    mockFetch(new Response("server body", { status: 200 }));
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).listDocumentSummaries(),
    ).rejects.toBeInstanceOf(FrontendApiError);

    mockFetch(jsonResponse({ data: [], success: true }));
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).getDocumentConfig("bad"),
    ).rejects.toMatchObject({
      code: "MALFORMED_PUBLIC_SCHEMA",
    });

    mockFetch(jsonResponse({ nope: true }));
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).listDocumentSummaries(),
    ).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
  });

  it("posts exact PDF generation body and accepts binary PDFs", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.7");
    const fetchMock = mockFetch(
      new Response(pdfBytes, {
        headers: {
          "content-disposition": 'attachment; filename="generated.pdf"',
          "content-type": "application/pdf",
        },
      }),
    );
    const controller = new AbortController();
    const api = createSchemaApi({ apiBaseUrl: "" });

    await expect(
      api.generatePdf({
        config: everyFieldConfig,
        flatten: false,
        signal: controller.signal,
        templateId: "synthetic-default",
        values: { fullName: "Example Person" },
      }),
    ).resolves.toMatchObject({
      filename: "generated.pdf",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate-pdf",
      expect.objectContaining({
        body: JSON.stringify({
          flatten: false,
          schemaType: "synthetic",
          templateId: "synthetic-default",
          values: { fullName: "Example Person" },
        }),
        headers: {
          Accept: "application/pdf",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      }),
    );
  });

  it("maps PDF JSON errors without exposing raw server details", async () => {
    mockFetch(
      jsonResponse(
        {
          error: {
            code: "PDF_GENERATION_FAILED",
            message: "raw backend library detail",
          },
          meta: { requestId: "req_pdf" },
          success: false,
        },
        { status: 500 },
      ),
    );

    await expect(
      createSchemaApi({ apiBaseUrl: "" }).generatePdf({
        config: everyFieldConfig,
        templateId: "synthetic-default",
        values: {},
      }),
    ).rejects.toMatchObject({
      code: "PDF_GENERATION_FAILED",
      requestId: "req_pdf",
    });
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).generatePdf({
        config: everyFieldConfig,
        templateId: "synthetic-default",
        values: {},
      }),
    ).rejects.not.toThrow("library detail");
  });

  it("rejects invalid PDF responses and unsafe filenames", async () => {
    mockFetch(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).generatePdf({
        config: everyFieldConfig,
        templateId: "synthetic-default",
        values: {},
      }),
    ).rejects.toMatchObject({ code: "INVALID_PDF_RESPONSE" });

    mockFetch(
      new Response(new Uint8Array(), {
        headers: { "content-type": "application/pdf" },
      }),
    );
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).generatePdf({
        config: everyFieldConfig,
        templateId: "synthetic-default",
        values: {},
      }),
    ).rejects.toMatchObject({ code: "EMPTY_PDF_RESPONSE" });

    mockFetch(
      new Response(new TextEncoder().encode("nope"), {
        headers: { "content-type": "application/pdf" },
      }),
    );
    await expect(
      createSchemaApi({ apiBaseUrl: "" }).generatePdf({
        config: everyFieldConfig,
        templateId: "synthetic-default",
        values: {},
      }),
    ).rejects.toMatchObject({ code: "INVALID_PDF_RESPONSE" });

    expect(parseSafePdfFilename('attachment; filename="safe-name.pdf"')).toBe(
      "safe-name.pdf",
    );
    expect(
      parseSafePdfFilename('attachment; filename="../secret.pdf"'),
    ).toBeUndefined();
    expect(
      parseSafePdfFilename('attachment; filename="secret.txt"'),
    ).toBeUndefined();
  });
});
