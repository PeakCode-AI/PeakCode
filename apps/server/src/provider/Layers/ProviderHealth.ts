/**
 * ProviderHealthLive - Cache-backed provider health service.
 *
 * Seeds provider status from disk cache when available, then refreshes from
 * CLI probes without blocking the rest of server startup.
 *
 * Uses effect's ChildProcessSpawner to run CLI probes natively.
 *
 * Pi is the only supported provider.
 *
 * @module ProviderHealthLive
 */
import * as nodePath from "node:path";
import type {
  ProviderKind,
  ServerSettings,
  ServerProviderStatus,
  ServerProviderUpdateState,
} from "@peakcode/contracts";
import { ServerProviderUpdateError } from "@peakcode/contracts";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  Cache,
  Cause,
  DateTime,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  PubSub,
  Ref,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ServerConfig } from "../../config";
import { ServerSettingsService } from "../../serverSettings";
import { isWindowsShellCommandMissingResult } from "../../shell-command-detection";
import { ProviderHealth, type ProviderHealthShape } from "../Services/ProviderHealth";
import {
  orderProviderStatuses,
  readProviderStatusCache,
  resolveProviderStatusCachePath,
  writeProviderStatusCache,
} from "../providerStatusCache";
import { makeProviderMaintenanceCommandCoordinator } from "../providerMaintenanceCommandCoordinator";
import {
  enrichProviderStatusWithVersionAdvisory,
  makeProviderMaintenanceCapabilities,
  normalizeCommandPath,
  parseGenericCliVersion,
  resolveProviderMaintenanceCapabilitiesEffect,
  type PackageManagedProviderMaintenanceDefinition,
} from "../providerMaintenance";
import { collectUint8StreamText } from "../../stream/collectUint8StreamText";

const DEFAULT_TIMEOUT_MS = 4_000;
const PI_PROVIDER = "pi" as const;
type ProviderStatuses = ReadonlyArray<ServerProviderStatus>;

const PROVIDERS = [PI_PROVIDER] as const satisfies ReadonlyArray<ProviderKind>;

const UPDATE_OUTPUT_MAX_BYTES = 10_000;
const UPDATE_TIMEOUT_MS = 5 * 60_000;

function isPiNativeCommandPath(commandPath: string): boolean {
  const normalized = normalizeCommandPath(commandPath);
  if (normalized.includes("/node_modules/")) {
    return false;
  }
  return (
    normalized.endsWith("/.pi/") || normalized.includes("/.pi/bin/pi") || normalized.endsWith("/pi")
  );
}

const PACKAGE_MANAGED_PROVIDER_UPDATES: Partial<
  Record<ProviderKind, PackageManagedProviderMaintenanceDefinition>
> = {
  pi: {
    provider: PI_PROVIDER,
    binaryName: "pi",
    npmPackageName: "@earendil-works/pi-coding-agent",
    homebrew: null,
    nativeUpdate: {
      executable: "pi",
      args: () => ["update"],
      lockKey: "pi-native",
      strategy: "always",
      excludedInstallSources: ["project"],
      isCommandPath: isPiNativeCommandPath,
    },
  },
};

// ── Pure helpers ────────────────────────────────────────────────────

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

function nonEmptyTrimmed(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isCommandMissingCause(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const lower = error.message.toLowerCase();
  return lower.includes("enoent") || lower.includes("notfound");
}

function detailFromResult(
  result: CommandResult & { readonly timedOut?: boolean },
): string | undefined {
  if (result.timedOut) return "Timed out while running command.";
  const stderr = nonEmptyTrimmed(result.stderr);
  if (stderr) return stderr;
  const stdout = nonEmptyTrimmed(result.stdout);
  if (stdout) return stdout;
  if (result.code !== 0) {
    return `Command exited with code ${result.code}.`;
  }
  return undefined;
}

// ── Effect-native command execution ─────────────────────────────────

const collectStreamAsString = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  Stream.runFold(
    stream,
    () => "",
    (acc, chunk) => acc + new TextDecoder().decode(chunk),
  );

const runProviderCommand = (
  executable: string,
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const command = ChildProcess.make(executable, [...args], {
      shell: process.platform === "win32",
      env,
    });

    const child = yield* spawner.spawn(command);

    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        collectStreamAsString(child.stdout),
        collectStreamAsString(child.stderr),
        child.exitCode.pipe(Effect.map(Number)),
      ],
      { concurrency: "unbounded" },
    );

    return { stdout, stderr, code: exitCode } satisfies CommandResult;
  }).pipe(Effect.scoped);

