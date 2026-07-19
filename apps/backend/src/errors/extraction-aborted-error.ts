export class ExtractionAbortedError extends Error {
  public constructor(message = "Extraction was cancelled.") {
    super(message);
    this.name = "ExtractionAbortedError";
  }
}

export const isAbortLikeError = (error: unknown): boolean =>
  error instanceof ExtractionAbortedError ||
  (error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError"));
