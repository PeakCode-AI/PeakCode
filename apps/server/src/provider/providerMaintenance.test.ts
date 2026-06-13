import { describe, it, assert } from "@effect/vitest";
import { Effect } from "effect";

import {
  createProviderVersionAdvisory,
  invalidateLatestProviderVersionCache,
  parseGenericCliVersion,
  resolvePackageManagedProviderMaintenance,
  resolveLatestProviderVersion,
  type PackageManagedProviderMaintenanceDefinition,
} from "./providerMaintenance";

const CODEX_DEFINITION = {
  provider: "codex",
  binaryName: "codex",
  npmPackageName: "@openai/codex",
  homebrew: { name: "codex", kind: "cask" },
  nativeUpdate: null,
} as const satisfies PackageManagedProviderMaintenanceDefinition;

const OPENCODE_DEFINITION = {
  provider: "opencode",
  binaryName: "opencode",
  npmPackageName: "opencode-ai",
  homebrew: { name: "anomalyco/tap/opencode", kind: "formula" },
  latestVersionSource: { kind: "npm", name: "opencode-ai" },
  nativeUpdate: {
    executable: "opencode",
    args: (installSource) =>
      installSource === "unknown" || installSource === "native"
        ? ["upgrade"]
        : ["upgrade", "--method", installSource],
    lockKey: "opencode-native",
    strategy: "always",
    excludedInstallSources: ["homebrew"],
  },
} as const satisfies PackageManagedProviderMaintenanceDefinition;

const PI_DEFINITION = {
  provider: "pi",
  binaryName: "pi",
  npmPackageName: "@earendil-works/pi-coding-agent",
  homebrew: null,
  nativeUpdate: {
    executable: "pi",
    args: () => ["update"],
    lockKey: "pi-native",
    strategy: "always",
  },
} as const satisfies PackageManagedProviderMaintenanceDefinition;

describe("providerMaintenance", () => {
  it("parses generic CLI versions", () => {
    assert.strictEqual(parseGenericCliVersion("codex-cli 0.130.0\n"), "0.130.0");
    assert.strictEqual(parseGenericCliVersion("claude 2.1\n"), "2.1.0");
    assert.strictEqual(parseGenericCliVersion("no version here"), null);
  });

  it("resolves npm global update commands for unqualified binaries", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(CODEX_DEFINITION, {
      binaryPath: "codex",
      realCommandPath: "/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "npm install -g @openai/codex@latest",
      executable: "npm",
      args: ["install", "-g", "@openai/codex@latest"],
      lockKey: "npm-global",
    });
  });

  it("does not guess an update command for unclassified binaries", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(CODEX_DEFINITION, {
      binaryPath: "/custom/bin/codex",
      realCommandPath: "/custom/bin/codex",
    });

    assert.strictEqual(capabilities.update, null);
  });

  it("resolves Homebrew cask update commands", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(CODEX_DEFINITION, {
      binaryPath: "/opt/homebrew/bin/codex",
      realCommandPath: "/opt/homebrew/Caskroom/codex/0.130.0/codex",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "brew upgrade --cask codex",
      executable: "brew",
      args: ["upgrade", "--cask", "codex"],
      lockKey: "homebrew",
    });
    assert.strictEqual(capabilities.packageName, null);
  });

  it("uses provider-native update commands with detected install method", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(OPENCODE_DEFINITION, {
      binaryPath: "opencode",
      realCommandPath: "/Users/test/.local/share/pnpm/opencode",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "opencode upgrade --method pnpm",
      executable: "opencode",
      args: ["upgrade", "--method", "pnpm"],
      lockKey: "opencode-native",
    });
  });

  it("does not self-update project-local package bin shims", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_DEFINITION, {
      binaryPath: "/repo/apps/server/node_modules/.bin/pi",
      realCommandPath: "/repo/apps/server/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    });

    assert.strictEqual(capabilities.update, null);
  });

  it("uses the resolved global executable for native provider updates", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_DEFINITION, {
      binaryPath: "/Users/test/.bun/bin/pi",
      realCommandPath:
        "/Users/test/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "/Users/test/.bun/bin/pi update",
      executable: "/Users/test/.bun/bin/pi",
      args: ["update"],
      lockKey: "pi-native",
    });
  });

  it("uses Homebrew directly for tapped OpenCode installs", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(OPENCODE_DEFINITION, {
      binaryPath: "opencode",
      realCommandPath: "/opt/homebrew/Cellar/opencode/1.14.46/bin/opencode",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "brew upgrade anomalyco/tap/opencode",
      executable: "brew",
      args: ["upgrade", "anomalyco/tap/opencode"],
      lockKey: "homebrew",
    });
    assert.deepStrictEqual(capabilities.latestVersionSource, {
      kind: "npm",
      name: "opencode-ai",
    });
  });

  it("marks older semver versions as behind latest", () => {
    const advisory = createProviderVersionAdvisory({
      provider: "codex",
      currentVersion: "0.129.0",
      latestVersion: "0.130.0",
    });

    assert.strictEqual(advisory.status, "behind_latest");
    assert.strictEqual(advisory.currentVersion, "0.129.0");
    assert.strictEqual(advisory.latestVersion, "0.130.0");
  });

  it("invalidates cached latest provider versions after updates", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ version: `0.13${callCount}.0` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const capabilities = resolvePackageManagedProviderMaintenance(CODEX_DEFINITION, {
      binaryPath: "codex",
      realCommandPath: "/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex",
    });

    try {
      assert.strictEqual(
        await Effect.runPromise(resolveLatestProviderVersion(capabilities)),
        "0.131.0",
      );
      assert.strictEqual(
        await Effect.runPromise(resolveLatestProviderVersion(capabilities)),
        "0.131.0",
      );
      assert.strictEqual(callCount, 1);

      invalidateLatestProviderVersionCache(capabilities);

      assert.strictEqual(
        await Effect.runPromise(resolveLatestProviderVersion(capabilities)),
        "0.132.0",
      );
      assert.strictEqual(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateLatestProviderVersionCache(capabilities);
    }
  });
});
