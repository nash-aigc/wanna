# pi二次开发 —— pi 相关资料的总目录

> **这一层放什么**：所有关于 pi（earendil-works 的 agent 运行时，Wanna 的决策大脑）
> 的文档、解读与本地副本的**入口**。动手改 Pi 相关的东西之前，先读这里列的东西。

| 东西 | 位置 | 是什么 |
|---|---|---|
| **Pi全览.md** | `pi二次开发/Pi全览.md` | ⭐ **先读这一篇**。RPC 协议 / DeepSeek / 技能 / 会话 / 压缩 / 已实测的坑 + 官方 38 份文档全部要点 + dg-ai-notes 源码精读的深度提炼。**细节以它为准，不用再翻官方** |
| Pi换血-方案.md | `pi二次开发/Pi换血-方案.md` | 换血实施方案（简短，2026-09-29） |
| **dg-ai-notes** | `pi二次开发/dg-ai-notes/` | **第三方深度解读仓库**（github.com/buchidonggua/dg-ai-notes，gh-proxy 克隆）。三块：**源码精读 10 章**（TS/Python 双版，`pi-agent/pi_source_dive/`）· **实战 7 章**（`pi-agent/pi_sdk_learn/`）· **dg-piagent skill**（SDK 文档 18 份 + 场景手册 41 份，`skills/dg-piagent/`，API 核对到 **v0.83.0**）。它自己的 SKILL.md 可以整个装进智能体的 skills 目录当开发助手用 |
| 官方文档本地副本 | `reference/pi/`（仓库根） | 官方全文 8.0 MB，166 份 markdown；核心 38 份在 `reference/pi/packages/coding-agent/docs/` |
| 官方依据台账 | `全局框架/官方依据.md` | 逐条官方原文引用（pre-commit 闸门会 fetch 核对） |

## 怎么用（按需求找）

| 我想… | 去哪 |
|---|---|
| 改 PiAgentRunner.swift / RPC 事件处理 | Pi全览 §2–§5（协议与实测坑） |
| 理解 pi 内部机制（循环/工具/消息/上下文/压缩/会话树） | Pi全览「内部机制」各节；细节查 `dg-ai-notes/pi-agent/pi_source_dive/typescript/` 对应章 |
| 给 pi 写扩展 / 自定义工具 / 换 provider | Pi全览「SDK 二次开发」节；完整版 `dg-ai-notes/skills/dg-piagent/references/sdk_doc/` |
| 「我想做 X」式的场景查找 | `dg-ai-notes/skills/dg-piagent/SKILL.md` 的意图总表 → `references/scenarios/` |
| 查官方原文依据 | `reference/pi/packages/coding-agent/docs/` 对应文档 + `全局框架/官方依据.md` |

## ⚠️ 两条硬规矩（仍然有效）

1. **`reference/` 与 `pi二次开发/dg-ai-notes/` 里是别人的代码和文档** —— 读它、引用它，**不改它**。
2. 动 agent 框架 / MCP / 技能之前，**先往 `全局框架/官方依据.md` 加一条台账，再改代码**（pre-commit 第四道闸门管这个）。
