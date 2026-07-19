import { createApp } from "../../src/app.js";
import type { Environment } from "../../src/config/environment.js";
import pino, { type Logger } from "pino";

export const testEnvironment: Environment = {
  frontendOrigin: "http://localhost:5173",
  logLevel: "info",
  nodeEnv: "test",
  port: 3001,
};

export const createSilentLogger = (): Logger => pino({ level: "silent" });

export const createTestApp = () =>
  createApp({
    environment: testEnvironment,
    logger: createSilentLogger(),
  });
