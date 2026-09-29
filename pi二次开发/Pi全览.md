# Pi 全览 —— 换血时**先读这一篇**

> **为什么有这一篇**：用户 2026-09-29 的话 ——
> 「你的**上下文压缩后，你读过的内容会被你忘记**，把**具体功能、路径、核心关键**提取出来，
> 到一个 md，未来你**首先查看这个全局的全局预览**。」
>
> 所以这一篇是**干货密度最高的一份**：路径、命令、协议形状、坑。**细节以它为准，
> 不用再去翻官方**。官方全文在 `reference/pi/`（本地，8.0 MB），逐条依据在 `官方依据.md`（29 条）。

---

## 0. 一句话

**Pi 是一个 agent 运行时**（官方自称 *"a minimal agent harness"*）。
我们用它**替换掉自己写的 agent 外壳**；工具层与技能层不动。

## 1. 路径与命令（忘了就做不了）

| 东西 | 位置 / 命令 |
|---|---|
| 官方全文（本地副本） | `reference/pi/` |
| 核心文档 38 份 | `reference/pi/packages/coding-agent/docs/` |
| 它自己的技能样例 | `reference/pi/.pi/skills/` |
| **RPC 启动** | `pi --mode rpc --no-session` |
| **装 MCP 扩展** | `pi install npm:pi-mcp-adapter` |
| 装 subagent 扩展 | `pi install npm:pi-subagents` |
| 模型配置 | `models.json`（`/model` 会重载，不用重启） |
| 技能目录（Pi 认的） | `~/.agents/skills/` · `.agents/skills/` |

## 2. RPC 协议（接进 Swift 的全部依据）

**帧**：一行一个 JSON + LF。**只在 LF 上切**（`U+2028`/`U+2029` 在 JSON 字符串里合法）。
**stdout 只走协议**，诊断日志走 stderr。

**命令清单**（stdin）：

| 组 | 命令 |
|---|---|
| 提问 | `prompt` · `steer` · `follow_up` · `abort` · `clear_queue` · `new_session` |
| 状态 | `get_state` · `get_messages` |
| 模型 | `set_model` · `cycle_model` · `get_available_models` |
| 思考档 | `set_thinking_level` · `cycle_thinking_level` · `get_available_thinking_levels` |
| 队列模式 | `set_steering_mode` · `set_follow_up_mode` |
| **压缩** | **`compact`** · **`set_auto_compaction`** ← **Pi 自带上下文压缩** |
| 重试 | `set_auto_retry` · `abort_retry` |
| Bash | `bash` · `abort_bash` |
| 会话 | `get_session_stats` · `export_html` · `switch_session` |

**`prompt` 的 `data.disposition`** 三个值：
`"handled"`（被扩展消费，**不会有 run**）· `"queued"`（排队）· `"started"`（真的开跑）

**事件流**（stdout）：

| 事件 | 何时 |
|---|---|
| `agent_start` / `agent_end` | 一次底层 run 起 / 止（**`agent_end` 不是终点**） |
| **`agent_settled`** | **Pi 不会再自动继续** ← 完成判据就是这个 |
| `turn_start` / `turn_end` | 一个 assistant 回合 |
| `message_update` | 内容块更新，内含 `assistantMessageEvent` |
| **`text_delta`** | **流式文字**（`contentIndex` + `delta`）→ 喂 Wanna 的流式显示 |
| `thinking_delta` · `toolcall_start` · `toolcall_end` | 思考 / 工具调用 |
| `tool_execution_start` / `_update` / `_end` | 工具执行 → 喂 Wanna 的「N 条进度」 |
| `queue_update` · `session_info_changed` · `thinking_level_changed` | 队列 / 会话名 / 思考档 |

## 3. 四个必须遵守的点（不遵守会静默出问题）

1. **`prompt` 成功 ≠ 跑完** → 等 **`agent_settled`**（`agent_end` 之后还可能有 retries / compaction / steering）
2. **先订阅事件、再发 prompt** → 否则快速完成的 run **永久挂住**
3. **只在 LF 上切帧**
4. **stdout 只走协议**

