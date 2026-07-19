import { z } from "zod";

const nodeEnvironments = ["development", "test", "production"] as const;
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
export type LogLevel = (typeof logLevels)[number];

export interface Environment {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly frontendOrigin: string;
  readonly logLevel: LogLevel;
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
  FRONTEND_ORIGIN: frontendOriginSchema,
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
    frontendOrigin: result.data.FRONTEND_ORIGIN,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
  };
};
