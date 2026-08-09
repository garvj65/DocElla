import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "groq-sdk";
import {
  buildExtractionSchema,
  buildProviderExtractionJsonSchema,
  type DocumentDefinition,
  type ExtractionData,
  type JsonObject,
} from "@docella/schemas";
import type { Logger } from "pino";

import type { Environment } from "../config/environment.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { ExtractionAbortedError, isAbortLikeError } from "../errors/extraction-aborted-error.js";
import { buildExtractionSystemInstruction, buildExtractionUserMessage } from "./prompt.js";
import type { StructuredExtractionRequest, StructuredExtractor } from "./extraction-types.js";

const MAX_COMPLETION_TOKENS = 2048 as const;

interface GroqMessage {
  readonly content?: string | null;
  readonly refusal?: string | null;
}

interface GroqChoice {
  readonly message?: GroqMessage;
}

interface GroqCompletion {
  readonly choices?: readonly GroqChoice[];
}

export interface GroqChatCompletions {
  readonly create: (
    request: GroqCompletionCreateRequest,
    options?: GroqRequestOptions,
  ) => Promise<GroqCompletion>;
}

export interface GroqChatClient {
  readonly chat: {
    readonly completions: GroqChatCompletions;
  };
}

export interface GroqCompletionCreateRequest {
  readonly max_completion_tokens: number;
  readonly messages: readonly GroqCompletionMessage[];
  readonly model: string;
  readonly response_format: {
    readonly type: "json_schema";
    readonly json_schema: {
      readonly name: string;
      readonly schema: JsonObject;
      readonly strict: true;
    };
  };
  readonly stream: false;
  readonly temperature: 0;
}

export interface GroqRequestOptions {
  readonly signal?: AbortSignal;
}

interface GroqCompletionMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface CreateGroqStructuredExtractorOptions {
  readonly client: GroqChatClient;
  readonly environment: Environment;
  readonly logger: Logger;
}

const safeSchemaName = (documentDefinition: DocumentDefinition): string =>
  `docella_${documentDefinition.id.replace(/[^A-Za-z0-9_]/g, "_")}_v${String(
    documentDefinition.version,
  )}`;