const runPiCommand = (args: ReadonlyArray<string>, executable = "pi") =>
  runProviderCommand(executable, args).pipe(
    Effect.flatMap((result) =>
      isWindowsShellCommandMissingResult({ code: result.code, stderr: result.stderr })
        ? Effect.fail(new Error(`spawn ${executable} ENOENT`))
        : Effect.succeed(result),
    ),
  );

const runCommandHealthProbe = <R>(effect: Effect.Effect<CommandResult, unknown, R>) =>
  effect.pipe(
    Effect.timeoutOption(DEFAULT_TIMEOUT_MS),
    Effect.exit,
    Effect.map((exit) =>
      Exit.isSuccess(exit) ? Result.succeed(exit.value) : Result.fail(Cause.squash(exit.cause)),
    ),
  );

// ── Pi health check ─────────────────────────────────────────────────

export const checkPiProviderStatus = (
  agentDir?: string,
  binaryPath?: string,
): Effect.Effect<ServerProviderStatus, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const checkedAt = new Date().toISOString();
    const executable = nonEmptyTrimmed(binaryPath) ?? "pi";
    const versionProbe = yield* runCommandHealthProbe(runPiCommand(["--version"], executable));
    const version =
      Result.isSuccess(versionProbe) && Option.isSome(versionProbe.success)
        ? versionProbe.success.value
        : null;
    const parsedVersion =
      version && version.code === 0
        ? parseGenericCliVersion(`${version.stdout}\n${version.stderr}`)
        : null;

    try {
      const trimmedAgentDir = nonEmptyTrimmed(agentDir);
      const authStorage = trimmedAgentDir
        ? AuthStorage.create(nodePath.join(trimmedAgentDir, "auth.json"))
        : AuthStorage.create();
      const registry = trimmedAgentDir
        ? ModelRegistry.create(authStorage, nodePath.join(trimmedAgentDir, "models.json"))
        : ModelRegistry.create(authStorage);
      registry.refresh();
      const modelCount = registry.getAvailable().length;
      const authPath = trimmedAgentDir
        ? nodePath.join(trimmedAgentDir, "auth.json")
        : "~/.pi/agent/auth.json";
      return {
        provider: PI_PROVIDER,
        status: modelCount > 0 ? "ready" : "warning",
        available: modelCount > 0,
        authStatus: modelCount > 0 ? "authenticated" : "unknown",
        version: parsedVersion,
        checkedAt,
        message:
          modelCount > 0
            ? `Pi SDK is available with ${modelCount} authenticated model${modelCount === 1 ? "" : "s"}.`
            : `Pi SDK is available, but no authenticated models were found in ${authPath}.`,
      } satisfies ServerProviderStatus;
    } catch (cause) {
      return {
        provider: PI_PROVIDER,
        status: "error" as const,
        available: false,
        authStatus: "unknown" as const,
        checkedAt,
        message: `Failed to read Pi auth/model registry: ${cause instanceof Error ? cause.message : String(cause)}.`,
      } satisfies ServerProviderStatus;
    }
  });

// ── Snapshot helpers ────────────────────────────────────────────────

function providerStatusesEqual(left: ProviderStatuses, right: ProviderStatuses): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((status, index) => {
    const next = right[index];
    return (
      next !== undefined &&
      status.provider === next.provider &&
      status.status === next.status &&
      status.available === next.available &&
      status.authStatus === next.authStatus &&
      (status.authType ?? null) === (next.authType ?? null) &&
      (status.authLabel ?? null) === (next.authLabel ?? null) &&
      status.voiceTranscriptionAvailable === next.voiceTranscriptionAvailable &&
      (status.version ?? null) === (next.version ?? null) &&
      (status.message ?? null) === (next.message ?? null) &&
      JSON.stringify(status.versionAdvisory ?? null) ===
        JSON.stringify(next.versionAdvisory ?? null) &&
      JSON.stringify(status.updateState ?? null) === JSON.stringify(next.updateState ?? null)
    );
  });
}

