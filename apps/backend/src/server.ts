import "dotenv/config";

import { createApp } from "./app.js";
import { EnvironmentValidationError, parseEnvironment } from "./config/environment.js";
import { createLogger } from "./config/logger.js";
import { startServer } from "./runtime/start-server.js";

const start = (): void => {
  const environment = parseEnvironment(process.env);
  const logger = createLogger(environment);
  const app = createApp({ environment, logger });

  startServer({ app, environment, logger });
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
