import { FrontendApiError } from "./api-error";

export interface SuccessEnvelope {
  readonly success: true;
  readonly data: unknown;
  readonly meta:
    | {
        readonly requestId?: unknown;
      }
    | undefined;
}

export interface ErrorEnvelope {
  readonly success: false;
  readonly error:
    | {
        readonly code?: unknown;
      }
    | undefined;
  readonly meta:
    | {
        readonly requestId?: unknown;
      }
    | undefined;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const requestIdFromMeta = (meta: unknown): string | undefined => {
  if (!isRecord(meta)) {
    return undefined;
  }

  return typeof meta.requestId === "string" ? meta.requestId : undefined;
};

export const parseEnvelope = (
  value: unknown,
  serviceLabel = "schema service",
): SuccessEnvelope | ErrorEnvelope => {
  if (!isRecord(value) || typeof value.success !== "boolean") {
    throw new FrontendApiError({
      code: "MALFORMED_RESPONSE",
      status: 502,
      message: `The ${serviceLabel} returned an unexpected response.`,
    });
  }

  if (value.success) {
    if (!("data" in value)) {
      throw new FrontendApiError({
        code: "MALFORMED_RESPONSE",
        status: 502,
        message: `The ${serviceLabel} returned an unexpected response.`,
      });
    }

    return {
      data: value.data,
      meta: isRecord(value.meta) ? value.meta : undefined,
      success: true,
    };
  }

  return {
    error: isRecord(value.error) ? value.error : undefined,
    meta: isRecord(value.meta) ? value.meta : undefined,
    success: false,
  };
};

export const buildUrl = (apiBaseUrl: string, path: string): string => {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/u, "");
  return normalizedBaseUrl.length === 0 ? path : `${normalizedBaseUrl}${path}`;
};

export const isJsonResponse = (response: Response): boolean =>
  response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;

const isPdfResponse = (response: Response): boolean =>
  response.headers.get("content-type")?.toLowerCase().includes("application/pdf") ?? false;

const hasUnsafeFilenameCharacter = (filename: string): boolean => {
  for (const character of filename) {
    const codePoint = character.codePointAt(0);
    if (
      character === "/" ||
      character === "\\" ||
      codePoint === undefined ||
      codePoint < 32 ||
      codePoint === 127
    ) {
      return true;
    }
  }

  return false;
};

export const apiErrorOptions = (
  status: number,
  code: string,
  requestId: string | undefined,
): ConstructorParameters<typeof FrontendApiError>[0] =>
  requestId === undefined ? { code, status } : { code, requestId, status };

export const getJson = async (
  apiBaseUrl: string,
  path: string,
  signal?: AbortSignal,
): Promise<unknown> => {
  const requestInit: RequestInit =
    signal === undefined
      ? {
          headers: {
            Accept: "application/json",
          },
          method: "GET",
        }
      : {
          headers: {
            Accept: "application/json",
          },
          method: "GET",
          signal,
        };
  const response = await fetch(buildUrl(apiBaseUrl, path), {
    ...requestInit,
  });

  return (await parseJsonEnvelopeResponse(response, "schema service")).data;
};

export const parseJsonEnvelopeResponse = async (
  response: Response,
  serviceLabel: string,
): Promise<SuccessEnvelope> => {
  if (!isJsonResponse(response)) {
    throw new FrontendApiError({
      code: "NON_JSON_RESPONSE",
      status: response.status,
      message: `The ${serviceLabel} returned an unexpected response.`,
    });
  }

  const envelope = parseEnvelope(await response.json(), serviceLabel);

  if (!envelope.success) {
    const code = typeof envelope.error?.code === "string" ? envelope.error.code : "API_ERROR";
    throw new FrontendApiError(
      apiErrorOptions(response.status, code, requestIdFromMeta(envelope.meta)),
    );
  }

  if (!response.ok) {
    throw new FrontendApiError(
      apiErrorOptions(response.status, "API_ERROR", requestIdFromMeta(envelope.meta)),
    );
  }

  return envelope;
};

export const getJsonData = async (response: Response, serviceLabel: string): Promise<unknown> =>
  (await parseJsonEnvelopeResponse(response, serviceLabel)).data;

const parseJsonErrorEnvelope = async (response: Response): Promise<FrontendApiError> => {
  if (!isJsonResponse(response)) {
    return new FrontendApiError({
      code: "API_ERROR",
      status: response.status,
      message: "The PDF generation request failed.",
    });
  }

  try {
    const envelope = parseEnvelope(await response.json());
    if (!envelope.success) {
      const code = typeof envelope.error?.code === "string" ? envelope.error.code : "API_ERROR";
      return new FrontendApiError(
        apiErrorOptions(response.status, code, requestIdFromMeta(envelope.meta)),
      );
    }
  } catch (error) {
    if (error instanceof FrontendApiError) {
      return error;
    }
  }

  return new FrontendApiError({
    code: "API_ERROR",
    status: response.status,
    message: "The PDF generation request failed.",
  });
};

export const parseSafePdfFilename = (contentDisposition: string | null): string | undefined => {
  if (contentDisposition === null) {
    return undefined;
  }

  const filenameStarMatch = /filename\*=UTF-8''([^;]+)/iu.exec(contentDisposition);
  const quotedMatch = /filename="([^"]+)"/iu.exec(contentDisposition);
  const tokenMatch = /filename=([^;]+)/iu.exec(contentDisposition);
  const rawFilename = filenameStarMatch?.[1] ?? quotedMatch?.[1] ?? tokenMatch?.[1];
  if (rawFilename === undefined) {
    return undefined;
  }

  let filename: string;
  try {
    filename = decodeURIComponent(rawFilename.trim());
  } catch {
    filename = rawFilename.trim();
  }

  if (
    filename.length === 0 ||
    filename.length > 120 ||
    hasUnsafeFilenameCharacter(filename) ||
    !/^[\w .()[\]-]+\.pdf$/iu.test(filename)
  ) {
    return undefined;
  }

  return filename;
};

export interface PdfResponse {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

export const postPdfJson = async (
  apiBaseUrl: string,
  path: string,
  body: unknown,
  fallbackFilename: string,
  signal?: AbortSignal,
): Promise<PdfResponse> => {
  const requestInit: RequestInit = {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/pdf",
      "Content-Type": "application/json",
    },
    method: "POST",
  };

  if (signal !== undefined) {
    requestInit.signal = signal;
  }

  const response = await fetch(buildUrl(apiBaseUrl, path), requestInit);

  if (!response.ok) {
    throw await parseJsonErrorEnvelope(response);
  }

  if (!isPdfResponse(response)) {
    throw new FrontendApiError({
      code: "INVALID_PDF_RESPONSE",
      status: response.status,
      message: "The PDF generation service returned an unexpected response.",
    });
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new FrontendApiError({
      code: "EMPTY_PDF_RESPONSE",
      status: response.status,
      message: "The PDF generation service returned an empty PDF.",
    });
  }

  const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d];
  if (!pdfHeader.every((byte, index) => bytes[index] === byte)) {
    throw new FrontendApiError({
      code: "INVALID_PDF_RESPONSE",
      status: response.status,
      message: "The PDF generation service returned an invalid PDF.",
    });
  }

  return {
    bytes,
    filename: parseSafePdfFilename(response.headers.get("content-disposition")) ?? fallbackFilename,
  };
};
