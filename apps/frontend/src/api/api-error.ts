export class FrontendApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(options: {
    readonly status: number;
    readonly code: string;
    readonly requestId?: string;
    readonly message?: string;
  }) {
    super(options.message ?? "The schema service request failed.");
    this.name = "FrontendApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}
