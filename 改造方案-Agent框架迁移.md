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

所以「两个都保留」有**两种可能的落法**，代价完全不同。**用户 2026-09-28 已拍板选 (a)：**

- **(a) 保留两种"瞄准方式"** ← **✅ 已定：走这条。**
  Wanna 的 MCP server 把 ① 和 ③ 都暴露成**可选、可切换**，测试时同一个任务各跑一遍做对比。
  **代价小**：都在同一个 server 里，**坐标系统仍然只有一套**。
  ⚠️ **由此产生的一条硬约束：阶段 1–3 期间，③（裸坐标）这一层不许删、也不许被降级掉。**
  它现在是"被测对象"，在阶段 4 出结论之前，任何"顺手把它删掉"的改动都等于**销毁证据**。
- **(b) 保留两个"服务端"**：`macos-use` 和 Wanna 的 server 并存。**未采用。**
  原因是它正是本文档 §五 列为"唯一致命风险"的那件事 ——
  **两套坐标语义混用 = 点歪且不报错**。真要走这条，必须先解决坐标统一，不能直接并存。

#### 验收问题（阶段 4 结束时必须能回答）

- 同一个真实任务（例如"打开计算器按 7"、"点开浏览器某个链接"），
  **两种瞄准方式各跑 N 次，各自命中几次？**
- 用户看完两组结果后说：**日常用哪一个？**（这个答案写进 `需求/`，由用户定）
- 保留下来的是 (a) 还是 (b)？如果是 (b)，坐标统一是怎么做的？

#### 这一阶段不做的事

- ❌ **不替用户下结论。** 代码里不许写死"用哪一种"，也不许用一次测量当判据。
- ❌ 不在阶段 4 之前就把 ③ 抽掉 —— 那等于**在测试之前先把被测对象删了**。

#### 第一次实测（2026-09-28，用户要求提前跑）

用户拍板 (a) 之后立刻要求"先让我测一下"。脚本 `~/Documents/SuperAgent/WannaAgent/compare_targeting.py`，
目标 = 计算器的「7」键，两条路各点 5 次，**判据是客观的**：点完读界面树，
看计算器**显示屏**上是不是「7」（按 AX 角色区分 —— 按钮也叫「7」，
不区分就会把"键上印着 7"误判成"屏上显示了 7"）。

| 瞄准方式 | 命中 | |
|---|---|---|
| **① by_name** | **5/5** | █████ |
| **② by_coordinate** | **1/5** | █···· |

视觉模型五轮估的坐标：**x 606–673（跨度 67）· y 711–795（跨度 84）** ——
同一个键、同一块屏幕，每次估的都不一样。这与 §四 阶段 4 引的那条既有实测
（±25% 屏宽、方向随机）**吻合**。

**⚠️ 但这还不足以定论，理由要写在前面：**
- **只有一个目标、一个 App、5 轮。** 换一个按钮、换一个 App、换一种界面密度，结论未必一样。
- ② 那次命中（第 4 轮，估到 606,795）说明它不是"永远不行"，是**概率低** —— 这个区别很重要。
- 用户的验收问题问的是"**日常用哪一个**"，那要在他自己的真实任务上多跑几轮才算数。

**这一轮真正的产出是：那条链现在是可测的了。** 在那之前，"哪种更准"只能靠感觉说。

#### ⚠️ 做这个测量时踩到的三个坑（都会让测试**静默作废**）

1. **`deepseek-flash` 是推理模型，估坐标时推理没有上限。** `max_tokens` 200 / 2000 / 8000
   **全部被 reasoning token 吃光** —— 返回 HTTP 200、`content` 为空、`finish_reason="length"`。
   表现为"模型不会答"，其实是**预算被烧光**。解法是**关掉推理**，不是加预算。
2. **关推理的开关，实测只有两个真的有效**：`thinking={"type":"disabled"}` 与
   `reasoning_effort="none"`（用后 `completion_tokens_details` 直接变成 `None`）。
   `reasoning_effort="minimal"` **仍然推理**（实测 1786 tokens）——
   "看起来像"的开关不能信。**这与本仓既有的结论一致**（`开发经验/10` 记过
   `enable_thinking:false` / `chat_template_kwargs.thinking:false` 都"看着像"却什么都不做）。
