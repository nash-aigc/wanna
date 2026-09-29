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

## 7. 还没读的

`cli.md`（全部命令行选项）· `sessions.md` · `compaction.md`（内置压缩怎么调）·
`extensions.md`（扩展怎么写）· `configuration.md` / `settings.md`

## 8. 官方文档目录树（38 份）

见 `AGENTS.md` 里那张表（**从文件生成**，不是凭印象写的）。
