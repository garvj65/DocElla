import type { SafeLogContext } from "../errors/app-error.js";

const MAX_PROVIDER_MESSAGE_LENGTH = 320;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const sanitizeProviderMessage = (message: string): string =>
  message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[redacted-email]")
    .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]{8,}\b/gu, "[redacted-secret]")
    .replace(/\b(?:\+?\d[\d(). -]{8,}\d)\b/gu, "[redacted-phone]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_PROVIDER_MESSAGE_LENGTH);

const providerPayload = (
  cause: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined => {
  const body = cause.error;
  if (!isRecord(body)) return undefined;
  return isRecord(body.error) ? body.error : body;
};

const providerRequestId = (cause: Readonly<Record<string, unknown>>): string | undefined => {
  const headers = cause.headers;
  if (headers instanceof Headers) {
    return (
      headers.get("x-request-id") ??
      headers.get("x-groq-request-id") ??
      headers.get("request-id") ??
      undefined
    );
  }

  if (!isRecord(headers)) return undefined;
  return (
    nonEmptyString(headers["x-request-id"]) ??
    nonEmptyString(headers["x-groq-request-id"]) ??
    nonEmptyString(headers["request-id"])
  );
};

const providerReason = (
  status: number | undefined,
  type: string | undefined,
  code: string | undefined,
  message: string | undefined,
): string | undefined => {
  const searchable = `${code ?? ""} ${type ?? ""} ${message ?? ""}`.toLocaleLowerCase();

  if (
    searchable.includes("blocked_api_access") ||
    searchable.includes("spend limit")
  ) {
    return "access_blocked";
  }
  if (searchable.includes("response_format")) return "invalid_response_format";
  if (searchable.includes("json schema") || searchable.includes("json_schema")) {
    return "invalid_schema";
  }
  if (
    searchable.includes("context length") ||
    searchable.includes("context_length") ||
    searchable.includes("too many tokens")
  ) {
    return "context_length_exceeded";
  }
  if (
    searchable.includes("model") &&
    (searchable.includes("unsupported") ||
      searchable.includes("not found") ||
      searchable.includes("not available"))
  ) {
    return "model_rejected";
  }
  if (status === 400) return "bad_request";
  if (status === 401) return "authentication";
  if (status === 403) return "permission_denied";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status !== undefined && status >= 500) return "provider_unavailable";
  return type;
};

export const providerErrorDiagnosticContext = (cause: unknown): SafeLogContext => {
  if (!isRecord(cause)) return {};

  const payload = providerPayload(cause);
  const status = typeof cause.status === "number" ? cause.status : undefined;
  const type = payload === undefined ? undefined : nonEmptyString(payload.type);
  const code = payload === undefined ? undefined : nonEmptyString(payload.code);
  const rawMessage = payload === undefined ? undefined : nonEmptyString(payload.message);
  const message = rawMessage === undefined ? undefined : sanitizeProviderMessage(rawMessage);
  const requestId = providerRequestId(cause);
  const reason = providerReason(status, type, code, message);

  return {
    ...(status === undefined ? {} : { providerHttpStatus: status }),
    ...(type === undefined ? {} : { providerErrorType: type }),
    ...(code === undefined ? {} : { providerErrorCode: code }),
    ...(message === undefined ? {} : { providerErrorMessage: message }),
    ...(requestId === undefined ? {} : { providerRequestId: requestId }),
    ...(reason === undefined ? {} : { providerErrorReason: reason }),
  };
};
