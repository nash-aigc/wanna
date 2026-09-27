# 17 · 大调整：主 Agent 快捷键接管「执行」，录音回归纯录音（2026-09-27 设计；**第 1、5 条已实施**，见文末）

> 用户的原话概括：**录音快捷键就只做"录下来、转写、润色"这一件事，做到极致；主 Agent 快捷键
> 本质是一个执行类的 Agent，那就让它真正具备执行能力** —— 于是 Notion 那套（关键词、参考材料、
> 三颗按钮、后端监听）从录音**剥离**，接到主 Agent 的快捷键上。
>
> 「**不要重写代码，你只需要去把那个里边的模型替换一下**」「相关的部分或者主要的部分都已经设计完了，
> 那么现在就只差一个接线的问题」—— 所以这一篇是**接线图**，不是重新设计。
>
> **进度**：**第 1 条（识别换豆包）与第 5 条（Notion 搬去主 Agent）已实施**；
> 第 2、3、4 条还没做。两条的实测结果、以及**没验到什么**，写在文末那两节里。

## 两个快捷键现在各是什么

| | 录音快捷键 | 主 Agent 快捷键（⌃⌥） |
|---|---|---|
| 入口 | `LongFormRecorderController` | `CompanionManager` 的按说即发 |
| 语音识别 | **豆包**（`VolcengineRealtimeASRClient`） | **豆包**（2026-09-27 前是阿里，见《第 1 条已实施》） |
| 刘海表现 | 带子 + 逐字字幕 + 两翼 | 两翼（Listening / Thinking / Speaking） |
| 转写去向 | 落盘 `.txt` / `.jsonl` | 直接进主对话管线（截图 → 视觉模型） |

## 要做的六件事（按依赖顺序）

### 1. 主 Agent 的识别换成豆包（用户第 1 条）—— **已实施，见文末《第 1 条已实施》**

**接在哪**：`CompanionManager` 起录音时用的 provider 是 `buddyDictationManager` 里按
`VoiceTranscriptionProvider` 解析的（`BuddyTranscriptionProvider.swift` 的工厂）。
**怎么接**：录音那条路已经有一个能跑的豆包客户端（`VolcengineRealtimeASRClient` +
`VolcengineASRFrame`，协议逐条实测过）。**不要动主 Agent 的音频管线**，只在 provider 工厂里
让"主 Agent 那条"也走豆包实现 —— 即把豆包的客户端做成一个符合 `BuddyTranscriptionProvider`
协议的 provider，与既有的 Bailian provider 并列，然后让设置里那一项（或新增一项）指到它。
**注意**：豆包那四条硬约束（`result_type: "single"`、`compression: none`、末包一发即断、
判重按文本）都在 `VolcengineRealtimeASRClient` 的注释里，照抄即可，别重新推。

### 2. 主 Agent 说话时，刘海下面显示逐字字幕（用户第 2 条）

**接在哪**：`NotchRecordingBandView` 里那条 `transcriptRibbon`（`SmoothRevealedTranscriptText`）
—— 用户点名「**直接照搬这个代码就可以了，完整的复制过来**」。
**怎么接**：把那一条（含 `SmoothRevealedTranscriptText` 与它的宽度迟滞逻辑）抽成一个**共用视图**
（例如 `NotchMarqueeTranscriptLine`），两处都用它：录音带用它，主 Agent 的 Listening 态也用它。
**它为什么容易错**（那篇注释里全写着）：位移是 `可用宽度 − 文字宽度`，所以**文字一变短就往右跳**；
显示源必须只增不减、窗口上限必须带迟滞、窗口必须能长。**照搬，不要重新设计。**

- 只在 **Listening** 显示；进入 **Thinking** 就消失（用户明说）。
- 打断等一切交互**仍由主 Agent 的既有逻辑驱动** —— 这里是"加一条字幕"，不是改状态机。

### 3. Listening 那颗可点击 → 展开成转写编辑窗（用户第 3 条）

**接在哪**：现在展开编辑是录音带左侧那颗（`toggleTranscriptEditor` + `expandedTranscriptPanel`）。
**怎么接**：主 Agent 的 Listening 态下，让**刘海左侧那颗（显示 Listening 的位置）可点**，
点了走同一个 `expandedTranscriptPanel` 那套排版（顶上一行转写、下面是正文、可编辑）。
**不要的**：录音带左上那颗时间、右下那颗停止录音 —— 那两个不进主 Agent 这条路。

