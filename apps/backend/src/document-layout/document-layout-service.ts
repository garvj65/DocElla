import type { Environment } from "../config/environment.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { createAzureDocumentLayoutProvider } from "./azure-document-layout-provider.js";
import { validateDocumentInput } from "./document-format.js";
import {
  DOCUMENT_LAYOUT_LIMITS,
  type DocumentLayoutProvider,
  type DocumentLayoutRequest,
  type DocumentLayoutResult,
  type DocumentLayoutService,
} from "./document-layout-types.js";
import { createPdfDocumentLayoutProvider } from "./pdf-document-layout-provider.js";

export interface CreateDocumentLayoutServiceOptions {
  readonly azureProvider?: DocumentLayoutProvider;
  readonly pdfProvider?: DocumentLayoutProvider;
}

const providerNotConfigured = (): AppError =>
  new AppError({
    code: ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_NOT_CONFIGURED,
    message: "OCR and multi-format document analysis are not configured.",
    status: 503,
  });

const validateLayoutResult = (
  result: DocumentLayoutResult,
  request: DocumentLayoutRequest,
): DocumentLayoutResult => {
  if (
    result.sourceFormat !== request.sourceFormat ||
    result.content.trim().length === 0 ||
    result.content.length > DOCUMENT_LAYOUT_LIMITS.maxContentCharacters ||
    result.contentUnitCount < 1 ||
    result.paragraphs.length > DOCUMENT_LAYOUT_LIMITS.maxLayoutItems ||
    result.tables.length > DOCUMENT_LAYOUT_LIMITS.maxTables
  ) {
    throw new AppError({
      code: ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_INVALID_RESPONSE,
      message: "The document layout provider returned an invalid response.",
      status: 502,
    });
  }

  const tableCellCount = result.tables.reduce((total, table) => total + table.cells.length, 0);
  if (tableCellCount > DOCUMENT_LAYOUT_LIMITS.maxTableCells) {
    throw new AppError({
      code: ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_INVALID_RESPONSE,
      message: "The document layout provider returned too many table cells.",
      status: 502,
    });
  }

  return result;
};

const shouldUseOcrFallback = (error: unknown): boolean =>
  error instanceof AppError && error.code === ERROR_CODES.PDF_NO_EXTRACTABLE_TEXT;

export const createDocumentLayoutService = ({
  azureProvider,
  pdfProvider = createPdfDocumentLayoutProvider(),
}: CreateDocumentLayoutServiceOptions = {}): DocumentLayoutService => ({
  analyze: async (request: DocumentLayoutRequest): Promise<DocumentLayoutResult> => {
    const validated = validateDocumentInput({
      bytes: request.bytes,
      filename: request.filename,
      mediaType: request.mediaType,
    });
    if (validated.sourceFormat !== request.sourceFormat) {
      throw new AppError({
        code: ERROR_CODES.DOCUMENT_SIGNATURE_INVALID,
        message: "The document source format does not match the validated file.",
        status: 422,
      });
    }

    const validatedRequest: DocumentLayoutRequest = {
      ...validated,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    };

    if (validated.sourceFormat === "pdf") {
      try {
        return validateLayoutResult(await pdfProvider.analyze(validatedRequest), validatedRequest);
      } catch (error) {
        if (!shouldUseOcrFallback(error)) throw error;
        if (azureProvider === undefined) throw providerNotConfigured();
      }
    } else if (azureProvider === undefined) {
      throw providerNotConfigured();
    }

    return validateLayoutResult(
      await (azureProvider as DocumentLayoutProvider).analyze(validatedRequest),
      validatedRequest,
    );
  },
});

export const createDocumentLayoutServiceFromEnvironment = (
  environment: Environment,
): DocumentLayoutService => {
  const azureProvider =
    environment.azureDocumentIntelligenceEndpoint === undefined ||
    environment.azureDocumentIntelligenceKey === undefined
      ? undefined
      : createAzureDocumentLayoutProvider({
          endpoint: environment.azureDocumentIntelligenceEndpoint,
          key: environment.azureDocumentIntelligenceKey,
          pollIntervalMs: environment.azureDocumentIntelligencePollIntervalMs ?? 500,
          timeoutMs: environment.azureDocumentIntelligenceTimeoutMs ?? 90_000,
        });

  return createDocumentLayoutService(azureProvider === undefined ? {} : { azureProvider });
};
