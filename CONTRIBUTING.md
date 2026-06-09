# Contributing to Peak Code

Thank you for your interest in contributing to Peak Code. This document defines the standards, processes, and expectations for all contributions. Please read it carefully before opening an issue or pull request.

**Peak Code is in an early stage.** The architecture and APIs are still evolving. Proposing sweeping changes that improve long-term maintainability is not just welcome — it is encouraged. That said, every change must be justified, focused, and aligned with the project's core priorities.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Core Priorities](#core-priorities)
- [Ways to Contribute](#ways-to-contribute)
  - [Report Bugs](#report-bugs)
  - [Suggest Enhancements](#suggest-enhancements)
  - [Improve Documentation](#improve-documentation)
  - [Contribute Code](#contribute-code)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Repository Setup](#repository-setup)
  - [Development Commands](#development-commands)
  - [Isolated Development](#isolated-development)
- [Project Architecture](#project-architecture)
  - [Monorepo Packages](#monorepo-packages)
  - [Event Lifecycle](#event-lifecycle)
  - [Background Workers](#background-workers)
  - [Runtime Signals](#runtime-signals)
- [Coding Standards](#coding-standards)
  - [General Principles](#general-principles)
  - [TypeScript & Effect-TS](#typescript--effect-ts)
  - [React & UI](#react--ui)
  - [Formatting & Linting](#formatting--linting)
  - [Testing](#testing)
- [Pull Request Process](#pull-request-process)
  - [Before You Code](#before-you-code)
  - [What Makes a Good PR](#what-makes-a-good-pr)
  - [PR Template](#pr-template)
  - [Review Process](#review-process)
- [Transcript Performance Guardrails](#transcript-performance-guardrails)
- [Local Dev Instance Isolation](#local-dev-instance-isolation)
- [Package Roles & Subpath Exports](#package-roles--subpath-exports)
- [Contributor License Agreement](#contributor-license-agreement)

---

## Code of Conduct

This project adheres to the [MIT License](./LICENSE) terms. In all interactions, treat maintainers and fellow contributors with respect. Be constructive, assume good intent, and keep discussions focused on technical merit.

We reserve the right to block or ban any participant whose behavior undermines a healthy community.

---

## Core Priorities

Every contribution is evaluated against these priorities, in order:

1. **Performance first.** Peak Code wraps resource-intensive AI agent runtimes. The GUI must never be the bottleneck. Every render, every store update, every WebSocket message must justify its cost.
2. **Reliability first.** Sessions survive restarts. Streaming must not drop frames. State must be deterministic. Partial failures must not corrupt the session.
3. **Predictability under load and during failures.** Session restarts, reconnections, and partial streams must behave consistently. Graceful degradation is mandatory.

> **When tradeoffs are unavoidable, choose correctness and robustness over short-term convenience.**

---

## Ways to Contribute

### Report Bugs

If you find a bug, [create an issue](https://github.com/PeakCode-AI/PeakCode/issues). A great bug report includes:

- A clear description of the bug and its impact
- Steps to reproduce, with the exact environment (OS, browser, agent provider)
- What you expected to happen vs. what actually happened
- Screenshots, videos, or logs where applicable
- Whether the issue is reproducible across providers (Codex, Claude, etc.) or provider-specific

### Suggest Enhancements

Before proposing a feature:

1. Search existing [issues](https://github.com/PeakCode-AI/PeakCode/issues) and [discussions](https://github.com/PeakCode-AI/PeakCode/discussions) to avoid duplicates.
2. Describe the problem you are solving, not just the solution you want.
3. Explain why the enhancement aligns with the project's core priorities.
4. If the change touches the transcript, scroll, or streaming paths, read the [Transcript Performance Guardrails](#transcript-performance-guardrails) first.

Enhancements that trade performance or reliability for cosmetic convenience will be rejected.

### Improve Documentation

Documentation is essential. If you find something missing, unclear, or outdated:

- For architecture docs: submit a PR to `.docs/`
- For user-facing docs: submit a PR to `docs/`
- For internal guidance: `AGENTS.md` documents the conventions used by automated agents

When adding documentation, prefer clarity over comprehensiveness. A short, correct document is better than a long, outdated one.

---

## Development Setup

### Prerequisites

| Dependency | Minimum Version | Notes                               |
| ---------- | --------------- | ----------------------------------- |
| Bun        | ^1.3.9          | Package manager and runtime         |
| Node.js    | ^24.13.1        | Also required for some tooling      |
| Git        | 2.30+           | For version control integration     |
| Codex CLI  | latest          | Required for Codex provider support |

The project uses **Bun** as its package manager with the `isolated` linker. Do not use `npm` or `yarn`.

### Repository Setup

```bash
git clone https://github.com/PeakCode-AI/PeakCode.git
cd PeakCode
bun install
```

> **Note:** `bun install` installs all workspace dependencies from the root. Do not run `bun install` in individual workspace packages.

### Development Commands

```bash
# Full dev environment (web UI + server)
bun run dev

# Individual services
bun run dev:server              # Server only
bun run dev:web                 # Web UI only
bun run dev:desktop             # Desktop (Electron) app

# Quality checks (run before committing)
bun run test                    # Vitest test suite
bun run lint                    # oxlint
bun run fmt                     # oxfmt
bun run typecheck               # TypeScript type checking

# Desktop distribution builds
bun run dist:desktop:dmg        # macOS DMG
bun run dist:desktop:linux      # Linux AppImage
bun run dist:desktop:win        # Windows installer
```

> **Important:** Run all four quality checks (`test`, `lint`, `fmt` check, `typecheck`) in a single pass before opening a PR. Avoid repeatedly running individual checks during iteration — batch them at the end.

### Isolated Development

When running alongside an existing Peak Code instance, avoid port and state conflicts:

```bash
env -u PEAKCODE_AUTH_TOKEN \
  PEAKCODE_PORT_OFFSET=3158 \
  PEAKCODE_NO_BROWSER=1 \
  bun run dev -- --home-dir ./.peakcode-dev --port 58090
```

Always dry-run first:

```bash
env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 \
  bun run dev -- --home-dir ./.peakcode-pr84 --port 58090 --dry-run
```

If the UI shows no threads after connecting, the issue is likely a WebSocket auth mismatch or port collision — check your `PEAKCODE_AUTH_TOKEN` and port bindings before debugging SQL.

---

## Project Architecture

### Monorepo Packages

| Path                  | Role                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/server`         | Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, manages provider sessions. |
| `apps/web`            | React/Vite UI. Session UX, conversation rendering, client-side state. Connects via WebSocket.                                |
| `apps/desktop`        | Electron desktop shell. Wraps the web app as a native desktop application.                                                   |
| `apps/marketing`      | Marketing / landing page site.                                                                                               |
| `packages/contracts`  | Effect-TS Schema definitions and TypeScript contracts. Schema-only — no runtime logic.                                       |
| `packages/shared`     | Runtime utilities consumed by server and web. Uses explicit subpath exports — no barrel index.                               |
| `packages/effect-acp` | Effect-TS ACP (Agents, Context, Policies) integration.                                                                       |

### Event Lifecycle

The data flow follows a strict layered path:

```
Browser → WebSocket → wsServer → ProviderService → codex app-server
                                                                  ↓
Browser ← ServerPushBus ← OrchestrationEngine ← ProviderRuntimeIngestion
```

1. User action in the browser becomes a typed WebSocket request via `WsTransport`
2. `wsServer` decodes and routes the request using shared contracts from `packages/contracts/src/ws.ts`
3. `ProviderService` starts/resumes a session and communicates with `codex app-server` via JSON-RPC over stdio
4. `ProviderRuntimeIngestion` ingests provider-native events, normalizing them into orchestration events
5. `OrchestrationEngine` persists events, updates the read model, and exposes domain events
6. `ServerPushBus` pushes typed updates to the browser on channels defined in `orchestration.ts`

### Background Workers

Long-running async flows run as queue-backed workers to keep side effects ordered and test synchronization deterministic:

- **ProviderRuntimeIngestion** — ingests provider runtime events
- **ProviderCommandReactor** — reacts to provider commands asynchronously
- **CheckpointReactor** — processes session checkpoint tasks

When a milestone completes, the server emits a typed receipt on `RuntimeReceiptBus` (e.g., checkpoint completion, turn quiescence). Tests wait on these receipts instead of polling.

### Runtime Signals

- Checkpoint completion
- Turn quiescence
- Diff finalization

These signals are the only approved mechanism for async coordination. Do not poll internal state.

---

## Coding Standards

### General Principles

- **No comments in code.** Code should be self-documenting through clear naming, small functions, and Effect-TS typed pipelines. If something is hard to understand without a comment, refactor it.
- **Prefer extraction over duplication.** When adding functionality, check if shared logic can be extracted to a new module. Duplicate logic across multiple files is a code smell.
- **No barrel index files.** The `packages/shared` package uses explicit subpath exports (e.g., `@t3tools/shared/git`). Do not add `index.ts` barrel files.
- **Don't be afraid to refactor.** This is an early project. If existing code stands in the way of a clean solution, change it — but justify the refactoring in your PR.
- **No emojis in code or UI** unless the user explicitly requests them.

### TypeScript & Effect-TS

- **Strict TypeScript.** The project uses strict TypeScript with Effect-TS heavily. All new code must use Effect-TS patterns (Schema, Effect, Layer) where applicable.
- **Effect-TS Schema** (`packages/contracts`) is the source of truth for all protocol types, WebSocket message formats, and domain events. Never duplicate type definitions.
- **Effect Layers** are used for dependency injection. All services should be expressed as `Layer`s composed in the runtime graph.
- **No `any`.** If you need escape hatch, prefer `unknown` with proper type narrowing. If you must use `any`, explain why in the PR.
- **Avoid classes.** Prefer Effect-TS functional patterns (pipes, generators, Layers) over OOP patterns.

### React & UI

- **Zustand stores** are the primary state management pattern. Do not introduce Redux, MobX, or other state libraries.
- **Tailwind CSS** for styling, with theme colors defined in the theme system. Do not use inline styles or CSS modules unless there is a measured performance case.
- **No explicit color classes outside the theme** (e.g., `text-yellow-400` is not allowed). Use theme tokens.
- **UI changes must include before/after screenshots** in the PR. For motion/interaction changes, include a video.
- **Components should be small and focused.** If a component exceeds 200 lines, consider splitting it.

### Formatting & Linting

The project uses **oxlint** for linting and **oxfmt** for formatting (not Prettier, not ESLint).

```bash
bun run lint       # oxlint
bun run fmt        # oxfmt (auto-fix)
bun run fmt:check  # oxfmt (check only)
```

All code must pass `bun run lint` and `bun run fmt:check` before opening a PR.

### Testing

- **Vitest** is the test framework (run via `bun run test`, never `bun test`).
- Tests live alongside source files (co-located).
- **Write tests for new functionality.** If your PR introduces a new module, it must include tests.
- **Update existing tests** if your change affects behavior.
- **Functional testing is the primary focus** — the project values integration-level tests over pure unit tests, especially around the orchestration engine, WebSocket protocol, and background worker flows.
- **Use runtime signals** (`RuntimeReceiptBus`) for test synchronization instead of arbitrary timers or polling.

---

## Pull Request Process

### Before You Code

1. **Open an issue first** (or comment on an existing one) to discuss your proposed changes. This ensures your effort aligns with the project direction and avoids wasted work.
2. **Keep scope tight.** One concern per PR. If you have multiple unrelated changes, open separate PRs.
3. **Follow the coding standards** above. Code that does not meet these standards will not be merged.

### What Makes a Good PR

- **Small and focused.** Prefer PRs under 200 lines. Large PRs are difficult to review and more likely to be rejected.
- **Clear motivation.** Explain _what_ changed and _why_. If the change is non-obvious, include the reasoning.
- **Tests included.** New functionality must include tests. Bug fixes must include a regression test.
- **Quality checks pass.** Run `bun run test`, `bun run lint`, `bun run fmt:check`, and `bun run typecheck` before opening the PR.
- **UI changes include screenshots.** Before/after images are required. Videos for animation/interaction changes.
- **Branch from `main`.** Name your branch descriptively (e.g., `fix-ws-reconnect`, `feat-thread-persistence`).

### PR Template

Use the PR template at [`.github/pull_request_template.md`](.github/pull_request_template.md). It asks for:

- **What Changed** — describe the change clearly and keep scope tight
- **Why** — explain the problem being solved and why this approach is right
- **UI Changes** — before/after screenshots (or delete section if not applicable)
- **Checklist** — small and focused, explanation provided, screenshots included

### Review Process

1. **Initial Review** — A maintainer will review your PR. Response time depends on availability.
2. **Feedback Loop** — The reviewer may request changes. Address all feedback. If you disagree, explain your reasoning — but be prepared to accept the reviewer's judgment on matters of architecture and project direction.
3. **Automated Checks** — CI runs lint, typecheck, and the full test suite. All must pass before merge.
4. **Approval & Merge** — Once approved and passing CI, a maintainer will merge your PR.

> **Note:** Peak Code is a small team project. PRs may sit for a while before review. Please be patient. If a PR has been open for more than two weeks without any response, feel free to ping the thread politely.

---

## Transcript Performance Guardrails

The transcript (chat message list) is the most performance-sensitive component in the UI. When making changes to transcript rendering, scrolling, or state, follow these rules:

1. **Treat auto-scroll as a live-output feature, not a generic "working" indicator.** Buffering, reconnecting, pending approvals, and tool-only activity must not trigger auto-scroll as if assistant text is actively streaming.
2. **Count real transcript messages only.** Tool and work rows must not retrigger the "new content arrived" auto-stick path.
3. **Prefer the simpler fork-style transcript path for the common case.** Small and medium transcripts should avoid virtualization churn unless there is a clear measured need.
4. **If virtualization is used,** never couple `rowVirtualizer.measure()` directly to another bottom-stick or height-follow cycle. Height-follow for live output must stay one-way to avoid measure/scroll feedback loops.
5. **Preserve these behaviors with dedicated tests** when changing chat scrolling, timeline measurement, or sidebar-driven transcript updates.

Violating these guardrails will cause review rejection. They exist because every prior violation caused observable jank in real-world usage.

---

## Local Dev Instance Isolation

When running a development instance alongside a production or another dev instance:

- **Never start `bun run dev` blindly** while another Peak Code instance is running unless you explicitly intend shared ports and state.
- **Use an isolated home directory and non-default ports.** Example:
  ```bash
  env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 \
    bun run dev -- --home-dir ./.peakcode-dev --port 58090
  ```
- **Always dry-run first** to detect conflicts:
  ```bash
  env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 \
    bun run dev -- --home-dir ./.peakcode-pr84 --port 58090 --dry-run
  ```
- **Unset `PEAKCODE_AUTH_TOKEN` for browser dev instances** unless the web app is configured to connect with that token. An auth mismatch will cause silent WebSocket rejection, and the UI will show no threads even though SQLite has data.
- **Check both server and web ports** with `lsof -nP -iTCP:<port> -sTCP:LISTEN`. A desktop app can bind `127.0.0.1:<port>` while the dev server binds IPv6 `*:<port>` — `localhost` may still hit the wrong process.
- **If the UI shows no threads,** first verify the server path by inspecting the isolated `state.sqlite`, then probe `orchestration.getSnapshot` over WebSocket. A healthy snapshot with projects/threads means the issue is client connection or hydration, not empty history.

---

## Package Roles & Subpath Exports

### `packages/contracts` — Schema-only

This package is the single source of truth for:

- Provider event schemas
- WebSocket protocol message formats
- Model and session types

**No runtime logic** belongs here. If you need a utility function, put it in `packages/shared`.

### `packages/shared` — Explicit subpath exports

This package exports shared runtime utilities. It **does not** use barrel index files. Import like this:

```typescript
import { DrainableWorker } from "@t3tools/shared/DrainableWorker";
// NOT: import { DrainableWorker } from "@t3tools/shared";
```

When adding a new module to `packages/shared`, add a corresponding entry in the package's `exports` field in `package.json`.

---

## Contributor License Agreement

By submitting a pull request, you agree that your contributions will be licensed under the [MIT License](./LICENSE) that covers this project. You represent that you have the right to grant this license.

If this is your first contribution to the project, the CLA bot will ask you to confirm acceptance. Reply with:

```
I have read the CLA Document and I hereby sign the CLA
```

This is recorded once per repository and does not need to be repeated for subsequent contributions.

---

_Thank you for helping make Peak Code better. Every thoughtful contribution — whether a bug report, a documentation fix, or a code change — moves the project forward._
