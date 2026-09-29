# 换成 Pi：整体方案（2026-09-29）

用户判定：「**开始完全换血**」「不再自己设计 agent，直接用现成的 agent」。

## 一句话

**把"我们自己写的 agent 外壳"整块删掉，换成 Pi 的 RPC 模式。工具层和技能层不动。**

## 删什么、留什么

| | 现在 | 换血后 |
|---|---|---|
| **工具（19 个 MCP）** | `WannaMCPServer` + `WannaMCPTools` | **不动** ✅ Pi 官方有 MCP 客户端扩展 |
| **技能（11 个）** | `~/…/wanna/skills/` | **基本不动** ✅ Pi 原生读 skills + AGENTS.md |
| **决策/循环** | `wanna_agent.py`（200 行） | **删** → Pi 的运行时 |
| **会话** | 我们接的 `SQLiteSession` | **删** → Pi 自己管（树结构、可回退） |
| **系统提示词** | 我们那一句 | **删** → Pi 自己的极简提示词 |
| **追踪** | `local_trace.py` | **删** → Pi 事件流本身就是追踪 |
| **调用** | `PythonAgentRunner`（每轮起进程） | **改成 PiAgentRunner**（RPC 长驻） |
| **外壳（刘海/语音/TTS/截屏/权限/光标）** | Swift | **不动** —— 那是产品 |

## RPC 协议要点（官方 `docs/rpc.md`，台账 P1–P7）

```bash
pi --mode rpc --no-session
```

**命令**（stdin，一行一个 JSON）：
```json
{"id":"req-1","type":"prompt","message":"打开计算器"}
```
**响应**（stdout）：
```json
{"id":"req-1","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}
```
**事件**（stdout）：`message_update`（`text_delta` 流式文字）、`agent_end`、`agent_settled` …

### 四个必须遵守的点（每条都有官方原文）

1. **`prompt` 成功 ≠ 跑完** —— 等 **`agent_settled`**，不是 `agent_end`
   （官方：其后还可能有 retries / overflow recovery / compaction / steering / follow-up）
2. **先订阅事件、再发 prompt** —— 否则快速完成的 run 会**永久挂住**
3. **只在 LF 上切帧** —— `U+2028`/`U+2029` 在 JSON 字符串里合法，不能被当成分隔符
4. **stdout 只走协议** —— 诊断日志走 stderr

## 换血的步骤（每步真跑验证）

1. **装 Pi + 确认能跑** —— `npm install -g @earendil-works/pi-coding-agent`，`pi --version`
2. **接 DeepSeek** —— Pi 列的 15+ provider 里没有 DeepSeek，要走 `models.json` 自定义或 OpenRouter
   （**官方文档没读全之前不动这一步**）
3. **装 MCP 扩展 + 指向我们的 19 个工具**（`http://127.0.0.1:8765/mcp`）
4. **确认 skills 目录约定** —— 我们那 11 个能不能直接用
5. **写 `PiAgentRunner.swift`** —— 起 `pi --mode rpc`、发 prompt、收事件
6. **删** `wanna_agent.py` / `local_trace.py` / PythonAgentRunner / 我们接的 Session

## 还没读的（动手前必须读全）

- `pi.dev/docs/latest` 全站
- `docs/rpc-commands.md` —— `prompt` 的全部 disposition 值
- `docs/json.md` —— 事件流的完整定义
- `docs/cli.md` —— 全部命令行选项
- **MCP 扩展怎么装**（`pi.dev/packages`）
- **`models.json` 怎么加自定义 provider**
- **skills 目录约定**（和我们现在的 `SKILL.md` 格式是否一致）
