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

### 阶段 4 · 精度对比测试（**由用户判定**，必须放在整件事最后）

> **用户 2026-09-28 的原话**：「我发现 macos-use 这个更准一点。**截图有时候会截偏**。
> 有没有一种方法把这两个都保留，之后再去测试到底哪一个更准，或者未来也可以测试？
> 这件事一定要放在整个方案的**最后**，或者在方案里作为**最后一个测试环节**，
> 让用户去测试到底用哪一个更准确。因为现在我发现，**截图说话这个东西并不是很准确**。」

**这一阶段不写新功能，只做一件事：让用户自己比出结论。**

#### 为什么它有资格占据"最后一步"

因为这是**用户用自己的眼睛得到的判断**，而不是代码里能推出来的。项目自己量过（`全局框架/12-定位精准度完全教程.md`）：

| 瞄准方式 | 实测（2026-09-22，计算器「7」键，真值 Quartz `(988,746)`） |
|---|---|
| 视觉模型看截图**估坐标** | 误差可达 **±25% 屏宽，方向随机**（同一句话三次，三个不同方向的偏移） |
| **按名字**去界面树里找元素 | **5/5 落在键上**，计算器读出 7 |

所以用户的观察与既有实测**一致** —— 但"哪一种更适合日常使用"仍然要**在真实任务里比**，
而不是拿一条 2026-09-22 的孤立测量代替。**这一阶段存在的理由就是：这个判断权归用户。**

#### ⚠️ 一个必须先说清的事实（否则会白测）

**「按名字」不是 `macos-use` 独有的本事 —— Wanna 里本来就有，而且是第一层。**
`MacosUseController.resolvedClickPoint` 是三层：

| 层 | 判据 | 说明 |
|---|---|---|
| ① **按名字** | 模型给了元素名 → 去界面树按名字找，**完全不看估算点** | 就是 `macos-use` 走的那条；Wanna 也走 |
| ② **坐标吸附** | 只给了坐标 → 找附近的小控件吸附过去 | Wanna 独有 |
| ③ **裸坐标** | 前两层都没成 | **这就是"截偏"的那一条** |

所以「两个都保留」有**两种可能的落法**，代价完全不同，**需要用户确认是哪一种**：

- **(a) 保留两种"瞄准方式"**：Wanna 的 MCP server 把 ① 和 ③ 都暴露成**可选、可切换**，
  测试时同一个任务各跑一遍做对比。**代价小**（都在同一个 server 里，坐标系统仍然只有一套）。
- **(b) 保留两个"服务端"**：`macos-use` 和 Wanna 的 server **并存**，由 agent 选。
  ⚠️ **代价大**：这正是本文档 §五 列为"唯一致命风险"的那件事 ——
  **两套坐标语义混用 = 点歪且不报错**。真要走这条，必须先解决坐标统一，不能直接并存。

#### 验收问题（阶段 4 结束时必须能回答）

- 同一个真实任务（例如"打开计算器按 7"、"点开浏览器某个链接"），
  **两种瞄准方式各跑 N 次，各自命中几次？**
- 用户看完两组结果后说：**日常用哪一个？**（这个答案写进 `需求/`，由用户定）
- 保留下来的是 (a) 还是 (b)？如果是 (b)，坐标统一是怎么做的？

#### 这一阶段不做的事

- ❌ **不替用户下结论。** 代码里不许写死"用哪一种"，也不许用一次测量当判据。
- ❌ 不在阶段 4 之前就把 ③ 抽掉 —— 那等于**在测试之前先把被测对象删了**。

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
| **4** | **两种瞄准方式各跑 N 次，各自命中几次？用户选哪一个？（这是唯一一个答案不属于 AI 的验收项）** |

---

## 九、下一步（本次会话结束时应该做的）

- [x] 阶段 0 的验证（脱离 Wanna，零风险）—— **2026-09-28 完成，见下**
- [x] 记录实测数据：哪些工具能调通、坐标准不准、报什么错
- [x] 把实测结果追加到本文档下方

**实测记录**

> **2026-09-28 · 阶段 0 完成。** 全部在仓库外做，`Wanna/` 一行代码没动。
> 工程在 `~/Documents/SuperAgent/WannaAgent/`（`agent.py` / `probe_mcp.py` /
> `probe_tools.py` / `probe_tools_extra.py` / `.venv` / `.deepseek_key` 0600）。

### 0.1 环境（实测）

| 项 | 值 |
|---|---|
| Python | 3.14.7（homebrew），独立 venv |
| 包 | `openai-agents 0.22.3` / `openai 3.19.2` / `mcp 2.2.0` |
| 模型 | `deepseek-flash` @ `https://api.deepseek.com`（官方端点） |
| 那只手 | `mcp-server-macos-use/.build/debug/…`，`server=SwiftMacOSServerDirect v1.6.0`，协议 `2025-11-25` |

### 0.2 方案里那两个「待验证」，答案如下

| 方案担心 | 实测答案 |
|---|---|
| 「本机 `localhost:3000` 上没有 Claude 模型」 | 对。**而且 `deepseek-flash` 也不在那儿** —— 网关回 `model_not_found`。它只在 `https://api.deepseek.com` 上（就是 App 里 DeepSeek 服务商那个地址） |
| 「Agents SDK 默认走 Responses API，代理多半只支持 Chat Completions」 | 网关**两条路由都在**（`/v1/chat/completions` 与 `/v1/responses` 各返 401 而非 404）。但 DeepSeek 官方端点这条路**必须显式切**：`set_default_openai_api("chat_completions")` |
| **（方案没提，但决定成败）`deepseek-flash` 支不支持 tool calling？** | **支持。** 实测返回规范的 `tool_calls` + `finish_reason: "tool_calls"`，参数抽取正确。**它是 DeepSeek-V4.1-Flash**，上下文 1,048,576，支持文本+图片输入 |

