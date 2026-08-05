import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import { createAzureDocumentLayoutProvider } from "../src/document-layout/azure-document-layout-provider.js";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const request = {
  bytes: pngBytes,
  filename: "invoice.png",
  mediaType: "image/png",
  sourceFormat: "image" as const,
};

const expectAppErrorCode = async (operation: Promise<unknown>, code: string): Promise<void> => {
  try {
    await operation;
    throw new Error("Expected operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
};

describe("createAzureDocumentLayoutProvider", () => {
  it("submits bytes, polls the same Azure origin, and normalizes layout evidence", async () => {
    const calls: { readonly init?: RequestInit; readonly url: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(init === undefined ? { url } : { init, url });
      if (calls.length === 1) {
        return new Response(null, {
          headers: {
            "operation-location":
              "https://docella.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/123?api-version=2024-11-30",
          },
          status: 202,
        });
      }

      return new Response(
        JSON.stringify({
          analyzeResult: {
            content: "Invoice number INV-1001\nConsulting 2 10000",
            pages: [{ height: 1000, pageNumber: 1, width: 800 }],
            paragraphs: [
              {
                boundingRegions: [
                  { pageNumber: 1, polygon: [80, 100, 400, 100, 400, 200, 80, 200] },
                ],
                content: "Invoice number INV-1001",
                role: "title",
                spans: [{ length: 23, offset: 0 }],
              },
            ],
            tables: [
              {
                boundingRegions: [
                  { pageNumber: 1, polygon: [80, 300, 720, 300, 720, 600, 80, 600] },
                ],
                cells: [
                  {
                    boundingRegions: [
                      { pageNumber: 1, polygon: [80, 300, 400, 300, 400, 400, 80, 400] },
                    ],
                    columnIndex: 0,
                    content: "Consulting",
                    rowIndex: 0,
                    spans: [{ length: 10, offset: 24 }],
                  },
                ],
                columnCount: 3,
                rowCount: 1,
                spans: [{ length: 20, offset: 24 }],
              },
            ],
          },
          status: "succeeded",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    };

    const provider = createAzureDocumentLayoutProvider({
      endpoint: "https://docella.cognitiveservices.azure.com",
      fetchImpl,
      key: "secret-not-logged",
      pollIntervalMs: 1,
      timeoutMs: 5_000,
    });

    const result = await provider.analyze(request);
    expect(result.provider).toBe("azure-document-intelligence");
    expect(result.contentUnit).toBe("page");
    expect(result.contentUnitCount).toBe(1);
    expect(result.paragraphs[0]?.regions[0]?.boundingPolygon).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.2 },
      { x: 0.1, y: 0.2 },
    ]);
    expect(result.tables[0]?.cells[0]?.content).toBe("Consulting");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain("prebuilt-layout:analyze");
    expect(calls[0]?.url).not.toContain("secret-not-logged");
    expect(calls[0]?.init?.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "secret-not-logged",
    });
    expect(calls[1]?.url).toContain("analyzeResults/123");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      base64Source: Buffer.from(pngBytes).toString("base64"),
    });
  });

  it("rejects cross-origin operation URLs", async () => {
    const provider = createAzureDocumentLayoutProvider({
      endpoint: "https://docella.cognitiveservices.azure.com",
      fetchImpl: async () =>
        new Response(null, {
          headers: { "operation-location": "https://attacker.example/result" },
          status: 202,
        }),
      key: "secret",
    });

    await expectAppErrorCode(
      provider.analyze(request),
      ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_INVALID_RESPONSE,
    );
  });

  it.each([
    [429, ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_RATE_LIMITED],
    [500, ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_UNAVAILABLE],
    [401, ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_UNAVAILABLE],
  ])("maps provider HTTP %i safely", async (status, code) => {
    const provider = createAzureDocumentLayoutProvider({
      endpoint: "https://docella.cognitiveservices.azure.com",
      fetchImpl: async () => new Response(null, { status }),
      key: "secret",
    });
    await expectAppErrorCode(provider.analyze(request), code);
  });

  it("rejects malformed successful responses and provider failures", async () => {
    for (const body of [
      { status: "succeeded" },
      { error: { message: "sensitive provider detail" }, status: "failed" },
    ]) {
      let call = 0;
      const provider = createAzureDocumentLayoutProvider({
        endpoint: "https://docella.cognitiveservices.azure.com",
        fetchImpl: async () => {
          call += 1;
          return call === 1
            ? new Response(null, {
                headers: {
                  "operation-location":
                    "https://docella.cognitiveservices.azure.com/documentintelligence/result",
                },
                status: 202,
              })
            : new Response(JSON.stringify(body), { status: 200 });
        },
        key: "secret",
        pollIntervalMs: 1,
      });

      await expectAppErrorCode(
        provider.analyze(request),
        body.status === "failed"
          ? ERROR_CODES.DOCUMENT_LAYOUT_FAILED
          : ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_INVALID_RESPONSE,
      );
    }
  });
});