// ── Layer ───────────────────────────────────────────────────────────

export const ProviderHealthLive = Layer.effect(
  ProviderHealth,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const serverConfig = yield* ServerConfig;
    const serverSettings = yield* ServerSettingsService;
    const changesPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ReadonlyArray<ServerProviderStatus>>(),
      PubSub.shutdown,
    );
    const refreshScope = yield* Scope.make("sequential");
    yield* Effect.addFinalizer(() => Scope.close(refreshScope, Exit.void));

    const cachePathByProvider = new Map(
      PROVIDERS.map(
        (provider) =>
          [
            provider,
            resolveProviderStatusCachePath({
              stateDir: serverConfig.stateDir,
              provider,
            }),
          ] as const,
      ),
    );

    const cachedStatuses: ProviderStatuses = yield* Effect.forEach(
      PROVIDERS,
      (provider) =>
        readProviderStatusCache(cachePathByProvider.get(provider)!).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        ),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((statuses) =>
        orderProviderStatuses(
          statuses.filter((status): status is ServerProviderStatus => status !== undefined),
        ),
      ),
    );

    const statusesRef = yield* Ref.make<ProviderStatuses>(cachedStatuses);
    const updateStatesRef = yield* Ref.make<ReadonlyMap<ProviderKind, ServerProviderUpdateState>>(
      new Map(),
    );
    const refreshFiberRef = yield* Ref.make<Fiber.Fiber<ProviderStatuses, never> | null>(null);
    const commandCoordinator = yield* makeProviderMaintenanceCommandCoordinator({
      makeAlreadyRunningError: (provider) =>
        new ServerProviderUpdateError({
          provider: provider as ProviderKind,
          reason: "An update is already running for this provider.",
        }),
    });

    const getProviderBinaryPath = (provider: ProviderKind, settings: ServerSettings) => {
      switch (provider) {
        case "pi":
          return settings.providers.pi.binaryPath;
      }
    };

    const getProviderMaintenanceCapabilities = Effect.fn("getProviderMaintenanceCapabilities")(
      function* (provider: ProviderKind) {
        const settings = yield* serverSettings.getSettings;
        const definition = PACKAGE_MANAGED_PROVIDER_UPDATES[provider];
        if (!definition) {
          return makeProviderMaintenanceCapabilities({
            provider,
            packageName: null,
            updateExecutable: null,
            updateArgs: [],
            updateLockKey: null,
          });
        }
        return yield* resolveProviderMaintenanceCapabilitiesEffect(definition, {
          binaryPath: getProviderBinaryPath(provider, settings),
          env: process.env,
          platform: process.platform,
        }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      },
    );

    const applyVolatileProviderState = Effect.fn("applyVolatileProviderState")(function* (
      status: ServerProviderStatus,
    ) {
      const updateStates = yield* Ref.get(updateStatesRef);
      const updateState = updateStates.get(status.provider);
      if (!updateState) {
        const { updateState: _updateState, ...statusWithoutUpdateState } = status;
        return statusWithoutUpdateState;
      }
      return {
        ...status,
        updateState,
      };
    });

    const setProviderUpdateState = Effect.fn("setProviderUpdateState")(function* (
      provider: ProviderKind,
      state: ServerProviderUpdateState | null,
    ) {
      yield* Ref.update(updateStatesRef, (previous) => {
        const next = new Map(previous);
        if (!state || state.status === "idle") {
          next.delete(provider);
        } else {
          next.set(provider, state);
        }
        return next;
      });

      const current = yield* Ref.get(statusesRef);
      const next = yield* Effect.forEach(current, applyVolatileProviderState, {
        concurrency: "unbounded",
      });
      yield* Ref.set(statusesRef, next);
      yield* PubSub.publish(changesPubSub, next);
      return next;
    });

    const enrichStatuses = Effect.fn("enrichProviderStatuses")(function* (
      statuses: ReadonlyArray<ServerProviderStatus>,
    ) {
      const enriched = yield* Effect.forEach(
        statuses,
        (status) =>
          getProviderMaintenanceCapabilities(status.provider).pipe(
            Effect.flatMap((capabilities) =>
              enrichProviderStatusWithVersionAdvisory(status, capabilities),
            ),
            Effect.catch(() =>
              Effect.succeed({
                ...status,
                versionAdvisory: {
                  status: "unknown" as const,
                  currentVersion: status.version ?? null,
                  latestVersion: null,
                  updateCommand: null,
                  canUpdate: false,
                  checkedAt: status.checkedAt,
                  message: null,
                },
              }),
            ),
          ),
        { concurrency: "unbounded" },
      );
      return yield* Effect.forEach(enriched, applyVolatileProviderState, {
        concurrency: "unbounded",
      });
    });

    const loadProviderStatuses = serverSettings.getSettings
      .pipe(
        Effect.flatMap((settings) =>
          checkPiProviderStatus(settings.providers.pi.agentDir, settings.providers.pi.binaryPath),
        ),
      )
      .pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.map((status) => orderProviderStatuses([status])),
        Effect.flatMap(enrichStatuses),
      );

    const persistStatuses = (statuses: ProviderStatuses) =>
      Effect.forEach(
        statuses,
        (status) => {
          const { updateState: _updateState, ...statusToPersist } = status;
          return writeProviderStatusCache({
            filePath: cachePathByProvider.get(status.provider)!,
            provider: statusToPersist,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.tapError(Effect.logError),
            Effect.ignore,
          );
        },
        { concurrency: "unbounded", discard: true },
      );

    const refreshNow = Effect.gen(function* () {
      const nextStatuses = yield* loadProviderStatuses;
      const previousStatuses = yield* Ref.get(statusesRef);
      if (providerStatusesEqual(previousStatuses, nextStatuses)) {
        yield* Ref.set(statusesRef, nextStatuses);
        return nextStatuses;
      }
      yield* Ref.set(statusesRef, nextStatuses);
      yield* persistStatuses(nextStatuses);
      yield* PubSub.publish(changesPubSub, nextStatuses);
      return nextStatuses;
    });

    // Keep a single refresh in flight so repeated config reads do not spawn
    // overlapping CLI probes while the cache already gives us a usable answer.
    const ensureRefreshFiber: Effect.Effect<Fiber.Fiber<ProviderStatuses, never>> = Effect.gen(
      function* () {
        const inFlight = yield* Ref.get(refreshFiberRef);
        if (inFlight) {
          return inFlight;
        }
        const refreshFiber = yield* Effect.gen(function* () {
          const refreshExit = yield* Effect.exit(refreshNow);
          if (Exit.isSuccess(refreshExit)) {
            return refreshExit.value;
          }
          // Keep the current in-memory snapshot as the source of truth if a
          // foreground refresh fails after startup.
          return yield* Ref.get(statusesRef);
        }).pipe(Effect.ensuring(Ref.set(refreshFiberRef, null)), Effect.forkIn(refreshScope));
        yield* Ref.set(refreshFiberRef, refreshFiber);
        return refreshFiber;
      },
    );

    yield* ensureRefreshFiber;

    const refresh: Effect.Effect<ProviderStatuses> = ensureRefreshFiber.pipe(
      Effect.flatMap(Fiber.join),
    );

    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

    const makeUpdateState = (input: {
      readonly status: ServerProviderUpdateState["status"];
      readonly startedAt: string | null;
      readonly finishedAt: string | null;
      readonly message: string | null;
      readonly output?: string | null;
    }): ServerProviderUpdateState => ({
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      message: input.message,
      output: input.output ?? null,
    });

    const describeUpdateCommandError = (error: unknown): string => {
      if (error instanceof Error && error.message.trim().length > 0) {
        if (error.message.includes("initial is not a function")) {
          return "Update command failed before producing output. Try running the provider update command from a terminal.";
        }
        return error.message;
      }
      if (typeof error === "string" && error.trim().length > 0) {
        return error;
      }
      return "Update command could not be started.";
    };

    const runUpdateCommand = Effect.fn("runProviderUpdateCommand")(function* (input: {
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly cwd?: string | undefined;
    }) {
      const child = yield* spawner.spawn(
        ChildProcess.make(input.command, [...input.args], {
          cwd: input.cwd,
          shell: process.platform === "win32",
          env: process.env,
        }),
      );
      yield* Effect.addFinalizer(() => child.kill().pipe(Effect.ignore));
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          collectUint8StreamText({
            stream: child.stdout,
            maxBytes: UPDATE_OUTPUT_MAX_BYTES,
          }),
          collectUint8StreamText({
            stream: child.stderr,
            maxBytes: UPDATE_OUTPUT_MAX_BYTES,
          }),
          child.exitCode.pipe(Effect.map(Number)),
        ],
        { concurrency: "unbounded" },
      );
      return {
        stdout: stdout.text,
        stderr: stderr.text,
        exitCode,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      };
    });

    const updateProvider: ProviderHealthShape["updateProvider"] = Effect.fn(
      "ProviderHealth.updateProvider",
    )(function* (input) {
      const provider = input.provider;
      const toUpdateError = (reason: unknown) =>
        new ServerProviderUpdateError({
          provider,
          reason: reason instanceof Error ? reason.message : String(reason),
        });
      const capabilities = yield* getProviderMaintenanceCapabilities(provider).pipe(
        Effect.mapError(toUpdateError),
      );
      const update = capabilities.update;
      if (!update) {
        return yield* new ServerProviderUpdateError({
          provider,
          reason: "This provider does not support one-click updates.",
        });
      }

      const run = Effect.gen(function* () {
        const startedAt = yield* nowIso;
        yield* setProviderUpdateState(
          provider,
          makeUpdateState({
            status: "running",
            startedAt,
            finishedAt: null,
            message: "Updating provider.",
          }),
        );

        const commandResult = yield* runUpdateCommand({
          command: update.executable,
          args: update.args,
          cwd: update.cwd,
        }).pipe(
          Effect.scoped,
          Effect.timeoutOption(Duration.millis(UPDATE_TIMEOUT_MS)),
          Effect.result,
        );
        const finishedAt = yield* nowIso;
        if (Result.isFailure(commandResult)) {
          const providers = yield* setProviderUpdateState(
            provider,
            makeUpdateState({
              status: "failed",
              startedAt,
              finishedAt,
              message: describeUpdateCommandError(commandResult.failure),
            }),
          );
          return { providers };
        }
        const result = commandResult.success;
        const output = Option.isSome(result)
          ? [result.value.stderr, result.value.stdout].filter(Boolean).join("\n\n").trim() || null
          : null;
        const failed = Option.isNone(result) || result.value.exitCode !== 0;
        if (failed) {
          const message = Option.isNone(result)
            ? "Update timed out."
            : `Update command exited with code ${result.value.exitCode}.`;
          const providers = yield* setProviderUpdateState(
            provider,
            makeUpdateState({
              status: "failed",
              startedAt,
              finishedAt,
              message,
              output: output ? output.slice(0, UPDATE_OUTPUT_MAX_BYTES) : null,
            }),
          );
          return { providers };
        }

        const providers = yield* refreshNow.pipe(Effect.mapError(toUpdateError));
        const refreshed = providers.find((status) => status.provider === provider);
        const stillOutdated = refreshed?.versionAdvisory?.status === "behind_latest";
        const isProjectDeps = update.lockKey === "project-dependencies";
        const finalProviders = yield* setProviderUpdateState(
          provider,
          makeUpdateState({
            status: stillOutdated && !isProjectDeps ? "unchanged" : "succeeded",
            startedAt,
            finishedAt,
            message:
              stillOutdated && !isProjectDeps
                ? "Update command completed, but Peak Code still detects an outdated provider version."
                : isProjectDeps
                  ? "Project dependencies updated."
                  : "Provider updated.",
            output: output ? output.slice(0, UPDATE_OUTPUT_MAX_BYTES) : null,
          }),
        );
        return { providers: finalProviders };
      });

      return yield* commandCoordinator.withCommandLock({
        targetKey: provider,
        lockKey: update.lockKey,
        onQueued: setProviderUpdateState(
          provider,
          makeUpdateState({
            status: "queued",
            startedAt: null,
            finishedAt: null,
            message: "Waiting for another provider update to finish.",
          }),
        ).pipe(Effect.asVoid),
        run,
      });
    });

    return {
      // Mirror upstream's behavior here: reads consume the latest stable
      // snapshot, while refreshes happen explicitly or from provider streams.
      getStatuses: Ref.get(statusesRef),
      refresh,
      updateProvider,
      get streamChanges() {
        return Stream.fromPubSub(changesPubSub);
      },
    } satisfies ProviderHealthShape;
  }),
);
