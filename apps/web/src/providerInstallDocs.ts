// FILE: providerInstallDocs.ts
// Purpose: Per-provider install/update/config documentation links and CLI command names.
// Layer: Web provider metadata
// Exports: INSTALL_PROVIDER_DOCS

import type { ProviderKind } from "@peakcode/contracts";

export const INSTALL_PROVIDER_DOCS: ReadonlyArray<{
  provider: ProviderKind;
  docs: ReadonlyArray<{ docKey: "install" | "update" | "config" | "headless"; href: string }>;
  command: string;
  title: string;
}> = [
  {
    provider: "codex",
    title: "Codex",
    command: "codex",
    docs: [
      { docKey: "install", href: "https://help.openai.com/en/articles/11096431" },
      { docKey: "update", href: "https://help.openai.com/en/articles/11096431" },
      { docKey: "config", href: "https://github.com/openai/codex/blob/main/docs/config.md" },
    ],
  },
  {
    provider: "claudeAgent",
    title: "Claude",
    command: "claude",
    docs: [
      { docKey: "install", href: "https://code.claude.com/docs/en/installation" },
      {
        docKey: "update",
        href: "https://code.claude.com/docs/en/installation#update-claude-code",
      },
      { docKey: "config", href: "https://code.claude.com/docs/en/settings" },
    ],
  },
  {
    provider: "cursor",
    title: "Cursor",
    command: "cursor-agent",
    docs: [
      { docKey: "install", href: "https://docs.cursor.com/en/cli/installation" },
      { docKey: "update", href: "https://docs.cursor.com/en/cli/installation#updates" },
      { docKey: "config", href: "https://docs.cursor.com/en/cli/overview" },
    ],
  },
  {
    provider: "gemini",
    title: "Gemini",
    command: "gemini",
    docs: [
      { docKey: "install", href: "https://google-gemini.github.io/gemini-cli/docs/get-started/" },
      { docKey: "update", href: "https://github.com/google-gemini/gemini-cli" },
      {
        docKey: "config",
        href: "https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html",
      },
    ],
  },
  {
    provider: "grok",
    title: "Grok",
    command: "grok",
    docs: [
      { docKey: "install", href: "https://docs.x.ai/build/overview" },
      { docKey: "headless", href: "https://docs.x.ai/build/cli/headless-scripting" },
      { docKey: "config", href: "https://docs.x.ai/build/overview" },
    ],
  },
  {
    provider: "kilo",
    title: "Kilo",
    command: "kilo",
    docs: [
      { docKey: "install", href: "https://kilo.ai/docs/cli" },
      { docKey: "update", href: "https://kilo.ai/docs/cli" },
      { docKey: "config", href: "https://kilo.ai/docs/cli#configuration" },
    ],
  },
  {
    provider: "kimiCode",
    title: "Kimi Code",
    command: "kimi",
    docs: [
      { docKey: "install", href: "https://moonshotai.github.io/kimi-code/" },
      { docKey: "update", href: "https://moonshotai.github.io/kimi-code/" },
      { docKey: "config", href: "https://moonshotai.github.io/kimi-code/" },
    ],
  },
  {
    provider: "opencode",
    title: "OpenCode",
    command: "opencode",
    docs: [
      { docKey: "install", href: "https://opencode.ai/docs/" },
      { docKey: "update", href: "https://opencode.ai/docs/cli/" },
      { docKey: "config", href: "https://opencode.ai/docs/config/" },
    ],
  },
  {
    provider: "pi",
    title: "Pi",
    command: "pi",
    docs: [
      { docKey: "install", href: "https://pi.dev/docs/latest" },
      { docKey: "update", href: "https://pi.dev/docs/latest/settings" },
      { docKey: "config", href: "https://pi.dev/docs/latest/settings" },
    ],
  },
];