### 4. 每一条指令都存成一条录音（用户第 4 条）

**接在哪**：`RecordingLibrary`（每场录音一个 `.json` + `.wav` + `.txt`/`.jsonl`）
与 `RecordingSettingsView` 的历史列表（原文 / 转写 / 重新撰写都在那儿）。
**怎么接**：主 Agent 的一轮结束后，把这一轮的**用户原文**（转录）按同一种记录写进录音库 ——
音频可以没有（主 Agent 那条不落 wav），所以 `RecordingSession` 要允许"没有音频"，
历史行那几个按钮（播放 / 在访达中显示）在没有音频时按既有约定显示「音频已清理」那一档。
**重新转写**在没有音频时不可用（它的输入就是 `.wav`）—— 这一点要在界面上说清楚。

### 5. Notion 那套从录音剥离 → 接到主 Agent（用户第 5 条）

**要搬的东西**（现在都在 `LongFormRecorderController` 里）：

| 现在的位置 | 搬到哪里 |
|---|---|
| `startNotionKeywordWatch` / `checkNotionKeywords` / `transcriptMentions` / `fuzzyContains` / `editDistance` | 一个**独立的** `NotionNoteDetector`（纯逻辑，可单测） |
| `showsNotionNoteButtons` / `notionWantsClipboard` / `notionReferenceScreenshots` / 两颗取消 | 一个**独立的** `NotionNoteSession`（@MainActor ObservableObject） |
| `captureNotionReferenceScreenshot` | 同上（主 Agent 那边截图用的是同一套 `CompanionScreenCaptureUtility`） |
| `saveNotionNote` / `parseNotionNoteReply` / `richBlocks` / `spans` | 同上 |
| 三颗按钮的**画**（`NotchRecordingOverlay.notionNoteButtons`） | 抽成一个共用视图，录音带与主 Agent 的刘海都用它 |
| 三颗按钮的**点**（`NotchWindowController.handleGlobalClick` 里的三个 slot） | 不动 —— 它读 `NotchSupport.notionNoteButtonFrame`，与画它的那一处是同一份算术 |

**剥离之后录音只剩**：录 → 转写 → 润色 → 落盘 → 剪贴板。**没有关键词、没有参考材料、没有按钮。**

### 6. 三颗按钮的层级（**已完成**，2026-09-27）

用户报「屏幕这个按钮被挡住了」。原来录音带面板是 `statusWindow + 1`，
现在抬到 `NotchSupport.recordingBandWindowLevel = .popUpMenu`（在菜单栏之上、
在我们自己的 `.screenSaver` 覆盖层之下）。

## 顺序与风险

1. **先抽共用视图**（第 2、5 条都要它）—— 抽错了三处一起错，所以**一次只抽一个**、抽完立刻验。
2. **再搬 Notion**（第 5 条）—— 搬完要验"录音快捷键真的不再触发它"（把一个含关键词的录音跑完，
   确认没有按钮、没有写 Notion）。
3. **再换模型**（第 1 条）—— 换完要验主 Agent 那条的识别质量与延迟（豆包 vs 阿里）。
4. **最后做第 3、4 条**（点击展开、每轮存成录音）—— 它们依赖前面的状态归属。
5. **全程不重写**：每一处都是"把已经跑通的代码搬过去 / 抽出来"，用户特意交代过
   （「因为很多细节你考虑不了」）。

## 三处已由他拍板（2026-09-27）

- **每一轮都保留音频**。所以第 4 条不是"只存文本"——主 Agent 那条也要落 `.wav`
  （`RecordingAudioWriter` 与录音那条路是同一个，直接接上），这样「播放」「重新转写」
  「在访达中显示」三个按钮在历史里全部可用。
- **字幕只在 Listening 显示**。Speaking 时不显示 —— 因为"生成内容的结果会显示在鼠标右下角的
  卡片上，用户能够直接看到"。（Thinking 时按他原话也不显示：话说完那行就消失。）
