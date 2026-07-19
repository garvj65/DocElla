import { createServer } from "node:http";
import { Writable } from "node:stream";

import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";

import type { Environment } from "../src/config/environment.js";
import { startServer, type SignalRegistrar } from "../src/runtime/start-server.js";

class MemoryLogStream extends Writable {
  public readonly entries: string[] = [];

  public override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.entries.push(chunk.toString());
    callback();
  }
}

class TestSignals implements SignalRegistrar {
  private readonly listeners = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void>();

  public once(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void {
    this.listeners.set(signal, listener);
  }

  public emit(signal: NodeJS.Signals): void {
    this.listeners.get(signal)?.(signal);
  }
}

const baseEnvironment: Environment = {
  frontendOrigin: "http://localhost:5173",
  logLevel: "info",
  nodeEnv: "test",
  port: 0,
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error("Timed out waiting for condition.");
};

const closeServer = async (server: ReturnType<typeof createServer>): Promise<void> => {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

describe("startServer", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it("handles listener startup errors through a controlled failure path", async () => {
    const blockingServer = createServer((_request, response) => {
      response.end("occupied");
    });
    servers.push(blockingServer);

    await new Promise<void>((resolve) => {
      blockingServer.listen(0, resolve);
    });

    const address = blockingServer.address();
    const occupiedPort = typeof address === "object" && address !== null ? address.port : 0;
    const stream = new MemoryLogStream();
    const logger = pino({ level: "trace" }, stream);
    let exitCode = 0;

    const server = startServer({
      app: (_request, response) => {
        response.end("ok");
      },
      environment: {
        ...baseEnvironment,
        port: occupiedPort,
      },
      logger,
      setExitCode: (code) => {
        exitCode = code;
      },
      signals: new TestSignals(),
    });
    servers.push(server);

    await waitFor(() => exitCode === 1);

    const logs = stream.entries.join("");

    expect(exitCode).toBe(1);
    expect(logs).toContain('"event":"server_start_failed"');
    expect(logs).toContain('"code":"EADDRINUSE"');
    expect(logs).toContain(`"port":${String(occupiedPort)}`);
    expect(server.listening).toBe(false);
  });

  it("ignores duplicate shutdown signals after shutdown starts", async () => {
    const signals = new TestSignals();
    const stream = new MemoryLogStream();
    const logger = pino({ level: "trace" }, stream);
    const server = startServer({
      app: (_request, response) => {
        response.end("ok");
      },
      environment: baseEnvironment,
      logger,
      signals,
    });
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });

    signals.emit("SIGTERM");
    signals.emit("SIGTERM");

    await waitFor(() => stream.entries.join("").includes('"event":"shutdown_completed"'));

    const logs = stream.entries.join("");
    const shutdownStarts = logs.match(/"event":"shutdown_started"/g) ?? [];

    expect(shutdownStarts).toHaveLength(1);
    expect(logs).toContain('"event":"shutdown_completed"');
  });
});
