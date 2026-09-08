import { describe, it, assert } from "@effect/vitest";

import {
  createProviderVersionAdvisory,
  parseGenericCliVersion,
  resolvePackageManagedProviderMaintenance,
  type PackageManagedProviderMaintenanceDefinition,
} from "./providerMaintenance";

const PI_DEFINITION = {
  provider: "pi",
  binaryName: "pi",
  npmPackageName: "@earendil-works/pi-coding-agent",
  homebrew: { name: "pi", kind: "cask" },
  nativeUpdate: null,
} as const satisfies PackageManagedProviderMaintenanceDefinition;

const PI_NATIVE_DEFINITION = {
  provider: "pi",
  binaryName: "pi",
  npmPackageName: "@earendil-works/pi-coding-agent",
  homebrew: { name: "pi", kind: "formula" },
  latestVersionSource: { kind: "npm", name: "@earendil-works/pi-coding-agent" },
  nativeUpdate: {
    executable: "pi",
    args: (installSource) =>
      installSource === "unknown" || installSource === "native"
        ? ["update"]
        : ["update", "--method", installSource],
    lockKey: "pi-native",
    strategy: "always",
    excludedInstallSources: ["homebrew"],
  },
} as const satisfies PackageManagedProviderMaintenanceDefinition;

describe("providerMaintenance", () => {
  it("parses generic CLI versions", () => {
    assert.strictEqual(parseGenericCliVersion("pi-cli 0.130.0\n"), "0.130.0");
    assert.strictEqual(parseGenericCliVersion("pi 2.1\n"), "2.1.0");
    assert.strictEqual(parseGenericCliVersion("no version here"), null);
  });

  it("resolves npm global update commands for unqualified binaries", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_DEFINITION, {
      binaryPath: "pi",
      realCommandPath:
        "/Users/test/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/bin/pi",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "npm install -g @earendil-works/pi-coding-agent@latest",
      executable: "npm",
      args: ["install", "-g", "@earendil-works/pi-coding-agent@latest"],
      lockKey: "npm-global",
    });
  });

  it("does not guess an update command for unclassified binaries", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_DEFINITION, {
      binaryPath: "/custom/bin/pi",
      realCommandPath: "/custom/bin/pi",
    });

    assert.strictEqual(capabilities.update, null);
  });

  it("resolves Homebrew cask update commands", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_DEFINITION, {
      binaryPath: "/opt/homebrew/bin/pi",
      realCommandPath: "/opt/homebrew/Caskroom/pi/0.130.0/pi",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "brew upgrade --cask pi",
      executable: "brew",
      args: ["upgrade", "--cask", "pi"],
      lockKey: "homebrew",
    });
    assert.strictEqual(capabilities.packageName, null);
  });

  it("uses provider-native update commands with detected install method", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_NATIVE_DEFINITION, {
      binaryPath: "pi",
      realCommandPath: "/Users/test/.local/share/pnpm/pi",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "pi update --method pnpm",
      executable: "pi",
      args: ["update", "--method", "pnpm"],
      lockKey: "pi-native",
    });
  });

  it("uses Homebrew directly for tapped installs", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_NATIVE_DEFINITION, {
      binaryPath: "pi",
      realCommandPath: "/opt/homebrew/Cellar/pi/1.14.46/bin/pi",
    });

    assert.deepStrictEqual(capabilities.update, {
      command: "brew upgrade pi",
      executable: "brew",
      args: ["upgrade", "pi"],
      lockKey: "homebrew",
    });
    assert.deepStrictEqual(capabilities.latestVersionSource, {
      kind: "npm",
      name: "@earendil-works/pi-coding-agent",
    });
  });

  it("resolves bun update for project node_modules binaries", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(PI_NATIVE_DEFINITION, {
      binaryPath: "pi",
      realCommandPath: "/Users/test/workspace/PeakCode/apps/server/node_modules/.bin/pi",
    });

    assert.deepStrictEqual(capabilities.update, {
      command:
        "bun update @earendil-works/pi-coding-agent @earendil-works/pi-ai @earendil-works/pi-agent-core",
      executable: "bun",
      args: [
        "update",
        "@earendil-works/pi-coding-agent",
        "@earendil-works/pi-ai",
        "@earendil-works/pi-agent-core",
      ],
      lockKey: "project-dependencies",
      cwd: "/Users/test/workspace/PeakCode/apps/server",
    });
  });

  it("marks older semver versions as behind latest", () => {
    const advisory = createProviderVersionAdvisory({
      provider: "pi",
      currentVersion: "0.129.0",
      latestVersion: "0.130.0",
    });

    assert.strictEqual(advisory.status, "behind_latest");
    assert.strictEqual(advisory.currentVersion, "0.129.0");
    assert.strictEqual(advisory.latestVersion, "0.130.0");
  });
});
