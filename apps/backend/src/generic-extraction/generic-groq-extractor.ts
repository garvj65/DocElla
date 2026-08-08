import {
  buildGenericDiscoveryJsonSchema,
  buildGenericDocumentExtractionValuesSchema,
  buildGenericExtractionJsonSchema,
  discoveredDocumentSchemaSchema,
  type DiscoveredDocumentSchema,
  type GenericDocumentValues,
  type JsonObject,
} from "@docella/schemas";
import type { Logger } from "pino";
import type { z } from "zod";

import type { Environment } from "../config/environment.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { ExtractionAbortedError } from "../errors/extraction-aborted-error.js";
import { mapProviderError, type GroqChatClient } from "../extraction/groq-structured-extractor.js";
import {
  buildGenericDiscoverySystemInstruction,
  buildGenericDiscoveryUserMessage,
  buildGenericExtractionSystemInstruction,
  buildGenericExtractionUserMessage,
} from "./generic-extraction-prompt.js";
import type { GenericSchemaDiscoverer, GenericValueExtractor } from "./generic-extraction-types.js";

const GENERIC_COMPLETION_TOKENS = 8_192 as const;

export interface CreateGenericGroqExtractorsOptions {
  readonly client: GroqChatClient;
  readonly environment: Environment;
  readonly logger: Logger;
}

export interface GenericGroqExtractors {
  readonly schemaDiscoverer: GenericSchemaDiscoverer;
  readonly valueExtractor: GenericValueExtractor;
}

interface GenericCompletionRequest {
  readonly max_completion_tokens: typeof GENERIC_COMPLETION_TOKENS;
  readonly messages: readonly {
    readonly content: string;
    readonly role: "system" | "user";
  }[];
  readonly model: string;
  readonly response_format: {
    readonly json_schema: {
      readonly name: string;
      readonly schema: JsonObject;
      readonly strict: true;
    };
    readonly type: "json_schema";
  };
  readonly stream: false;
  readonly temperature: 0;
}

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ExtractionAbortedError();
  }
};

const safeSchemaName = (value: string): string =>
  `docella_${value.replace(/[^A-Za-z0-9_]/gu, "_").slice(0, 48)}`;

const providerContent = (content: string, environment: Environment): string =>
  content.slice(0, environment.groqMaxInputCharacters);

const requestOptions = (
  signal: AbortSignal | undefined,
): { readonly signal: AbortSignal } | undefined => (signal === undefined ? undefined : { signal });