export const buildGroqCompletionRequest = (
  environment: Environment,
  documentDefinition: DocumentDefinition,
  documentText: string,
  correction: boolean,
): GroqCompletionCreateRequest => ({
  messages: [
    {
      content: buildExtractionSystemInstruction(documentDefinition),
      role: "system",
    },
    {
      content: buildExtractionUserMessage(documentDefinition, documentText, correction),
      role: "user",
    },
  ],
  max_completion_tokens: MAX_COMPLETION_TOKENS,
  model: environment.groqModel,
  response_format: {
    json_schema: {
      name: safeSchemaName(documentDefinition),
      schema: buildProviderExtractionJsonSchema(documentDefinition),
      strict: true,
    },
    type: "json_schema",
  },
  stream: false,
  temperature: 0,
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const safeToken = (value: unknown, maximumLength = 100): string | undefined =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximumLength &&
  /^[A-Za-z0-9_.:-]+$/u.test(value)
    ? value
    : undefined;

const safeSchemaPath = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 240 &&
  /^\/[A-Za-z0-9_./~:-]*$/u.test(value)
    ? value
    : undefined;

const parseProviderMessageBody = (
  error: unknown,
): Readonly<Record<string, unknown>> | undefined => {
  if (!(error instanceof Error)) return undefined;
  const objectStart = error.message.indexOf("{");
  if (objectStart < 0) return undefined;

  try {
    const parsed: unknown = JSON.parse(error.message.slice(objectStart));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const innerProviderPayload = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined => {
  if (!isRecord(value)) return undefined;
  return isRecord(value.error) ? value.error : value;
};

const providerPayload = (error: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (isRecord(error)) {
    const direct = innerProviderPayload(error.error);
    if (direct !== undefined) return direct;
  }

  const parsed = parseProviderMessageBody(error);
  return parsed === undefined ? undefined : innerProviderPayload(parsed.error);
};

const classifyProviderReason = (
  message: unknown,
  status: number | undefined,
): string | undefined => {
  if (typeof message !== "string") return status === 400 ? "bad_request" : undefined;
  const normalized = message.toLocaleLowerCase();

  if (normalized.includes("invalid json schema")) return "invalid_json_schema";
  if (
    normalized.includes("context_length") ||
    normalized.includes("context length") ||
    normalized.includes("too many tokens")
  ) {
    return "context_length_exceeded";
  }
  if (normalized.includes("request entity too large") || normalized.includes("request too large")) {
    return "request_too_large";
  }
  if (normalized.includes("generated json does not match")) return "generated_json_mismatch";
  if (normalized.includes("response_format")) return "response_format_rejected";
  return status === 400 ? "bad_request" : undefined;
};

export const providerStatus = (error: unknown): number | undefined => {
  if (error instanceof APIError && typeof error.status === "number") {
    return error.status;
  }

  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
};

const providerClassName = (error: unknown): string =>
  error instanceof Error ? error.name : "UnknownProviderError";

const safeProviderContext = (
  environment: Environment,
  code: string,
  error: unknown,
): Readonly<Record<string, string | number | boolean>> => {
  const status = providerStatus(error);
  const payload = providerPayload(error);
  const providerErrorType = safeToken(payload?.type);
  const providerErrorCode = safeToken(payload?.code);
  const providerErrorParam = safeToken(payload?.param);
  const providerSchemaPath = safeSchemaPath(payload?.schema_path);
  const providerSchemaKind = safeToken(payload?.schema_kind);
  const providerErrorReason = classifyProviderReason(payload?.message, status);

  return {
    providerErrorClass: providerClassName(error),
    providerModel: environment.groqModel,
    providerMappedCode: code,
    ...(status === undefined ? {} : { providerHttpStatus: status }),
    ...(providerErrorType === undefined ? {} : { providerErrorType }),
    ...(providerErrorCode === undefined ? {} : { providerErrorCode }),
    ...(providerErrorParam === undefined ? {} : { providerErrorParam }),
    ...(providerSchemaPath === undefined ? {} : { providerSchemaPath }),
    ...(providerSchemaKind === undefined ? {} : { providerSchemaKind }),
    ...(providerErrorReason === undefined ? {} : { providerErrorReason }),
  };
};

const providerAppError = (
  environment: Environment,
  error: unknown,
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
  status: number,
): AppError =>
  new AppError({
    cause: error,
    code,
    logCause: false,
    message,
    safeLogContext: safeProviderContext(environment, code, error),
    status,
  });

export const mapProviderError = (environment: Environment, error: unknown): AppError => {
  const status = providerStatus(error);

  if (error instanceof APIUserAbortError || isAbortLikeError(error)) {
    throw new ExtractionAbortedError();
  }

  if (error instanceof APIConnectionTimeoutError) {
    return providerAppError(
      environment,
      error,
      ERROR_CODES.EXTRACTION_PROVIDER_TIMEOUT,
      "The extraction provider timed out.",
      503,
    );
  }

  if (error instanceof RateLimitError || status === 429) {
    return providerAppError(
      environment,
      error,
      ERROR_CODES.EXTRACTION_PROVIDER_RATE_LIMITED,
      "The extraction provider is rate limited.",
      503,
    );
  }

  if (error instanceof APIConnectionError || (status !== undefined && status >= 500)) {
    return providerAppError(
      environment,
      error,
      ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      "The extraction provider is unavailable.",
      503,
    );
  }

  if (
    error instanceof AuthenticationError ||
    error instanceof BadRequestError ||
    error instanceof PermissionDeniedError
  ) {
    return providerAppError(
      environment,
      error,
      ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      "The extraction provider rejected the request.",
      502,
    );
  }

  if (status !== undefined && status >= 400) {
    return providerAppError(
      environment,
      error,
      ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      "The extraction provider rejected the request.",
      502,
    );
  }

  return providerAppError(
    environment,
    error,
    ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
    "The extraction provider is unavailable.",
    503,
  );
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ExtractionAbortedError();
  }
};

const invalidOutputError = (
  environment: Environment,
  failureStage: "missing_content" | "invalid_json" | "schema_validation",
  cause?: unknown,
): AppError =>
  new AppError({
    cause,
    code: ERROR_CODES.EXTRACTION_OUTPUT_INVALID,
    logCause: false,
    message: "The extraction provider returned invalid output.",
    safeLogContext: {
      outputFailureStage: failureStage,
      providerMappedCode: ERROR_CODES.EXTRACTION_OUTPUT_INVALID,
      providerModel: environment.groqModel,
    },
    status: 502,
  });

const parseProviderContent = (
  environment: Environment,
  content: string | null | undefined,
  documentDefinition: DocumentDefinition,
): ExtractionData => {
  if (content === undefined || content === null || content.trim().length === 0) {
    throw invalidOutputError(environment, "missing_content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw invalidOutputError(environment, "invalid_json", error);
  }

  const schema = buildExtractionSchema(documentDefinition);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw invalidOutputError(environment, "schema_validation", result.error);
  }

  return result.data;
};

export const createGroqStructuredExtractor = ({
  client,
  environment,
  logger,
}: CreateGroqStructuredExtractorOptions): StructuredExtractor => ({
  extract: async ({
    documentDefinition,
    documentText,
    signal,
  }: StructuredExtractionRequest): Promise<ExtractionData> => {
    for (const attempt of [0, 1] as const) {
      let completion: GroqCompletion;
      try {
        throwIfAborted(signal);
        completion = await client.chat.completions.create(
          buildGroqCompletionRequest(environment, documentDefinition, documentText, attempt === 1),
          signal === undefined ? undefined : { signal },
        );
        throwIfAborted(signal);
      } catch (error) {
        throw mapProviderError(environment, error);
      }

      const message = completion.choices?.[0]?.message;

      if (message?.refusal !== undefined && message.refusal !== null) {
        throw new AppError({
          code: ERROR_CODES.EXTRACTION_PROVIDER_REJECTED,
          message: "The extraction provider rejected the document.",
          status: 422,
        });
      }

      try {
        return parseProviderContent(environment, message?.content, documentDefinition);
      } catch (error) {
        if (attempt === 0 && error instanceof AppError) {
          logger.warn(
            {
              code: error.code,
              documentSchema: documentDefinition.id,
              providerModel: environment.groqModel,
            },
            "Extraction provider output failed validation; retrying once",
          );
          throwIfAborted(signal);
          continue;
        }

        throw error;
      }
    }

    throw invalidOutputError(environment, "schema_validation");
  },
});