- **按钮的取消语义**：主 Agent 上点取消 = **不发出去，只保留本地一条录音**。
  与录音那条的分寸不同：录音那条取消之后是"照常存一场录音"，主 Agent 这条取消之后
  **这一轮不进对话管线**（不截图、不问模型），但**本地那条录音照留** —— 两处都要有东西留下来，
  这是同一条原则。

---

## 第 5 条已实施（2026-09-27，同一天下午）

**做了什么，一句话：Notion 那整套从 `LongFormRecorderController` 里整块搬出来、接到主 Agent 的
快捷键上；录音那边一段都不剩。** 没有重写任何逻辑 —— 每一处都是"原样搬"，代码里连注释都跟着走。

### 搬成了三个文件

| 文件 | 搬了什么（**一行逻辑都没改**） |
|---|---|
| `Wanna/NotionNoteDetector.swift`（241 行） | `nonisolated enum`：`transcriptMentions` / `fuzzyContains` / `editDistance` / `transcriptMentionCount` / `parseNotionNoteReply` / `richBlocks` / `spans` / `notionColor` / `notionNoteTitle` + `edgeCharacterCount = 100`。**不碰网络、不碰 UI、不碰设置**，所以能脱离整个 App 单独编译跑 |
| `Wanna/NotionNoteSession.swift`（406 行） | `@MainActor ObservableObject` 单例（形状照 `AgentActivityBoard.shared`）：那 8 个 `@Published` 状态、2 秒一次之后每 3 秒的检测表、参考材料截图、三颗按钮的动作、`saveNote`（模型整理 → `NotionNoteClient` 写入）。**只有两处改动**：日志从 `publishDiagnostic` 改成注入的 `log`（那两样输出属于录音页）；转写来源从"读控制器自己的 `transcriptPlainText + livePartialText`"改成喂进来的 `noteLiveTranscript` |
| `Wanna/NotionNoteButtonRow.swift`（90 行） | 那三颗按钮的"画"，从 `NotchRecordingOverlay.notionNoteButtons` 原样搬来 |

### 接线点（主 Agent 的语音路径）

- **起表**：按下说话键（`pendingKeyboardShortcutStartTask` 里）、连续追问窗口打开时（`armContinuousListeningWindow`）。
- **喂转写**：按下说话那条的 `updateDraftText` 与连续追问的 `onTranscriptUpdate`，各调一次
  `noteNotionLiveTranscript`。**刻意不塞进 `handleInterimTranscriptForScreenDetection`** ——
  那个函数第一行就按「说到屏幕立即截屏」的开关 `return`，而 Notion 有它自己的总闸。
- **收尾分岔**：`handleFinalTranscript` 与 `submitFollowUpQuestion` 在把转写送进管线之前都过一次
  `consumeNotionNoteTurnIfNeeded`。它是**消费型**的（判完就清干净），所以随后的打字提问不会
  捡到这一轮的残留；连续追问里判成 `.none` 会**重新起表**，否则窗口里说的第二句没有任何检测。
- **停表**：`handleFinalTranscript` 的空转写早退、`endContinuousListeningWindow`。

### 那三颗按钮：几何没动，画的位置换了

点仍然是 `handleGlobalClick` 里那三个 slot、读的仍然是 `NotchSupport.notionNoteButtonFrame`
（**这两处按要求一行没改**）；改的只是"画"从**录音带那块面板**搬进了**刘海面板**
（静止 pill 与展开态那条状态带各一处 `NotionNoteButtonAnchor`）。

两者靠**相减**发生关系、不另写一份几何：`NotchSupport.notionNoteButtonPlacement(on:)` 由
`notionNoteButtonFrame` 与 `restingWindowFrame` 直接相减得出三个偏移（静止面板的 trailing inset、
离屏幕顶边的距离、离刘海中心的偏移）。摆法是"零尺寸锚点 + 把那一行以 `.overlay(alignment: .trailing)`
挂上去"：`.position` 定的是**中心**，而按钮按**右边缘**定位，所以锚点的 x 就是那个偏移，
不必知道此刻有几颗、有多宽。

那一行 `.allowsHitTesting(false)` 是必须的：静止态面板 `ignoresMouseEvents = true`，本来收不到点击；
**但展开态面板是收事件的** —— 少了这一行，同一个动作会被 SwiftUI 按钮和全局监听各触发一次
（"打开那一页"会开出两个标签页）。