3. ⭐ **`ClickTargeting` 的 rawValue 曾是驼峰 `byName`，而工具 schema 声明的是 `by_name`**
   —— 参数**静默失效，两次跑的都是 `auto`**。那一轮的对比数字（按名字 3/3、按坐标 0/3）
   看着完全像回事，其实**整轮作废**。现在脚本对"认不出来"直接抛错，不让它静默过去。

#### ⭐ 第二轮：多软件普测（2026-09-28，用户要求）

**用户当场否掉了"只测计算器就下结论"**：「你刚才只测了计算器，**有局限性，要通用、全面地测试**，
才能知道这个东西到底有没有价值…… 如果每一个软件都能操控，你再去删掉它；
**如果很多软件用之前的方案操控不了，只能用截图来估计，你再去考虑用截图的方法**」，
并点名 网易云音乐 / Safari / Recast / 豆包 / 百度网盘（**尤其网易云音乐**）。

他是对的，而且理由比"样本少"更硬：**计算器的键是 48×48、间隙 6 点，是这类目标里最难的**。
拿最难的一类代表全部，方法本身就错了。

脚本 `~/Documents/SuperAgent/WannaAgent/survey_estimate_accuracy.py`（每个 App 取 9 个目标，
按大小分三层）。判据：`read_screen` 返回的坐标**本身就是 0–1000 网格**，
所以真值与估算在同一套坐标系里直接比，**不需要任何换算**。

| App | 命中 | 距中心 中位/最小/最大 |
|---|---|---|
| **网易云音乐** | — | ⚠️ **界面树 0 个内容元素，按名字完全无从下手** |
| Safari | 0/9 | 213 / 38 / 827 |
| 豆包 | 1/9 | 95 / 20 / 681 |
| 百度网盘 | 2/9 | 64 / 28 / 756 |
| Notion | 4/9 | 98 / 6 / 901 |

按目标大小分层：小图标(24–40) **3/20** 中位 133 · 小按钮(40–80) **3/13** 中位 80 ·
大按钮(80+) **1/3** 中位 64。

**三个比命中率更要紧的发现：**

1. **误差是两极的，不是均匀的。** 距中心那一列里 `6/16/20/28/42/45` 与
   `338/416/756/827/901` 各占一半 —— **中间地带几乎没有**。
   翻译过来：**找到了就极准**（Notion「主页」偏 6 = 整屏 0.6%），
   **没找到就是在乱猜**（偏 900 = 完全另一头）。
   **所以问题不在"定位精度"，在"能不能认出这个控件"。**
2. **认不出的主因是"名字歧义"，不是"看不清"**：百度网盘那三个失败里，
   三个图标**都叫 `folder`** —— 模型没法知道要哪个。这不是眼睛的问题。
3. ⭐ **网易云音乐的窗口内容对辅助功能完全不暴露（0 个元素）** ——
   **「按名字」对它不是"不准"，是"根本没有"。**

**结论（据此修正阶段 4 的方向）：**

- ❌ **不能删**：至少有网易云音乐这一类 App，坐标估算是**唯一**的手段。
  用户那个判据（"如果很多软件只能用截图来估计，你再去考虑用截图的方法"）**成立了**。
- ❌ **也不能当主力**：17% 的命中率不足以单独撑起"操控电脑"。
- ✅ **正确的形状**：**按名字优先，估算兜底** —— 也就是现在的 `.auto`。
  但**兜底必须让调用方知道"这一次是兜底猜的"**，不能和"按名字精确命中"混为一谈
  （现在两者都回一句「点击完成」，调用方分不出来 —— 这是下一步要修的点）。

**这一轮的测量本身也有局限，如实记：**
- 目标名是从界面树里抓的**裸标签**（`folder`、`6个文件`），
  而真实场景里用户会说「文件列表左上那个文件夹」—— **信息更多，理应更准**。
  所以这份数字**可能低估了实际表现**。
- 只在**单块屏、当前这个桌面**上测；没测多屏、也没测窗口被遮挡的情况。

#### ⭐ 第三轮：剪映（Chromium 内核）+「能看见 ≠ 能控制」

用户要求按**能真的操控**来验，而不只是"能识别"：
「你能看到的元素和你能精准控制的不是一回事，**不能只是识别，还要分别点击一下，
看它能不能正常使用**」（并交代：别点删除，正常点击没问题）。