const invalidOutput = (
  code:
    | typeof ERROR_CODES.GENERIC_SCHEMA_DISCOVERY_INVALID
    | typeof ERROR_CODES.GENERIC_EXTRACTION_OUTPUT_INVALID,
  stage: "discovery" | "extraction",
  cause?: unknown,
): AppError =>
  new AppError({
    cause,
    code,
    logCause: false,
    message:
      stage === "discovery"
        ? "The document schema could not be discovered reliably."
        : "The document values could not be extracted reliably.",
    safeLogContext: { genericExtractionStage: stage },
    status: 502,
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const normalizeProviderDiscoveryResult = (value: unknown): unknown => {
  if (!isRecord(value) || !isUnknownArray(value.sections)) return value;

  return {
    ...value,
    sections: value.sections.map((section) => {
      if (!isRecord(section) || !isUnknownArray(section.fields)) return section;
      return {
        ...section,
        fields: section.fields.map((field) => {
          if (!isRecord(field) || field.valueType === "select") return field;
          const { options: _options, ...normalizedField } = field;
          void _options;
          return normalizedField;
        }),
      };
    }),
  };
};

const parseContent = <T>(
  content: string | null | undefined,
  parser: z.ZodType<T>,
  code:
    | typeof ERROR_CODES.GENERIC_SCHEMA_DISCOVERY_INVALID
    | typeof ERROR_CODES.GENERIC_EXTRACTION_OUTPUT_INVALID,
  stage: "discovery" | "extraction",
  normalize: (value: unknown) => unknown = (value) => value,
): T => {
  if (content === undefined || content === null || content.trim().length === 0) {
    throw invalidOutput(code, stage);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw invalidOutput(code, stage, error);
  }

  const result = parser.safeParse(normalize(parsed));
  if (!result.success) {
    throw invalidOutput(code, stage, result.error);
  }
  return result.data;
};

const buildRequest = (
  environment: Environment,
  schemaName: string,
  schema: JsonObject,
  system: string,
  user: string,
): GenericCompletionRequest => ({
  max_completion_tokens: GENERIC_COMPLETION_TOKENS,
  messages: [
    { content: system, role: "system" },
    { content: user, role: "user" },
  ],
  model: environment.groqModel,
  response_format: {
    json_schema: {
      name: safeSchemaName(schemaName),
      schema,
      strict: true,
    },
    type: "json_schema",
  },
  stream: false,
  temperature: 0,
});

const complete = async (
  client: GroqChatClient,
  environment: Environment,
  request: GenericCompletionRequest,
  signal: AbortSignal | undefined,
): Promise<string | null | undefined> => {
  try {
    throwIfAborted(signal);
    const completion = await client.chat.completions.create(request, requestOptions(signal));
    throwIfAborted(signal);
    const message = completion.choices?.[0]?.message;
    if (message?.refusal !== undefined && message.refusal !== null) {
      throw new AppError({
        code: ERROR_CODES.EXTRACTION_PROVIDER_REJECTED,
        message: "The extraction provider rejected the document.",
        status: 422,
      });
    }
    return message?.content;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mapProviderError(environment, error);
  }
};

const warnRetry = (
  logger: Logger,
  environment: Environment,
  stage: "discovery" | "extraction",
): void => {
  logger.warn(
    {
      event: "generic_extraction_validation_retry",
      genericExtractionStage: stage,
      providerModel: environment.groqModel,
    },
    "Generic extraction provider output failed local validation; retrying once",
  );
};

export const createGenericGroqExtractors = ({
  client,
  environment,
  logger,
}: CreateGenericGroqExtractorsOptions): GenericGroqExtractors => ({
  schemaDiscoverer: {
    discover: async ({ layout, signal }): Promise<DiscoveredDocumentSchema> => {
      const content = providerContent(layout.content, environment);
      for (const attempt of [0, 1] as const) {
        const response = await complete(
          client,
          environment,
          buildRequest(
            environment,
            "generic_schema_discovery_v1",
            buildGenericDiscoveryJsonSchema(),
            buildGenericDiscoverySystemInstruction(),
            buildGenericDiscoveryUserMessage(layout, content, attempt === 1),
          ),
          signal,
        );
        try {
          return parseContent(
            response,
            discoveredDocumentSchemaSchema,
            ERROR_CODES.GENERIC_SCHEMA_DISCOVERY_INVALID,
            "discovery",
            normalizeProviderDiscoveryResult,
          );
        } catch (error) {
          if (attempt === 0 && error instanceof AppError) {
            warnRetry(logger, environment, "discovery");
            throwIfAborted(signal);
            continue;
          }
          throw error;
        }
      }
      throw invalidOutput(ERROR_CODES.GENERIC_SCHEMA_DISCOVERY_INVALID, "discovery");
    },
  },
  valueExtractor: {
    extract: async ({ documentSchema, layout, signal }): Promise<GenericDocumentValues> => {
      const content = providerContent(layout.content, environment);
      const parser = buildGenericDocumentExtractionValuesSchema(documentSchema);
      for (const attempt of [0, 1] as const) {
        const response = await complete(
          client,
          environment,
          buildRequest(
            environment,
            `generic_values_${documentSchema.documentType}_v1`,
            buildGenericExtractionJsonSchema(documentSchema),
            buildGenericExtractionSystemInstruction(documentSchema),
            buildGenericExtractionUserMessage(layout, content, attempt === 1),
          ),
          signal,
        );
        try {
          return parseContent(
            response,
            parser,
            ERROR_CODES.GENERIC_EXTRACTION_OUTPUT_INVALID,
            "extraction",
          );
        } catch (error) {
          if (attempt === 0 && error instanceof AppError) {
            warnRetry(logger, environment, "extraction");
            throwIfAborted(signal);
            continue;
          }
          throw error;
        }
      }
      throw invalidOutput(ERROR_CODES.GENERIC_EXTRACTION_OUTPUT_INVALID, "extraction");
    },
  },
});
