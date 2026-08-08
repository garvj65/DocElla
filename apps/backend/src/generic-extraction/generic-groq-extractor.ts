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
import { genericProviderBudgets, sampleGenericProviderContent } from "./generic-provider-budget.js";
import type { GenericSchemaDiscoverer, GenericValueExtractor } from "./generic-extraction-types.js";

const GENERIC_COMPLETION_TOKENS = 4_096 as const;

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

interface CompleteWithBackoffOptions {
  readonly client: GroqChatClient;
  readonly content: string;
  readonly environment: Environment;
  readonly logger: Logger;
  readonly schema: JsonObject;
  readonly schemaName: string;
  readonly signal?: AbortSignal;
  readonly stage: "discovery" | "extraction";
  readonly system: string;
  readonly userMessage: (content: string) => string;
}

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ExtractionAbortedError();
  }
};

const safeSchemaName = (value: string): string =>
  `docella_${value.replace(/[^A-Za-z0-9_]/gu, "_").slice(0, 48)}`;

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

const normalizeProviderValuesResult = (
  value: unknown,
  documentSchema: DiscoveredDocumentSchema,
): unknown => {
  if (!isRecord(value)) return value;

  const hasFields = documentSchema.sections.some((section) => section.fields.length > 0);
  const hasTables = documentSchema.tables.length > 0;

  return {
    ...value,
    ...(hasFields ? {} : { fields: {} }),
    ...(hasTables ? {} : { tables: {} }),
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

const isProviderPayloadTooLarge = (error: unknown): error is AppError =>
  error instanceof AppError && error.safeLogContext?.providerHttpStatus === 413;

const completeWithPayloadBackoff = async ({
  client,
  content,
  environment,
  logger,
  schema,
  schemaName,
  signal,
  stage,
  system,
  userMessage,
}: CompleteWithBackoffOptions): Promise<string | null | undefined> => {
  const budgets = genericProviderBudgets(environment);
  let previousInputLength: number | undefined;

  for (let index = 0; index < budgets.length; index += 1) {
    const budget = budgets[index];
    if (budget === undefined) continue;
    const sampledContent = sampleGenericProviderContent(content, budget);
    if (sampledContent.length === previousInputLength) continue;
    previousInputLength = sampledContent.length;

    try {
      return await complete(
        client,
        environment,
        buildRequest(environment, schemaName, schema, system, userMessage(sampledContent)),
        signal,
      );
    } catch (error) {
      const nextBudget = budgets
        .slice(index + 1)
        .find((candidate) => candidate < sampledContent.length);
      if (!isProviderPayloadTooLarge(error) || nextBudget === undefined) throw error;

      logger.warn(
        {
          event: "generic_provider_payload_backoff",
          genericExtractionStage: stage,
          nextProviderInputCharacters: nextBudget,
          providerHttpStatus: 413,
          providerInputCharacters: sampledContent.length,
          providerModel: environment.groqModel,
        },
        "Generic extraction provider rejected an oversized request; retrying with less document content",
      );
    }
  }

  throw new AppError({
    code: ERROR_CODES.EXTRACTION_PROVIDER_UNAVAILABLE,
    message: "The extraction provider rejected the request.",
    safeLogContext: {
      genericExtractionStage: stage,
      providerHttpStatus: 413,
      providerModel: environment.groqModel,
    },
    status: 502,
  });
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
      for (const attempt of [0, 1] as const) {
        const response = await completeWithPayloadBackoff({
          client,
          content: layout.content,
          environment,
          logger,
          schema: buildGenericDiscoveryJsonSchema(),
          schemaName: "generic_schema_discovery_v1",
          signal,
          stage: "discovery",
          system: buildGenericDiscoverySystemInstruction(),
          userMessage: (content) =>
            buildGenericDiscoveryUserMessage(layout, content, attempt === 1),
        });
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
      const parser = buildGenericDocumentExtractionValuesSchema(documentSchema);
      for (const attempt of [0, 1] as const) {
        const response = await completeWithPayloadBackoff({
          client,
          content: layout.content,
          environment,
          logger,
          schema: buildGenericExtractionJsonSchema(documentSchema),
          schemaName: `generic_values_${documentSchema.documentType}_v1`,
          signal,
          stage: "extraction",
          system: buildGenericExtractionSystemInstruction(documentSchema),
          userMessage: (content) =>
            buildGenericExtractionUserMessage(layout, content, attempt === 1),
        });
        try {
          return parseContent(
            response,
            parser,
            ERROR_CODES.GENERIC_EXTRACTION_OUTPUT_INVALID,
            "extraction",
            (value) => normalizeProviderValuesResult(value, documentSchema),
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