**剪映 = `/Applications/VideoFusion-macOS.app`（bundle `com.lemon.lvpro`）**，
和网易云音乐一样是 **Chromium Embedded Framework** 内核，但**表现完全不同**：

| | 网易云音乐 | 剪映 |
|---|---|---|
| 窗口内容元素 | **0** | **55** |
| 元素名字 | — | **程序内部标识符**（`root_素材`、`MainWindowTitleBarExportBtn`） |

剪映暴露的**不是给人看的文字，是内部 id** —— 但 Wanna 的名字匹配是「**包含**」语义，
所以搜「素材」能命中 `root_素材`，**按名字照样可用**。

**真点击实测**（`~/Documents/SuperAgent/WannaAgent/test_jianying_control.py`，
点顶部 12 个素材分页 —— 纯导航，不碰删除）：

| | 结果 | 判据 |
|---|---|---|
| **命中** | **12/12** | 三重吻合：查到的矩形**尺寸**与目标逐点相等（40×42）；12 个名字查到 **12 个互不相同、单调递增**的位置；像素间距 49.0 ÷ 网格间距 28.4 = **1.728 = 屏幕宽÷1000** |
| **生效** | **5/12** | 点前点后各读一次界面树，看内容有没有变 |

**7 个"点中了但界面没变"的原因还没查清**（如实记）。最可能是剪映**没打开工程**时
那几个面板本来就是空的；也可能是那些分页的切换不改变界面树。**没查清就不下结论。**

⚠️ **这一轮我自己写错了一次判据，值得记**：日志里的坐标是**像素**（屏幕 1728 宽），
`read_screen` 给的是 **0–1000 网格** —— 我拿两者直接比，得出「点得中 0/12」而
「UI 变了 12/12」这种**自相矛盾**的结果。真相是那个偏移只是比例（1.728）+ 一个
约 20px 的原点差。**自相矛盾的数字，先怀疑自己的判据，别先怀疑被测对象。**

---

## 附：`mcp-server-macos-use` 与 Wanna 的逐条对照（2026-09-28 读源码得出）

用户要求：「**你要去把这个代码读一下**，然后看它具体是不是跟当前的 MCP 功能重合」
—— 下面是读 `Sources/MCPServer/main.swift`（2056 行）与 `MacosUseSDK` 的结果。

### 同源，但"找元素"那一层是各写各的

两边都 `import MacosUseSDK`（mediar-ai，同一作者）。但：

| | 共用 | 各写各的 |
|---|---|---|
| 读界面树 | ✅ 同一个 SDK | |
| 输入合成（点击/打字/按键） | ✅ 同一个 `InputController` | |
| **找元素** | | **Wanna：三键排序（精确名→控件尺寸→离估算点近）+ 包含语义**<br>**macos-use：`elementText == text` 精确相等** |
| 兜底 | | Wanna 有 ②吸附 ③估算；**macos-use 没有兜底**，找不到名字就必须给坐标 |

### 谁也不是谁的父集

| 能力 | Wanna | macos-use |
|---|---|---|
| 按名字（宽松/包含） | ✅ | ❌（必须完全相等） |
| 坐标兜底（吸附 / 估算点） | ✅ | ❌ |
| ⭐ **动作后报 diff（变了什么）** | ❌ | ✅ |
| `set_value` / `press_ax` / `set_selected` | ❌ | ✅ |
| 蓝光标 / 圈选提问 / 画圈 / agent 循环 | ✅ | ❌ |
| 截图**剔除本 App 窗口** | ✅ | ❌ |

### ⭐ 而且 diff 这个能力**本来就在我们脚下**

`MacosUseSDK` 自己就提供 `CombinedActions.clickWithDiff` / `pressKeyWithDiff` /
`writeTextWithDiff`，以及 `AccessibilityActions` 里的
`setAccessibilityValue(pid:at:value:)` / `pressAccessibilityElement(pid:at:)` /
`setAccessibilitySelected(pid:at:selected:)`。**Wanna 一个都没用。**

### 正面对比：同一批目标各点一遍（豆包，6 个目标）

脚本 `~/Documents/SuperAgent/WannaAgent/compare_two_mcps.py`
（Wanna 走 HTTP、macos-use 走 stdio，**同一个 Python 客户端**；判据对两者相同：
点前点后界面树有没有变）。