⚠️ **一条会影响手感与账单的事实**：`deepseek-flash` 是**推理模型**，每次决策前先吐 reasoning token
（实测一次简单工具选择用掉 14 个）。Agent 场景下这未必是坏事，但延迟和成本都会体现。

### 0.3 九个工具逐个实测（全部覆盖）

跑法：`probe_tools.py` + `probe_tools_extra.py`，每个工具调一次、动作可逆。

| 工具 | 结果 |
|---|---|
| `open_application_and_traverse` | ✅ 访达 1597 元素 / 计算器 186 / TextEdit 315 |
| `refresh_traversal` | ✅ |
| `click_and_traverse` | ✅ **按 `element` 名字 + `role` 点的**，不是猜坐标 |
| `type_and_traverse` | ✅ TextEdit |
| `press_key_and_traverse` | ✅ |
| `scroll_and_traverse` | ✅ |
| `press_ax_and_traverse` | ✅ |
| `set_value_and_traverse` | ✅ TextEdit 正文区 |
| `set_selected_and_traverse` | ✅ 访达列表行 |

**9/9 覆盖。** 其中两个第一次没通，原因是**文档没写的必填项**（见 0.5 坑 4）。

### 0.4 端到端：一句中文 → 真的点对了

指令「打开计算器，按一下数字 7，然后读一次界面确认显示屏上现在是什么」，实测：

```
[02] → open_application_and_traverse  {"identifier": "com.apple.calculator"}
[05] → click_and_traverse  {"pid":8438, "element":"7", "role":"AXButton", …}
[07] → refresh_traversal   {"pid":8438}
[09] 💬 「…显示屏的内容是 7（AXStaticText 显示 "7"，宽 17px，正好一位数字的宽度；
        同时「全部清除」按钮已变为「清除」）」
```

**总耗时 9.232 秒**（含 3 次模型往返），9 条交互条目。

**独立复核**（本仓规矩「返回 success ≠ 动作生效」，不信模型自述）——直接读那只手写下的界面树：

```
16: [AXStaticText (文本)] "7 编辑字段" x:242 y:789 w:17 h:36 visible
18: [AXButton (按钮)] "清除" x:104 y:833 w:48 h:48 visible
```

第 16 行确实是 7；第 18 行确实从「全部清除」变成了「清除」—— **模型那个交叉验证点是真的**，
不是编的（我没提示它去看那个按钮）。计算器进程 `8438` 独立核对也在跑。

### 0.5 发现的坑（**阶段 1 设计时必须先看这几条**）

1. ⭐ **那只手返回的是「界面树文件的路径」，不是正文。** agent 只能看到摘要那几百字，
   于是它自己说出了这句：「完整清单存在 `/tmp/macos-use/….txt`，但**我这边没有读取该文件的工具**」。
   **在 Wanna 里是 App 自己去读那个文件** —— 阶段 0 的 Python agent 没有这个工具。
   这条直接决定阶段 1 的形状：Wanna 的 MCP server 是**回正文**还是**回路径 + 另给读文件工具**。
2. **`identifier` 必须用 bundle id。** 传英文名 `"Finder"` 报
   `error: Application not found for identifier: 'Finder'`，`com.apple.finder` 才行。
3. **`AXRow` / `AXCell` 没有 `"文字"` 字段**（只有 role + 坐标），解析界面树的代码不能假设每行都有引号字段。
4. **`set_value` 与 `set_selected` 的 `pid` 是必填**，而工具的 description 里没写 ——
   第一版没传，报 `-32602 Invalid params: Missing required 'pid'`。
5. **Python SDK 是 snake_case**：`init.server_info` / `init.protocol_version`（MCP 规范 JSON 里是
   camelCase）。写错抛 `AttributeError`，而**握手其实已经成功了** —— 报错会把人往错的方向带。

### 0.6 ⚠️ 阶段 0 **回答不了**的那件事（别拿它推论）

**「坐标准不准」—— 阶段 0 没有资格回答。** 这次点击走的是 `element=` **元素名解析**
（和 Wanna 的 `resolvedClickPoint` 同一条思路），用的是**界面树里的元素坐标**；
而 Wanna 那套是 **0–1000 归一化网格 → 截图像素 → 屏幕本地 → Quartz 全局**。
两套语义不同（方案 §五 自己写明了）。

所以阶段 0 证明的是「**链路通、工具调得到、动作真的生效**」，
**不是**「最终系统的坐标会准」。后者只能等阶段 1（Wanna 自己当 MCP server、只留一套坐标）来答。

### 0.7 没量的（如实记，别当成量过）

- **每个工具各自的延迟**：只量了端到端那次 9.2 秒；单工具的冷启动/热启动没分开量。
- **把 Python 打包进 `.app` 后的权限继承与冷启动** —— 那是阶段 2 的验收问题，阶段 0 碰不到。
- **多步长任务**：只验到 3 步（开→点→读）。更长的循环、失败重试、超时都还没跑。
