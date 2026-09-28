# Wanna 改造方案 · 手写 Agent → OpenAI Agents SDK

> 写于 2026-09-28。**这份文档自带全部上下文**，可以在任意新会话里直接使用。
> 它描述的是**计划**，不是现状；现状见 `全局框架/`。

---

## 〇、一句话方案

> **Wanna 的外壳（Swift）全部保留。只把「多步执行 Agent」那一条路径的决策循环，
> 换成 Python + OpenAI Agents SDK。两侧用 MCP 说话。**

---

## 一、为什么是"只换一条路径"

Wanna 有两条独立的路径，**只有一条要改**：

| 路径 | 触发 | 特征 | 动不动 |
|---|---|---|---|
| **实时语音对话** | 按快捷键 → 说话 → 读屏 → 回答 → 朗读 | 低延迟、流式、秒级 | ❌ **一行都不动** |
| **多步执行 Agent** | 说"帮我做某事" → 模型输出动作 → 执行 → 截图 → 再问 | 慢、多轮、长任务 | ✅ **只换这一条** |

**依据**：`AgentSessionManager.swift` 文件头自己写着
> "Deliberately NOT part of the voice pipeline."

也就是说项目本身已经把这两条路分开了。**换框架只碰后者。**

> ⚠️ **把框架塞进实时语音路径是常见的错误**。框架是为"多步执行"设计的，
> 放进实时链路只会增加延迟和复杂度，不会变好。

---

## 二、已验证的事实（可以直接引用，不用重新查）

### 2.1 要换的那块，代码在哪

| 文件 | 行数 | 角色 |
|---|---|---|
| `Wanna/ActionTagParser.swift` | 995 | **解析模型输出的动作标签** —— 痛点的上游 |
| `Wanna/MacosUseController.swift` | 1903 | **唯一引入 `MacosUseSDK` 的文件**，真正执行动作 |
| `Wanna/CompanionManager.swift` | 6425 | 什么都往里塞 —— **耦合的根因** |
| `Wanna/AgentSessionManager.swift` | — | 多 Agent 调度（已与语音管线隔离） |
| `Wanna/ClaudeAgentProcess.swift` | — | **已有的子进程接缝**（现在跑 `claude` CLI） |
| `Wanna/MCPClient.swift` / `MCPServersStore.swift` | — | **已有的 MCP 客户端** |
| `Wanna/CompanionScreenCaptureUtility.swift` | — | 截图，**会剔除本 App 全部窗口** |

### 2.2 动作清单（`CompanionAction`，ActionTagParser.swift:99）

模型能输出的动作，一共 7 个：

| 动作 | 参数 | 对应标签 |
|---|---|---|
| `.openApplication(name)` | 应用名 | `[OPEN:]` |
| `.click(coordinate)` | 坐标（**0–1000 归一化网格**） | `[CLICK:]` |
| `.scroll(coordinate, direction, steps)` | 坐标 + 方向 + 步数 | `[SCROLL:]` |
| `.typeText(text)` | 文本 | `[TYPE:]` |
| `.selectText(start, end)` | 起止标记 | `[SELECT:]` |
| `.pressKey(keyName, modifiers)` | 键名 + 修饰键 | `[PRESS:]` |
| `.wait(seconds)` | 秒数 | `[WAIT:]` |

**外加一个不算动作的动作**：`[POINT:]` —— 只移动蓝色光标，不改变用户机器。
代码里**故意**把它排除在 `actions` 数组外（`ActionTagParser.swift` 文件头有说明）。

### 2.3 **唯一的接缝**（这是整个方案的支点）

`MacosUseController.swift` 文件头原话：

> "This is the only file that imports MacosUseSDK. Everything upstream of it — the tags,
> the parser, the prompt — is ordinary Wanna code, so the dependency has **exactly one
> seam to move** if it ever has to be replaced."

**分发点**：`MacosUseController.swift:276` 附近的 `switch action`，7 个 case 全在那一个 switch 里。

### 2.4 "手"这一层**已经有一个现成的 MCP 服务器**

`/Users/mjm/Documents/SuperAgent/Agent/Mcp/mcp-server-macos-use/`

- Swift 写的，用**官方 MCP Swift SDK**（`modelcontextprotocol/swift-sdk` v0.11.0）
- 依赖 **`MacosUseSDK`（mediar-ai）** —— **和 Wanna 的 `MacosUseController` 是同一个底层 SDK**
- 暴露 **6 个工具**：打开应用 / 点击 / 打字 / 按键 / 滚动 / 重读界面树
- 自带测试脚本 `scripts/test_mcp.py`，**可以脱离 Wanna 独立跑**

### 2.5 权限与分发（已核实）

