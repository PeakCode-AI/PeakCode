# Provider architecture

The web app communicates with the server via WebSocket using a simple JSON-RPC-style protocol:

- **Request/Response**: `{ id, method, params }` → `{ id, result }` or `{ id, error }`
- **Push events**: typed envelopes with `channel`, `sequence` (monotonic per connection), and channel-specific `data`

Push channels: `server.welcome`, `server.configUpdated`, `terminal.event`, `orchestration.domainEvent`. Payloads are schema-validated at the transport boundary (`wsTransport.ts`). Decode failures produce structured `WsDecodeDiagnostic` with `code`, `reason`, and path info.

Methods mirror the `NativeApi` interface defined in `@peakcode/contracts`:

- `providers.startSession`, `providers.sendTurn`, `providers.interruptTurn`
- `providers.respondToRequest`, `providers.stopSession`
- `shell.openInEditor`, `server.getConfig`

## Implemented providers

`ProviderKind` (`packages/contracts/src/orchestration.ts`) currently covers:

| Provider kind | Runtime                          | Transport           |
| ------------- | -------------------------------- | ------------------- |
| `codex`       | `codex app-server`               | JSON-RPC over stdio |
| `claudeAgent` | `@anthropic-ai/claude-agent-sdk` | in-process SDK      |
| `cursor`      | `cursor-agent`                   | ACP over stdio      |
| `gemini`      | Gemini CLI                       | ACP over stdio      |
| `grok`        | `grok agent ... stdio`           | ACP over stdio      |
| `kilo`        | Kilo Code                        | HTTP server         |
| `kimiCode`    | `kimi acp`                       | ACP over stdio      |
| `opencode`    | OpenCode                         | HTTP server         |
| `pi`          | Pi                               | stdio               |

Every adapter implements `ProviderAdapterShape` (`provider/Services/ProviderAdapter.ts`) and is
registered in `ProviderAdapterRegistry` plus `provider/runtimeLayer.ts`.

### ACP providers

ACP-backed providers share `provider/acp/AcpSessionRuntime.ts` (protocol v1) and the event mappers in
`AcpCoreRuntimeEvents.ts` / `AcpRuntimeModel.ts`. Each contributes a small `*AcpSupport.ts` module
that owns only its spawn line and auth resolution.

Two Kimi-specific notes worth knowing before adding another ACP provider:

- **Config options vs. process flags.** `kimi acp` accepts no model flags; model and thinking level
  are session config options written with `session/set_config_option`. That is why Kimi advertises
  `sessionModelSwitch: "in-session"` while Grok, whose model is a spawn-time flag, uses
  `restart-session`. It is also why Kimi's model catalogue is read live from `session/new` rather
  than hardcoded.
- **Defects vs. typed errors.** Kimi reports agent-side refusals (quota exhausted, expired
  credentials) as a JSON-RPC error whose payload fails schema decode, so it reaches the adapter as a
  _defect_, not a typed `AcpError`. The prompt fiber ends in `Effect.ignoreCause`, so such a defect
  is silently swallowed and the turn never reaches a terminal event — the thread spins forever.
  `KimiCodeAdapter` promotes prompt defects to the failure channel
  (`kimiCodePromptDefectToAdapterError`) so every turn terminates. Check this when wiring a new ACP
  agent.

## Client transport

`wsTransport.ts` manages connection state: `connecting` → `open` → `reconnecting` → `closed` → `disposed`. Outbound requests are queued while disconnected and flushed on reconnect. Inbound pushes are decoded and validated at the boundary, then cached per channel. Subscribers can opt into `replayLatest` to receive the last push on subscribe.

## Server-side orchestration layers

Provider runtime events flow through queue-based workers:

1. **ProviderRuntimeIngestion** — consumes provider runtime streams, emits orchestration commands
2. **ProviderCommandReactor** — reacts to orchestration intent events, dispatches provider calls
3. **CheckpointReactor** — captures git checkpoints on turn start/complete, publishes runtime receipts

All three use `DrainableWorker` internally and expose `drain()` for deterministic test synchronization.
