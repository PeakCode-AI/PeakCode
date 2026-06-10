#!/usr/bin/env node

import { homedir } from "node:os";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { NetService } from "@peakcode/shared/Net";
import { Config, Data, Effect, Hash, Layer, Logger, Option, Path, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";

const BASE_SERVER_PORT = 3773;
const BASE_WEB_PORT = 5733;
const MAX_HASH_OFFSET = 3000;
const MAX_PORT = 65535;

export const DEFAULT_T3_HOME = Effect.map(Effect.service(Path.Path), (path) =>
  path.join(homedir(), ".peakcode"),
);

const MODE_ARGS = {
  dev: [
    "run",
    "dev",
    "--ui=tui",
    "--filter=@peakcode/contracts",
    "--filter=@peakcode/web",
    "--filter=peakcode",
    "--parallel",
  ],
  "dev:server": ["run", "dev", "--filter=peakcode"],
  "dev:web": ["run", "dev", "--filter=@peakcode/web"],
  "dev:desktop": [
    "run",
    "dev",
    "--filter=@peakcode/desktop",
    "--filter=@peakcode/web",
    "--parallel",
  ],
  "dev:win": [
    "run",
    "dev",
    "--ui=tui",
    "--filter=@peakcode/contracts",
    "--filter=@peakcode/web",
    "--parallel",
  ],
} as const satisfies Record<string, ReadonlyArray<string>>;

type DevMode = keyof typeof MODE_ARGS;
type PortAvailabilityCheck<R = never> = (port: number) => Effect.Effect<boolean, never, R>;

const DEV_RUNNER_MODES = Object.keys(MODE_ARGS) as Array<DevMode>;

class DevRunnerError extends Data.TaggedError("DevRunnerError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const optionalStringConfig = (name: string): Config.Config<string | undefined> =>
  Config.string(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalBooleanConfig = (name: string): Config.Config<boolean | undefined> =>
  Config.boolean(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalPortConfig = (name: string): Config.Config<number | undefined> =>
  Config.port(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalIntegerConfig = (name: string): Config.Config<number | undefined> =>
  Config.int(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalUrlConfig = (name: string): Config.Config<URL | undefined> =>
  Config.url(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );

const OffsetConfig = Config.all({
  portOffset: optionalIntegerConfig("PEAKCODE_PORT_OFFSET"),
  devInstance: optionalStringConfig("PEAKCODE_DEV_INSTANCE"),
});

export function resolveOffset(config: {
  readonly portOffset: number | undefined;
  readonly devInstance: string | undefined;
}): { readonly offset: number; readonly source: string } {
  if (config.portOffset !== undefined) {
    if (config.portOffset < 0) {
      throw new Error(`Invalid PEAKCODE_PORT_OFFSET: ${config.portOffset}`);
    }
    return {
      offset: config.portOffset,
      source: `PEAKCODE_PORT_OFFSET=${config.portOffset}`,
    };
  }

  const seed = config.devInstance?.trim();
  if (!seed) {
    return { offset: 0, source: "default ports" };
  }

  if (/^\d+$/.test(seed)) {
    return { offset: Number(seed), source: `numeric PEAKCODE_DEV_INSTANCE=${seed}` };
  }

  const offset = ((Hash.string(seed) >>> 0) % MAX_HASH_OFFSET) + 1;
  return { offset, source: `hashed PEAKCODE_DEV_INSTANCE=${seed}` };
}

function resolveBaseDir(baseDir: string | undefined): Effect.Effect<string, never, Path.Path> {
  return Effect.gen(function* () {
    const path = yield* Path.Path;
    const configured = baseDir?.trim();

    if (configured) {
      return path.resolve(configured);
    }

    return yield* DEFAULT_T3_HOME;
  });
}

interface CreateDevRunnerEnvInput {
  readonly mode: DevMode;
  readonly baseEnv: NodeJS.ProcessEnv;
  readonly serverOffset: number;
  readonly webOffset: number;
  readonly t3Home: string | undefined;
  readonly authToken: string | undefined;
  readonly noBrowser: boolean | undefined;
  readonly autoBootstrapProjectFromCwd: boolean | undefined;
  readonly logWebSocketEvents: boolean | undefined;
  readonly host: string | undefined;
  readonly port: number | undefined;
  readonly devUrl: URL | undefined;
}

export function createDevRunnerEnv({
  mode,
  baseEnv,
  serverOffset,
  webOffset,
  t3Home,
  authToken,
  noBrowser,
  autoBootstrapProjectFromCwd,
  logWebSocketEvents,
  host,
  port,
  devUrl,
}: CreateDevRunnerEnvInput): Effect.Effect<NodeJS.ProcessEnv, never, Path.Path> {
  return Effect.gen(function* () {
    const serverPort = port ?? BASE_SERVER_PORT + serverOffset;
    const webPort = BASE_WEB_PORT + webOffset;
    const resolvedBaseDir = yield* resolveBaseDir(t3Home);

    const output: NodeJS.ProcessEnv = {
      ...baseEnv,
      PEAKCODE_PORT: String(serverPort),
      PORT: String(webPort),
      ELECTRON_RENDERER_PORT: String(webPort),
      VITE_WS_URL: `ws://[::1]:${serverPort}`,
      VITE_DEV_SERVER_URL: devUrl?.toString() ?? `http://localhost:${webPort}`,
      PEAKCODE_HOME: resolvedBaseDir,
    };

    if (host !== undefined) {
      output.PEAKCODE_HOST = host;
    }

    if (authToken !== undefined) {
      output.PEAKCODE_AUTH_TOKEN = authToken;
    } else {
      delete output.PEAKCODE_AUTH_TOKEN;
    }

    if (noBrowser !== undefined) {
      output.PEAKCODE_NO_BROWSER = noBrowser ? "1" : "0";
    } else {
      delete output.PEAKCODE_NO_BROWSER;
    }

    if (autoBootstrapProjectFromCwd !== undefined) {
      output.PEAKCODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD = autoBootstrapProjectFromCwd ? "1" : "0";
    } else {
      delete output.PEAKCODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD;
    }

    if (logWebSocketEvents !== undefined) {
      output.PEAKCODE_LOG_WS_EVENTS = logWebSocketEvents ? "1" : "0";
    } else {
      delete output.PEAKCODE_LOG_WS_EVENTS;
    }

    if (mode === "dev" || mode === "dev:win") {
      output.PEAKCODE_MODE = "web";
      delete output.PEAKCODE_DESKTOP_WS_URL;
    }

    if (mode === "dev:server" || mode === "dev:web") {
      output.PEAKCODE_MODE = "web";
      delete output.PEAKCODE_DESKTOP_WS_URL;
    }

    return output;
  });
}

function portPairForOffset(offset: number): {
  readonly serverPort: number;
  readonly webPort: number;
} {
  return {
    serverPort: BASE_SERVER_PORT + offset,
    webPort: BASE_WEB_PORT + offset,
  };
}

const defaultCheckPortAvailability: PortAvailabilityCheck<NetService> = (port) =>
  Effect.gen(function* () {
    const net = yield* NetService;
    return yield* net.isPortAvailableOnLoopback(port);
  });

interface FindFirstAvailableOffsetInput<R = NetService> {
  readonly startOffset: number;
  readonly requireServerPort: boolean;
  readonly requireWebPort: boolean;
  readonly checkPortAvailability?: PortAvailabilityCheck<R>;
}

export function findFirstAvailableOffset<R = NetService>({
  startOffset,
  requireServerPort,
  requireWebPort,
  checkPortAvailability,
}: FindFirstAvailableOffsetInput<R>): Effect.Effect<number, DevRunnerError, R> {
  return Effect.gen(function* () {
    const checkPort = (checkPortAvailability ??
      defaultCheckPortAvailability) as PortAvailabilityCheck<R>;

    for (let candidate = startOffset; ; candidate += 1) {
      const { serverPort, webPort } = portPairForOffset(candidate);
      const serverPortOutOfRange = serverPort > MAX_PORT;
      const webPortOutOfRange = webPort > MAX_PORT;

      if (
        (requireServerPort && serverPortOutOfRange) ||
        (requireWebPort && webPortOutOfRange) ||
        (!requireServerPort && !requireWebPort && (serverPortOutOfRange || webPortOutOfRange))
      ) {
        break;
      }

      const checks: Array<Effect.Effect<boolean, never, R>> = [];
      if (requireServerPort) {
        checks.push(checkPort(serverPort));
      }
      if (requireWebPort) {
        checks.push(checkPort(webPort));
      }

      if (checks.length === 0) {
        return candidate;
      }

      const availability = yield* Effect.all(checks);
      if (availability.every(Boolean)) {
        return candidate;
      }
    }

    return yield* new DevRunnerError({
      message: `No available dev ports found from offset ${startOffset}. Tried server=${BASE_SERVER_PORT}+n web=${BASE_WEB_PORT}+n up to port ${MAX_PORT}.`,
    });
  });
}

interface ResolveModePortOffsetsInput<R = NetService> {
  readonly mode: DevMode;
  readonly startOffset: number;
  readonly hasExplicitServerPort: boolean;
  readonly hasExplicitDevUrl: boolean;
  readonly checkPortAvailability?: PortAvailabilityCheck<R>;
}

export function resolveModePortOffsets<R = NetService>({
  mode,
  startOffset,
  hasExplicitServerPort,
  hasExplicitDevUrl,
  checkPortAvailability,
}: ResolveModePortOffsetsInput<R>): Effect.Effect<
  { readonly serverOffset: number; readonly webOffset: number },
  DevRunnerError,
  R
> {
  return Effect.gen(function* () {
    const checkPort = (checkPortAvailability ??
      defaultCheckPortAvailability) as PortAvailabilityCheck<R>;

    if (mode === "dev:web") {
      if (hasExplicitDevUrl) {
        return { serverOffset: startOffset, webOffset: startOffset };
      }

      const webOffset = yield* findFirstAvailableOffset({
        startOffset,
        requireServerPort: false,
        requireWebPort: true,
        checkPortAvailability: checkPort,
      });
      return { serverOffset: startOffset, webOffset };
    }

    if (mode === "dev:server") {
      if (hasExplicitServerPort) {
        return { serverOffset: startOffset, webOffset: startOffset };
      }

      const serverOffset = yield* findFirstAvailableOffset({
        startOffset,
        requireServerPort: true,
        requireWebPort: false,
        checkPortAvailability: checkPort,
      });
      return { serverOffset, webOffset: serverOffset };
    }

    const sharedOffset = yield* findFirstAvailableOffset({
      startOffset,
      requireServerPort: !hasExplicitServerPort,
      requireWebPort: !hasExplicitDevUrl,
      checkPortAvailability: checkPort,
    });

    return { serverOffset: sharedOffset, webOffset: sharedOffset };
  });
}

interface DevRunnerCliInput {
  readonly mode: DevMode;
  readonly t3Home: string | undefined;
  readonly authToken: string | undefined;
  readonly noBrowser: boolean | undefined;
  readonly autoBootstrapProjectFromCwd: boolean | undefined;
  readonly logWebSocketEvents: boolean | undefined;
  readonly host: string | undefined;
  readonly port: number | undefined;
  readonly devUrl: URL | undefined;
  readonly dryRun: boolean;
  readonly turboArgs: ReadonlyArray<string>;
}

const readOptionalBooleanEnv = (name: string): boolean | undefined => {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }
  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }
  return undefined;
};

const resolveOptionalBooleanOverride = (
  explicitValue: boolean | undefined,
  envValue: boolean | undefined,
): boolean | undefined => {
  if (explicitValue === true) {
    return true;
  }

  if (explicitValue === false) {
    return envValue;
  }

  return envValue;
};

export function runDevRunnerWithInput(input: DevRunnerCliInput) {
  return Effect.gen(function* () {
    const { portOffset, devInstance } = yield* OffsetConfig.asEffect().pipe(
      Effect.mapError(
        (cause) =>
          new DevRunnerError({
            message: "Failed to read PEAKCODE_PORT_OFFSET/PEAKCODE_DEV_INSTANCE configuration.",
            cause,
          }),
      ),
    );

    const { offset, source } = yield* Effect.try({
      try: () => resolveOffset({ portOffset, devInstance }),
      catch: (cause) =>
        new DevRunnerError({
          message: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    });

    const envOverrides = {
      noBrowser: readOptionalBooleanEnv("PEAKCODE_NO_BROWSER"),
      autoBootstrapProjectFromCwd: readOptionalBooleanEnv(
        "PEAKCODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD",
      ),
      logWebSocketEvents: readOptionalBooleanEnv("PEAKCODE_LOG_WS_EVENTS"),
    };

    const { serverOffset, webOffset } = yield* resolveModePortOffsets({
      mode: input.mode,
      startOffset: offset,
      hasExplicitServerPort: input.port !== undefined,
      hasExplicitDevUrl: input.devUrl !== undefined,
    });

    const env = yield* createDevRunnerEnv({
      mode: input.mode,
      baseEnv: process.env,
      serverOffset,
      webOffset,
      t3Home: input.t3Home,
      authToken: input.authToken,
      noBrowser: resolveOptionalBooleanOverride(input.noBrowser, envOverrides.noBrowser),
      autoBootstrapProjectFromCwd: resolveOptionalBooleanOverride(
        input.autoBootstrapProjectFromCwd,
        envOverrides.autoBootstrapProjectFromCwd,
      ),
      logWebSocketEvents: resolveOptionalBooleanOverride(
        input.logWebSocketEvents,
        envOverrides.logWebSocketEvents,
      ),
      host: input.host,
      port: input.port,
      devUrl: input.devUrl,
    });

    const selectionSuffix =
      serverOffset !== offset || webOffset !== offset
        ? ` selectedOffset(server=${serverOffset},web=${webOffset})`
        : "";

    yield* Effect.logInfo(
      `[dev-runner] mode=${input.mode} source=${source}${selectionSuffix} serverPort=${String(env.PEAKCODE_PORT)} webPort=${String(env.PORT)} baseDir=${String(env.PEAKCODE_HOME)}`,
    );

    if (input.dryRun) {
      return;
    }

    // On Windows the server must run on Node.js because Bun does not
    // implement ConPTY.  When the user runs `dev` on Windows — or explicitly
    // runs `dev:win` — we split into two processes: turbo drives contracts +
    // Vite, and Node.js runs the pre-built server directly.
    const useWinSplit =
      input.mode === "dev:win" ||
      (input.mode === "dev" && process.platform === "win32");

    if (useWinSplit) {
      const pathService = yield* Path.Path;
      const serverCwd = pathService.join(process.cwd(), "apps", "server");
      const serverScript = pathService.join(serverCwd, "dist", "index.mjs");

      const common = {
        stdin: "inherit" as const,
        stdout: "inherit" as const,
        stderr: "inherit" as const,
        env,
        extendEnv: false as const,
        detached: false as const,
        forceKillAfter: "1500 millis" as const,
      };

      const turboChild = yield* ChildProcess.make(
        "turbo",
        [...MODE_ARGS["dev:win"], ...input.turboArgs],
        { ...common, shell: process.platform === "win32" },
      );

      const serverChild = yield* ChildProcess.make("node", [serverScript], {
        ...common,
        cwd: serverCwd,
      });

      const [turboExit, serverExit] = yield* Effect.all(
        [turboChild.exitCode, serverChild.exitCode],
        { concurrency: "unbounded" },
      );

      if (turboExit !== 0 || serverExit !== 0) {
        const parts: Array<string> = [];
        if (turboExit !== 0) parts.push(`turbo exited with code ${turboExit}`);
        if (serverExit !== 0) parts.push(`server exited with code ${serverExit}`);
        return yield* new DevRunnerError({
          message: parts.join("; "),
        });
      }
    } else {
      const child = yield* ChildProcess.make(
        "turbo",
        [...MODE_ARGS[input.mode], ...input.turboArgs],
        {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          env,
          extendEnv: false,
          // Windows needs shell mode to resolve .cmd shims (e.g. bun.cmd).
          shell: process.platform === "win32",
          // Keep turbo in the same process group so terminal signals (Ctrl+C)
          // reach it directly. Effect defaults to detached: true on non-Windows,
          // which would put turbo in a new group and require manual forwarding.
          detached: false,
          forceKillAfter: "1500 millis",
        },
      );

      const exitCode = yield* child.exitCode;
      if (exitCode !== 0) {
        return yield* new DevRunnerError({
          message: `turbo exited with code ${exitCode}`,
        });
      }
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof DevRunnerError
        ? cause
        : new DevRunnerError({
            message: cause instanceof Error ? cause.message : "dev-runner failed",
            cause,
          }),
    ),
  );
}

const devRunnerCli = Command.make("dev-runner", {
  mode: Argument.choice("mode", DEV_RUNNER_MODES).pipe(
    Argument.withDescription("Development mode to run."),
  ),
  t3Home: Flag.string("home-dir").pipe(
    Flag.withDescription("Base directory for all Peak Code data (equivalent to PEAKCODE_HOME)."),
    Flag.withFallbackConfig(optionalStringConfig("PEAKCODE_HOME")),
  ),
  authToken: Flag.string("auth-token").pipe(
    Flag.withDescription("Auth token (forwards to PEAKCODE_AUTH_TOKEN)."),
    Flag.withAlias("token"),
    Flag.withFallbackConfig(optionalStringConfig("PEAKCODE_AUTH_TOKEN")),
  ),
  noBrowser: Flag.boolean("no-browser").pipe(
    Flag.withDescription("Browser auto-open toggle (equivalent to PEAKCODE_NO_BROWSER)."),
    Flag.withFallbackConfig(optionalBooleanConfig("PEAKCODE_NO_BROWSER")),
  ),
  autoBootstrapProjectFromCwd: Flag.boolean("auto-bootstrap-project-from-cwd").pipe(
    Flag.withDescription(
      "Auto-bootstrap toggle (equivalent to PEAKCODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD).",
    ),
    Flag.withFallbackConfig(optionalBooleanConfig("PEAKCODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD")),
  ),
  logWebSocketEvents: Flag.boolean("log-websocket-events").pipe(
    Flag.withDescription("WebSocket event logging toggle (equivalent to PEAKCODE_LOG_WS_EVENTS)."),
    Flag.withAlias("log-ws-events"),
    Flag.withFallbackConfig(optionalBooleanConfig("PEAKCODE_LOG_WS_EVENTS")),
  ),
  host: Flag.string("host").pipe(
    Flag.withDescription("Server host/interface override (forwards to PEAKCODE_HOST)."),
    Flag.withFallbackConfig(optionalStringConfig("PEAKCODE_HOST")),
  ),
  port: Flag.integer("port").pipe(
    Flag.withSchema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
    Flag.withDescription("Server port override (forwards to PEAKCODE_PORT)."),
    Flag.withFallbackConfig(optionalPortConfig("PEAKCODE_PORT")),
  ),
  devUrl: Flag.string("dev-url").pipe(
    Flag.withSchema(Schema.URLFromString),
    Flag.withDescription("Web dev URL override (forwards to VITE_DEV_SERVER_URL)."),
    Flag.withFallbackConfig(optionalUrlConfig("VITE_DEV_SERVER_URL")),
  ),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Resolve mode/ports/env and print, but do not spawn turbo."),
    Flag.withDefault(false),
  ),
  turboArgs: Argument.string("turbo-arg").pipe(
    Argument.withDescription("Additional turbo args (pass after `--`)."),
    Argument.variadic(),
  ),
}).pipe(
  Command.withDescription("Run monorepo development modes with deterministic port/env wiring."),
  Command.withHandler((input) => runDevRunnerWithInput(input)),
);

const cliRuntimeLayer = Layer.mergeAll(
  Logger.layer([Logger.consolePretty()]),
  NodeServices.layer,
  NetService.layer,
);

const runtimeProgram = Command.run(devRunnerCli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide(cliRuntimeLayer),
);

if (import.meta.main) {
  NodeRuntime.runMain(runtimeProgram);
}
