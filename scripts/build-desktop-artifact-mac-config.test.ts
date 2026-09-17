import { assert, describe, it } from "@effect/vitest";

import {
  createDesktopPlatformBuildConfig,
  MAC_ENTITLEMENTS_PATH,
  MAC_INHERITED_ENTITLEMENTS_PATH,
  MICROPHONE_USAGE_DESCRIPTION,
} from "./lib/desktop-platform-build-config.ts";

describe("createDesktopPlatformBuildConfig", () => {
  it("adds explicit microphone entitlements to macOS builds", () => {
    const config = createDesktopPlatformBuildConfig({
      platform: "mac",
      target: "dmg",
      hasMacIconComposer: false,
    });
    const mac = config.mac as Record<string, unknown>;
    const extendInfo = mac.extendInfo as Record<string, unknown>;

    assert.deepStrictEqual(mac.target, ["dmg", "zip"]);
    assert.equal(mac.hardenedRuntime, true);
    assert.equal(mac.entitlements, MAC_ENTITLEMENTS_PATH);
    assert.equal(mac.entitlementsInherit, MAC_INHERITED_ENTITLEMENTS_PATH);
    assert.equal(extendInfo.NSMicrophoneUsageDescription, MICROPHONE_USAGE_DESCRIPTION);
    assert.equal(mac.sign, undefined);
    assert.equal(config.afterPack, undefined);
    assert.equal(config.dmg, undefined);
  });

  it("ad-hoc signs unsigned macOS builds instead of skipping signing", () => {
    const unsigned = createDesktopPlatformBuildConfig({
      platform: "mac",
      target: "dmg",
      hasMacIconComposer: false,
      macAdHocSign: true,
    });
    const signed = createDesktopPlatformBuildConfig({
      platform: "mac",
      target: "dmg",
      hasMacIconComposer: false,
      macAdHocSign: false,
    });

    assert.equal(
      (unsigned.mac as Record<string, unknown>).sign,
      "./electron-builder-ad-hoc-sign.cjs",
    );
    assert.equal((signed.mac as Record<string, unknown>).sign, undefined);
  });

  it("preserves the icon composer packaging path for macOS builds", () => {
    const config = createDesktopPlatformBuildConfig({
      platform: "mac",
      target: "dmg",
      hasMacIconComposer: true,
    });
    const mac = config.mac as Record<string, unknown>;
    const extendInfo = mac.extendInfo as Record<string, unknown>;

    assert.equal(mac.icon, "icon.icon");
    assert.equal(extendInfo.CFBundleIconFile, "icon.icns");
    assert.equal(config.afterPack, "./electron-builder-after-pack.cjs");
    assert.deepStrictEqual(config.dmg, { icon: "icon.icns" });
  });

  it("leaves non-macOS platform configs unchanged", () => {
    const linux = createDesktopPlatformBuildConfig({
      platform: "linux",
      target: "AppImage",
      hasMacIconComposer: false,
    });
    const win = createDesktopPlatformBuildConfig({
      platform: "win",
      target: "nsis",
      hasMacIconComposer: false,
      windowsAzureSignOptions: { publisherName: "Peak Code" },
    });

    assert.equal(linux.mac, undefined);
    assert.equal(linux.afterPack, undefined);
    assert.deepStrictEqual(linux.linux, {
      target: ["AppImage"],
      executableName: "peakcode",
      icon: "icon.png",
      category: "Development",
      desktop: {
        entry: {
          StartupWMClass: "peakcode",
        },
      },
    });

    assert.equal(win.mac, undefined);
    assert.deepStrictEqual(win.win, {
      target: ["nsis"],
      icon: "icon.ico",
      azureSignOptions: { publisherName: "Peak Code" },
    });
  });
});
