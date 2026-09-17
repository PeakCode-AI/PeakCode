# Changelog

All notable changes to Peak Code are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pi packages** under Settings → Pi Packages: install, list and remove the packages `pi install` understands — `npm:@scope/pkg`, `git:host/user/repo`, and local paths — from the app. Installs go through pi's own package manager, so sources land in the same `settings.json` the CLI reads and a package installed here is visible to `pi list`. The listing reports what each package contributes (skills, prompts, extensions, themes) and where it was installed; new threads load it on their next start, and `/reload` picks it up in an open thread. This is the surface that makes third-party packages like [pi-crew](https://www.npmjs.com/package/@melihmucuk/pi-crew) usable in Peak Code: its six `crew_*` subagent tools, orchestration skill, and `/pi-crew-plan` / `/pi-crew-review` prompt templates all run in-process.
- Themes and prompt-engineering skills ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) (MIT): `bun scripts/generate-oh-my-pi-theme-seeds.ts` turns oh-my-pi's 100 pi TUI themes into Peak Code `ChromeTheme` seeds (`apps/web/src/theme/oh-my-pi.seed.generated.ts`), selectable in the appearance picker as `omp-*`; and its two prompt-engineering skills (`system-prompts`, `semantic-compression`) ship as a bundled in-tree payload written to the shared skill library at startup, so `read_skill` and `/skill:` resolve them with no network. Both are additive: the skills follow the existing `AGENT_SKILL_PACKS` switch (the same one that governs the default pack, so turning it off drops both), and the themes have no switch of their own — they are extra options in the picker, and not choosing one changes nothing. ([.docs/oh-my-pi-integration.md](.docs/oh-my-pi-integration.md))
- Skills have a per-skill switch, and the ported content has commands. Settings → Skills now carries a toggle on every local skill: switching one off keeps its files on disk but removes it from the agent's per-turn skill list and makes `read_skill` refuse it, so a skill you do not want cannot be listed or opened. It is stored as `AGENT_DISABLED_SKILLS` (empty by default — nothing changes until you use it) and keys on the skill's directory name, the same id `read_skill` resolves. Three composer commands make the ported skills usable without describing them by hand: `/compress` drives `semantic-compression`, `/prompt-review` drives `system-prompts`, and `/review-prs` runs this repository's own gate (`bash scripts/pr-review.sh <PR number|--all|nothing to auto-detect>`, reporting its verdict). All three insert their instruction into the composer for you to read before sending, like `/subagents`. ([.docs/oh-my-pi-integration.md](.docs/oh-my-pi-integration.md))
- Extension failures are reported in the thread instead of being dropped: every extension that fails to load, and every extension handler that throws while a turn runs, now emits a `runtime.warning` naming the extension and the event. Extension load errors were previously invisible unless the model happened to notice a missing tool.

