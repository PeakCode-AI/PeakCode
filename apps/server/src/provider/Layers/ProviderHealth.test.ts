import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it, assert } from "@effect/vitest";
import { Effect, Layer, Sink, Stream } from "effect";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";

import { ServerConfig } from "../../config";
import { ServerSettingsLive } from "../../serverSettings";
import { checkPiProviderStatus, ProviderHealthLive } from "./ProviderHealth";
import { ProviderHealth } from "../Services/ProviderHealth";

// ── Test helpers ────────────────────────────────────────────────────

const encoder = new TextEncoder();

function makeTempAgentDir(prefix = "t3-test-pi-agent-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(
    path.join(dir, "auth.json"),
    JSON.stringify({ anthropic: { type: "api_key", key: "test" } }),
  );
  return dir;
}

function mockHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function mockSpawnerLayer(
  handler: (
    args: ReadonlyArray<string>,
    command: string,
  ) => {
    stdout: string;
    stderr: string;
    code: number;
  },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as {
        command: string;
        args: ReadonlyArray<string>;
        options?: { env?: NodeJS.ProcessEnv };
      };
      return Effect.succeed(mockHandle(handler(cmd.args, cmd.command)));
    }),
  );
}

function failingSpawnerLayer(description: string) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.fail(
        PlatformError.systemError({
          _tag: "NotFound",
          module: "ChildProcess",
          method: "spawn",
          description,
        }),
      ),
    ),
  );
}

it.layer(NodeServices.layer)("ProviderHealth", (it) => {
  // ── checkPiProviderStatus tests ────────────────────────────────────

  describe("checkPiProviderStatus", () => {
    it.effect("returns ready with provider pi when the SDK has available models", () =>
      Effect.gen(function* () {
        const agentDir = makeTempAgentDir();
        const status = yield* checkPiProviderStatus(agentDir);
        assert.strictEqual(status.provider, "pi");
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "authenticated");
        fs.rmSync(agentDir, { recursive: true, force: true });
      }).pipe(
        Effect.provide(mockSpawnerLayer(() => ({ stdout: "pi 0.130.0\n", stderr: "", code: 0 }))),
      ),
    );

    it.effect("parses the reported Pi version from the --version probe", () =>
      Effect.gen(function* () {
        const agentDir = makeTempAgentDir();
        const status = yield* checkPiProviderStatus(agentDir);
        assert.strictEqual(status.version, "0.130.0");
        fs.rmSync(agentDir, { recursive: true, force: true });
      }).pipe(
        Effect.provide(mockSpawnerLayer(() => ({ stdout: "pi 0.130.0\n", stderr: "", code: 0 }))),
      ),
    );

    it.effect("uses a configured binary path for the version probe", () =>
      Effect.gen(function* () {
        const agentDir = makeTempAgentDir();
        const status = yield* checkPiProviderStatus(agentDir, "/custom/bin/pi");
        assert.strictEqual(status.provider, "pi");
        fs.rmSync(agentDir, { recursive: true, force: true });
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args, command) => {
            assert.strictEqual(command, "/custom/bin/pi");
            return { stdout: "pi 1.2.3\n", stderr: "", code: 0 };
          }),
        ),
      ),
    );

    it.effect("falls back to ready status when the version probe cannot run", () =>
      Effect.gen(function* () {
        const agentDir = makeTempAgentDir();
        const status = yield* checkPiProviderStatus(agentDir);
        assert.strictEqual(status.provider, "pi");
        // The SDK still exposes its default model set even without a CLI binary.
        assert.strictEqual(status.status, "ready");
        fs.rmSync(agentDir, { recursive: true, force: true });
      }).pipe(Effect.provide(failingSpawnerLayer("spawn pi ENOENT"))),
    );
  });

  // ── ProviderHealthLive tests ───────────────────────────────────────

  function makeHealthLayer() {
    const spawnerLayer = mockSpawnerLayer((args) => {
      const joined = args.join(" ");
      if (joined === "--version") return { stdout: "pi 0.130.0\n", stderr: "", code: 0 };
      if (joined === "update" || joined.startsWith("update"))
        return { stdout: "Updated to 0.131.0\n", stderr: "", code: 0 };
      throw new Error(`Unexpected args: ${joined}`);
    });
    return ProviderHealthLive.pipe(
      Layer.provideMerge(ServerSettingsLive),
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-test-health" })),
      Layer.provide(spawnerLayer),
      Layer.provideMerge(NodeServices.layer),
    );
  }

  const health = it.layer(makeHealthLayer());

  health("ProviderHealthLive", (it) => {
    it.effect("exposes a cached pi provider status", () =>
      Effect.gen(function* () {
        const providerHealth = yield* ProviderHealth;
        // Seed the in-memory snapshot via a foreground refresh, then read the
        // stable cache snapshot that transport consumers observe.
        yield* providerHealth.refresh;
        const statuses = yield* providerHealth.getStatuses;
        assert.equal(
          statuses.some((status) => status.provider === "pi"),
          true,
        );
      }),
    );

    it.effect("refresh returns an ordered set of pi statuses", () =>
      Effect.gen(function* () {
        const providerHealth = yield* ProviderHealth;
        const statuses = yield* providerHealth.refresh;
        assert.equal(
          statuses.some((status) => status.provider === "pi"),
          true,
        );
      }),
    );

    it.effect("updateProvider runs the pi native update flow", () =>
      Effect.gen(function* () {
        const providerHealth = yield* ProviderHealth;
        const result = yield* providerHealth.updateProvider({ provider: "pi" });
        assert.equal(
          result.providers.some((status) => status.provider === "pi"),
          true,
        );
      }),
    );
  });
});
