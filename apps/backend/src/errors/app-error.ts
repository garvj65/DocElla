import type { ErrorCode } from "./error-codes.js";

export type ErrorDetails = Readonly<Record<string, string | number | boolean | null>>;
export type SafeLogContext = Readonly<Record<string, string | number | boolean>>;

export interface AppErrorOptions {
  readonly cause?: unknown;
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  readonly isOperational?: boolean;
  readonly logCause?: boolean;
  readonly message: string;
  readonly safeLogContext?: SafeLogContext;
  readonly status: number;
}

export class AppError extends Error {
  public override readonly cause: unknown;
  public readonly code: ErrorCode;
  public readonly details: ErrorDetails | undefined;
  public readonly isOperational: boolean;
  public readonly logCause: boolean;
  public readonly safeLogContext: SafeLogContext | undefined;
  public readonly status: number;

  public constructor({
    cause,
    code,
    details,
    isOperational = true,
    logCause = true,
    message,
    safeLogContext,
    status,
  }: AppErrorOptions) {
    super(message);
    this.name = "AppError";
    this.cause = cause;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    this.logCause = logCause;
    this.safeLogContext = safeLogContext;
    this.status = status;
  }
}
