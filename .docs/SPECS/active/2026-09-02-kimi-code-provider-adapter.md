# Kimi Code CLI provider adapter

Status: Implemented (AC 4/6/7/9/10/11 unverified — account quota)   Owner: @notdefined-inc Date: 2026-09-02

## Problem

The fork's thesis is native harnesses with native login and native subscription. Kimi is currently reachable in PeakCode only as a **gateway channel** (`GatewayChannelId "kimi"`) that proxies Claude Code's `ANTHROPIC_BASE_URL` to Moonshot's API — the opposite of that thesis. Kimi Code CLI ships a first-class ACP server (`kimi acp`, v0.39.1) whose capability set is richer than any provider currently wired in. Adding it natively is the first proof that the fork's direction is buildable.

## Non-goals

- **Not** removing, disabling, or altering the existing gateway or its `kimi` channel. They coexist; see `docs/SPECS/active/` for the separate per-thread channel work.
- **Not** the deprecated `kimi-cli` package. Target `kimi-code` only (`~/.kimi-code/bin/kimi`).
- **Not** implementing the ACP methods `session/fork` or `session/delete` (branching and deleting a _conversation_ — unrelated to forking a git repo), even though Kimi advertises both. `session/fork` is the raw material for lossless handoff-v2 and gets its own spec.
- **Not** auto-installing or upgrading the Kimi binary. Discovery + a clear "not installed" status only.
- **Not** any MCP code in the adapter — and none is needed. Kimi loads its own MCP servers from its own config exactly as Claude Code and Codex already do; PeakCode passes `mcpServers: []` for every ACP provider (`AcpSessionRuntime.ts:416`) and only _renders_ MCP tool calls. Kimi has MCP support on day one. What is out of scope is PeakCode **managing** MCP configs across harnesses (the unified MCP layer), which is missing for all eight providers, not for Kimi specifically.
- **Not** surfacing Kimi's `--agent` / `--agent-file` profiles or `--skills-dir` in PeakCode's Skills/Plugins library. Kimi still loads its own skills and agent profiles from its own directories at startup; they just won't appear in PeakCode's cross-provider discovery UI.

## Design

Kimi is an **ACP provider**, so the template is `GrokAdapter` — the newest ACP provider — not the Codex or Claude paths. Reuse `packages/effect-acp` (implements `protocolVersion: 1`) and `provider/acp/AcpSessionRuntime.ts` unchanged.

Verified against the live binary:

```
initialize  → protocolVersion 1
              agentCapabilities.loadSession = true
              sessionCapabilities: list, resume, close, delete, fork, additionalDirectories
              promptCapabilities: image ✓  embeddedContext ✓  audio ✗
              mcpCapabilities: http, sse
              authMethods: [{ id: "login", type: "terminal" }]
session/new → { sessionId, configOptions: [ select "model", select "thinking" ] }
```

**Contracts** (`packages/contracts`):

```ts
ProviderKind += "kimiCode"                    // NOT "kimi" — that id belongs to GatewayChannelId
KimiCodeModelOptions   = { thinking?: "low" | "high" }
KimiCodeModelSelection = { provider: "kimiCode", model, options?: KimiCodeModelOptions }
settings.providers.kimiCode = ProviderSettingsBase   // enabled, binaryPath — no extra slots
```

**Model catalogue**: read at runtime from `session/new`'s `configOptions[id="model"]`, not hardcoded. Capability `supportsRuntimeModelList: true`, matching Cursor's live-metadata approach. Static fallback for the picker before a session exists: `kimi-code/kimi-for-coding` (K2.7 Coding), `-highspeed`, `kimi-code/k3` (1M ctx), `kimi-code/k3-256k` (default).

**Model and thinking switching**: both are `configOptions` mutated by `session/set_config_option` — the same method `GrokAdapter` already calls. Therefore `sessionModelSwitch: "in-session"` (no restart).

**Auth**: `AcpSessionRuntime` already exposes `resolveAuthMethodId`. Kimi's sole method is `{id: "login", type: "terminal"}`. Verified: when `~/.kimi-code/credentials` exists, `session/new` succeeds **without** an `authenticate` call. So `resolveAuthMethodId` returns `"login"` only when the agent rejects the session as unauthenticated; health check surfaces the terminal command rather than PeakCode attempting an interactive device-code flow over stdio.

_Rejected — gateway channel reuse_: routes Kimi through Claude Code's process, forfeits Kimi's own tools, session format, and subscription. That is the thing this fork exists to avoid.
_Rejected — hardcoded model list_: Kimi ships model changes with CLI releases; a static list goes stale and is the current top source of provider bugs upstream.

## Acceptance criteria