| | 生效 |
|---|---|
| **Wanna** | **4/6** |
| **macos-use** | **2/6** |

macos-use 那 4 个失败里 **2 个是「参数报错」**（它根本没处理），另 2 个它自报
`Clicked element 'X'. 1 added, 1 removed` 而我的判据没看到变化 ——
**说明它的 diff 比"整棵树对比"更灵敏**，这也正是要吸收它的理由。

### 三层的真实工作原理（用户问）

**串行兜底，不是并行对比**：①按名字 → 找到了就返回（**根本不看估算点**）
→ 没找到才 ②吸附 → 还不行才 ③估算点。

⚠️ **所以 ③ 不是罕见路径**：仓库自己量过（2026-09-26，7 次点击解析），
**6 次是「模型没写名字」** → 全部直接掉到 ③。**模型不写名字 = 直接用 17% 那条路。**

### 结论：合并什么、不合并什么

- ❌ **不合并服务端**：能力互不包含，合成一个只会互相牵制；而且两套坐标（像素 vs 网格）
  同时暴露给 agent 正是 §五 的致命风险。
- ✅ **吸收这四样**（用户拍板「我们没有的全都吸收过来」）：
  1. ⭐ **动作后报 diff** —— 现在只回「点击完成」，调用方不知道生效没有
  2. `set_value`　3. `press_ax`　4. `set_selected`
- ✅ **给 Python agent 只暴露 Wanna 一个**。macos-use 留着给别的客户端用（Claude Code 现在就在用）。

---

## 移植完成 + 升级版对比（2026-09-28）

用户拍板：「**把它所有的特点和优势全都移植过来，然后再重新测试**……
升级之后的版本如果比 macOS Use 要强，那就没有必要用它」，并指定拿
**Safari + Notion** 做测试（「这样结果才有价值」）。

### 移植了什么（4 样，全部来自底层 SDK）

| 移植 | 实现 |
|---|---|
| ⭐ **动作后报 diff** | 左键改用 `CombinedActions.clickWithDiff(point:pid:)`（内部：遍历→点→再遍历→算 diff） |
| `set_value` | `setAccessibilityValue(pid:at:value:)` |
| `press_ax` | `pressAccessibilityElement(pid:at:)` |
| `set_selected` | `setAccessibilitySelected(pid:at:selected:)` |

三个原子动作**走和点击完全相同的那条三层解析链**（`resolvedClickPoint`）——
刻意的：移植过来的动作绝不能绕过已调好的定位逻辑，否则会出现"点击走一套坐标、
写值走另一套"的分裂，而那种分裂**不报错**。

Wanna 的 MCP 现在 **10 个工具**（原 7 + set_value / press_ax / set_selected）。

**diff 实测输出**：
```
点「显示起始页」→ 点击了「显示起始页」。界面变了：新增 0 · 消失 1 · 改动 0。
点「显示侧栏」  → 按名字没有找到「显示侧栏」，这一次点击没有执行（当前是「只用名字」模式，不会退到坐标）。
```
第二条同样重要：**失败也如实说出来**，不再回一句含糊的"点击完成"。

### 对比结果（同一批目标、各点一次、同一把尺子）

| App | Wanna（升级后） | macos-use |
|---|---|---|
| Safari | **6/6** | 3/6 |
| Notion | **3/6** | 1/6 |
| 豆包 | **4/6** | 2/6 |
| **合计** | **13/18 = 72%** | 6/18 = 33% |

⚠️ **这个对比对 macos-use 不完全公平**（如实记）：它的遍历默认**包含不可见元素**，
而我判"界面变了没"用的是 Wanna 的 `read_screen`（只列可见元素），
所以它有些真实的微小变化我这边看不到（例如它自报 `1 added` 而我的判据说"没反应"）。
但即使把这个偏差算进去，差距（13 vs 6）也不是它追得上的。

**结论（按用户给的判据）：升级版明显强于 macos-use，因此没有必要用它。**
macos-use 继续留着给别的客户端（Claude Code 现在就在用），但**不接进 Python agent**。

### 三层的耗时（用户问）

