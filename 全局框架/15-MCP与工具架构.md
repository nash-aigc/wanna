# 15 - MCP 与工具架构（调查记录）

> ⚠️ **备注（2026-09-30）**：本文档最开始的那个判断（「Wanna 的 MCP 搬不出去，只能留在 App 里」）**已被推翻**；
> 当前的判断（「能搬出去，独立 server + 转发」）**也有可能被推翻** —— 目前**暂时保留此观点**，
> 当前认知或观点**存疑**：也许存在更好的调用方法，或者现有方案其实完全可以解决。
> 读这份文档时按这个前提读，不要把它当成已验证的定论。

## 这份文档从哪来

2026-09-30 用户问：「当前项目的 MCP 和工具在哪个文件夹」→ 整理现状 → 用户问「为什么不是独立文件夹的形式」
（对照 `~/Documents/SuperAgent/Agent/Mcp/` 里那些独立 MCP 项目）→ 我第一次回答「搬不走」→
用户指出「MCP 协议本身就是为了让其他客户端使用，否则就不是 MCP」→ **重新思考后第一次回答被推翻**。
本文档记录两次判断与推翻的理由，防止以后照着错的那次去做。

## 一、现状（2026-09-30 实地盘点，非凭印象）

### 1. Wanna 自己当 MCP 服务端

| 内容 | 位置 |
|---|---|
| MCP 服务端（手写最小协议：`initialize` / `tools/list` / `tools/call`） | `Wanna/WannaMCPServer.swift` |
| 21 个工具的声明与实现 | `Wanna/WannaMCPTools.swift` |
| 监听地址 | `http://127.0.0.1:8765/mcp`（只绑回环），token 在 `~/Library/Application Support/Wanna/mcp-token`（0600） |
| 由谁起 | `CompanionManager.start()`，`willTerminateNotification` 收 |

### 2. 决策大脑（pi）那侧怎么接

| 内容 | 位置 |
|---|---|
| pi 全局配置（默认模型、`pi-mcp-adapter` 包、技能路径） | `~/.pi/agent/settings.json` |
| **MCP 服务器清单（wanna 这条在这配）** | `~/.config/mcp/mcp.json` ← `wanna` → `127.0.0.1:8765/mcp`，token 走 `!echo` 动态读，`directTools: true` |
| 适配器本体 | `~/.pi/agent/npm/node_modules/pi-mcp-adapter/` |
| 工具清单缓存（21 个工具的完整 schema 可在这里逐个查） | `~/.pi/agent/mcp-cache.json` |
| pi 自己的扩展 | `~/.pi/agent/extensions/` |

### 3. 技能（pi 实际加载的那份）

- pi 正在读的：`/Users/mjm/Documents/SuperAgent/APP/Design/wanna/skills/`（11 个技能：anysearch / awesome-jev /
  computer-use / cosyvoice-tts / graphics / image-station / macos-fast-action / notion / retrospective /
  search-max / writing）
- 仓库里也有 `Wanna/skills/`（desktop-agent / 截图与OCR），**pi 的设置没有指向它**

### 4. 仓库内的独立脚本工具（不走 MCP）

- `Wanna/tools/desktop-agent/` — `desktop_file_agent.py`
- `Wanna/tools/截图与OCR/` — `capture_and_ocr.sh` + `ocr` 二进制 + `ocr_to_file.swift`（用法见该目录 README）

### 5. ⚠️ 文档与现状不符（发现于 2026-09-30）

CLAUDE.md 的 Key Files 表仍写着 `ToolCatalog.swift` + `tools/manifest.json`（`[RUN:工具名:参数]` 那套）
—— **这两个在仓库里已不存在**（find 找不到），是 2026-09-29 换到 pi 之前的旧路。
按规矩该同步，当时先报告未擅改。

### 当前链路（一句话）

pi（`~/.config/mcp/mcp.json`）→ `pi-mcp-adapter`（directTools 全量直连）→ `http://127.0.0.1:8765/mcp`
→ `WannaMCPServer.swift`（21 个工具，`WannaMCPTools.swift` 实现）→ `MacosUseController` 真正动手。

## 二、21 个工具按「碰到谁」分两类（这是整个问题的核心）

| 类型 | 工具 | 依赖 |
|---|---|---|
| **通用的**（独立进程也能做） | `screenshot` `click` `type_text` `press_key` `scroll` `open_app` `read_screen` `set_value` `press_ax` `set_selected` + 4 个文件读写（`read_file` / `write_file` / `create_folder` / `list_folder`） | `MacosUseSDK` 封装 —— 与 `Agent/Mcp/mcp-server-macos-use` **同一个 SDK**；文件那 4 个是纯文件系统 |
| **Wanna 专属的**（实现碰到 Wanna 进程内部） | `point`（蓝色光标）`draw`（绿色标记）`draw_figure`（屏幕白板）`spawn_agent` / `send_agent`（Wanna 的 agent 会话）`list_skills`（读 Wanna 技能目录）`search_history`（读 Wanna 对话库）；`screenshot` 的「剔除自家窗口」也算半专属 | 画的是 **Wanna 自己的窗口**、读的是 **Wanna 进程内存里的数据** |

