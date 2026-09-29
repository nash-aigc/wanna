# Pi 全览（2026-09-29）

**这一篇是"看全局"的那一篇。** 官方全文在 `reference/pi/`（本地，8.0 MB，166 份 markdown），
逐条依据在 `全局依据.md`（P1–P12）。**先看这一篇，再决定去读哪一份。**

## 一句话

**Pi 是一个 agent 运行时**（官方自称 *"a minimal agent harness"*），
我们用它**替换掉自己写的 agent 外壳**，19 个 MCP 工具和 11 个技能层不动。

## 它怎么跑

```bash
pi --mode rpc --no-session        # 长驻子进程 + JSONL（stdin 命令 / stdout 响应+事件）
```

四种模式：**interactive / print-JSON / RPC / SDK**。我们用 **RPC**（Wanna 是 Swift，非 Node）。

## 换血后各层归谁（这是全局观的核心）

| 层 | 归谁 | 我们要做的 |
|---|---|---|
| 刘海 / 语音 / TTS / 截屏 / 权限 / 光标 | **Wanna（Swift）** | 不动 |
| 19 个 MCP 工具 | **Wanna 的 MCP 服务端** | 不动（Pi 有官方 MCP 扩展接它） |
| 11 个技能 | **Pi** | 改名（中文→规范名）+ 挪到 `~/.agents/skills/` |
| 决策 / 循环 / 上下文 | **Pi** | 删 `wanna_agent.py` |
| 会话（树结构、可回退） | **Pi** | 删我们接的 `SQLiteSession` |
| 上下文压缩 | **Pi** | 删我们刚删过的那套 |
| 追踪 | **Pi 事件流** | 删 `local_trace.py` |
| 调用 | **`PiAgentRunner.swift`（新写）** | 起 `pi --mode rpc`、发 prompt、收事件 |
| 模型接入 | **`models.json`** | 配 DeepSeek（三方 OpenAI 协议，**不用写扩展**） |

## 动手前必须遵守的四条（官方 `rpc.md`，台账 P1–P7）

1. **`prompt` 成功 ≠ 跑完** → 等 **`agent_settled`**，不是 `agent_end`
2. **先订阅事件、再发 prompt** → 否则快速完成的 run **永久挂住**
3. **只在 LF 上切帧** → `U+2028`/`U+2029` 在 JSON 字符串里合法
4. **stdout 只走协议** → 诊断日志走 stderr

## ⚠️ 两个会静默出问题的点

- **技能中文名**：规范要求 `小写字母/数字/连字符`，且 **没有 description 的技能不会加载**
  （官方：*"declared skills without descriptions are not loaded"*）。**改了名没生效，屏幕上不会说。**
- **技能位置**：Pi 认 `~/.agents/skills/` 与 `.agents/skills/`，我们的在
  `~/Documents/SuperAgent/APP/Design/wanna/skills/`。

## 还没读的（下一步）

`rpc-commands.md`（`prompt` 的全部 disposition）· `json.md`（事件流定义）·
`cli.md`（全部选项）· `extensions.md`（MCP 扩展怎么装）·
`models.md`（`models.json` 具体写法）· `sessions.md` · `compaction.md`

## 文档目录树（38 份，从文件生成）

| 文档（`reference/pi/packages/coding-agent/docs/`） | 是什么 |
|---|---|
| `cli-integration.md` | By default, running `pi` opens the interactive terminal interface. When input  |
| `cli.md` | This page documents Pi's built-in command-line commands and options. Run `pi - |
| `compaction.md` | This reference describes automatic compaction, branch summarization, persisted |
| `configuration.md` | Pi supports user-level and project configuration. User-level configuration liv |
| `containerization.md` | Use an isolated environment to limit the files, credentials, processes, and ne |
| `custom-provider.md` | A provider extension connects Pi to a model service that needs custom authenti |
| `environment-variables.md` | Pi uses environment variables in three ways: |
| `extensions.md` | Extensions are TypeScript modules that add executable behavior to Pi. Use one  |
| `how-pi-works.md` | Pi coordinates model requests, tool execution, context assembly, and session s |
| `index.md` | Pi is an extensible AI agent that works from your terminal. Give it a goal and |
| `json.md` | JSON mode emits structured progress for one invocation: |
| `keybindings.md` | Pi exposes named actions, such as `app.session.new`, that can be assigned keyb |
| `llama-cpp.md` | Pi supports the llama.cpp router server. The router discovers multiple GGUF mo |
| `message-types.md` | Pi uses `AgentMessage` values in SDK state, lifecycle events, RPC responses, a |
| `models.md` | For a built-in provider, start with `/login`, then choose a model with `/model |
| `packages.md` | Pi packages install and distribute extensions, skills, prompt templates, and t |
| `prompt-templates.md` | Prompt templates turn Markdown files into reusable `/` commands. Use one when  |
| `providers.md` | Most hosted providers support one or both of these authentication methods: |
| `quickstart.md` | Pi runs in your terminal and works with files on your machine. To use it, you  |
| `rpc-commands.md` | This reference lists commands accepted on stdin in RPC mode. Each command and  |
| `rpc-extension-ui.md` | Extensions can request user interaction through `ctx.ui`. In RPC mode, support |
| `rpc.md` | RPC mode runs Pi as a long-lived subprocess controlled through JSON records on |
| `sdk.md` | Use the SDK for in-process TypeScript integration. For a language-independent  |
| `security.md` | Treat model-generated commands and code as untrusted. Pi can read, change, and |
| `session-format.md` | Sessions are stored as JSONL (JSON Lines) files. Each line is a JSON object wi |
| `sessions.md` | Pi saves a conversation as a session. The active branch of that session suppli |
| `settings.md` | This reference lists user-configurable settings, their types, defaults, and pu |
| `shell-aliases.md` | Pi starts a separate non-interactive shell process for each Bash command. Non- |
| `skills.md` | Skills give Pi specialized instructions and supporting files for a particular  |
| `slash-commands.md` | Type `/` in Pi's terminal editor to search the commands available in the curre |
| `terminal-setup.md` | Most modern terminals work with Pi without additional setup. Use this page whe |
| `termux.md` | Pi runs on Android through Termux, a terminal emulator and Linux environment.  |
| `themes.md` | Themes control the colors Pi uses in interactive mode and HTML exports. Pi inc |
| `tmux.md` | Pi works inside tmux, but tmux can report `Shift+Enter`, `Ctrl+Enter`, and pla |
| `tui.md` | Start with `ctx.ui` methods from an extension. Build a custom component only w |
| `usage.md` | Run `pi` from the folder you want to work in. Pi uses that folder to discover  |
| `virtual-models.md` | A virtual model is a selectable model that picks a physical model for each req |
| `windows.md` | Run Pi either as a native Windows process or inside Windows Subsystem for Linu |