### 取消语义（**两条路唯一一处不同**）

- 录音那条点「取消」= **按普通录音走**（照常存一场录音，只是不写 Notion）。
- 主 Agent 这条点「取消」= **这一轮什么都不发**（不截图、不问模型、也不写 Notion）。

这里没有"照常"可退 —— 退回去就是拿用户已经否掉的东西去问模型、去写一页云端笔记。
两处都要留下东西（同一条原则）：录音那条留下录音；主 Agent 这条本该留下本地那条录音，
**但第 4 条「每一轮都保留音频」还没接**，所以今天这条只做到"不发出去"，
被取消的那一轮转写只在日志里留一行。

### 验收：跑了什么、量到什么

**① 录音不再触发 Notion —— 过了（有一条前提）**

- 在**带探针的构建**上跑真录音（⌥C 开始、⌥C 停止，14.0 秒、有真实输入样本）；
- 探针打在 `NotionNoteSession.beginListening()` 与 `checkKeywords()` 上 —— 整场录音期间
  **这两行一次都没出现**（这套东西**只能**从 `beginListening()` 被 arm，所以"没被 arm"
  就等于"检测根本没跑"）；
- Notion 那一页的顶层子块 **61 → 61**（没写进去）；
- 录制中的截图里刘海左侧没有那几颗按钮。

⚠️ **前提（如实记）**：**没能把关键词真正喂进录音转写**。这台机器上音箱放出来的声音进不了麦克风 ——
`say` / `afplay -v 4`（音量 38% 与 75% 都试过）录到的峰值一直是房间底噪（0.04 上下），
所以这几场录音的转写都是空的。因此"没有按钮"这条**靠的是上面那条结构性证据**（检测从未被 arm），
不是"转写里有词却没触发"。真实语音这条路上，这一条**没验到**。

**② 主 Agent 那条路：检测与那颗按钮 —— 过了**

拿不到真实语音，所以按接线图允许的做法用了一个临时探针（`/tmp/wanna-notion-probe-on` 存在时才跑，
做完已删、已标注 `TEMP PROBE (remove before commit)`）把「说话期间的实时转写」直接喂进
`NotionNoteSession`：**检测循环、状态发布、按钮的绘制与点击全是真的，只有那句转写是注入的。**

- 真的检测循环：`checkKeywords()` 按 2 秒 → 3 秒的节奏在跑，约 2 秒后 `showsNotionNoteButtons = true`、
  `noteWasDetectedThisTurn = true`；
- **画的和点的逐点重合**：算出来的命中矩形是 AppKit `(622.5, 1086.0, 52×30)`（y 向上），
  同一块屏的 AX 树里那颗按钮是 `(622, 1, 52×30)`（y 向下）—— 高度 1117 一点不差地翻过来是同一个矩形；
- **点它真的走通**：在 (622,1,52×30) 上合成一次点击 → `shows` 变 false（按钮收掉）、`取消` 变 true；
- **两种判定都验了**：没点那次 `consumeTurnDecision()` = **`saveNote`**；点过取消那次 = **`cancelled`**；
- **收尾入口真的拦得住**：带着关键词的转写在"已取消"状态下走 `handleFinalTranscript` →
  **会话条目数 2 → 2**（没进对话管线），`voiceState` 没停在 processing。

**没验到的**：`.saveNote` 的**执行**那一步（模型整理 + 写 Notion）没有在主 Agent 这条路上真跑过 ——
它会往用户的页面上写一条测试笔记，我不该留下那个。判定值验到了，执行没验。

### 顺带留下的两处别扭（不是错，是没做）

1. **设置页那一节没搬**：设置 → 录音 → 「Notion 笔记」现在配的是**主 Agent** 的行为。
   搬它意味着动设置页的信息架构，不在"只搬第 5 条"的范围里。
2. **`NotchWindowController.swift:618` 有一行别人留下的 `// TEMP PROBE (remove before commit)` 注释**
   （来自 `f83da84`，底下并没有探针代码）。不是这次留下的，也没顺手删。

---

## 第 1 条已实施（2026-09-27，同一天）