| 问题 | 答案 |
|---|---|
| 权限发给谁？ | **签名后的 App 包**，按 bundle id + 签名证书识别。**不看语言，不看工具** |
| 证书签名 vs ad-hoc | 证书签名：重编译不掉权限；ad-hoc：**每次重建三样权限全重置**（见 `08-构建与签名.md`） |
| 改 bundle id | ⚠️ TCC 三项（录屏/辅助功能/麦克风）**全部重置** |
| 能上 Mac App Store 吗？ | ❌ **不能**。App Store 强制沙盒，而 Apple 明确"Accessibility API 在沙盒 App 里不受支持"。**跟用什么语言无关** |
| Python 打包进 App 会掉权限吗？ | ❌ 不会。Python 必须**打包进 `.app` 一起签名**（不能用系统 Python） |

---

## 三、目标架构

```
┌───────────────────────────────────────────────────────────┐
│  Wanna.app    （签名 → 拿到 TCC 权限）                     │
│                                                            │
│  ┌──────────────────────┐      ┌────────────────────────┐ │
│  │  Swift（保留，~90%）  │      │  Python（新写）         │ │
│  │                      │      │                        │ │
│  │  · 刘海窗口 / 设置页  │      │  · Agent 循环          │ │
│  │  · 蓝色光标覆盖层     │←MCP→ │  · 工具调用            │ │
│  │  · 截图（剔除自己）   │      │  · 多 Agent            │ │
│  │  · 语音管线           │      │  · 决策                │ │
│  │  · 点击/滚动/打字     │      │                        │ │
│  │                      │      │  OpenAI Agents SDK     │ │
│  │  【跟 AI 无关的】     │      │  【跟 AI 有关的】      │ │
│  └──────────────────────┘      └────────────────────────┘ │
│         ↑ MCP server 端              ↑ MCP client 端       │
└───────────────────────────────────────────────────────────┘
                    ↓
        官网直接分发（不进 App Store）
```

### 三条不变量（改造中不能破）

1. **实时语音路径零改动。**
2. **TCC 权限不能掉** —— 不改 bundle id、保持证书签名、不改 `DEVELOPMENT_TEAM`。
3. **坐标系只有一套** —— 见下面「最大的风险」。

---

## 四、分阶段方案

### 阶段 0 · 脱离 Wanna 验证（**不碰 Wanna 一行代码**）

**目的**：证明"Python agent + MCP 手"这条链能跑通。

**做什么**
1. 在任意临时目录建一个 Python 工程
2. 装 `openai-agents`
3. 挂上已有的 `mcp-server-macos-use`（stdio 方式）
4. 下一条真实指令，例如"打开备忘录并新建一条"
5. 观察：工具调用是否成功、坐标是否点准

**为什么先做这个**
- 零风险（不动 Wanna）
- 如果这条链根本不稳，后面全白搭
- `mcp-server-macos-use` 有独立测试脚本，可以脱离一切验证

**产出**：一个能跑的最小 agent + 一份"哪些能跑、哪些报错"的实测记录。

**⚠️ 待验证（这一步要回答的）**
- 模型走哪个端点？（本机 `ANTHROPIC_BASE_URL=localhost:3000` 上没有 Claude 模型；
  若用 OpenAI Agents SDK，需要确认它的 `base_url` 指向和模型名）
- OpenAI Agents SDK 默认走 Responses API；代理多半只支持 Chat Completions，
  需要 `set_default_openai_api("chat_completions")` + 自定义 client

---

### 阶段 1 · 让 Wanna 自己成为一个 MCP server

**目的**：把 Wanna 的能力（截图 / 指向 / 动作）用标准协议暴露出来。

**为什么是 Wanna 当 server，而不是复用 `mcp-server-macos-use`**

这是**整个方案最重要的技术判断**：

| 方案 | 坐标系 | 截图 | 风险 |
|---|---|---|---|
| A. 截图用 Wanna，动作走 `mcp-server-macos-use` | **两套** | Wanna 的 | ❌ **高**——两边坐标系不一致会**点歪且不报错** |
| B. **全部由 Wanna 暴露** | **一套** | Wanna 的 | ✅ 低——复用已验证的 `MacosUseController` |

**选 B。** 因为 Wanna 的 `MacosUseController` 已经处理好了那套复杂的坐标转换
（文件头专门写了"两套坐标系"的风险），`mcp-server-macos-use` 是通用工具，
**不知道 Wanna 的刘海窗口和蓝光标要排除**。

**做什么**
1. 用**官方 MCP Swift SDK** 在 Wanna 里起一个 stdio MCP server
2. 暴露工具（形状照抄 `mcp-server-macos-use`）：
   - `screenshot` —— 走 `CompanionScreenCaptureUtility`（**自动剔除 Wanna 自己的窗口**）
   - `point` —— 蓝光标（Wanna 独有）
   - `click` / `scroll` / `type` / `press_key` / `open_app` —— 走已有的 `MacosUseController`
   - `ax_tree` —— 读界面树
3. **参数用归一化坐标（0–1000 网格）**，和现在模型说的一致，**不要改成像素**

