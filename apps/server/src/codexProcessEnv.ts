// FILE: codexProcessEnv.ts
// Purpose: Builds the exact environment used when Peak Code launches Codex subprocesses.
// Layer: Server runtime utility
// Exports: Codex process env builder and browser-plugin overlay helpers.
// Depends on: Codex home path helpers, shared Codex config parsing, login-shell env reader.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { readActiveCodexProviderEnvKey } from "@peakcode/shared/codexConfig";
import {
  readEnvironmentFromLoginShell,
  resolveLoginShell,
  type ShellEnvironmentReader,
} from "@peakcode/shared/shell";

import {
  resolveBaseCodexHomePath,
  resolvePeakCodeCodexHomeOverlayPath,
  shouldDisablePeakCodeBrowserPlugin,
} from "./codexHomePaths.ts";

const CODEX_PROCESS_SHELL_ENV_NAMES = ["PATH", "SSH_AUTH_SOCK"] as const;
const NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS = "NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS";
const PEAKCODE_BROWSER_PLUGIN_CONFIG_HEADER = '[plugins."peakcode-browser@local"]';
const PEAKCODE_GATEWAY_PROVIDER_ID = "peakcode-gateway";
const PEAKCODE_GATEWAY_API_KEY_ENV = "PEAKCODE_GATEWAY_API_KEY";

export interface CodexGatewayProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export function resolveCodexBrowserUsePipePath(
  input: {
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
  } = {},
): string {
  const env = input.env ?? process.env;
  const configured =
    env.PEAKCODE_BROWSER_USE_PIPE_PATH?.trim() || env.PEAKCODE_BROWSER_USE_PIPE_PATH_LEGACY?.trim();
  if (configured) {
    return configured;
  }
  return (input.platform ?? process.platform) === "win32"
    ? String.raw`\\.\pipe\codex-browser-use`
    : "/tmp/codex-browser-use.sock";
}

export function disablePeakCodeBrowserPluginInCodexConfig(config: string): string {
  const lines = config.split(/\r?\n/);
  const output: string[] = [];
  let inTargetSection = false;
  let sawTargetSection = false;
  let targetSectionHasEnabled = false;

  const closeTargetSection = () => {
    if (inTargetSection && !targetSectionHasEnabled) {
      output.push("enabled = false");
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      closeTargetSection();
      inTargetSection = trimmed === PEAKCODE_BROWSER_PLUGIN_CONFIG_HEADER;
      sawTargetSection ||= inTargetSection;
      targetSectionHasEnabled = false;
      output.push(line);
      continue;
    }

    if (inTargetSection && /^\s*enabled\s*=/.test(line)) {
      output.push("enabled = false");
      targetSectionHasEnabled = true;
      continue;
    }

    output.push(line);
  }

  closeTargetSection();

  if (!sawTargetSection) {
    if (output.length > 0 && output.at(-1)?.trim()) {
      output.push("");
    }
    output.push(PEAKCODE_BROWSER_PLUGIN_CONFIG_HEADER, "enabled = false");
  }

  return output.join("\n");
}

export function configurePeakCodeGatewayProviderInCodexConfig(
  config: string,
  gateway: CodexGatewayProviderConfig,
): string {
  const lines = config.split(/\r?\n/);
  const output: string[] = [];
  let insertedModelProvider = false;
  let inTopLevel = true;
  let inGatewayProviderSection = false;
  let skippingGatewayProviderSection = false;

  const insertModelProvider = () => {
    if (insertedModelProvider) return;
    output.push(`model_provider = "${PEAKCODE_GATEWAY_PROVIDER_ID}"`);
    insertedModelProvider = true;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const startsSection = trimmed.startsWith("[") && trimmed.endsWith("]");

    if (startsSection) {
      inTopLevel = false;
      if (!insertedModelProvider) {
        insertModelProvider();
      }
      inGatewayProviderSection =
        trimmed === `[model_providers.${PEAKCODE_GATEWAY_PROVIDER_ID}]` ||
        trimmed === `[model_providers."${PEAKCODE_GATEWAY_PROVIDER_ID}"]`;
      skippingGatewayProviderSection = inGatewayProviderSection;
      if (skippingGatewayProviderSection) {
        continue;
      }
      output.push(line);
      continue;
    }

    if (skippingGatewayProviderSection) {
      continue;
    }

    if (inTopLevel && /^\s*model_provider\s*=/.test(line)) {
      insertModelProvider();
      continue;
    }

    output.push(line);
  }

  if (!insertedModelProvider) {
    insertModelProvider();
  }

  if (output.length > 0 && output.at(-1)?.trim()) {
    output.push("");
  }
  output.push(
    `[model_providers.${PEAKCODE_GATEWAY_PROVIDER_ID}]`,
    'name = "PeakCode Gateway"',
    `base_url = "${gateway.baseUrl.replaceAll('"', '\\"')}"`,
    `env_key = "${PEAKCODE_GATEWAY_API_KEY_ENV}"`,
  );

  return output.join("\n");
}

