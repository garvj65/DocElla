import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from "groq-sdk";
import {
  buildExtractionSchema,
  buildJsonSchema,
  type DocumentDefinition,
  type ExtractionData,
  type JsonObject,
} from "@docella/schemas";
import type { Logger } from "pino";

import type { Environment } from "../config/environment.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { buildExtractionPrompt } from "./prompt.js";
import type { StructuredExtractionRequest, StructuredExtractor } from "./extraction-types.js";

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
  readonly create: (request: GroqCompletionCreateRequest) => Promise<GroqCompletion>;
}

export interface GroqChatClient {
  readonly chat: {
    readonly completions: GroqChatCompletions;
  };
}

export interface GroqCompletionCreateRequest {
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
  readonly temperature: 0;
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
  `${documentDefinition.id.replace(/[^A-Za-z0-9_-]/g, "_")}_v${String(documentDefinition.version)}`;

const buildRequest = (
  environment: Environment,
  documentDefinition: DocumentDefinition,
  documentText: string,
  correction: boolean,
): GroqCompletionCreateRequest => ({
  messages: [
    {
      content:
        "You extract structured data from text-based PDFs. Return valid JSON only. Use null for missing values.",
      role: "system",
    },
    {
      content: [
        buildExtractionPrompt(documentDefinition),
        correction
          ? "The previous response did not validate. Return corrected JSON that exactly matches the schema."
          : "",
        "Document text:",
        documentText,
      ]
        .filter((line) => line.length > 0)
        .join("\n\n"),
      role: "user",
    },
  ],
  model: environment.groqModel,
  response_format: {
    json_schema: {
      name: safeSchemaName(documentDefinition),
      schema: buildJsonSchema(documentDefinition),
      strict: true,
    },
    type: "json_schema",
  },
  temperature: 0,
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const providerStatus = (error: unknown): number | undefined => {
  if (error instanceof APIError && typeof error.status === "number") {
    return error.status;
  }

  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
};

const mapProviderError = (error: unknown): AppError => {
  const status = providerStatus(error);

  if (error instanceof APIConnectionTimeoutError) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.EXTRACTION_PROVIDER_TIMEOUT,
      message: "The extraction provider timed out.",
      status: 503,
    });
  }

  if (error instanceof RateLimitError || status === 429) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.EXTRACTION_PROVIDER_RATE_LIMITED,
      message: "The extraction provider is rate limited.",
      status: 503,
    });
  }

  if (error instanceof APIConnectionError || (status !== undefined && status >= 500)) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      message: "The extraction provider is unavailable.",
      status: 503,
    });
  }

  if (error instanceof AuthenticationError || error instanceof BadRequestError) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      message: "The extraction provider rejected the request.",
      status: 502,
    });
  }

  if (status !== undefined && status >= 400) {
    return new AppError({
      cause: error,
      code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
      message: "The extraction provider rejected the request.",
      status: 502,
    });
  }

  return new AppError({
    cause: error,
    code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
    message: "The extraction provider is unavailable.",
    status: 503,
  });
};

const parseProviderContent = (
  content: string | null | undefined,
  documentDefinition: DocumentDefinition,
): ExtractionData => {
  if (content === undefined || content === null || content.trim().length === 0) {
    throw new AppError({
      code: ERROR_CODES.EXTRACTION_OUTPUT_INVALID,
      message: "The extraction provider returned invalid output.",
      status: 502,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new AppError({
      cause: error,
      code: ERROR_CODES.EXTRACTION_OUTPUT_INVALID,
      message: "The extraction provider returned invalid output.",
      status: 502,
    });
  }

  const schema = buildExtractionSchema(documentDefinition);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new AppError({
      cause: result.error,
      code: ERROR_CODES.EXTRACTION_OUTPUT_INVALID,
      message: "The extraction provider returned invalid output.",
      status: 502,
    });
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
  }: StructuredExtractionRequest): Promise<ExtractionData> => {
    for (const attempt of [0, 1] as const) {
      let completion: GroqCompletion;
      try {
        completion = await client.chat.completions.create(
          buildRequest(environment, documentDefinition, documentText, attempt === 1),
        );
      } catch (error) {
        throw mapProviderError(error);
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
        return parseProviderContent(message?.content, documentDefinition);
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
          continue;
        }

        throw error;
      }
    }

    throw new AppError({
      code: ERROR_CODES.EXTRACTION_OUTPUT_INVALID,
      message: "The extraction provider returned invalid output.",
      status: 502,
    });
  },
});
