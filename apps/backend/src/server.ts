import "dotenv/config";

import { createServer, type Server } from "node:http";

import { createApp } from "./app.js";
import { EnvironmentValidationError, parseEnvironment } from "./config/environment.js";
import { createLogger } from "./config/logger.js";

const start = (): Server => {
  const environment = parseEnvironment(process.env);
  const logger = createLogger(environment);
  const app = createApp({ environment, logger });
  const server = createServer(app);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ event: "shutdown_started", signal }, "Shutting down server");
    server.close((error) => {
      if (error !== undefined) {
        logger.error({ err: error, event: "shutdown_failed" }, "Server shutdown failed");
        process.exitCode = 1;
      } else {
        logger.info({ event: "shutdown_completed" }, "Server shutdown completed");
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

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

try {
  start();
} catch (error) {
  if (error instanceof EnvironmentValidationError) {
    process.stderr.write(`${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`Failed to start server: ${error.message}\n`);
  } else {
    process.stderr.write("Failed to start server.\n");
  }

  process.exitCode = 1;
}