## 3.5 ⚠️⚠️ 工具怎么给：**只能去掉三个，不能全关**（2026-09-29 实测，改之前必读）

**一条线记住：留 `read`，去掉 `bash,edit,write`。** 启动参数就是那一个：

```
--exclude-tools bash,edit,write
```

**为什么不能图省事写 `--no-builtin-tools`（内置全关）** —— 官方源码
`src/core/system-prompt.ts:165` 是个**写死的两个字面量数组**：

```ts
const skillFileReadTool = (["read", "bash"] as const).find((tool) => selectedTools.includes(tool));
if (skillFileReadTool && skills.length > 0) { …写入 <available_skills>… }
```

**没有 `read` 也没有 `bash` → 技能段整段不出现，而且不报错、不写日志。**
（金丝雀实测：放一条提到"紫色犀牛协议"的技能，问它认不认得 → 「没有」；留 `read` → 「有」。）
扩展/自定义工具**顶不上去** —— 那是个字面量数组，不查扩展。

**为什么又要去掉那三个** —— 它们是 Pi"用自己的手"的来源。用户报
「点快捷键进入 agent 模式，没有返回」那一轮，会话文件实证 Pi **完全没用我们给的 MCP 工具**：

```
bash  open -a Calculator && osascript …     ← 自己开计算器
bash  screencapture -x /tmp/calc.png        ← 自己截图
read  /tmp/calc.png                         ← 自己看图
bash  grep -rl "平凡" … find … url-tool      ← 满硬盘找目录，再也不回来
```

它是个 coding agent，**只要手里有 bash，它就会用自己的手**，而不是我们给的那 19 个工具。
去掉 `bash`/`edit`/`write` 之后，真机同一件事：**9 秒返回**，工具调用只有 MCP。

**留下的 `read` 不是妥协，是技能那条官方机制的必需品**：官方 `formatSkillsForPrompt`
给模型的是 `<name>` + `<description>` + `<location>`（**绝对路径**），正文由模型自己
用 `read` 去读 —— 正是三级披露。所以这一条同时保住了"技能能用"和"它不会自己动手"。

**改这里之后怎么验**（别只看日志）：`bash scripts/agent-mode-return-check.sh` —— 它跑一轮
真的带截图的任务，断言三件事：这一轮真的交给了 Pi / 有返回 / 那一轮新追加的帧里
**一次 `bash`/`edit`/`write` 都没有**（会话文件是累积历史，必须只看新增帧，否则永远红）。

## 4. 接 DeepSeek（不用写扩展）

```json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "api": "openai-completions",
      "apiKey": "$DEEPSEEK_API_KEY",
      "models": [{ "id": "deepseek-flash" }]
    }
  }
}
```
`apiKey` 支持 `$NAME` / `${NAME}` 环境变量、字面值、或 `!命令`。

## 5. ⚠️ 两个会**静默**出问题的点

- **技能名必须 `小写字母/数字/连字符`**（上限 64 字符）。我们那 4 个中文名（图形/执行/文本/复盘）**不合规**。
  且官方写着：*"declared skills without descriptions are not loaded"* —— **加载不了，屏幕上不会说**。
  → 中文名放进 `description`，`name` 用英文。
- **技能目录**：Pi 认 `~/.agents/skills/` 与 `.agents/skills/`，我们现在在
  `~/Documents/SuperAgent/APP/Design/wanna/skills/`。

## 6. 换血后各层归谁

| 层 | 归谁 |
|---|---|
| 刘海 / 语音 / TTS / 截屏 / 权限 / 光标 | **Wanna（Swift）** 不动 |
| 19 个 MCP 工具 | **Wanna 的 MCP 服务端** 不动 —— Pi 通过 **`pi-mcp-adapter`（第三方，1.2M/月）** 接 |
| 11 个技能 | **Pi** —— 改名 + 挪目录 |
| 决策 / 循环 / 会话 / 压缩 / 追踪 | **Pi**（全内置） |
| 调用 | **`PiAgentRunner.swift`（新写）** |
| 模型 | **`models.json`** |

## 7. 会话：存储、续接、分叉（官方 `sessions.md`）

