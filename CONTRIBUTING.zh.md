# 参与 Peak Code 贡献

感谢您对 Peak Code 的兴趣。本文档定义了所有贡献的标准、流程和期望。在提交 issue 或 pull request 之前，请仔细阅读。

**Peak Code 处于早期阶段。** 架构和 API 仍在演进中。我们不仅欢迎、而且鼓励提出能改善长期可维护性的全局性变更。但每一项变更都必须有充分理由、聚焦明确，并与项目的核心优先级保持一致。

---

## 目录

- [行为准则](#行为准则)
- [核心优先级](#核心优先级)
- [贡献方式](#贡献方式)
  - [报告 Bug](#报告-bug)
  - [建议改进](#建议改进)
  - [改进文档](#改进文档)
  - [贡献代码](#贡献代码)
- [开发环境搭建](#开发环境搭建)
  - [前置条件](#前置条件)
  - [仓库设置](#仓库设置)
  - [开发命令](#开发命令)
  - [隔离开发](#隔离开发)
- [项目架构](#项目架构)
  - [Monorepo 包结构](#monorepo-包结构)
  - [事件生命周期](#事件生命周期)
  - [后台工作者](#后台工作者)
  - [运行时信号](#运行时信号)
- [编码规范](#编码规范)
  - [通用原则](#通用原则)
  - [TypeScript 与 Effect-TS](#typescript-与-effect-ts)
  - [React 与 UI](#react-与-ui)
  - [格式化与代码检查](#格式化与代码检查)
  - [测试](#测试)
- [Pull Request 流程](#pull-request-流程)
  - [编码之前](#编码之前)
  - [好的 PR 的标准](#好的-pr-的标准)
  - [PR 模板](#pr-模板)
  - [审查流程](#审查流程)
- [对话记录性能护栏](#对话记录性能护栏)
- [本地开发实例隔离](#本地开发实例隔离)
- [包职责与子路径导出](#包职责与子路径导出)
- [贡献者许可协议](#贡献者许可协议)

---

## 行为准则

本项目遵循 [MIT 许可](./LICENSE) 条款。在所有互动中，请尊重维护者和其他贡献者。保持建设性，假设善意，让讨论聚焦于技术本身。

我们保留阻止或封禁任何破坏社区健康环境者的权利。

---

## 核心优先级

每一项贡献都会按以下优先级顺序进行评估：

1. **性能优先。** Peak Code 封装了资源密集型的 AI 代理运行时。GUI 绝不能成为瓶颈。每一次渲染、每一次 store 更新、每一条 WebSocket 消息都必须有其性能上的合理性。
2. **可靠性优先。** 会话必须能在重启后存活。流式传输不能丢帧。状态必须是确定性的。部分故障不能损坏会话。
3. **在负载和故障下可预测。** 会话重启、重连和部分流的行为必须一致。优雅降级是强制要求。

> **当不可避免需要权衡时，选择正确性和健壮性，而非短期便利。**

---

## 贡献方式

### 报告 Bug

如果您发现了 Bug，请[创建 issue](https://github.com/PeakCode-AI/PeakCode/issues)。一个好的 Bug 报告包括：

- 清晰的 Bug 描述及其影响
- 复现步骤，并注明确切的运行环境（操作系统、浏览器、AI 提供方）
- 期望行为与实际行为的对比
- 相关截图、视频或日志
- 该问题是否可跨多个 AI 提供方（Codex、Claude 等）复现，还是特定于某一提供方

### 建议改进

在提出新功能之前：

1. 先搜索已有的 [issues](https://github.com/PeakCode-AI/PeakCode/issues) 和 [discussions](https://github.com/PeakCode-AI/PeakCode/discussions)，避免重复。
2. 描述您想解决的问题，而不仅仅描述您想要的解决方案。
3. 说明该改进如何与项目的核心优先级保持一致。
4. 如果修改涉及对话记录（transcript）、滚动或流式传输路径，请先阅读[对话记录性能护栏](#对话记录性能护栏)。

以牺牲性能或可靠性为代价追求外观便利的改进将被拒绝。

### 改进文档

文档至关重要。如果您发现文档缺失、不清晰或过时：

- 架构文档：提交 PR 到 `.docs/` 目录
- 用户文档：提交 PR 到 `docs/` 目录
- 内部指南：`AGENTS.md` 记录了自动化代理所使用的约定

编写文档时，清晰优于全面。一篇简短而正确的文档胜过一篇冗长而过时的文档。

---

## 开发环境搭建

### 前置条件

| 依赖      | 最低版本 | 说明                 |
| --------- | -------- | -------------------- |
| Bun       | ^1.3.9   | 包管理器及运行时     |
| Node.js   | ^24.13.1 | 部分工具链所需       |
| Git       | 2.30+    | 版本控制集成         |
| Codex CLI | latest   | Codex 提供方支持所需 |

本项目使用 **Bun** 作为包管理器，采用 `isolated` 链接器。请勿使用 `npm` 或 `yarn`。

### 仓库设置

```bash
git clone https://github.com/PeakCode-AI/PeakCode.git
cd PeakCode
bun install
```

> **注意：** `bun install` 会在根目录安装所有 workspace 依赖。请勿在单个 workspace 包中单独运行 `bun install`。

### 开发命令

```bash
# 完整开发环境（Web UI + 服务器）
bun run dev

# 单个服务
bun run dev:server              # 仅服务器
bun run dev:web                 # 仅 Web UI
bun run dev:desktop             # 桌面（Electron）应用

# 质量检查（提交前运行）
bun run test                    # Vitest 测试套件
bun run lint                    # oxlint
bun run fmt                     # oxfmt
bun run typecheck               # TypeScript 类型检查

# 桌面分发版本构建
bun run dist:desktop:dmg        # macOS DMG
bun run dist:desktop:linux      # Linux AppImage
bun run dist:desktop:win        # Windows 安装包
```

> **重要：** 在提交 PR 之前，请一次性运行全部四项质量检查（`test`、`lint`、`fmt` 检查、`typecheck`）。避免在迭代过程中反复运行单项检查——在最后统一执行。

### 隔离开发

当与现有的 Peak Code 实例同时运行时，请避免端口和状态冲突：

```bash
env -u PEAKCODE_AUTH_TOKEN \
  PEAKCODE_PORT_OFFSET=3158 \
  PEAKCODE_NO_BROWSER=1 \
  bun run dev -- --home-dir ./.peakcode-dev --port 58090
```

始终先试运行以检测冲突：

```bash
env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 \
  bun run dev -- --home-dir ./.peakcode-dev --port 58090 --dry-run
```

如果连接后 UI 不显示任何会话（threads），问题很可能是 WebSocket 认证不匹配或端口冲突——在对 SQL 进行调试之前，请先检查您的 `PEAKCODE_AUTH_TOKEN` 和端口绑定。

---

## 项目架构

### Monorepo 包结构

| 路径                  | 职责                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/server`         | Node.js WebSocket 服务器。包装 Codex app-server（通过 stdio 进行 JSON-RPC 通信），提供 React Web 应用，管理 AI 提供方会话。 |
| `apps/web`            | React/Vite UI。会话用户体验、对话渲染、客户端状态管理。通过 WebSocket 连接。                                                |
| `apps/desktop`        | Electron 桌面外壳。将 Web 应用封装为原生桌面应用。                                                                          |
| `apps/marketing`      | 营销/落地页网站。                                                                                                           |
| `packages/contracts`  | Effect-TS Schema 定义和 TypeScript 合约。仅包含 Schema——不含运行时逻辑。                                                    |
| `packages/shared`     | 被服务器和 Web 共同使用的运行时工具库。使用显式子路径导出——不使用 barrel index。                                            |
| `packages/effect-acp` | Effect-TS ACP（Agents, Context, Policies）集成。                                                                            |

### 事件生命周期

数据流遵循严格的分层路径：

```
Browser → WebSocket → wsServer → ProviderService → codex app-server
                                                                  ↓
Browser ← ServerPushBus ← OrchestrationEngine ← ProviderRuntimeIngestion
```

1. 浏览器中的用户操作通过 `WsTransport` 变为类型化的 WebSocket 请求
2. `wsServer` 使用 `packages/contracts/src/ws.ts` 中的共享合约解码并路由请求
3. `ProviderService` 启动或恢复会话，通过 stdio 上的 JSON-RPC 与 `codex app-server` 通信
4. `ProviderRuntimeIngestion` 摄取 AI 提供方的原生事件，将其规范化为编排事件
5. `OrchestrationEngine` 持久化事件、更新读取模型、暴露领域事件
6. `ServerPushBus` 通过 `orchestration.ts` 中定义的通道向浏览器推送类型化更新

### 后台工作者

长时间运行的异步流程作为队列支持的工作者运行，以保持副作用有序并使测试同步具有确定性：

- **ProviderRuntimeIngestion** —— 摄取 AI 提供方运行时事件
- **ProviderCommandReactor** —— 异步响应 AI 提供方命令
- **CheckpointReactor** —— 处理会话检查点任务

当里程碑完成时，服务器在 `RuntimeReceiptBus` 上发出类型化的收据（例如检查点完成、回合静止）。测试等待这些收据而非轮询。

### 运行时信号

- 检查点完成（Checkpoint completion）
- 回合静止（Turn quiescence）
- 差异完成（Diff finalization）

这些信号是异步协调的唯一认可机制。请勿轮询内部状态。

---

## 编码规范

### 通用原则

- **代码中不加注释。** 代码应通过清晰的命名、短小的函数和 Effect-TS 类型化管道实现自文档化。如果某段代码不加注释就难以理解，请重构它。
- **提取而非重复。** 添加新功能时，先检查是否有可提取到独立模块的共享逻辑。在多个文件中重复相同逻辑是代码坏味道。
- **不使用 barrel index 文件。** `packages/shared` 包使用显式子路径导出（例如 `@t3tools/shared/git`）。请勿添加 `index.ts` barrel 文件。
- **不要害怕重构。** 这是一个早期项目。如果现有代码阻碍了干净的解决方案，请修改它——但要在 PR 中说明重构的理由。
- **代码和 UI 中不使用 emoji**，除非用户明确要求。

### TypeScript 与 Effect-TS

- **严格 TypeScript。** 本项目使用严格模式 TypeScript，并重度使用 Effect-TS。所有新代码必须在适用之处使用 Effect-TS 模式（Schema、Effect、Layer）。
- **Effect-TS Schema**（`packages/contracts`）是所有协议类型、WebSocket 消息格式和领域事件的唯一数据来源。切勿重复定义类型。
- **Effect Layers** 用于依赖注入。所有服务都应表示为组合在运行时图中的 `Layer`。
- **禁止使用 `any`。** 如果需要逃逸口，优先使用 `unknown` 配合恰当的类型收窄。如果必须使用 `any`，请在 PR 中说明理由。
- **避免使用类（class）。** 优先使用 Effect-TS 的函数式模式（pipe、generator、Layer）而非面向对象模式。

### React 与 UI

- **Zustand stores** 是主要的状态管理模式。请勿引入 Redux、MobX 或其他状态管理库。
- **Tailwind CSS** 用于样式，颜色使用主题系统定义。除非有可衡量的性能理由，否则不要使用内联样式或 CSS Modules。
- **禁止在主题之外使用显式颜色类**（例如 `text-yellow-400` 是不允许的）。请使用主题 tokens。
- **UI 变更必须在 PR 中附带前后对比截图。** 对于动画或交互变更，请附上视频。
- **组件应短小精悍。** 如果某个组件超过 200 行，请考虑将其拆分。

### 格式化与代码检查

本项目使用 **oxlint** 进行代码检查，使用 **oxfmt** 进行格式化（不使用 Prettier，不使用 ESLint）。

```bash
bun run lint       # oxlint
bun run fmt        # oxfmt（自动修复）
bun run fmt:check  # oxfmt（仅检查）
```

所有代码必须在提交 PR 之前通过 `bun run lint` 和 `bun run fmt:check`。

### 测试

- **Vitest** 是测试框架（通过 `bun run test` 运行，永远不要使用 `bun test`）。
- 测试文件与源码文件放在一起（同目录）。
- **新功能必须包含测试。** 如果您的 PR 引入了新模块，必须包含测试。
- **如果改动影响了已有行为，请更新现有测试。**
- **功能测试是主要关注点**——项目重视集成级别的测试胜过纯单元测试，尤其是围绕编排引擎、WebSocket 协议和后台工作者流程的测试。
- **使用运行时信号**（`RuntimeReceiptBus`）进行测试同步，而非使用任意的定时器或轮询。

---

## Pull Request 流程

### 编码之前

1. **先创建 issue**（或在已有 issue 中评论）来讨论您计划中的修改。这确保您的工作方向与项目一致，避免浪费精力。
2. **控制范围。** 一个 PR 只解决一个问题。如果您有多个不相关的修改，请分别提交 PR。
3. **遵循上述编码规范。** 不符合规范的代码将不会被合并。

### 好的 PR 的标准

- **小而精。** PR 最好控制在 200 行以内。大 PR 难以审查，且更可能被拒绝。
- **动机清晰。** 说明*改了什么*以及*为什么改*。如果改动不直观，请附上推理过程。
- **包含测试。** 新功能必须包含测试。Bug 修复必须包含回归测试。
- **质量检查通过。** 在提交 PR 之前运行 `bun run test`、`bun run lint`、`bun run fmt:check` 和 `bun run typecheck`。
- **UI 变更附带截图。** 前后对比图是必须的。动画/交互变更需要视频。
- **从 `main` 分支创建。** 分支命名要有描述性（例如 `fix-ws-reconnect`、`feat-thread-persistence`）。

### PR 模板

使用位于 [`.github/pull_request_template.md`](.github/pull_request_template.md) 的 PR 模板。它要求填写：

- **What Changed（改了什么）** —— 清晰描述变更，保持范围紧凑
- **Why（为什么）** —— 说明解决的问题以及为什么这个方案是正确的
- **UI Changes（UI 变更）** —— 前后对比截图（如不适用请删除该章节）
- **Checklist（检查清单）** —— 范围小且精、提供了说明、附带了截图

### 审查流程

1. **初次审查** —— 维护者会审查您的 PR。响应时间取决于维护者的可用时间。
2. **反馈循环** —— 审查者可能要求修改。请处理所有反馈。如果您不同意，请说明理由——但要准备好接受审查者在架构和项目方向上的判断。
3. **自动检查** —— CI 会运行 lint、typecheck 和完整的测试套件。所有项目必须在合并前通过。
4. **批准与合并** —— 批准且 CI 通过后，维护者会合并您的 PR。

> **注意：** Peak Code 是一个小团队项目。PR 可能会在审查前停留一段时间。请耐心等待。如果 PR 打开超过两周没有任何回复，可以礼貌地在 thread 中提醒一下。

---

## 对话记录性能护栏

对话记录（聊天消息列表）是 UI 中对性能最敏感的组件。在对对话记录的渲染、滚动或状态进行修改时，请遵守以下规则：

1. **将自动滚动视为实时输出功能，而非泛化的"工作中"指示器。** 缓冲、重连、待批准状态和仅工具活动不得触发自动滚动，仿佛 AI 文本正在实时流式传输。
2. **只计数真实的对话消息。** 工具行和工作行不得重新触发"新内容到达"自动粘底路径。
3. **常规情况下优先使用简单的 fork 式对话记录路径。** 中小规模的对话记录应避免虚拟化的抖动，除非有明确的、可衡量的性能需求。
4. **如果使用虚拟化，** 切勿将 `rowVirtualizer.measure()` 直接耦合到另一个粘底或高度追踪循环中。实时输出的高度追踪必须保持单向，以避免 measure/scroll 反馈循环。
5. **在修改聊天滚动、时间线测量或侧边栏触发的对话记录更新时，** 需要用专门的测试来保护这些行为。

违反这些护栏将导致审查不通过。它们之所以存在，是因为每一次违反都在实际使用中导致了可观察到的界面卡顿。

---

## 本地开发实例隔离

当开发实例与生产实例或其他开发实例同时运行时：

- **切勿盲目运行 `bun run dev`**，除非您明确希望共享端口和状态。
- **使用隔离的家目录和非默认端口。** 示例：
  ```bash
  env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 \
    bun run dev -- --home-dir ./.peakcode-dev --port 58090
  ```
- **始终先试运行**以检测冲突：
  ```bash
  env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 \
    bun run dev -- --home-dir ./.peakcode-dev --port 58090 --dry-run
  ```
- **浏览器开发实例需取消设置 `PEAKCODE_AUTH_TOKEN`**，除非 Web 应用已配置使用该 token。认证不匹配会导致 WebSocket 静默拒绝，此时即使 SQLite 中有数据，UI 也不会显示任何会话。
- **同时检查服务器和 Web 端口**，使用 `lsof -nP -iTCP:<port> -sTCP:LISTEN`。桌面应用可能绑定 `127.0.0.1:<port>`，而开发服务器可能绑定 IPv6 `*:<port>`——`localhost` 可能指向错误的进程。
- **如果 UI 不显示会话，** 首先通过检查隔离的 `state.sqlite` 文件来验证服务器路径，然后通过 WebSocket 探查 `orchestration.getSnapshot`。如果快照中含有项目/会话数据，则说明问题是客户端连接或数据初始化，而不是数据库为空。

---

## 包职责与子路径导出

### `packages/contracts` —— 仅含 Schema

此包是以下内容唯一的单一数据来源：

- AI 提供方事件 Schema
- WebSocket 协议消息格式
- 模型和会话类型

**运行时逻辑不归属此处。** 如果您需要工具函数，请放到 `packages/shared` 中。

### `packages/shared` —— 显式子路径导出

此包导出共享的运行时工具。它**不使用** barrel index 文件。请这样导入：

```typescript
import { DrainableWorker } from "@t3tools/shared/DrainableWorker";
// 错误：import { DrainableWorker } from "@t3tools/shared";
```

在 `packages/shared` 中添加新模块时，请在 `package.json` 中为该包添加对应的 `exports` 字段条目。

---

## 贡献者许可协议

提交 pull request 即表示您同意您的贡献将按照本项目使用的 [MIT 许可](./LICENSE) 进行许可。您声明您有权授予此许可。

如果这是您第一次向本项目贡献代码，CLA 机器人会要求您确认接受。请回复：

```
I have read the CLA Document and I hereby sign the CLA
```

该确认在每个仓库只需进行一次，后续贡献无需重复。

---

_感谢您帮助 Peak Code 变得更好。每一份深思熟虑的贡献——无论是 Bug 报告、文档修复还是代码修改——都在推动项目向前发展。_
