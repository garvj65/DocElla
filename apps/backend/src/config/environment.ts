import { z } from "zod";

const nodeEnvironments = ["development", "test", "production"] as const;
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
const groqStrictModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
export type LogLevel = (typeof logLevels)[number];
export type GroqStrictModel = (typeof groqStrictModels)[number];

export interface Environment {
  readonly azureDocumentIntelligenceEndpoint?: string;
  readonly azureDocumentIntelligenceKey?: string;
  readonly azureDocumentIntelligencePollIntervalMs?: number;
  readonly azureDocumentIntelligenceTimeoutMs?: number;
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly frontendOrigin: string;
  readonly logLevel: LogLevel;
  readonly groqApiKey: string;
  readonly groqModel: GroqStrictModel;
  readonly groqTimeoutMs: number;
  readonly groqMaxRetries: number;
  readonly extractRateLimitWindowMs: number;
  readonly extractRateLimitMax: number;
  readonly generateRateLimitWindowMs: number;
  readonly generateRateLimitMax: number;
  readonly groqMaxInputCharacters: number;
  readonly shutdownTimeoutMs: number;
  readonly trustProxyHops: number;
}

export interface EnvironmentIssue {
  readonly field: string;
  readonly message: string;
}

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly EnvironmentIssue[];

  public constructor(issues: readonly EnvironmentIssue[]) {
    super(
      `Invalid environment configuration: ${issues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

const integerFromString = (
  minimum: number,
  maximum: number,
  defaultValue: number,
): z.ZodDefault<z.ZodType<number | undefined>> =>
  z
    .preprocess(
      (value) => {
        if (value === undefined || value === "") {
          return undefined;
        }

        if (typeof value !== "string") {
          return value;
        }

        return Number(value);
      },
      z
        .number()
        .int("must be an integer")
        .min(minimum, `must be at least ${String(minimum)}`)
        .max(maximum, `must be at most ${String(maximum)}`),
    )
    .default(defaultValue);

const portSchema = z.preprocess((value) => {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return value;
  }

  return Number(value);
}, z.number().int("must be an integer").min(1, "must be at least 1").max(65_535, "must be at most 65535").default(3001));

const frontendOriginSchema = z
  .string()
  .min(1, "is required")
  .transform((value, context) => {
    try {
      const url = new URL(value);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: "must use http or https",
        });
        return z.NEVER;
      }

      if (url.username !== "" || url.password !== "") {
        context.addIssue({
          code: "custom",
          message: "must not include credentials",
        });
        return z.NEVER;
      }

      if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
        context.addIssue({
          code: "custom",
          message: "must be an origin without path, query, or fragment",
        });
        return z.NEVER;
      }

      return url.origin;
    } catch {
      context.addIssue({
        code: "custom",
        message: "must be a valid URL origin",
      });
      return z.NEVER;
    }
  });

const optionalSecretSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z
    .string()
    .transform((value) => value.trim())
    .optional(),
);

const optionalAzureEndpointSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z
    .string()
    .transform((value, context) => {
      try {
        const url = new URL(value.trim());
        if (
          url.protocol !== "https:" ||
          url.username !== "" ||
          url.password !== "" ||
          url.pathname !== "/" ||
          url.search !== "" ||
          url.hash !== ""
        ) {
          context.addIssue({
            code: "custom",
            message: "must be an HTTPS origin without credentials, path, query, or fragment",
          });
          return z.NEVER;
        }
        return url.origin;
      } catch {
        context.addIssue({ code: "custom", message: "must be a valid HTTPS origin" });
        return z.NEVER;
      }
    })
    .optional(),
);

const environmentSchema = z
  .object({
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: optionalAzureEndpointSchema,
    AZURE_DOCUMENT_INTELLIGENCE_KEY: optionalSecretSchema,
    AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS: integerFromString(100, 5_000, 500),
    AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS: integerFromString(5_000, 180_000, 90_000),
    EXTRACT_RATE_LIMIT_MAX: integerFromString(1, 100, 10),
    EXTRACT_RATE_LIMIT_WINDOW_MS: integerFromString(1_000, 3_600_000, 60_000),
    FRONTEND_ORIGIN: frontendOriginSchema,
    GENERATE_RATE_LIMIT_MAX: integerFromString(1, 200, 20),
    GENERATE_RATE_LIMIT_WINDOW_MS: integerFromString(1_000, 3_600_000, 60_000),
    GROQ_API_KEY: z
      .string({ error: "is required" })
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, "is required"),
    GROQ_MAX_INPUT_CHARACTERS: integerFromString(1_000, 100_000, 30_000),
    GROQ_MAX_RETRIES: integerFromString(0, 2, 1),
    GROQ_MODEL: z.enum(groqStrictModels).default("openai/gpt-oss-20b"),
    GROQ_TIMEOUT_MS: integerFromString(1_000, 120_000, 30_000),
    LOG_LEVEL: z.enum(logLevels).default("info"),
    NODE_ENV: z.enum(nodeEnvironments).default("development"),
    PORT: portSchema,
    SHUTDOWN_TIMEOUT_MS: integerFromString(1_000, 60_000, 10_000),
    TRUST_PROXY_HOPS: integerFromString(0, 10, 0),
  })
  .superRefine((value, context) => {
    const hasEndpoint = value.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT !== undefined;
    const hasKey = value.AZURE_DOCUMENT_INTELLIGENCE_KEY !== undefined;
    if (hasEndpoint !== hasKey) {
      context.addIssue({
        code: "custom",
        message: "must be configured together with AZURE_DOCUMENT_INTELLIGENCE_KEY",
        path: ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"],
      });
      context.addIssue({
        code: "custom",
        message: "must be configured together with AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
        path: ["AZURE_DOCUMENT_INTELLIGENCE_KEY"],
      });
    }
  });

export const parseEnvironment = (source: NodeJS.ProcessEnv): Environment => {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const azureConfiguration =
    result.data.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT === undefined ||
    result.data.AZURE_DOCUMENT_INTELLIGENCE_KEY === undefined
      ? {}
      : {
          azureDocumentIntelligenceEndpoint: result.data.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
          azureDocumentIntelligenceKey: result.data.AZURE_DOCUMENT_INTELLIGENCE_KEY,
          azureDocumentIntelligencePollIntervalMs:
            result.data.AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS,
          azureDocumentIntelligenceTimeoutMs: result.data.AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS,
        };

  return {
    ...azureConfiguration,
    extractRateLimitMax: result.data.EXTRACT_RATE_LIMIT_MAX,
    extractRateLimitWindowMs: result.data.EXTRACT_RATE_LIMIT_WINDOW_MS,
    frontendOrigin: result.data.FRONTEND_ORIGIN,
    generateRateLimitMax: result.data.GENERATE_RATE_LIMIT_MAX,
    generateRateLimitWindowMs: result.data.GENERATE_RATE_LIMIT_WINDOW_MS,
    groqApiKey: result.data.GROQ_API_KEY,
    groqMaxInputCharacters: result.data.GROQ_MAX_INPUT_CHARACTERS,
    groqMaxRetries: result.data.GROQ_MAX_RETRIES,
    groqModel: result.data.GROQ_MODEL,
    groqTimeoutMs: result.data.GROQ_TIMEOUT_MS,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    trustProxyHops: result.data.TRUST_PROXY_HOPS,
  };
};
