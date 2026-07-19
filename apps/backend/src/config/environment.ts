import { z } from "zod";

const nodeEnvironments = ["development", "test", "production"] as const;
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
const groqStrictModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
export type LogLevel = (typeof logLevels)[number];
export type GroqStrictModel = (typeof groqStrictModels)[number];

export interface Environment {
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
  readonly groqMaxInputCharacters: number;
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

const environmentSchema = z.object({
  EXTRACT_RATE_LIMIT_MAX: integerFromString(1, 100, 10),
  EXTRACT_RATE_LIMIT_WINDOW_MS: integerFromString(1_000, 3_600_000, 60_000),
  FRONTEND_ORIGIN: frontendOriginSchema,
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

  return {
    extractRateLimitMax: result.data.EXTRACT_RATE_LIMIT_MAX,
    extractRateLimitWindowMs: result.data.EXTRACT_RATE_LIMIT_WINDOW_MS,
    frontendOrigin: result.data.FRONTEND_ORIGIN,
    groqApiKey: result.data.GROQ_API_KEY,
    groqMaxInputCharacters: result.data.GROQ_MAX_INPUT_CHARACTERS,
    groqMaxRetries: result.data.GROQ_MAX_RETRIES,
    groqModel: result.data.GROQ_MODEL,
    groqTimeoutMs: result.data.GROQ_TIMEOUT_MS,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
  };
};