1. With no `kimi` binary on PATH, Settings → Providers shows Kimi Code as not installed with an install hint, and starting a session is blocked — no crash, no orphan process.
2. With the binary present but no credentials, provider status reports needs-auth and surfaces `kimi login` as the remedy; PeakCode never spawns an interactive login on its own.
3. With credentials present, `session/new` returns a `sessionId` and the thread reaches `ready` in ≤ 10s on a warm binary.
4. A prompt turn streams assistant text incrementally into the transcript (no single end-of-turn dump) and tool calls render as tool rows.
5. Changing the model mid-thread applies via `session/set_config_option` **without** restarting the session, and the composer's displayed model matches the value the agent reports back.
6. Toggling thinking low/high applies via the same path and survives the next turn.
7. Interrupting an in-flight turn stops output within 2s and leaves the session `ready`, not `error`.
8. After a server restart, an existing Kimi thread resumes via `loadSession` and prior turns are still rendered.
9. A tool call requiring approval raises a PeakCode approval request; approving and rejecting both round-trip correctly.
10. Handoff works in both directions between Kimi Code and every other provider, and the destination thread carries a "Handoff from …" badge.
11. Image attachments are accepted; audio attachments are rejected with a clear message (`promptCapabilities.audio = false`).
12. If the `kimi` process exits mid-turn, the session is marked closed with a surfaced error and no orphaned child process remains.
13. `bun fmt`, `bun lint`, `bun typecheck`, and `bun run test` all pass.
14. A prompt that the agent refuses (quota exhausted, expired credentials) still produces a terminal
    `turn.completed` with `state: "failed"` and the agent's message — never a turn that hangs.

## Tasks

Each step leaves the codebase working. Step 4 exceeds the repo's preferred <200-line diff and should be split at review time if it grows past ~600 lines.

> **Revised after step 1.** Steps 1, 2 and most of 6 are **not separable into distinct PRs**. `ProviderKind` is consumed by exhaustive `Record<ProviderKind, …>` types across contracts, server and web, so adding the literal breaks the build in ~25 files until every one is filled in. Likewise `PROVIDERS` in `ProviderHealth.ts` forces the health check in the same change. The first shippable commit is therefore "contracts + settings + health check + UI records", ~500 lines, and cannot be made smaller without a temporary non-exhaustive escape hatch that would be worse. Steps 3-5 remain independent.

- [x] 1. Contracts + settings: `ProviderKind "kimiCode"`, model selection/options, `settings.providers.kimiCode`, discovery entry. No runtime behavior. (touches: `packages/contracts/src/{orchestration,model,settings,providerDiscovery,agentMentions}.ts`, `packages/shared/src/model.ts`) → AC 13
- [x] 2. Health check + status cache: version probe, credential detection, terminal-auth remedy copy. (touches: `provider/Layers/ProviderHealth.ts`, `provider/providerStatusCache.ts`) → AC 1, 2
- [x] 3. `KimiCodeAcpSupport.ts`: spawn input (`kimi acp`, binaryPath override, cwd, `--add-dir`) + `resolveAuthMethodId`. Unit-tested against the recorded `initialize` response. (touches: `provider/acp/KimiCodeAcpSupport.ts`) → AC 2, 3
- [x] 4. `KimiCodeAdapter` Layers + Services + registry + runtime layer: session lifecycle, turn streaming, interrupt, approvals, `loadSession` resume. (touches: `provider/Layers/KimiCodeAdapter.ts`, `provider/Services/KimiCodeAdapter.ts`, `provider/Layers/ProviderAdapterRegistry.ts`, `provider/runtimeLayer.ts`) → AC 3, 4, 7, 8, 9, 12
- [x] 5. Runtime config options: model list from `session/new`, in-session model + thinking switching via `session/set_config_option`. (touches: `KimiCodeAdapter.ts`, `persistence/modelSelectionCompatibility.ts`) → AC 5, 6
- [x] 6. Web wiring: composer provider registry, model picker + runtime capabilities, provider icon, ordering, settings panel, attachment gating. (touches: `apps/web/src/components/chat/*`, `providerModelOptions.ts`, `providerOrdering.ts`, `ProviderIcon.tsx`, `Icons.tsx`, `appSettings.ts`, `session-logic.ts`, `store.ts`, `routes/_chat.settings.tsx`) → AC 5, 6, 11
- [x] 7. Handoff: add `kimiCode` to `HANDOFF_PROVIDER_ORDER` and verify both directions. (touches: `apps/web/src/lib/threadHandoff.ts`, `orchestration/Layers/ProviderCommandReactor.ts`) → AC 10
- [x] 8. Docs + changelog: `.docs/provider-architecture.md`, README provider table (also correct the stale 5-provider list), `whatsNew/entries.ts`. → AC 13

## Verification status

Verified live against Kimi Code CLI 0.39.1 on 2026-09-02:

- **AC 1, 2** — health check reports `ready`/`authenticated` with a real install and credentials, and
  a clear not-installed message without the binary.
- **AC 3** — `startSession` returns a real ACP session id and reaches `ready`; events
  `session.started` → `session.state.changed(ready)` → `thread.started` → `turn.started` all emit.
- **AC 5 (discovery half)** — `listModels` returns the agent's live catalogue with
  `source: "kimi-acp-session"`, not the static fallback.
- **AC 14** — a refused prompt produces `turn.completed` with `state: "failed"` in ~3s carrying the
  agent's own message. Before the defect promotion this hung indefinitely with no terminal event.

**Not yet verified:** AC 4 (assistant text streaming), 6 (thinking toggle across turns), 7
(interrupt), 9 (approvals), 10 (handoff round-trip), 11 (attachment gating). All require a completed
model turn, and the Kimi account is at its weekly usage limit:
`403 You've reached your weekly (7-day) usage limit`. Re-run the live checks once quota resets.