**纯代码，不是三次模型交互。** 模型调一次 `click`，Wanna 内部串行试
①按名字 → ②吸附 → ③估算点。耗时在 ①② 各一次**AX 跨进程查询**
（仓库实测 **0.14–0.6 秒**，见 `全局框架/12`）：一次命中约 0.14–0.6s；
走到 ③ 约 0.3–1.2s；③ 本身是纯算术、0 秒。**最坏多花一秒左右。**

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

---

## 阶段 1 进度（2026-09-28 · 最小闭环已通）

### 1.1 ⚠️ 方案原文的「用官方 MCP Swift SDK」**已作废**，改成自己写

**原文**：§四 阶段 1「用**官方 MCP Swift SDK** 在 Wanna 里起一个 stdio MCP server」。

**实测两条都走不通：**

| 原计划 | 实测结论 |
|---|---|
| 用官方 SDK | ❌ **在 Xcode 下编不过**。`modelcontextprotocol/swift-sdk` 自己是 `swift-tools-version:6.1` → 按 Swift 6 语言模式编 → 被 Swift 6.4 的 region-based isolation 判两处数据竞争（`NetworkTransport.swift` 的 `Task { @MainActor in … }`，正是那 2 行）。**换版本无解**：查过全部 tag，凡是有 HTTP 服务端传输的版本（0.11.0 / 0.12.0 / 0.12.1）都含这两行。唯一有效的手段是全局 `SWIFT_VERSION=5.0`，而**那只对命令行有效** —— 在 Xcode 里构建照样失败。工程级设置覆盖不了包自己的 tools-version（实测过）。 |
| stdio | ❌ **语义上就不成立**：stdio 要求「客户端 spawn 服务端进程」，而 **Wanna 是已经在跑的 GUI App**，客户端没法 spawn 它。 |

**改成**：按规范自己实现最小集（`initialize` / `tools/list` / `tools/call`），
**HTTP 监听绑 `127.0.0.1:8765`**（`/mcp`）。**零新依赖** —— Wanna 仍然只有 `MacosUseSDK` 一个外部依赖。
好处不只是绕开那个编译问题：加官方 SDK 会带进 1 + 1 + 7 = 9 个包。

### 1.2 鉴权（用户拍板：加 token）

绑定回环只防外网，**防不住本机其他进程** —— 而本服务能点击、打字、读屏。
所以启动时读/生成 `~/Library/Application Support/Wanna/mcp-token`（0600），
请求必须带 `Authorization: Bearer <token>`，否则 401。

### 1.3 已完成并实测的部分

新增两个文件：`Wanna/WannaMCPServer.swift`（协议 + HTTP + 鉴权）、
`Wanna/WannaMCPTools.swift`（工具声明与实现）。由 `CompanionManager.start()` 起、
`willTerminateNotification` 收。

**实测（2026-09-28，真机）**：

| 验什么 | 结果 |
|---|---|
| 服务端起来了 | ✅ 日志 `🧩 MCP · ✅ MCP 服务端已监听 127.0.0.1:8765/mcp`；`lsof` 确认 Wanna 进程在 LISTEN |
| **独立 Python 客户端连得上** | ✅ `server=wanna v1.0.0`，协议 `2025-11-25`，`tools/list` 返回 1 个工具 |
| **调得通截图** | ✅ 返回 **303 KB 的 JPEG**（1280×827）+ 归一化坐标说明 + 屏幕尺寸 |
| **截图里看不到 Wanna 自己** | ✅ 看图确认：画面里没有任何 Wanna 窗口（刘海面板 / 蓝光标 / 覆盖层都没有） |
| **错误令牌被拒** | ✅ 返回 401 |

### 1.4 还没做的（阶段 1 剩余部分）

- **动作类工具还没挂**：`click` / `type_text` / `press_key` / `scroll` / `open_app` / `ax_tree`。
  目前只有 `screenshot` 一个。
- **`click` 的 `targeting` 参数还没实现**：它是用户拍板的「两种瞄准方式都保留」那一半，
  需要给 `MacosUseController.execute` 加一个可选参数把它透到三层解析链上。
- **还没有设置开关**：现在启动即监听。应该加一个设置项（默认关或默认开由用户定）。
- **`mimeType` 字段**：实测是对的（MCP 规范 wire 名就是 `mimeType`，Python 客户端内部叫
  `mime_type`）—— 这一条记在这里是为了避免下次有人被客户端属性名误导。
