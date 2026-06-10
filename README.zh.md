<p align="center">
  <img src="./assets/prod/black-universal-1024.png" alt="Peak Code" width="128" />
</p>

<h1 align="center">Peak Code</h1>

<p align="center">
  <strong>AI 编程代理的开源图形界面。</strong><br />
  统一的精美界面，支持 Claude Code、Codex、Gemini、Kilo Code、OpenCode 等。
</p>

<p align="center">
  <a href="https://github.com/PeakCode-AI/PeakCode/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/PeakCode-AI/PeakCode?style=flat-square" alt="License" />
  </a>
  <a href="https://github.com/PeakCode-AI/PeakCode/stargazers">
    <img src="https://img.shields.io/github/stars/PeakCode-AI/PeakCode?style=flat-square" alt="Stars" />
  </a>
  <a href="https://discord.gg/jn4EGJjrvv">
    <img src="https://img.shields.io/discord/1354019574017490975?style=flat-square&logo=discord&logoColor=white&label=Discord&color=5865F2" alt="Discord" />
  </a>
  <a href="https://github.com/PeakCode-AI/PeakCode/releases">
    <img src="https://img.shields.io/github/v/release/PeakCode-AI/PeakCode?style=flat-square&label=Release" alt="Release" />
  </a>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-功能特性">功能特性</a> •
  <a href="https://discord.gg/jn4EGJjrvv">Discord</a> •
  <a href="#-参与贡献">参与贡献</a>
</p>

---

![Peak Code 截图](./assets/prod/readme-screenshot.png)

## 为什么选择 Peak Code？

AI 编程代理功能强大，但通过原始终端使用它们体验很差。Peak Code 为你提供**精致、本地优先的桌面和 Web 界面**，将你喜爱的 AI 代理统一在一个体验中：

- **告别终端切换** — 在一个窗口中管理多个 AI 代理会话
- **实时流式输出** — 实时观看代码生成、审查和应用
- **内置 Git 工作流** — 分支、提交、推送、查看 diff，无需离开应用
- **代码保留在本地** — 一切都在你的机器上运行，绝不接触云端

## 快速开始

### 桌面应用（推荐）

从 [Releases](https://github.com/PeakCode-AI/PeakCode/releases) 下载：

| 平台    | 格式        |
| ------- | ----------- |
| macOS   | `.dmg`      |
| Windows | `.exe`      |
| Linux   | `.AppImage` |

### 从源码构建

```bash
git clone https://github.com/PeakCode-AI/PeakCode.git
cd PeakCode
bun install
bun run dev
```

> **要求：** [Codex CLI](https://github.com/openai/codex)、Node.js 24+ 或 Bun、Git 2.30+、现代浏览器。

#### 从源码构建 - Windows

Windows 上服务器需用 Node.js 运行（Bun 尚未实现 ConPTY）。`dev` 命令已自动处理此问题。克隆项目后：

```powershell
# 安装依赖（如果配了私有 npm 仓库，需指定公网 registry）
bun install --registry https://registry.npmjs.org

# 构建服务器（一次性）
bun run build

# 启动开发环境
bun run dev
```

然后浏览器打开 **`http://localhost:5733`**。

> `bun run dev` 自动检测 Windows 并用 Node.js 运行服务器，同时启动 Vite 前端——和 macOS/Linux 同一个命令。

## 功能特性

### 多代理，统一界面

无需改变工作流即可无缝切换 AI 编程提供商：

| 提供商         | 状态   |
| -------------- | ------ |
| Claude Code    | 已支持 |
| Codex (OpenAI) | 已支持 |
| Gemini         | 已支持 |
| Kilo Code      | 已支持 |
| OpenCode       | 已支持 |

### 实时流式输出

实时观看 AI 代理工作——看到代码被编写、工具被调用、结果即时呈现。无需轮询，无需刷新。

### Git 集成

内置版本控制，支持分支管理、暂存、提交和推送——一切都在你与 AI 交互的同一界面中完成。

### 会话持久化

会话在重启后依然保留。智能检查点机制会捕获对话状态，让你可以从中断处精确恢复。

### 集成终端与编辑器

内置终端用于命令执行，基于 Monaco 的代码编辑器支持语法高亮——无需离开窗口即可完成所有操作。

### 跨平台

支持原生 **Electron 桌面应用**（macOS、Windows、Linux）和可自托管的 **Web 应用**。

## 架构

Peak Code 采用分层客户端-服务器架构：

```
浏览器 / 桌面 (React + Vite + Electron)
        │ WebSocket
        ▼
   Node.js 服务器
        │ JSON-RPC over stdio
        ▼
   AI 代理运行时 (codex app-server)
```

| 层             | 关键组件                               |
| -------------- | -------------------------------------- |
| **展示层**     | React UI、Zustand 状态管理、主题系统   |
| **应用层**     | Native API、事件处理器、WebSocket 传输 |
| **领域层**     | 编排引擎、领域事件、状态投影           |
| **基础设施层** | 提供商服务、Git 服务、终端服务         |

详见 [`.docs/architecture.md`](./.docs/architecture.md) 获取完整技术深入分析。

## 开发

```bash
# 完整开发环境（Web UI + 服务器）
bun run dev

# 单独服务
bun run dev:server         # 仅服务器
bun run dev:web            # 仅 Web UI
bun run dev:desktop        # 桌面应用

# 质量检查
bun run test               # Vitest 测试套件
bun run lint               # oxlint
bun run fmt                # oxfmt 格式化
bun run typecheck          # TypeScript 类型检查

# 桌面分发
bun run dist:desktop:dmg   # macOS DMG
bun run dist:desktop:linux # Linux AppImage
bun run dist:desktop:win   # Windows 安装包
```

### Windows 开发

`bun run dev` 自动检测 Windows 并用 Node.js 运行服务器，工作流与 macOS/Linux 一致：

```powershell
# 首次：构建服务器
bun run build

# 一键启动前后端
bun run dev
```

打开 **`http://localhost:5733`**。修改服务器源码后，运行 `bun run build` 重新构建并重启。

> Windows 上 `bun run dev` 会将 Vite（Bun）和 Node.js 服务器作为两个协调进程启动——无需手动开终端或配环境变量。

### 隔离开发

与现有 Peak Code 实例并行运行，避免端口冲突：

```bash
env -u PEAKCODE_AUTH_TOKEN PEAKCODE_PORT_OFFSET=3158 PEAKCODE_NO_BROWSER=1 \
  bun run dev -- --home-dir ./.peakcode-dev --port 58090
```

## 参与贡献

欢迎贡献！在提交 Issue 或 PR 前请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

**快速指南：**

- 保持 PR 简洁（< 200 行）
- 每个 PR 只关注一个问题
- 说明**什么**改变了以及**为什么**
- UI 变更请附上修改前后的截图
- 为新功能编写测试

## 社区

- **[GitHub Issues](https://github.com/PeakCode-AI/PeakCode/issues)** — 报告 Bug 和请求功能

## Star 历史

如果 Peak Code 对你的工作流有帮助，不妨给它一个 Star——这能帮助更多人发现这个项目。

## 开源许可

[MIT](./LICENSE) — 随意使用、修改和发布。