**存在哪**：`~/.pi/agent/sessions/`（按工作目录分组）。
改位置：`--session-dir` / `PI_CODING_AGENT_SESSION_DIR` / `sessionDir` 设置（**命令行优先级最高**）。

| 命令行 | 作用 |
|---|---|
| `--continue` | 打开当前目录**最近**的那个会话 |
| `--resume` | 开会话选择器（交互模式里是 `/resume`；`/new` 开新的） |
| `--session <路径或 ID>` | 你已经知道是哪个 |
| `--fork` | 交互模式开始前，从既有会话分叉出一个新的 |
| **`--no-session`** | **临时运行**，退出后不能续 ← RPC 起手用的就是它 |

**记忆模型**：*"The **active branch** of that session supplies conversation history for the next model request."*
—— **是"当前分支"供上下文**，不是整棵树。

**分叉三种**（`/tree` 在同一文件内移动 · `/fork` 从更早的消息开新会话 · `/clone` 复制当前分支）
—— 对应 Wanna 的「新建对话」应该是哪一种，动手时要定。

## 8. 压缩：**Pi 内置**（官方 `compaction.md`）

⚠️ **推翻我们之前的结论** —— 之前说"官方没有压缩机制、要自己做"，那是
**OpenAI Agents SDK** 的情况；**Pi 有，而且不用你管。**

| 机制 | 触发 |
|---|---|
| **Compaction** | **上下文超阈值**，或 `/compact` |
| Branch summarization | `/tree` 切分支时 |

**自动压缩什么时候跑**（官方逐字）：
- 多轮 run 里，**工具跑完、结果追加之后**、下一个 assistant 回应开始之前
- 每次**新用户提问之前**
- **provider 报上下文溢出** 时，做**一次** compact-and-retry 恢复

**手动**：`/compact [instructions]` —— 可选指令用来**指定摘要聚焦什么**。
**反复压缩**时，摘要起点是**上一次压缩保留的边界**（`firstKeptEntryId`），
不是压缩条目本身 —— **这样上一次压缩后活下来的消息会被再带进下一轮摘要**。

## 8.5 ⭐ 核心逻辑（官方 `how-pi-works.md`）—— **这一节是全局观的心脏**

### Agent 循环

```
提交一条消息 → 加进"当前分支"
  → Pi 组装请求 = 系统提示词 + 当前分支 + 可用工具 + 模型设置
  → 交给所选 provider
  → provider 流式回 assistant 响应（可能含文字 + 工具调用）
  → Pi 记录响应 → 逐个执行工具调用 → 记录结果     ← 这算【一个 turn】
  → 如果工具结果或排队消息还需要再一次模型请求 → 再来一个 turn
  → 否则 run 结束
```

**三种"插话"的区别**（官方逐字，很容易搞混）：
- **Steering** —— 进入**当前 assistant 回合之后**
- **Follow-up** —— 进入**agent 把手上活干完之后**
- **Abort** —— 停当前 run，**把排队的消息退回编辑器**

### 上下文怎么组装（这是"记忆"的真正机制）

- **当前分支供历史** —— Pi 把 session 条目转成模型认的 user/assistant/tool-result 消息
- **系统提示词** = Pi 的基础指令 + **它发现的 context 文件**（就是 `AGENTS.md` 那一类）
- **请求里还带**：工具定义 + **技能描述**
- ⭐ **技能正文按需加载** —— *"Full skill instructions are loaded on demand."*
- 提示词模板在**变成用户消息之前**展开；选中的文件/图片/粘贴文本/shell 输出**可以变成消息内容**

### 会话的真相：**是 JSONL 文件里的一棵树**

- 每个树条目**有 ID、指向它的 parent**；**"当前条目"决定当前分支**
- 从更早的条目继续 → **在同一个文件里长出另一条分支**
- Fork / Clone → **把选中的历史复制进一个新的 session 文件**
- ⭐ **压缩的真相**：插入一条**摘要条目**，它**在后续请求里替代更老的消息** ——
  **而原始条目仍然留在 session 树里**（这就是"可回退"能成立的原因）

### 四个界面**共用同一套 agent 与 session 机制**

交互 / Print / JSON / RPC / SDK —— **只是界面不同，底下的循环与会话是同一套**。

