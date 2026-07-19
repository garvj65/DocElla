import type { Request, Response } from "express";

export interface RequestCancellation {
  readonly cleanup: () => void;
  readonly closedBeforeCompletion: () => boolean;
  readonly signal: AbortSignal;
}

export const bindRequestCancellation = (
  request: Request,
  response: Response,
): RequestCancellation => {
  const abortController = new AbortController();
  let closedBeforeCompletion = false;
  const abort = (): void => {
    abortController.abort();
  };
  const abortOnClose = (): void => {
    if (!response.writableEnded) {
      closedBeforeCompletion = true;
      abortController.abort();
    }
  };
  const cleanup = (): void => {
    request.off("aborted", abort);
    response.off("close", abortOnClose);
  };

  request.once("aborted", abort);
  response.once("close", abortOnClose);

  return {
    cleanup,
    closedBeforeCompletion: () => closedBeforeCompletion,
    signal: abortController.signal,
  };
};