**做了什么，一句话：主 Agent 快捷键（⌃⌥ 按说即发）的语音识别从阿里百炼换成了豆包（火山引擎）。
豆包的客户端一行没改、音频管线一行没改，只是把「这些音频送给谁」换了。**

### 改了哪些文件

| 文件 | 改了什么 |
|---|---|
| `Wanna/VolcengineTranscriptionProvider.swift`（**新增，425 行**） | 把已经跑通的 `VolcengineRealtimeASRClient` 包成一个符合 `BuddyTranscriptionProvider` 协议的 provider，与百炼那个并列 |
| `Wanna/BuddyTranscriptionProvider.swift` | 工厂改成三条规矩（见下）。顺手删掉了 Info.plist 的 `VoiceTranscriptionProvider` 那条读法 —— 用户能在界面上选之后，那个 bundle 常量就成了第二个真相 |
| `Wanna/AppSettings.swift` | 新增 `VoiceTranscriptionService`（豆包 / 百炼）+ `voiceTranscriptionServiceRawValue`（默认**豆包**），`CodingKeys` 与手写的 `init(from:)` 两处都加了（漏掉其中一处就是「每次点都写盘、每次启动都丢」，这个坑 2026-09-26 刚踩过） |
| `Wanna/GeneralSettingsView.swift` | 「听」页最上面新增一节「识别服务」（一行下拉），并把「识别模型」与「识别语言」两处的说明改成「**只作用于百炼**」 |

**没有动的**：`BuddyDictationManager` 的音频管线、VAD、连续监听、打断、`VoicePlaybackEngine`、
`BailianRealtimeTranscriptionProvider`、`VolcengineRealtimeASRClient`（它的四条硬约束一行没重推）。

### 配置从哪来：**复用「录音」页那一套**（这是要他知情的一个选择）

豆包那条读的是 `recordingServiceAPIKey` / `recordingResourceID`（档位）/ `recordingCustomResourceID` /
`recordingLanguage` / `recordingHotwords` —— 也就是说**与录音快捷键共用同一份配置**。

- **为什么不新加一套字段**：同一台机器上只有一个火山账号，同一个 API Key 让用户填两遍没有意义；
  而且「录音」那一套是**与豆包一起实测过**的值（语言写 `zh-CN`、热词进 `corpus.hotwords` 的形状）。
- **代价（已在界面上写清楚）**：「听」页的「识别语言」从此只作用于百炼；豆包那条用「录音」页的语言。
  热词两处都生效（`buildTranscriptionKeyterms()` 已经把「听」页的热词合进 keyterms，
  provider 再把它与「录音」页的热词合成一个 corpus 列表）。
- 界面上这一行就在「听（识别）」页最上面，说明里直接写着「豆包那条不用这里配任何东西，它读的是录音页那一套」。

### 三条规矩（工厂里那一处，顺序不能换）

1. **调用方点名了模型 → 百炼。** 语音聊天三段式的四条预设**全部**带非空
   `recognitionModelID`（实测：都是 `qwen-audio-3.1-realtime-plus`，而带 nil 的全是全双工预设、
   不走这条路）。所以「override 非空 → 百炼」精确地圈出了**语音聊天那条路**，
   与用户的原话一致：「这两个快捷键用豆包，正常的那个（语音聊天）用阿里」。
2. **没点名 → 看用户在「听」页选的识别服务**（默认豆包）。按说即发、它的持续追问窗口、卡片通话都走这条。
3. **选中的没配好 → 退到另一个；两个都没配 → Apple 本地识别。** 每一步都打一行日志 ——
   静默换后端是最坏的结果。

### 实测把两处设计改了（细节见 `09-实测数据.md` 第二十节）

1. **不发末包了。** 豆包的官方姿势（录音那条路）是发末包等服务端给 `definite`。
   探针实测这条路**根本不回定稿**（两次都等满 2.04 秒的兜底，回来的文字与实时文字一字不差），
   而录音日志里 `定稿已到` 146 / `超时兜底` 98 也印证短句必然走超时。
   改成**盯「文字不再变长」**（连续 0.4 秒没变就交）：收尾从 **2.04 秒降到 0.40 秒**。