- **Scheduled tasks** (Automations, `/automations`): a plan plus one instruction plus the workspace it runs in. When the plan comes due, the server opens a real thread in that workspace and sends it the instruction, so every run leaves a conversation you can read and continue. Plans are **once**, **daily** and **weekly**, evaluated as wall-clock times in an IANA timezone; a task can be paused, resumed or run by hand, a one-off switches itself off once it has run, and a trigger missed by more than six hours is rolled forward instead of firing late. Each task carries the composer's interaction mode (Agent / Plan / Goal) into its runs. ([.docs/automations.md](.docs/automations.md))
- The `schedule_task` agent tool: "every morning, summarise what changed here" now schedules the task from the conversation itself. It resolves the workspace from the thread it was called in, reports the task id and the next run instant back to the model, and is off in Plan mode. ([.docs/automations.md](.docs/automations.md))
- The engineering workflow is the default for every request, and it is installed rather than assumed. The system prompt now carries a workflow section (DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP, with the skill to read at each stage and the judgement call for when a task does not need the process at all) plus the list of the machine's other skills. The `addyosmani/agent-skills` pack backs it — 25 skills, MIT — and the server keeps it installed at the system level through the official CLI (`npx skills add … --global --agent universal`), forked at startup so an offline machine costs a log line and nothing else. Both sections are injected per turn and in every interaction mode, so a fresh thread already has them. ([.docs/skills-and-workflow.md](.docs/skills-and-workflow.md))
- The `kanban_comment` agent tool and the board's standing instructions: a task dispatched from 进行中 now leaves one comment per finished step on its card (what finished, what proved it, what comes next), because conversation text never reaches the board. The card is resolved from the thread the task was dispatched from, so the model cannot aim a comment at another task, and a conversation that is not a board task is told that nothing was written instead of getting a silent success. Off in Plan mode, no approval prompt. ([.docs/skills-and-workflow.md](.docs/skills-and-workflow.md))
- Run modes in the composer: **Agent** (default), **Plan** and **Goal**. The mode travels with the turn and is kept in thread state. Goal mode stores the objective, its acceptance criteria and a token budget, and the harness continues the work across turns (capped by `AGENT_GOAL_MAX_CONTINUATIONS`) until the goal is completed, dropped, or out of budget; the composer's goal panel can pause, resume, complete or drop it. ([#20])
- Model providers under Settings → Model Providers: a provider rail with built-in and custom groups and status dots, an add-provider form with template picker (OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, DeepSeek, 智谱 AI) and the `ENV_VAR` / `!shell` key hint. ([#19], [#20])
- Add/edit-model dialog: model id, context window (default `1000000`), max output tokens (default `128000`) and input kinds (text, image, video, PDF). Model rows show context/output badges. ([#20])
- Kanban boards, one per project at `.kanban/board.json`: 待开始 / 进行中 / 已完成 / 已阻塞 / 归档 columns with drag and drop, agent dispatch when a task lands in 进行中 or is created there, requirement briefs an agent can draft from the title, and a task detail view that merges board comments with the agent's messages from the thread it ran in — including steer and interrupt for a running turn. ([#20])
- `@peakcode/agent-toolkit`, the agent harness hosted from the server: tools, plans, goals, approvals, skills, runtime paths, their sqlite store, and migration `040_AgentToolkit`. ([#20])
- Settings navigation split (`SettingsNav`, with the skills panel among its sections) and chat activity rows for plan/goal/approval steps. ([#20])

### Changed

- The vendored pi SDK moves from `0.74.0` to `0.85.1`, which is what packages built against current pi require (pi-crew needs `>=0.84.3`) and what the `pi` CLI on the same machine already runs. The migration replaces the removed `AuthStorage` + `ModelRegistry.create` pair with the async `ModelRuntime` in the adapter, the provider health probe, git text generation, and the "test connection" probe, and reads completion through the `@earendil-works/pi-ai/compat` entrypoint.
- Extensions no longer need a warning to explain themselves: pi supplies a no-op UI context with `ctx.hasUI === false`, so `ctx.ui.*` calls are inert rather than fatal. The session warning now says that instead of implying extension behavior is unsupported. ([#20])
- The automation model is now Peak Code's own rather than the ported cron shape: plans are once/daily/weekly with a persisted next-run instant instead of five-field cron expressions, a run ends when its conversation reports back (previously a run was recorded as completed the moment its turn was queued), and the run history shows the outcome with a summary and a link into the conversation.
- Scheduling a task from a chat goes through the agent's `schedule_task` tool instead of the client-side keyword interceptor, which used to swallow the message before it reached the model.
- The automations page is rebuilt around the new model: a task description and a workspace picker in the editor, a run history under each task, and react-query polling so scheduled runs appear without a manual reload.
- Documentation covers the new surface: a Scheduled Tasks section in README (English and Chinese) and [.docs/automations.md](.docs/automations.md).
- App identity is unified on `com.peakcode.app` / `com.peakcode.app.dev` across the Electron dev launcher, the Windows AUMID and electron-builder's `appId`, so one app owns its taskbar grouping, shortcuts and notifications. The macOS About panel and the staged installer metadata now read **Peak Code AI**, matching the LICENSE holder. ([#20])
- The server CLI command is `peakcode` instead of `t3`, matching the published bin name. ([#20])
- Documentation covers the new surfaces: README (English and Chinese), `.docs/runtime-modes.md`, `.docs/encyclopedia.md`, `.docs/workspace-layout.md`, `.docs/scripts.md`, and the package tables in `CONTRIBUTING.md`, `CONTRIBUTING.zh.md` and `AGENTS.md`. ([#20])

### Removed

- The automation script columns (`scriptId`, `scriptName`, `scriptCommand`), which no code path ever wrote, and the automation templates that were tied to cron expressions. Migration `041_AutomationSchedules` rebuilds both automation tables; existing cron-based rows are not converted — see [.docs/automations.md](.docs/automations.md).
- The client-side provider-to-provider handoff path: `useThreadHandoff` (called from nowhere), the target-provider list that could only ever be empty now that Pi is the only provider, and the handoff creation, title and model-selection helpers around them. The `thread.handoff.create` command stays on the server, where it is tested and still reads the handoff metadata older threads carry. Threads created before this change keep their handoff badge.

### Fixed

- Desktop packaging (`bun run dist:desktop:*`) no longer fails on bundled `workspace:` dependencies. tsdown inlines every `@peakcode/*` package into the server bundle, so they are skipped when staging the production install. ([#20])
- The release smoke test derives its workspace manifest fixture from the root `workspaces` globs instead of a hardcoded list, so a newly added package can no longer break the release-only steps by being absent from the fixture. ([#20])
- Cached `.electron-runtime` bundles are re-patched when `LAUNCHER_VERSION` changes, and each patched bundle keeps its own metadata file, so Dev and Alpha can no longer validate against the other variant's stale patch. ([#20])
- Saving a model in the provider settings no longer invalidates the `models.json` that pi loads: `video`/`pdf` are stored in a key pi ignores, and cleared fields are dropped from the saved config instead of being written as empty values. ([#20])

## [0.0.2] - 2026-06-22

### Added

- Claude Fable 5 model option. ([#4])
- Windows dev mode auto-detection: `bun run dev` runs the server on Node.js. ([#6])

### Changed

- Sidebar thread preview limit and empty-project UX. ([#3])
- Fewer redundant tokens sent per turn for the Codex and Claude providers. ([#7])

### Fixed

- Provider health spawn defect handling. ([#1])

## [0.0.1] - 2026-06-09

Initial public release: desktop builds for macOS, Windows and Linux, the Codex provider, and the web GUI.

[Unreleased]: https://github.com/PeakCode-AI/PeakCode/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/PeakCode-AI/PeakCode/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/PeakCode-AI/PeakCode/releases/tag/v0.0.1
[#1]: https://github.com/PeakCode-AI/PeakCode/pull/1
[#3]: https://github.com/PeakCode-AI/PeakCode/pull/3
[#4]: https://github.com/PeakCode-AI/PeakCode/pull/4
[#6]: https://github.com/PeakCode-AI/PeakCode/pull/6
[#7]: https://github.com/PeakCode-AI/PeakCode/pull/7
[#19]: https://github.com/PeakCode-AI/PeakCode/pull/19
[#20]: https://github.com/PeakCode-AI/PeakCode/pull/20