**产出**：一个可以独立 `test_mcp.py` 验证的 Wanna MCP server。

**参考样板**：`mcp-server-macos-use/Sources/MCPServer/main.swift`（照着抄结构即可）

---

### 阶段 2 · 把 Python agent 接进 App

**目的**：让 Wanna 的多步执行路径，跑在 Python 上。

**做什么**
1. 把阶段 0 验证过的 Python agent 打包进 `.app`（**打包运行时，不用系统 Python**）
2. 签名（跟着 App 一起，保持同一个 TeamIdentifier）
3. **接在现成的接缝上**：`ClaudeAgentProcess.swift` 现在拉的是 `claude` CLI，
   把启动命令换成你的 Python 程序——**协议可以照抄它现在的换行分隔 JSON**
4. 或者更简单：让 Python 侧直接连 Wanna 的 MCP server（少一层协议）

**产出**：按快捷键说"帮我做某事"，执行的是 Python agent。

**⚠️ 待验证**
- Python 运行时的打包方式（`python-build-standalone` / PyInstaller / 内嵌 framework）
- 打包进 `.app` 后 TCC 权限是否正常继承 —— **这一步必须实测，不能推测**
- 冷启动时间（会影响用户按快捷键后的手感）

---

### 阶段 3 · 清理

**做什么**
1. 删掉 Swift 侧的**决策循环**（注意：是决策，不是动作执行）
2. `CompanionManager.swift` 瘦身 —— **这一步单独做，和换框架无关**，
   但不做的话"改左坏右"会继续存在
3. 更新 `全局框架/14-Agent子系统.md`

**⚠️ 特别注意**
- **不要删 `MacosUseController.swift`** —— 它是阶段 1 的 MCP server 的后端
- **不要删 `ActionTagParser.swift`** —— 至少在确认新方案稳定前不删

---

## 五、最大的风险（一条，但致命）

### 坐标语义不一致 → **点歪，而且不报错**

Wanna 现在有一套精密的坐标转换（见 `MacosUseController.swift` 文件头 + `12-定位精准度完全教程.md`）：

```
模型的 0–1000 归一化网格
   → 截图像素
   → 该屏幕自己的左上角空间
   → Quartz 全局坐标（多屏时上方屏幕 y 为负数）
   （AppKit 的 y 翻转只在覆盖层那一侧发生）
```

而 `mcp-server-macos-use` 用的是**元素坐标**（从界面树读出来的 `x/y/w/h`）。

**两套语义混用 = 点击落到别的地方，不抛错、不打日志。**
项目文档里把这种失败模式叫"静默失败"，已经踩过一次（`开发经验/10-踩过的坑.md` H3）。

**防范**：阶段 1 坚持「坐标系只有一套」—— 全部由 Wanna 暴露，用归一化网格。

---

## 六、明确不做的事

| 不做 | 原因 |
|---|---|
| ❌ 把整个 App 改成 Python | 90% 是 UI/系统能力，Python 做不了或代价极高 |
| ❌ 把框架塞进实时语音路径 | 框架是为多步执行设计的，塞进去只会更慢更复杂 |
| ❌ 改成 Python 以求"跨平台" | **换语言换不来可移植性**。Windows/安卓的控屏 API 完全不同，无论什么语言都要重写 |
| ❌ 上 Mac App Store | 沙盒与 Accessibility 互斥，**跟语言无关** |
| ❌ 一次全改完 | 分阶段，每阶段可独立验证、可回滚 |

---

## 七、跨平台那件事（如果还想要）

**可移植的不是语言，是分层。**

| 层 | 可复用吗 |
|---|---|
| 决策大脑（Python + Agents SDK） | ✅ 全平台一份 |
| 模型调用 | ✅ 全平台一份 |
| 刘海 UI | ❌ 每平台重写 |
| 控屏 | ❌ 每平台重写（Accessibility / UI Automation / AccessibilityService） |
| 语音 | ❌ 每平台重写 |

**所以正确顺序是：先把大脑拆出来（阶段 0–2），跨平台才有意义。**
在此之前谈跨平台是空谈。

---

## 八、验收标准（每阶段结束要能回答）

| 阶段 | 验收问题 |
|---|---|
| 0 | Python agent 能通过 MCP 打开一个 App 并点击一个按钮吗？坐标准吗？ |
| 1 | Wanna 的 MCP server 能被 `test_mcp.py` 独立测通吗？截图里看不到 Wanna 自己吗？ |
| 2 | 打包进 `.app` 后，权限还在吗？按快捷键后的冷启动要几秒？ |
| 3 | `CompanionManager` 减了多少行？"改左坏右"还在吗？ |

---

## 九、下一步（本次会话结束时应该做的）

- [ ] 阶段 0 的验证（脱离 Wanna，零风险）
- [ ] 记录实测数据：哪些工具能调通、坐标准不准、报什么错
- [ ] 把实测结果追加到本文档下方

**实测记录**

（待填）