### 信任

Pi **先决定项目可不可信，再加载项目设置与资源**，之后才加载 context 文件。
工具用 **Pi 进程的操作系统权限**；扩展**在那个进程里执行**（= 扩展是可信代码）。

## 8.7 ⭐ 配置在哪、技能怎么指、系统提示词怎么换（官方 `configuration.md` + `settings.md`）

### Agent 目录 = `~/.pi/agent/`（用户级配置都在这）

| 路径 | 管什么 |
|---|---|
| `settings.json` | 偏好、**资源路径**、Pi 包声明 |
| **`models.json`** | **兼容端点 / 模型** ← **DeepSeek 配在这** |
| `auth.json` | 保存的 API key 与 OAuth 凭据 |
| `AGENTS.md` / **`CLAUDE.md`** | 跨工作目录的用户指令 ⚠️ **见下面的风险** |
| **`SYSTEM.md`** | ⭐ **替换掉 Pi 的默认系统提示词** |
| `APPEND_SYSTEM.md` | 往系统提示词**追加** |
| `extensions/` · `skills/` · `prompts/` · `themes/` | 各资源的默认位置 |

**项目级**在 `.pi/`（**要等项目被信任之后才加载**）。

### ⭐ 技能不用挪目录 —— 用绝对路径指过去就行

官方 `settings.md` 逐字：

> `skills` \| `string[]` \| `[]` \| **Skill files or directories.**
> *"Resource paths in user settings resolve from the agent directory. **Absolute paths and `~` are supported.**"*

```json
{ "skills": ["/Users/mjm/Documents/SuperAgent/APP/Design/wanna/skills"] }
```

**→ 之前说"技能目录要挪到 `~/.agents/skills/`"是不必要的。** 指绝对路径即可，
而且是**用户级**设置（对所有工作目录生效）。

同理：`extensions` / `prompts` / `themes` / **`packages`** 都是同一张表里的数组，
都支持绝对路径与 `~`，也都支持 glob 排除 `!pattern`。

### ⭐ 系统提示词可以整个换掉

`SYSTEM.md` —— 官方表里逐字：*"**Replaces** Pi's default system prompt."*
**这正是你要的"系统提示词就是机械化的一句话"** —— 而且 Pi 还留了 `APPEND_SYSTEM.md` 做追加。

### ⚠️ 一个**必须处理的风险**：Pi 会自动读 `CLAUDE.md` / `AGENTS.md`

