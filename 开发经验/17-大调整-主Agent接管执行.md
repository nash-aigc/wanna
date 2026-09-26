# 17 · 大调整：主 Agent 快捷键接管「执行」，录音回归纯录音（2026-09-27 设计，**尚未实施**）

> 用户的原话概括：**录音快捷键就只做"录下来、转写、润色"这一件事，做到极致；主 Agent 快捷键
> 本质是一个执行类的 Agent，那就让它真正具备执行能力** —— 于是 Notion 那套（关键词、参考材料、
> 三颗按钮、后端监听）从录音**剥离**，接到主 Agent 的快捷键上。
>
> 「**不要重写代码，你只需要去把那个里边的模型替换一下**」「相关的部分或者主要的部分都已经设计完了，
> 那么现在就只差一个接线的问题」—— 所以这一篇是**接线图**，不是重新设计。

## 两个快捷键现在各是什么

| | 录音快捷键 | 主 Agent 快捷键（⌃⌥） |
|---|---|---|
| 入口 | `LongFormRecorderController` | `CompanionManager` 的按说即发 |
| 语音识别 | **豆包**（`VolcengineRealtimeASRClient`） | **阿里**（`BailianRealtimeTranscriptionProvider`） |
| 刘海表现 | 带子 + 逐字字幕 + 两翼 | 两翼（Listening / Thinking / Speaking） |
| 转写去向 | 落盘 `.txt` / `.jsonl` | 直接进主对话管线（截图 → 视觉模型） |

## 要做的六件事（按依赖顺序）

### 1. 主 Agent 的识别换成豆包（用户第 1 条）

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
