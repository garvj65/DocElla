import { createServer, type RequestListener, type Server } from "node:http";

import type { Logger } from "pino";

import type { Environment } from "../config/environment.js";

export interface SignalRegistrar {
  readonly once: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => void;
}

export interface StartServerOptions {
  readonly app: RequestListener;
  readonly environment: Environment;
  readonly logger: Logger;
  readonly setExitCode?: (exitCode: number) => void;
  readonly signals?: SignalRegistrar;
}

const safeErrorCode = (error: Error): string =>
  "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";

export const startServer = ({
  app,
  environment,
  logger,
  setExitCode = (exitCode) => {
    process.exitCode = exitCode;
  },
  signals = process,
}: StartServerOptions): Server => {
  const server = createServer(app);
  let isShuttingDown = false;

  server.once("error", (error: Error) => {
    const code = safeErrorCode(error);

    logger.fatal(
      {
        code,
        event: "server_start_failed",
        port: environment.port,
      },
      "Server failed to start",
    );
    setExitCode(1);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    const timeoutMs = environment.shutdownTimeoutMs ?? 10_000;
    let forced = false;
    const timer = setTimeout(() => {
      forced = true;
      setExitCode(1);
      logger.error(
        { event: "shutdown_forced", signal, timeoutMs },
        "Forcing server shutdown after grace period",
      );
      server.closeAllConnections?.();
    }, timeoutMs);
    timer.unref();

    logger.info({ event: "shutdown_started", signal, timeoutMs }, "Shutting down server");
    server.closeIdleConnections?.();
    server.close((error) => {
      clearTimeout(timer);
      if (error !== undefined) {
        logger.error({ err: error, event: "shutdown_failed" }, "Server shutdown failed");
        setExitCode(1);
        return;
      }

      logger.info(
        { event: "shutdown_completed", forced },
        forced ? "Forced server shutdown completed" : "Server shutdown completed",
      );
    });
  };

  signals.once("SIGINT", shutdown);
  signals.once("SIGTERM", shutdown);

  server.listen(environment.port, () => {
    logger.info(
      {
        event: "server_started",
        port: environment.port,
      },
      "Server started",
    );
  });

  return server;
};
