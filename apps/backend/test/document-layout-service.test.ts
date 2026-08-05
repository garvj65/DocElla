import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import { ERROR_CODES } from "../src/errors/error-codes.js";
import { createDocumentLayoutService } from "../src/document-layout/document-layout-service.js";
import type {
  DocumentLayoutProvider,
  DocumentLayoutResult,
} from "../src/document-layout/document-layout-types.js";

const pdfBytes = new Uint8Array(Buffer.from("%PDF-1.7\ntext"));
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pdfResult: DocumentLayoutResult = {
  content: "Digital PDF content",
  contentUnit: "page",
  contentUnitCount: 1,
  paragraphs: [],
  provider: "pdfjs",
  sourceFormat: "pdf",
  tables: [],
};

const imageResult: DocumentLayoutResult = {
  content: "Scanned image content",
  contentUnit: "page",
  contentUnitCount: 1,
  paragraphs: [],
  provider: "azure-document-intelligence",
  sourceFormat: "image",
  tables: [],
};

const expectCode = async (operation: Promise<unknown>, code: string): Promise<void> => {
  try {
    await operation;
    throw new Error("Expected operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
};

describe("createDocumentLayoutService", () => {
  it("uses the local PDF provider for text PDFs", async () => {
    let pdfCalls = 0;
    let azureCalls = 0;
    const pdfProvider: DocumentLayoutProvider = {
      analyze: async () => {
        pdfCalls += 1;
        return pdfResult;
      },
    };
    const azureProvider: DocumentLayoutProvider = {
      analyze: async () => {
        azureCalls += 1;
        return imageResult;
      },
    };
    const service = createDocumentLayoutService({ azureProvider, pdfProvider });

    await expect(
      service.analyze({
        bytes: pdfBytes,
        filename: "document.pdf",
        mediaType: "application/pdf",
        sourceFormat: "pdf",
      }),
    ).resolves.toEqual(pdfResult);
    expect(pdfCalls).toBe(1);
    expect(azureCalls).toBe(0);
  });

  it("falls back to OCR only when a PDF has no extractable text", async () => {
    const pdfProvider: DocumentLayoutProvider = {
      analyze: async () => {
        throw new AppError({
          code: ERROR_CODES.PDF_NO_EXTRACTABLE_TEXT,
          message: "No text.",
          status: 422,
        });
      },
    };
    const azurePdfResult = { ...pdfResult, provider: "azure-document-intelligence" as const };
    const azureProvider: DocumentLayoutProvider = { analyze: async () => azurePdfResult };
    const service = createDocumentLayoutService({ azureProvider, pdfProvider });

    await expect(
      service.analyze({
        bytes: pdfBytes,
        filename: "scan.pdf",
        mediaType: "application/pdf",
        sourceFormat: "pdf",
      }),
    ).resolves.toEqual(azurePdfResult);
  });

  it("routes non-PDF documents to Azure and reports missing provider configuration", async () => {
    const azureProvider: DocumentLayoutProvider = { analyze: async () => imageResult };
    const service = createDocumentLayoutService({ azureProvider });
    await expect(
      service.analyze({
        bytes: pngBytes,
        filename: "scan.png",
        mediaType: "image/png",
        sourceFormat: "image",
      }),
    ).resolves.toEqual(imageResult);

    const unconfigured = createDocumentLayoutService();
    await expectCode(
      unconfigured.analyze({
        bytes: pngBytes,
        filename: "scan.png",
        mediaType: "image/png",
        sourceFormat: "image",
      }),
      ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_NOT_CONFIGURED,
    );
  });

  it("does not hide invalid or password-protected PDF errors behind OCR", async () => {
    let azureCalls = 0;
    const pdfProvider: DocumentLayoutProvider = {
      analyze: async () => {
        throw new AppError({
          code: ERROR_CODES.PDF_PASSWORD_PROTECTED,
          message: "Protected.",
          status: 422,
        });
      },
    };
    const azureProvider: DocumentLayoutProvider = {
      analyze: async () => {
        azureCalls += 1;
        return pdfResult;
      },
    };
    const service = createDocumentLayoutService({ azureProvider, pdfProvider });

    await expectCode(
      service.analyze({
        bytes: pdfBytes,
        filename: "protected.pdf",
        mediaType: "application/pdf",
        sourceFormat: "pdf",
      }),
      ERROR_CODES.PDF_PASSWORD_PROTECTED,
    );
    expect(azureCalls).toBe(0);
  });

  it("rejects provider output that exceeds normalized result boundaries", async () => {
    const azureProvider: DocumentLayoutProvider = {
      analyze: async () => ({ ...imageResult, content: "" }),
    };
    const service = createDocumentLayoutService({ azureProvider });
    await expectCode(
      service.analyze({
        bytes: pngBytes,
        filename: "scan.png",
        mediaType: "image/png",
        sourceFormat: "image",
      }),
      ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_INVALID_RESPONSE,
    );
  });
});
