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

## 12. 读完了 —— 这批文档到此为止

`rpc.md` · `rpc-commands.md` · `json.md` · `cli.md` · `skills.md` · `custom-provider.md` ·
`models.md` · `sessions.md` · `compaction.md` · `extensions.md` · `settings.md` —— **全读过。**

**剩下的没读**（判断用不上，动手时按需翻）：`configuration.md` · `terminal-setup.md` ·
`themes.md` · `keybindings.md` · `slash-commands.md` · `security.md` · 以及 Windows/Termux/tmux 那几份。
**它们在 `reference/pi/packages/coding-agent/docs/` 里，随手可查。**

## 8. 官方文档目录树（38 份）

见 `AGENTS.md` 里那张表（**从文件生成**，不是凭印象写的）。
