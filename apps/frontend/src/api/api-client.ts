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