export function removePeakCodeGatewayProviderFromCodexConfig(config: string): string {
  const lines = config.split(/\r?\n/);
  const output: string[] = [];
  let skippingGatewayProviderSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const startsSection = trimmed.startsWith("[") && trimmed.endsWith("]");

    if (startsSection) {
      skippingGatewayProviderSection =
        trimmed === `[model_providers.${PEAKCODE_GATEWAY_PROVIDER_ID}]` ||
        trimmed === `[model_providers."${PEAKCODE_GATEWAY_PROVIDER_ID}"]`;
      if (skippingGatewayProviderSection) {
        continue;
      }
    }

    if (skippingGatewayProviderSection) {
      continue;
    }

    if (
      /^\s*model_provider\s*=/.test(line) &&
      line.includes(`"${PEAKCODE_GATEWAY_PROVIDER_ID}"`)
    ) {
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function preparePeakCodeCodexHomeOverlay(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly homePath?: string;
  readonly gatewayProvider?: CodexGatewayProviderConfig;
}): string | undefined {
  const sourceHomePath = resolveBaseCodexHomePath(input.env, input.homePath);
  const overlayHomePath = resolvePeakCodeCodexHomeOverlayPath(input.env, sourceHomePath);
  if (path.resolve(sourceHomePath) === path.resolve(overlayHomePath) && !input.gatewayProvider) {
    return undefined;
  }

  mkdirSync(overlayHomePath, { recursive: true });

  try {
    for (const entry of readdirSync(sourceHomePath)) {
      if (entry === "config.toml") {
        continue;
      }
      const sourcePath = path.join(sourceHomePath, entry);
      const targetPath = path.join(overlayHomePath, entry);
      if (existsSync(targetPath)) {
        continue;
      }
      const stat = lstatSync(sourcePath);
      symlinkSync(sourcePath, targetPath, stat.isDirectory() ? "dir" : "file");
    }
  } catch {
    // If the source home is partially missing, Codex can still start with the
    // overlay config and create any required state lazily.
  }

  const sourceConfigPath = path.join(sourceHomePath, "config.toml");
  const sourceConfig = existsSync(sourceConfigPath) ? readFileSync(sourceConfigPath, "utf8") : "";
  const overlayConfig = input.gatewayProvider
    ? configurePeakCodeGatewayProviderInCodexConfig(sourceConfig, input.gatewayProvider)
    : disablePeakCodeBrowserPluginInCodexConfig(
        removePeakCodeGatewayProviderFromCodexConfig(sourceConfig),
      );
  writeFileSync(
    path.join(overlayHomePath, "config.toml"),
    disablePeakCodeBrowserPluginInCodexConfig(overlayConfig),
    "utf8",
  );

  return overlayHomePath;
}

export function buildCodexProcessEnv(
  input: {
    readonly env?: NodeJS.ProcessEnv;
    readonly homePath?: string;
    readonly platform?: NodeJS.Platform;
    readonly readEnvironment?: ShellEnvironmentReader;
    readonly gatewayProvider?: CodexGatewayProviderConfig;
  } = {},
): NodeJS.ProcessEnv {
  const baseEnv = { ...(input.env ?? process.env) };
  const overlayHomePath = shouldDisablePeakCodeBrowserPlugin(baseEnv) || input.gatewayProvider
    ? preparePeakCodeCodexHomeOverlay({
        env: baseEnv,
        ...(input.homePath ? { homePath: input.homePath } : {}),
        ...(input.gatewayProvider ? { gatewayProvider: input.gatewayProvider } : {}),
      })
    : undefined;
  const effectiveEnv =
    overlayHomePath || input.homePath
      ? { ...baseEnv, CODEX_HOME: overlayHomePath ?? input.homePath }
      : baseEnv;
  if (input.gatewayProvider) {
    effectiveEnv[PEAKCODE_GATEWAY_API_KEY_ENV] = input.gatewayProvider.apiKey;
  }
  const platform = input.platform ?? process.platform;

  if (platform === "darwin" || platform === "linux") {
    try {
      const shell = resolveLoginShell(platform, effectiveEnv.SHELL);
      const providerEnvKey = readActiveCodexProviderEnvKey(effectiveEnv);
      if (shell && providerEnvKey && !effectiveEnv[providerEnvKey]?.trim()) {
        const shellEnvironment = (input.readEnvironment ?? readEnvironmentFromLoginShell)(shell, [
          ...CODEX_PROCESS_SHELL_ENV_NAMES,
          providerEnvKey,
        ]);

        if (shellEnvironment.PATH) {
          effectiveEnv.PATH = shellEnvironment.PATH;
        }
        if (!effectiveEnv.SSH_AUTH_SOCK && shellEnvironment.SSH_AUTH_SOCK) {
          effectiveEnv.SSH_AUTH_SOCK = shellEnvironment.SSH_AUTH_SOCK;
        }
        if (shellEnvironment[providerEnvKey]) {
          effectiveEnv[providerEnvKey] = shellEnvironment[providerEnvKey];
        }
      }
    } catch {
      // Keep inherited environment if shell lookup fails.
    }
  }

  if (platform !== "win32") {
    const browserUsePipePath = resolveCodexBrowserUsePipePath({ env: effectiveEnv, platform });
    const allowedSockets =
      effectiveEnv[NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS]
        ?.split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) ?? [];
    if (!allowedSockets.includes(browserUsePipePath)) {
      effectiveEnv[NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS] = [
        ...allowedSockets,
        browserUsePipePath,
      ].join(",");
    }
  }

  return effectiveEnv;
}