（通用 13 个 = 9 个屏幕类 + 4 个文件类；专属 8 个 = 上表第二行。）

## 三、两次判断（第二次推翻第一次）

### 第一次判断：❌「搬不走」—— 已被推翻

当时的理由：那 8 个专属工具离开 Wanna 进程就没法干活，所以 MCP 服务端必须住在 App 里。

**为什么错**：把「工具的**实现**碰到谁」和「MCP **服务端**住在哪」混成了同一件事。
按协议本身，MCP 服务端 = 一个独立进程，通过 stdio / HTTP 跟客户端说话，
它**不关心**每个工具背后怎么实现 —— 独立服务端完全可以「自己能实现的自己干，碰到 Wanna 内部的转发给 Wanna」。

### 当前判断：✅「能搬出去」—— 暂时保留，存疑（见文档最上面的备注）

```
任何 MCP 客户端（pi、其他 App、Claude…）
        │
        ▼
Agent/Mcp/wanna-mcp/   ← 新建：独立文件夹、独立进程、标准 MCP 协议（21 个工具声明只在这定义）
        │
        ├── 13 个通用工具 → 自己直接实现（MacosUseSDK + 文件操作）
        │                    ← Wanna 没开也能用（今天不开就连不上，全废）
        │
        └── 8 个专属工具 → 转发给正在运行的 Wanna（127.0.0.1:8765 + token，
                           该端点已存在，降级为内部 IPC 通道）
```

各方变化：

| 东西 | 变化 |
|---|---|
| `Agent/Mcp/wanna-mcp/` | **新建**，独立 SwiftPM 项目，21 个工具的协议声明只在这一个地方 |
| Wanna 里的 `WannaMCPServer` | 降级成内部 IPC 通道，只接 8 个专属工具的调用，不再对外 |
| `WannaMCPTools.swift` 里 13 个通用工具实现 | 搬到新 server（协议描述跟着走，Wanna 只留执行） |
| pi / 其他 App | 都连 `Agent/Mcp/wanna-mcp/` 这一个入口 |

预期好处：① 形态与其他 MCP 一致；② 13 个通用工具在 Wanna 没开时也可用；③ 工具声明不再长在 App 源码里。

### 已知的两个代价（如实记录）

1. **8 个专属工具仍然需要 Wanna 正在运行** —— 它们画的是 Wanna 的窗口、读的是它的内存，这是物理事实，
   搬出去解决不了，只能「不在时报一句请先启动 Wanna」。
2. **转发层是新代码** —— 转发参数、报错、超时都要验过，这是搬迁里唯一有风险的部分；
   13 个通用那侧是成熟 SDK，风险小。

## 四、开工前要做的（如果用户拍板执行）

1. 先读 `Agent/Mcp/mcp-server-macos-use/` 的实现 —— 现成模板，同一 SDK、同一 0–1000 坐标网格。
2. 这是**较大调整**（新项目 + 改 Wanna 两侧 + pi 配置）：开分支 `wip/mcp独立化`，验证通过再合回 main。
3. 验证判据（开工前写进 prompt）：① pi 连新 server 拿到 21 个工具；② 通用工具在 Wanna 未启动时可用；
   ③ 8 个专属工具在 Wanna 运行时可用、未运行时报明确错误；④ Wanna 自身功能（光标 / 派 agent / 技能 /
   firecrawl 类）回归无静默失效 —— 对照 §0.9 闸二那次六样断掉的教训。
4. 同一次提交里更新 CLAUDE.md Key Files、`全局框架/00-项目全貌.md`（工具数 / 位置表）、本篇。

## 五、与 CLAUDE.md 规则的对照

- §0.9 闸三「不许自己设计机制」：本方案不发明协议 —— 转发/网关是 MCP 生态的常见形态
  （pi-mcp-adapter 自己也有 proxy 工具概念），协议层全部走标准 `initialize` / `tools/list` / `tools/call`。
- §0.8 极简：方案 B（搬通用 13 个、保留专属在 App）会造成**两个几乎一样的「手」**（与 mcp-server-macos-use
  重复维护），本方案把「手」收敛到一个独立入口，Wanna 内部只剩一个转发目标 —— 复杂度没有净增。
- 本篇属于「全局框架」：写给以后改这块的人看；结论**存疑**这一点写在最上面，不是藏在最后。