2. **一句一条新连接（`beginNextUtterance` 重连）。** 考虑过留着连接省一次握手，
   **没用**：留着的话服务端的时间轴是连续的，上一句「定稿晚到」的那一帧会落进下一句的累积里
   （用户会看到下一句开头挂着上一句的尾巴），而按时间戳做水位又会吃掉「按了发送之后继续说」的半句 ——
   两种错法都在悄悄改用户说的话。重连是干净的：新连接时间轴从零重计 + 代次闸挡住旧连接的迟到帧，
   代价是一次握手，而握手期间喂进来的音频是在 `URLSessionWebSocketTask` 里排队的，**不会丢**。
   实测第二句与第一句同量级（首字 1.29s vs 1.18s），三句连着跑都一样（首字 1.25–1.27 秒、收尾 0.40 秒），
   且每句的定稿都是干干净净的那一句（没有上一句的尾巴）。
3. **那条共用的 `URLSession` 是补上的**（`VolcengineRealtimeASRClient` 新增一个可注入的参数，
   不注入时行为一字不变、录音那条路照旧自己建）。理由就是仓规 E3
   （`开发经验/10-踩过的坑.md`）：每句话新建一条 `URLSession` 再 invalidate 会破坏 OS 的连接池。
   录音那条路一次录音只换几十次连接，自己建没事；**这条路每句话一条**，所以 provider 持一条长命的、
   所有连接共用。注入的那条**不会被 invalidate**（归调用方所有），超时也和自建那条一样设成无限 ——
   会话之间可能隔几十秒没有音频，默认的 60 秒请求超时会把挂着的 socket 拆掉。

### 验收：跑了什么、量到什么

- **编译通过**；`xcodebuild` 全绿（新文件 0 warning）。
- **端到端走了真的一条**（这一台机器上扬声器喂不进麦克风，所以按接线图允许的做法挂了临时探针）：
  把用户**自己的真实录音**（`2026-09-27-073609-1A8E.wav` 第 31.5–39.5 秒，
  内容正是他描述这件事的那句话）从 `BuddyDictationManager` 的 tap 送进去，
  按键走**真实快捷键路径**（连按两次说话键 = 开始 / 说完发送）：
  - 会话是 `VolcengineTranscriptionSession`（= 工厂真的把主 Agent 那条指到了豆包），
  - 日志 `🎙️ Transcription: using 豆包流式识别（火山引擎）`；
  - 识别出整句原文并**直接进了主对话管线**（`🗣️ Companion sending transcript: 然后这两个快捷键…`），
    随后截图 → 视觉模型 → 播报整条链照常（`🧠 本轮上下文…截图 1 张`、TTS 分段入队）；
  - `请求定稿 → 拿到最终转写 **0.40 秒**`。
- **延迟对比**：见 `09-实测数据.md` 第二十节（豆包首字 1.18–1.29 秒、百炼 0.43 秒；
  收尾豆包 0.40 秒、百炼 0.33 秒 —— 百炼更快，但**它的第二句在同一个会话上没给出定稿**）。
- **新字段的编码/解码往返也验了**（仓规 E4 那一类：只加 `CodingKeys`、忘了 `init(from:)`
  就是「界面改完写进盘、重启就丢」）：encode → decode 往返保持所选的后端；一份**缺这个键**的老设置
  解出来是默认的豆包（不 throw，也就不会把用户那一整份设置丢掉）；一个**不认识的值**退化成默认；
  用户盘上那份真实的 `AppSettings.json` 也解得开、解出来就是豆包（所以他不用动任何设置）。
- **探针已删**（临时文件 + 钩子全部清掉，工作区干净、`grep ASRSwapProbe` 为空）；没有新的崩溃报告。

⚠️ **没验到的，如实记**：

1. **用户真实麦克风下的这一条没跑**。这台机器的扬声器→麦克风耦合太低（`09-实测数据.md` §17），
   所以喂的是**真实录音文件**：音频是真的、识别是真的、管线是真的，**麦克风那一段不是**。
2. **识别质量**：同一句话豆包把「突出」听成「痛」、百炼把「同一个」听成「共同」——
   **各错一处**。一个样本，不能据此说谁更准。
3. **「不等定稿会不会掉精度」没测出来**：两次探针里实时文字与定稿文字一字不差，
   所以那 0.40 秒的收尾是安全的 —— 但这是**两句音频**的结论。
