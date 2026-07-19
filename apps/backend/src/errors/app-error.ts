import type { ErrorCode } from "./error-codes.js";

export type ErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export interface AppErrorOptions {
  readonly cause?: unknown;
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  readonly isOperational?: boolean;
  readonly message: string;
  readonly status: number;
}

export class AppError extends Error {
  public override readonly cause: unknown;
  public readonly code: ErrorCode;
  public readonly details: ErrorDetails | undefined;
  public readonly isOperational: boolean;
  public readonly status: number;

  public constructor({
    cause,
    code,
    details,
    isOperational = true,
    message,
    status,
  }: AppErrorOptions) {
    super(message);
    this.name = "AppError";
    this.cause = cause;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    this.status = status;
  }
}