官方表里逐字：`<agent-dir>/AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, **`CLAUDE.md`**, or `CLAUDE.MD`
→ *"User instructions applied across working directories."*

**而 Wanna 仓库里那个 `AGENTS.md`（=CLAUDE.md 的真身）实测 `wc -c` = 515 542 字节 ≈ 503 KB
（≈ 12.5 万 token）。**
如果 Pi 在 Wanna 目录下跑，**它会把这一整份读进上下文** —— 那是灾难性的。

**动手时必须处理**（几个方向，动手时定）：
- Pi 跑在**别的工作目录**（不是 Wanna 仓库）
- 或者用 `AGENTS.override.md` / 配置把 context 文件关掉
- ⚠️ **这条在动手前必须验证**：Pi 到底在什么条件下读、读哪个目录的

## 9. 命令行（官方 `cli.md`）

**三种非交互模式**（决定我们怎么起 Pi）：

| 选项 | 行为 |
|---|---|
| `--mode rpc` | **读 stdin 的 JSONL 命令、往 stdout 写响应与事件，直到关闭** ← 我们用的 |
| `--mode json` | 跑完给的 prompt，把 JSONL 事件写 stdout，**然后退出** |
| `--mode text` | 文本输出（stdin/stdout 都是终端时仍开 TUI） |
| `-p`, `--print` | 跑 prompt，**只把最终 assistant 文字写 stdout**，然后退出 |

**输入怎么给**：`message`（初始 prompt）· `@path`（把文本文件或图片带进第一个 prompt）·
**管道 stdin**（内容前置到第一个 prompt）· `--`（让 prompt 能以 `-` 开头）

⚠️ 官方 `rpc.md` 另有一条：**RPC 模式拒绝 `@file` 形式的 prompt 参数**，prompt 一律走 `prompt` 命令。

## 10. 扩展怎么写（官方 `extensions.md`）

```ts
export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", { ... })
}
```

| 想加什么 | 用哪个 |
|---|---|
| 模型能调的操作（工具） | `pi.registerTool()` |
| 一个 `/` 斜杠命令 | `pi.registerCommand()` |
| 快捷键 / 命令行开关 | `pi.registerShortcut()` / `pi.registerFlag()` |
| 模型服务商 | `pi.registerProvider()` |
| 把请求路由到某个模型 | `pi.registerVirtualModel()` |

**我们的 19 个工具不走这条路** —— 它们是 MCP，用 `pi-mcp-adapter` 接。
**但将来 Wanna 想给 Pi 加一个专属工具，入口就在这里。**

## 11. 设置与资源加载（官方 `settings.md`）

资源的数组写法支持：**glob 排除 `!pattern`** · **精确包含 `+path`** · **精确排除 `-path`**。
用户级与项目级设置里的资源**都会加载**。

→ **我们那 11 个技能可以显式列进设置里**，不必非得挪到 `~/.agents/skills/`
（挪目录是"约定位置"，列进设置是"显式指定"，两条路都行 —— 动手时选一条并写明）。

## 12. ⭐ 第二轮扫出的关键项（`security.md` · `message-types.md` · 源码 `cli/args.ts`）

### 12.1 ⚠️→✅ AGENTS.md 风险**已解除**：官方开关 `--no-context-files`

官方 `security.md` 逐字（把风险钉死了）：

> *"Context files such as `AGENTS.override.md`, `AGENTS.md`, and `CLAUDE.md` load
> **regardless of project trust** unless you disable context loading."*

**拒绝信任也没用，context 文件照读。** 但源码里有官方开关（`cli/args.ts:204`）：

```
-nc, --no-context-files     # 不读 AGENTS.md / CLAUDE.md
-ne, --no-extensions        # 不装扩展
-ns, --no-skills            # 不读技能
-np, --no-prompt-templates  # 不读提示模板
--no-themes
```

→ **RPC 起手命令定为：`pi --mode rpc --no-session -nc`** —— 503 KB 的 AGENTS.md 不会进上下文，
技能仍由我们显式指的路径加载。**风险解除。**

### 12.2 消息形状（`message-types.md` —— Swift 解析事件时的直接依据）

- 时间戳 = **Unix 毫秒**（session 条目才是 ISO 8601 —— 两套并存，别混）
- `UserMessage.content` = `string | (TextContent | ImageContent)[]`
- `AssistantMessage.content` = `(TextContent | ThinkingContent | ToolCall)[]`，带 `usage`
  （`input`/`output`/`cost.total` —— **token 与成本 Pi 顺手就给了**）
- `ImageContent` = `base64 data + mimeType`（Wanna 的截图走这里）
- `ThinkingContent` 带 `thinkingSignature`（provider 私有，**当不透明数据别解析**）

### 12.3 压缩是可调的（`settings.md`）

| 设置 | 默认 | 说明 |
|---|---|---|
| `compaction.enabled` | `true` | 自动压缩总开关 |
| `compaction.reserveTokens` | `16384` | 给模型回复留的 token |
| `compaction.keepRecentTokens` | `20000` | 最近这段不参与摘要 |

### 12.4 有用的环境变量（`environment-variables.md`）

`PI_CODING_AGENT_DIR`（改配置目录）· `PI_SESSION_ID` / `PI_SESSION_FILE`（当前会话）·
`PI_PROVIDER` / `PI_MODEL` · `PI_OFFLINE=1`（禁一切自动联网）· `PI_SKIP_VERSION_CHECK` ·
`PI_TELEMETRY=0`（关遥测）

## 13. 其余文档的排查结论（都看过了，判定如下）

- `agent/docs/` 12 份 —— **内部存储规范**（harness.md = 实现规格、values.md = typed storage
  primitive、pico 系列是内部设计稿）—— 与集成无关，不读
- `durable/docs/` 4 份 —— pico 设计稿，同上
- `usage.md` / `slash-commands.md` / `themes.md` / `keybindings.md` / `terminal-setup.md` /
  `windows.md` / `tmux.md` / `termux.md` —— 交互终端体验，RPC 集成用不上
- `virtual-models.md` · `containerization.md` · `shell-aliases.md` —— 按需再翻

**至此扫完：`coding-agent/docs` 38 份全部过了一遍，另两包的 docs 判定为内部资料。**

`rpc.md` · `rpc-commands.md` · `json.md` · `cli.md` · `skills.md` · `custom-provider.md` ·
`models.md` · `sessions.md` · `compaction.md` · `extensions.md` · `settings.md` —— **全读过。**

**剩下的没读**（判断用不上，动手时按需翻）：`configuration.md` · `terminal-setup.md` ·
`themes.md` · `keybindings.md` · `slash-commands.md` · `security.md` · 以及 Windows/Termux/tmux 那几份。
**它们在 `reference/pi/packages/coding-agent/docs/` 里，随手可查。**

## 8. 官方文档目录树（38 份）

见 `AGENTS.md` 里那张表（**从文件生成**，不是凭印象写的）。

---

# 迁移进度（2026-09-29 开始动手）

## 已完成并验证

| 步 | 结果 |
|---|---|
| 装 Pi | `pi 0.87.1`（npm 全局，node v26.8.1） |
| 接 DeepSeek | `~/.pi/agent/models.json`：provider `deepseek`、api `openai-completions`、**apiKey 用 `!cat` 命令**（key 不落明文）。`deepseek-flash` 出现在 `--list-models`（1M 上下文 / thinking / 图片） |
| 装 MCP 扩展 | `pi install npm:pi-mcp-adapter` → Pi 自动把它记进 settings 的 `packages` |
| 接 Wanna 的 19 个工具 | `~/.config/mcp/mcp.json`：`{url: http://127.0.0.1:8765/mcp, headers: {Authorization: "!echo Bearer $(cat …mcp-token)"}}`（headers 支持 `!命令`，token 不落明文） |
| **端到端** | `pi -p "调 screenshot"` → **真的截了屏并描述了真实屏幕** ✓ |
| RPC 冒烟 | `get_state` ✓ / prompt 接受 ✓ / `text_delta` +0.7s ✓ / **`agent_end` 后继续等到 `agent_settled`** ✓ / 关 stdin 有序退出(0) ✓ |
| 技能改名 | 4 个中文名 → `graphics` / `computer-use` / `writing` / `retrospective`（目录+frontmatter 都改，中文名挪进 description 保路由） |
| 技能加载验证 | **RPC 模式 3.6s 跑通，11 个技能全部被列进系统提示词** ✓ |
| Swift 侧不受影响 | 改名后 `list_skills` 照常返回 11 个 ✓ |

## ⚠️ 踩到的坑（只有真跑才发现）

1. **print 模式（`-p`）+ settings 声明技能 = 无 TTY 挂死**：零输出卡 5 分钟；用 `script` 给个 pty 就正常。
   **RPC 模式完全正常**（它本来就是给管道设计的）—— 我们的集成路走 RPC，不受影响，但**别用 `-p` 做脚本调用**。
2. **机器全局技能会混进来**：Pi 还自动发现 `~/.agents/skills/`（Agent Skills 规范的全局位置），
   里面有 `bailian-*` / `arkcli-*` 等一大批（别的工具装的）。它们每轮都进系统提示词。
   没动它们（别的工具在用）；要省上下文得单独处理。
3. `settings.json` 里 Pi 自己会写 `defaultProvider` / `defaultModel` / `packages` —— 别手工覆盖整个文件，只改自己的键。

## 未完成

- [ ] `PiAgentRunner.swift`（RPC 客户端：订阅→prompt→`agent_settled`→解析 text_delta / tool_execution_*）
- [ ] CompanionManager 切到 PiAgentRunner
- [ ] 删 `wanna_agent.py` / `local_trace.py` / `PythonAgentRunner.swift` / venv / 我们接的 Session
- [ ] 「新建对话」映射到 Pi 的哪种分叉（/fork vs /clone vs new_session）—— 动手时定
