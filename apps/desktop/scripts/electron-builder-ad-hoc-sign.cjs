// FILE: electron-builder-ad-hoc-sign.cjs
// Purpose: Ad-hoc signs the macOS bundle when the release build has no Developer ID identity.
// Layer: Build hook
// Depends on: electron-builder's `mac.sign` hook contract and macOS `codesign`.

const { spawnSync } = require("node:child_process");

// Unsigned macOS bundles ship with a signature that no longer matches the packed app, and macOS
// reports that state to the user as a damaged download. An ad-hoc signature is valid but untrusted,
// so Gatekeeper falls back to its regular unidentified-developer flow instead. Notarization still
// needs a Developer ID; this only removes the broken-signature state from an unsigned release.
exports.default = async function adHocSign(options) {
  const appPath = typeof options?.app === "string" ? options.app : "";
  if (!appPath) {
    console.warn("[desktop-artifact] ad-hoc signing skipped: no app path was provided");
    return;
  }

  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.info(`[desktop-artifact] ad-hoc signed ${appPath}`);
    return;
  }

  // Best effort: the release still publishes an unsigned artifact, which is what the README
  // documents (clear the quarantine flag, then open the app from Applications).
  const details = (result.stderr || result.error?.message || "unknown codesign failure").trim();
  console.warn(`[desktop-artifact] ad-hoc signing failed for ${appPath}: ${details}`);
};
