# 17 · 大调整：主 Agent 快捷键接管「执行」，录音回归纯录音（2026-09-27 设计）

# 17 · 大调整：主 Agent 快捷键接管「执行」，录音回归纯录音（2026-09-27 设计；**第 1、5 条已实施**，见文末）

> 用户的原话概括：**录音快捷键就只做"录下来、转写、润色"这一件事，做到极致；主 Agent 快捷键
> 本质是一个执行类的 Agent，那就让它真正具备执行能力** —— 于是 Notion 那套（关键词、参考材料、
> 三颗按钮、后端监听）从录音**剥离**，接到主 Agent 的快捷键上。
>
> 「**不要重写代码，你只需要去把那个里边的模型替换一下**」「相关的部分或者主要的部分都已经设计完了，
> 那么现在就只差一个接线的问题」—— 所以这一篇是**接线图**，不是重新设计。
>
> **进度（2026-09-27 收尾）**：**六条全部实施。**
> 第 1 步（抽字幕共用视图）、第 2、3 条（字幕 + Listening 可点开）、第 4 条（每一轮存成一条录音）、
> 第 5 条（Notion 搬去主 Agent）、第 6 条（按钮层级）都已完成。
> 每一条做了什么、量到什么、**没验到什么**，写在文末对应那一节里；
> **第 4 条的那一节同时记了它带出来的一条界内改动**（刘海黑带下边缘的接缝）。

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

## 第 2、3 条已实施（2026-09-27，同一天）

**做了什么，一句话：主 Agent 说话时，刘海下面多了一行和录音带一模一样的滚动字幕；
刘海左侧那颗「Listening」点一下，展开的是录音带那个转写编辑窗（同一份视图）。**
状态机一行没动 —— 相位、打断、说完等待、自动发送全都还是原来那套。

### 三个新东西，一处共用

| 位置 | 是什么 |
|---|---|
| `Wanna/NotchListeningTranscript.swift`（新，~330 行） | `NotchListeningTranscriptModel`（文本 + 编辑状态，单例）、`NotchListeningTranscriptView`（收起=那一行 / 展开=编辑窗）、`NotchListeningTranscriptPanelController`（它住的那块窗口）。**和录音子系统零共享**：录音带那块面板归 `NotchRecordingOverlayController`，这块是自己的 |
| `NotchTranscriptMarquee.swift`（加） | `NotchExpandedTranscriptPanel` —— 展开的转写编辑窗（顶上 46pt 黑行 + 下面一整块可编辑正文 + 三个快捷键）。**从录音带的 `expandedTranscriptPanel` 原样抽出来的共用视图**，两处都用它 |
| `NotchSupport.swift`（加） | `notchTranscriptRowHeight`(32) / `notchTranscriptEditorBodyHeight`(560) / `notchTranscriptPanelWindowLevel`(.popUpMenu)。前两个原来是 `NotchRecordingBandView` 的静态量，现在那一侧是**转发**（和两翼宽度同一个写法） |

**为什么把录音那个面板抽出来而不是抄一份**：用户对这一条的要求是「整个的排版，整个的效果，
包括展开之后这个窗口……**这个东西是完全照搬过来的**」——「照搬」由**同一份实现**保证，
抄一份只能保证今天像。抽出来之后录音那边只剩「哪几个字段接到哪几个参数上」，
`EmbossMaterial` 从 `private` 放开（共用材质）。

### 接线点（都在主 Agent 的既有路径上）

- **喂字幕**：`updateDraftText`（按住说话那条）与连续追问的 `onTranscriptUpdate`，
  各调一次 `NotchListeningTranscriptModel.shared.setLiveText`。**刻意放在
  「说话时实时显示识别文字」那个开关的 guard 之前** —— 那个开掌管的是鼠标旁那颗气泡，
  而这条字幕是主 Agent 自己的显示，不该被它关掉。
- **什么时候在**：`NotchWindowController.bindListeningTranscriptPanel()` 订阅
  `activityPhase` + `isFullscreenSuppressed`，**`== .listening` 就出现、其余一律收起**
  （用户：「如果用户说完了，然后进入 thinking，那么这个录音的内容就消失掉了」；
  补的一句是「Listening 时要显示，Speaking 时不显示」）。面板一出现就 `beginRound()`
  把上一轮的文本清干净，所以"上一轮说的字"不会闪一下。
- **点它**：`handleGlobalClick` 里新增一个分支，读的是**录音两翼那一份矩形**
  （`NotchSupport.recordingWingFrames`）——「画在哪」由视图按 `NotchSupport.leadingWingWidth`
  画，「点在哪」由这里判，两处只有一处算术。**判在录音那条之后**（两者占的是屏幕上的同一块，
  谁真的在跑算谁的），**排在 `panelModel.isExpanded` 之前**（那一整段结尾有一句无条件的
  `return`，录音两翼当年就是被它挡掉的）。

### 编辑窗是唯一的语义新东西：**改的字顶替这一句发出去的话**

录音那条改的是"存下来的转写"；主 Agent 这条没有"存下来的转写"，它的输出就是**这一句要发出去的
话**。所以用户在编辑窗里改的字，在 `handleFinalTranscript` / `submitFollowUpQuestion`
的**最前面**取走（`consumeEditedTranscript()`，取走即清、一轮一次），有就用他改的那份、
没有（`nil`）就照识别结果走 —— **不碰状态机**，只是把送进管线的那个字符串换掉。
这是他「可以让用户编辑录音里面的内容」这句话唯一有意义的落点：不生效的编辑框比没有编辑框更糟。

### 验收：量到了什么

**① 那一行的位置与形状（把截图按 2× 像素铺开，沿一条水平/竖直线扫「亮度 < 0.02」的连续段，边界就是黑条的边界 —— 探针脚本放在 `/tmp` 里、验完没留）**

- 屏幕上那条黑色圆角条：**x 684.5…1043.5（宽 359 = 两翼 + 刘海）、y 32…64（高 32）、下圆角 22** ——
  与录音带那条同一个式子、同一个内边距（左右各 12）、同一份 `NotchTranscriptLine`；
- 字幕条面板的窗口：算出来是 AppKit `(505, 525, 718×592)`，AX 树里是 `(505, 0, 718×592)`
  （y 向下）—— 高度 1117 翻过来逐点重合。

**② 画的和点的（这个仓库吃过"差 71pt"的亏，所以逐条量）**

- 命中矩形（`recordingWingFrames.leading`）：Quartz **x 685.5…771.5，y 0…32**；
- 画出来的左翼左边缘（截图扫描）：**x 684.5** —— **差 1pt**（86pt 宽的目标里差 1pt，不是 71pt 那种）。
  这 1pt 来自 pill 那条带 `HStack(spacing: -2)` 的居中算术，命中矩形没算那两处负间距；
- AX 树里那颗 `Listening` 文字是 **(702, 8, 62×16)** —— 完整落在命中矩形里（右端离刘海 7.5pt，
  和当年测的「~5pt」同一档）；
- 合成一次点击在 **(712, 16)**（矩形内）→ **展开真的发生**（AX 里多出 `AXTextArea` 与展开顶行）。

**③ 字幕是「平滑左移」的（不是跳的）** —— 拿 16 帧截图（实测间隔 ~100ms），对黑条那一条 y 带做 1-D 亮度剖面、在 ±80px 里找让相邻两帧最吻合的位移（SSD 最小）：

- **15/15 对相邻帧都是向左移**，单帧位移 **−2.5 … −5.0 pt**，残差 0.00086~0.0014；
- 整段 1.549s 累计位移 **50.0pt**，而这段时间喂进去 **3.44 个字 × 14.883pt = 51.2pt** ——
  位移和文字增长同步，**没有静止段、没有整段跳**（这正是
  `SmoothRevealedTranscriptText` 那 0.6s 线性动画被下一批从当前呈现值接上的效果）。

**④ 消失时机**：`voiceState = .processing`（→ 相位 thinking）之后，那一行与**编辑窗一起**
消失（AX 树里 `AXTextArea` 与字幕文本都没了，截图里 32…64 那一条回到桌面）。

**⑤ 编辑真的能用**：点开 → 在编辑区打字 → AX 的 `AXTextArea` 值变成
「…告诉我-EDITED」→ 探针取走时拿到的就是这一份（`consumeEditedTranscript() =
Optional("帮我看一下屏幕上这个窗口里写的是什么内容然后告诉我-EDITED")`）；
**再取一次是 `nil`** —— 没改过的那一轮不会顶替识别结果。
ESC、点面板外面两条折叠路径也都点过，都收起。

**⑥ 录音那条编辑窗没有被我抽坏（回归）**：抽成共用视图之后，把录音带的展开态摆出来
（探针只摆 UI，**不起采、不落盘**），AX 量到的 `AXTextArea` 是 **(523, 90, 682×474)** ——
与新面板的编辑区**逐点相同**；顶行的右边缘 1206（主 Agent）/ 1207（录音），差异只来自文字不同。
也就是说「两处长得一模一样」是量出来的，不是看着像。

### 没验到的（如实记）

1. **真语音这条路没走通**：这台机器音箱放出来的声音进不了麦克风（实测峰值 212~447/32768，
   而 VAD 门槛是 0.25 那一档 —— 见 `开发经验/09-实测数据.md` §18.6）。所以沿用了第 5 条验收的
   同一个办法：**相位、字幕、点击、展开、消失全是真的，只有那句转写是注入的**（临时探针，
   已标注 `TEMP PROBE (remove before commit)`、验完已删）。真实按 ⌃⌥ 说话 → 出字幕这一段，没验到。
2. **"改过的字真的发给了模型"没端到端跑过**：`consumeEditedTranscript()` 的返回值验到了
   （改过 = 那一份，没改 = nil），但拿它去发一轮（截图 → 视觉模型 → 播报）没有跑 ——
   那会真的调一次模型并出声。所以这一条只到"编辑被记录、被取走"，**发送那一步没验**。
3. **说话期间点击**：探针是直接把相位摆到 Listening 的（录音管理器并没有在录），
   所以真实的"边说话边点刘海左侧"那个时序没验到。
4. **按住说话模式下的可编辑性**：编辑窗只在相位是 Listening 时存在，而**按住说话**
   模式下要打字就得松开按键（一松开就进 transcribing、窗口就收了），按着键打字又会被
   ⌃⌥ 修饰成别的字符 —— 这条路**没有为它做任何事，也没验**。
   他这台机器上是 `pushToTalkTriggerModeRawValue = doubleTapToTalk`（**点两下说话**）：
   点两下开始录、再点两下结束，中间是不按任何键的，所以点刘海左侧、打字、再点两下发送
   这条路是通的 —— 这个功能是照那个模式做的。连续追问那条窗口同理（麦克风开着、手上不按键）。

### 两处刻意的取舍（不是错，是照搬录音那条的既定分寸）

- **面板展开时那一整块（718×592）是收鼠标事件的** —— 编辑框要用。这和录音带的展开态一样，
  代价是同屏那一片（含刘海左右那一段菜单栏）在展开期间点不到。收起态 `ignoresMouseEvents = true`，
  所以平时那一行完全不挡任何东西。
- **面板铺开时那一行会压在展开面板的页头那一条（y 32…64）上** —— 与录音带完全同一条取舍；
  它只在说话那几秒里出现，而且那时候用户的注意力不在页头的按钮上。

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

---

## 第 4 条已实施（2026-09-27，同一天下午）—— 每一条指令都存成一条录音

**做了什么，一句话：主 Agent 的每一条指令都落成一条录音 —— `.wav` + `.txt` + `.json`
三份齐全，落在一个和长录音**完全一样**的目录结构里，所以设置 → 录音 的历史、复制全文、
播放、重新转写、在访达中显示**一行代码都没为新来源改**。**

同一天顺手做了用户附图的另一件事（**刘海那条黑带的下边缘**），它和第 4 条是两件事，
但因为都在「说话时」这一屏上，写在同一节里。

### 音频从哪来：寄生在已有的那个输入 tap 上，音频管线一行没改

用户对大调整的要求是「接线，不是重写」，而这一条的音频是最容易接错的地方 ——
**没有新增任何采集**：`BuddyDictationManager` 本来就在往识别器送音频（按住说话那条、
连续追问那条），这里只是在**同一个 tap 回调里**多调一次观察者。

```swift
// BuddyDictationManager.swift —— 三处 tap 各加了一行
let tapHandler: AVAudioNodeTapBlock = { [weak self] buffer, _ in
    self?.activeTranscriptionSession?.appendAudioBuffer(buffer)
    self?.updateAudioPowerLevel(from: buffer)
    self?.capturedAudioBufferObserver?(buffer)          // ← 新增的唯一一行
}
```

三处是：按住说话（`startPushToTalkCapture`）、连续追问的共享引擎那条、以及连续追问的
own-engine 兜底那条。**VAD、连续监听、打断判定一个字节都没动** —— 观察者是纯读的。

「这一句从哪一秒算起」由 `onContinuousListeningUtteranceBegan` 给：连续追问的窗口
整场开着麦克风（从回答起播到窗口过期，默认 30 秒），只有"用户开口"那一下才知道
这一轮的音频在哪里切。它挂在 `markContinuousListeningUtteranceActive` 里、
`continuousListeningUtteranceActive = true` 旁边 —— **也是纯观察者**，
不参与 VAD 的任何判断。

### 落盘：三个已经跑通的组件，一行没改

| 用途 | 用的是什么 |
|---|---|
| 音频 | `RecordingAudioWriter`（边录边写、停止时回填 44 字节 WAV 头）—— 与长录音同一个 |
| 文本 | `LongFormTranscriptWriter`（`.txt` 给人看 + `.jsonl` 逐段带毫秒）—— 同一个 |
| 元数据/历史 | `RecordingSession` + `RecordingLibraryStore`（每场一个 `<id>.json` + 索引）—— 同一个 |

格式也照抄长录音：**16 kHz 单声道 PCM16**（`LongFormAudioCapture` 那三个常量），
所以历史里那颗「重新转写」可以直接把这个 `.wav` 喂回同一个识别器 —— 那条路的输入
就是这种格式的 `.wav`。会话 id 也走 `LongFormRecorderController.makeSessionID()`
（那一处从 `private` 放开成 internal），因为历史列表按它排序。

### 一轮的边界 = 一条录音

```
armTurn()                      按下说话键 / 连续追问里用户开口
  → 第一块音频到达            真的开始录了（**这一刻才建文件**）
  → finishTurn(transcript:)   这一轮结束了（发了 / 存成笔记 / 被取消，三种都算）
```

**「第一块音频到达才建文件」是刻意的**：`armTurn` 与"真的开始录"之间隔着权限检查、
开 ASR 会话、装 tap 几步，任何一步都可能中断（按住说话模式下快速松手就会取消整个启动
任务）。一 arm 就建文件，这些中断会在历史里留下一串 0 秒的空录音；改成"第一块音频到达
才建"之后，**没采到音频就没有录音**，而这一条不变量比"永远留一条"更接近事实。

所以 `AgentTurnRecorder` 分成两半：**`AgentTurnAudioSink`**（`nonisolated`，
活在采集线程上：转 PCM16 → 串行队列落盘；三个状态 idle / armed / recording）
与 **`AgentTurnRecorder`**（`@MainActor`：元数据、转写、写库）。
`BuddyPCM16AudioConverter` 因此标了 `nonisolated` —— 它本来就在渲染线程上被调用
（五个 provider 都是），不标的话每一次转换都是一次跨 actor 调用。

### ⚠️ 取消语义：**两条路唯一一处不同，别再改成一样**

- **长录音那条**点「取消」= 按普通录音走（照常存一场录音，只是不写 Notion）；
- **主 Agent 这条**点「取消」= **这一轮什么都不发**（不截图、不问模型、也不写 Notion），
  但**本地那条录音照留**。

两处都要留下东西（同一条原则），而"照常退回去"在主 Agent 这条路上是**拿用户已经否掉的
东西去问模型、去写一页云端笔记**，所以退不得。**实现上靠的是顺序**：
`finishTurn(transcript:)` 排在 `consumeNotionNoteTurnIfNeeded` **之前** ——
三个去向（发出 / 存成笔记 / 取消）都经过它，所以不可能有一条路漏掉录音。
用户 2026-09-27 连着两句原话：「主 Agent 上点取消 = 不发出去，只保留本地一条录音」
「这一条是两条路唯一一处取消语义不同，代码注释里要写明，免得以后被误改成一样」。

**与"取消"不同的一件事**：**没听到话**（转写为空）走的是 `discardTurn()`，
文件直接删掉。它不是取消 —— 取消是用户对**已经听清的一句话**说不发，那一条要留；
这里根本没有一句话，留一个 0 秒 0 字的文件只是历史里的噪音。

### 顺带修的一件：刘海黑带的下边缘（用户附图）

用户原话：「在使用主 AI 的快捷键时，下方显示录音，你会发现刘海左下角和右下角有圆角，
而下面显示的文字是直角，所以中间边缘会出现空白空隙……我觉得在 listening 时……它应该和
录音按钮一样，类似于上面是长方形效果，下面拼接出文字，应该能一眼看出左右两边是空白
区域……**但在其他情况下，即非录音状态下，保持之前的状态最好**」。

根因：那行字幕（`NotchTranscriptLine`）的上边是方的，而刘海那条黑带**两翼外端**的下圆角
是 14pt —— 接缝的两端各让出一块 14×14 的三角，桌面从那里透出来。

改法：`NotchWingView` 多一个 `squaresBottomOuterCorner`，为真时外端下圆角归零；
判据是**新增的** `NotchPanelModel.notchBandSitsAboveTranscriptLine`
（`activityPhase == .listening && !isFullscreenSuppressed`）—— **和"那行字幕显不显示"
是同一个属性**（`syncListeningTranscriptPanel` 也改成读它），两处不可能分家。
中段本来就是方的（`PillShape(bottomCornerRadius: isActive ? 0 : 10)`），所以整条带子
的下边缘这时是一条直线。非 Listening 时一切照旧。

### 验收：跑了什么、量到什么

**做法**：这台机器的扬声器喂不进麦克风（`09-实测数据.md` §18.6），所以音频是**注入**的 ——
用 `say -v Tingting` 合成一句真话、`afconvert` 成 16 kHz 单声道，从
`BuddyDictationManager` 的 tap 送进去。**其余全是真的**：真豆包识别、真状态机
（连按两次说话键 = 开始 / 说完发送）、真落盘、真历史。探针标了
`TEMP PROBE (remove before commit)`，验完已删（`grep AgentTurnProbe` 为空）。

**① 正常一轮 —— 过了**

- `🗣️ Companion sending transcript: 现在屏幕上` → 视觉模型 → 播报整条链照常；
- **`2026-09-27-090205-B9FE` 落进录音库**：时长 **7.41 秒**、`.wav` **237238 字节**
  （PCM 237194）、`.txt` 内容「现在屏幕上」、`.json` 字段齐（`endedCleanly=true`）；
- 活动会话条目 **7 → 8**（这一轮真的发出去了）；
- **按下 → 录音落盘 = 5601 ms**，其中「说完发送」那一下按在 5026 ms ——
  也就是**收尾本身 575 ms**（音频有多长，落盘就有多晚，因为定稿是「文字不再变长」判的）。

**② 点取消的一轮 —— 过了**

- `📝 NotionNote: 检测到 Notion 关键词，刘海左侧显示按钮` → 在
  `NotchSupport.notionNoteButtonFrame(indexFromTrailingEdge: 0)` 上**合成一次真点击**
  → `📝 NotionNote: 用户取消了笔记：按钮收掉、检测停掉，这一轮不进对话管线`
  （点的是 `handleGlobalClick` 那条真路，全局监听接的）；
- **`2026-09-27-090024-1553` 照样落进录音库**：12.67 秒、405638 字节、
  `.txt` = 「然后告诉我现在屏幕上什么东西？」；
- **活动会话条目 7 → 7（没变）**，日志里没有截图、没有视觉模型调用；
- `📝 主 Agent：用户取消了这条笔记，这一轮什么都不发` ✓

**③ 设置 → 录音 的历史里能看到 —— 过了（截图在
`开发经验/运行日志/wanna-每轮录音-历史.png`）**

四条新记录都在列表最上面，每条都有「源文本」和「播放 / 重新转写 / 在访达中显示」
三颗按钮（音频在，所以三颗全亮）。

**④ 接缝（第 1 条那个附图问题）—— 过了，而且是量出来的**

两次截图（`开发经验/运行日志/wanna-接缝-Listening.png` 与 `…-Speaking.png`，
截图时相位分别是 `listening` 与 `speaking`，探针把相位打了出来），
逐行扫「最左/最右的黑色像素」（`1pt = 2px`，屏幕顶边是第 0 行）：

| 带子最下面一行（第 63 行 = 31.5pt） | 最左黑 | 最右黑 |
|---|---|---|
| **Listening**（字幕条在） | **100** | **819** |
| Speaking（字幕条不在，基线） | 132 | 785 |

- Listening 时黑带到它自己的下边缘**一点都没有退**（100 → 100），而紧接着的下一行
  （第 64 行 = 32pt，字幕条的上边）是 **101** —— **两条边只差 1px（0.5pt），接缝是通的**；
- Speaking 时黑带在最后一行退到 132，比它上面退掉 **32px = 16pt**（就是那个 14pt 圆角）
  —— **这就是用户附图里那两块空隙，而它在非 Listening 时原样保留**。

### 没验到的（如实记）

1. **真语音这条路依然没走通**：这台机器的扬声器→麦克风耦合太低，所以音频是注入的
   （`say` 合成的真话、真豆包识别、真管线）。**麦克风那一段不是真的。**
2. **注入音频的识别质量很差**：四轮里只有两轮出了字，且只认出句首几个字
   （「现在」「现在屏幕上」「然后告诉我」）—— 因为注入的块和真实麦克风缓冲交替进入
   同一条流，语音被切碎了。**这一条与功能无关，是探针的局限**，如实记在这里。
3. **按住说话模式下「快速松手取消启动」那条路没验**：`armTurn` 排在那条任务里，
   取消之后不留录音（因为没有音频到达），逻辑上成立，但**没有真跑过**。
4. **连续追问那条路的录音没端到端验**：`onContinuousListeningUtteranceBegan → armTurn`
   与 `submitFollowUpQuestion → finishTurn` 都接了、编译过了，但验证跑的是按住说话那条。
5. **同时同刻有两个实例在跑**（用户的 `/Applications/Wanna.app` + 探针那份）——
   音频不互相干扰（探针的音频是注入的），但刘海那一条上两层带子是叠着的，
   截图里的黑带是探针那一份画的。

### 测试产生的文件：删了什么

**9 条测试录音、共 36 个文件**（每条 `.wav` / `.txt` / `.jsonl` / `.json`），
全部按 id 精确删除；`~/Library/Application Support/Wanna/Recordings.json` 从
测试前的备份**整份还原**（461 条 → 测试后 470 条 → 还原回 461 条），
目录里的 `.json` 与索引**零孤儿**。用户原有的 **331 个 `.wav` 一个没动**。

验的时候为了让录音落进用户真正那个目录（`~/Documents/SuperAgent/Wanna/Wanna录音/`），
在 worktree 里临时建了一个同名软链 —— 同时**临时把 `recordingAudioRetentionDays`
从 1 改成 0**，因为启动时的保留期清理会按天数删音频，而那个目录里全是用户的真录音。
两件事验完全部还原（软链已删、设置回 1）。

---

## 第 4 条之后的回归修复（2026-09-27 下午）

用户在同一天连报三件事，三件的根因各不相同，全部在真机上量过、改过、复验过。
逐条的根因与教训写在 `10-踩过的坑.md` 的 **D21 / D22 / D23**，这里只记**这一轮做了什么、
量到了什么、以及没验到什么**。

### 一、快捷键「第二次按不提交」（D21）—— 当天最要紧的一件事

**根因**：主 Agent 的识别换成豆包之后，那条客户端自带的看门狗（15 秒没回包判死）在
**按住说话**这条路上天然误报（用户按下键沉默地想事情时服务端本来就不回包），而
`VolcengineTranscriptionProvider` 把连接死亡当**致命错误**交出去 → 整场录音被
`cancelCurrentDictation()` 取消 → **一个字都没提交、界面上什么都不说**；用户第二次按时
`isRecordingFromKeyboardShortcut` / `isPreparingToRecord` 都已是 false，于是那一按
**不是「停并提交」，而是又开了一场新录音** —— 按几次都一样。

**用户录音目录里的铁证**（不是我推的，是他机器上留下来的）：
`2026-09-27-091207-8672` 的 `endedAt - startedAt` = **108 秒**，`recordedSeconds` = **0.39** ——
一轮录音开着没人收尾，直到下一次按键才被顺手收掉。当天 09:11–09:14 那 12 条里，
**7 条是 0 字空录音**。

**改了三处**：
1. `VolcengineTranscriptionSession.handleConnectionLoss`：一句还没定稿时连接死掉 → **重连**
   （上限 3 次），已认出的字冻成 `sealedTranscriptPrefix`（新连接时间轴从零重计，不能同键覆盖）。
2. `BuddyDictationManager.handleRecognitionError`：**只要已经认出了字就按正常收尾交出去**
   （原来的条件是 `isFinalizingTranscript && 有字`，于是"正在说话时连接坏掉" = 把刚认出的字扔掉）。
3. 一个字都没有的两条出口（连接报错 / 转写为空的正常收尾）都通知 `onDictationAbandoned`
   → `AgentTurnRecorder.discardTurn()`，不再留一条开着的一轮。

**实测（真按键，⌘⇧⌥K 两次）**：
- 改之前：`🎙️ 豆包识别：看门狗：已 19 秒没有任何回包` → `❌ Buddy dictation error …` →
  录音消失、`voiceState` 回 idle、什么都没提交（当天那次复现的原始日志）。
- 改之后：同一条看门狗 → `🎙️ 豆包识别：连接出问题（连接无响应 19 秒），第 1 次重连接着听`
  → **相位仍是 listening，录音继续**；第二次按走 `→ 双击第二条：停并提交`，
  落了一条 **31.6 秒**的录音（`afinfo`：1ch/16kHz/16bit/31.597s，样本峰值 2551 非静音），
  转写进了对话（`🗣️ Companion sending transcript: …`）、模型答了、TTS 播了。
- 「随时能退出」也复验了：播报中按一下 → `→ 忙分支：纯打断 + 退出监听`（纯打断，不开麦，符合设计）。
- 静音下按两次 → `🎙️ 主 Agent 这一轮没有听到话，不留录音`，**录音目录文件数不变**
  （改之前这里会留一条 0 字空录音 + 一条开着的一轮）。

### 二、卡顿（D22）—— 量到了，改掉了，但不是用户那条路

**量到的**（tap 内分段计时，每 100 块；一块音频本身 21.3ms）：识别 9088 / 电平 767 /
**观察者 6785µs**（最大 13874），合计 ~16.6ms = 采集线程 **~78%**。观察者那 6.8ms 是
「每一轮存一条录音」那次加进来的（渲染线程上做了一次重采样 + 建文件）。
**改法**：采集线程只 `memcpy` 一份缓冲，重采样/建文件/写盘全挪到串行队列上。
**实测**：观察者 **6785µs → 40µs（峰值 155µs）**。

⚠️ **没验到的**：用户说的「录音时卡顿」如果他指的是**长录音**（⌥C）那条路，那条路**有自己的
引擎、自己的 tap，根本不经过这个观察者** —— 所以这次的量化与修复**不能证明**修好了他听到的那声卡顿。
这条如实记在这里，别把它当成"已经修好"。剩下的 9ms（识别）是既有成本，最大 17.4ms 已经贴近
21.3ms 的块周期，是下一处该看的地方。

### 三、接缝（D23）—— 上一次只改了一半

`7a84434` 给两翼加的 `squaresBottomOuterCorner` **只传给了展开态那条带子**，而屏幕上的黑带
是收起态的 `NotchPillRootView` 画的（那个参数有默认值 `false`，所以漏传是静默的）。
补上之后同一个 build 里 A/B：Listening 时带子最下面一行最左黑 **88**（直角到底），
Speaking 时 **88→123**（那 35px 就是 14pt 的圆角），字幕条上边 **89** —— 差 1px，缝通了。

### 这一轮怎么验的 / 没验到什么

- **真按键**：用一个 40 行的 Swift 小工具往系统里发真的 ⌘⇧⌥K（按下/松开，带修饰键 flags），
  走的是 App 自己的 CGEvent tap —— 不是直接调 `handleShortcutTransition`。
- **真识别结果**：这台机器的音箱进不了麦克风（仓里量过 212–447/32768），所以**转写是注入的**：
  在 `requestFinalTranscript` 里按环境变量把一固定文本当作「识别结果」交付，**走完全相同的
  下游路径**（`onFinalTranscriptReady` → `finishDictationSessionIfNeeded` → `submitDraftText`
  → `handleFinalTranscript`）。**豆包那一段识别质量本身没验**；连接死亡与重连是**真的**
  （看门狗自己报的 19 秒无回包），因为静音就足以触发它。
- **没验到的**：真语音（同上）；重连之后**继续说话**能否接着认出字（重连是真的，认出字要有声音）；
  Notion 那道岔在这两条真语音转写上是否命中（当天用户的两条录音 `091355-5F79` /
  `091409-C694` 的转写正是「宝贝小笔记。保存一张笔记。」「保存下笔记，保存下笔记」——
  **很可能就是被 Notion 那道岔吃掉的**，但那两轮不在这次复现里，**未证实**）。
- 测试产生的录音都在 **worktree 自己的** `Wanna录音/`（`WorkspaceDirectory` 从 `#filePath`
  推出根目录，所以 worktree 的构建写的是 worktree 的目录），**用户那份目录一个字节都没动**；
  测完全部删除。用户的 `/Applications/Wanna.app` 按任务要求**没有同步**（仍是旧代码）。

---

## 第二轮回归修复 + ESC 打断（2026-09-27 傍晚）

用户的第二批反馈三件事 + 一条新功能，全部在真机上量过、改过、复验过。

### 一、实时字幕（D24）—— 四件事挂在了一个只在收尾时被调用的回调上

`updateDraftText` **不是**「每句实时转写都给你」的那个回调：它只在收尾/取消时被调用。
刘海下面那行字幕、Notion 的实时关键词检测、「说到屏幕立即截屏」、鼠标旁那颗气泡的实时文字
**四件事全挂在它上面**，于是真机上从来没有活过。而验收用的是"注入一句转写"，注入点在**收尾**
那条路上 —— 正好绕开。修法是在 provider 的 `onTranscriptUpdate`（真·实时回调）里多喂一次，
**只喂回调，不碰任何状态机**。

**真识别验的**（不是注入）：把一段真语音的 16k PCM 按 tap 的节奏喂进**同一个豆包 provider**
（`WANNA_PROBE_AUDIO_FILE`），服务端真回字 → 刘海下面出现
「现在几点？帮我看一下屏幕右上角有什么内容」，同一批日志里 `📸 Companion: heard 屏幕 — capturing
the screen immediately` 也出现了（那一条同样是被这个洞埋掉的）。**探针验完已删。**

### 二、展开动画（D25）—— 两块合成了一个动画

时长/曲线/几何式子三样都收敛到 `NotchSupport`（`listeningBandRevealDuration` +
`revealedListeningBandWidth`），字幕从刘海中心向两侧展开。录屏逐帧量到：**时长 ≈350ms**、
两块**收敛到同一对边缘 88…807**、**没有任何一帧只有一块**。
残差（如实记）：过程中带子每侧比字幕宽约 25pt —— 两个 `withAnimation` 的起跑差一个主队列轮次。

### 三、ESC 打断（用户新定的）

用户的原话：「1. 第一次按下：开始触发，截屏识别用户语音并显示。2. 第二次按下：保持现有逻辑不变。
3. 按下 ESC 键：打断……用户在录音时按下 ESC，直接中断录音，但**录音需保存到本地，与正常录音一致**……
**执行过程中**，用户可通过两种方式打断：一是直接语音打断（现有方式），二是通过主 Agent 快捷键……
点击 ESC 为**真打断，会停止整个执行过程**，具体停止范围包括：**语音播报、卡片下角的卡片，
以及当前任务（即刚才提交的任务）所涉及的所有 agent**。注意：**仅打断刚才这一次提交的全部内容，
之前提交的不算。**」

**怎么接的**：ESC 走**已有的那条 CGEvent tap**（`GlobalPushToTalkShortcutMonitor`），
新增一个 `escapeKeyPressedPublisher`。选它而不是 NSEvent 全局监听，理由与说话快捷键一样：
**它不要求 Wanna 自己是 key window** —— 用户十有八九正在别的 App 里干活，而那正是「打断」要发生的
场合。tap **只读不吞**，所以不属于这一轮的那一按原样进前台 App（用户按 ESC 关他的对话框照常）。
长按重复用 `keyboardEventAutorepeat` 挡掉。

**判不判，由这一轮在不在跑决定**（`CompanionManager.handleEscapeKeyPressed`）：

| 时刻 | 这一按做什么 |
|---|---|
| **转写编辑窗开着** | 收起编辑窗（**既有语义，优先**）—— 编辑窗本来就开在 Listening 里，用户按 ESC 最可能的意思是"收起来" |
| **正在听**（`isRecordingFromKeyboardShortcut` / `isPreparingToRecord` / 连续追问窗口） | 中断录音：**录音照存**（走 `finishTurn`，不是 `discardTurn`）、**这一轮什么都不发**（在 Notion 那道岔**之前**判，所以也不会顺手写一页笔记） |
| **正在跑**（`processing` / `responding` / `currentResponseTask != nil` / 正在播报） | `interruptActiveResponse()`（播报 + 卡片 + 主循环含 sub agent 一个收口）+ **只收这一轮派出去的 agent** |
| 其余 | 什么都不做（日志留一行），ESC 原样进前台 App |

**「这一次提交」用哪个字段界定 → `groupID`**（`turnGroupID`，一轮生成一次，派活时逐个写进
`EphemeralAgent.groupID`）。另外三个候选都不行，理由写在
`AgentActivityBoard.cancelRunningTasks(inGroup:reason:)` 的注释里：`sessionID` 是**会话**（跨很多轮，
按它停会杀掉之前几轮的活，而用户明确说"之前提交的不算"）、`startedAt` 只是时间戳没有边界、
`cardID` 会被**兜底交接改写**（所以它答的是"现在归谁"，不是"谁提交的"）。

**实测（真按键盘）**：

- **Listening 中按 ESC**（带探针音频的那次构建，真识别）：`主 Agent 这一轮已存成一条录音
  2026-09-27-094253-1DC0 · 2.7 秒 · 10 字` + `⏹️ ESC 打断：这一轮的录音已留存，什么都不发`
  —— 录音留了、一个字没发 ✓。干净构建（无语音）走的是空转写那条出口：`这一轮没有听到话，不留录音` ✓。
- **执行中按 ESC**：`⏹️ ESC 打断这一轮（group=DC6264C3…）` →
  `🔊 Streaming speech: stopPlayback() while a segment was playing — abandoning the rest of the reply`
  → 相位回 idle（卡片收掉）✓。
- **什么都不在跑时按 ESC**：`⏹️ ESC：这一轮没有在听也没有在跑，什么都不做` ✓。
- **"只停这一轮"的边界**（确定性探针，已在真 App 里跑）：造两轮派活（groupA×2、groupB×1），
  只取消 groupA → `被取消 2 个（应 2）：cpah、y9ze`，`A1=failed/group=A A2=failed/group=A
  B1=running/group=B` —— **上一轮的活原样不动** ✓。探针验完已删。

**没验到的（如实写）**：
1. **真实用户语音**（这台机器的音箱进不了麦克风）—— 上面那些"真识别"是把一段**真语音的 PCM**
   喂进真 provider，**麦克风那一段不是真的**。
2. **"执行中"那一按停掉的真实 agent**：`cancelRunningTasks` 的收口是用确定性探针验的
   （两轮分组），而**端到端**（真派活 → ESC → 看那一条任务变成"被 ESC 打断"）**没有构造**——
   需要模型真的写出 `[AGENT:…]` 或动作标签。
3. **Claude Code 卡片那一半**：`agentSessionManager.interrupt(sessionID)` 只在
   `cancelledTasks` 里出现 `.claudeCode` 时调用，**没有真跑过**。而且有一处**结构边界**：
   一张 Claude Code 卡片只有**一个**子进程，所以这张卡上更早那一轮的活会被一起停掉 ——
   这是那个数据结构本身的边界，绕不开，已写在注释里。
4. **ESC 在"别的 App 抢了 key"时的可达性**：走 CGEvent tap 按说与前台是谁无关，但**只验了
   Wanna 自己 idle 时那一按**（日志那一行出现了），**没有在别的 App 里真按一次**。

---

## 第三轮：展开动画的空白 + 识别 2 秒延迟（2026-09-27 深夜）

### 一、展开过程中还是露白（D26）—— 两块必须读同一个进度值

上一轮（D25）只做到了"时长/曲线/式子一样"，而**两块各读各的进度**（两翼读相位、字幕读面板里那个
`bandRevealProgress`），差一个主队列轮次 —— 展开的头几十毫秒里带子比字幕宽，桌面从那里透出来。
用户的话：「你绝对不可以出现这种状态」，同时给了底线：**宁可直接显示也行**。

**改法**：让两翼**也**读 `bandRevealProgress`（`wingRevealProgress`），并且用一个
`isBandPresented`（`show()` 起、`orderOut` 止）把**收起那一段也带上** —— 只按相位判的话，
收起时两翼会被强行按满宽、字幕却在缩，实测每侧最宽 **150px** 的白。另外 `hide()` 改成
**不缩宽度**（相位离开 Listening 后那条黑带还要留着给 Thinking/Speaking），直接把进度归零 + 收起面板。
最后把面板的出现从"相位订阅（晚一轮）"改成在 `refreshActivityPhase()` 里**同拍直调**。

**实测（录屏逐帧量）**：

| 版本 | 展开过程中每侧最宽露白 |
|---|---|
| D25 之后 | **55px（≈25pt）** |
| 只补"同拍出现" | 17px（方向已反：字幕更宽） |
| 最终（同一进度值 + 收起不缩宽） | **≤2px（≈1pt）**，且方向是"字幕略宽" |

**没验到的**：用户是在**别的 App 里**用快捷键的（Wanna 不是 key window）—— 那条路上刘海面板的
渲染路径相同，但**我没有在那种状态下逐帧量过**；另外我量的时候用户的 `/Applications/Wanna.app`
有时也在画同一个刘海（同一个屏幕位置），**逐帧数据里可能混进它的带子**；本次两条录屏里
f001 那一帧的"露白 351px"就是这种污染，已确认不在展开段内。

### 二、识别要 2 秒才出字（D27）—— 是**音频采集**晚，不是识别慢

四段打点（按下说话键算起）：**① 第一块音频进 provider：冷 2025ms / 热 139ms**；②③ 与其同拍。
录音那条路的对照（同一份日志）：`开始录音` → `AUHAL 已启动` **+17ms** → `第 1 块` **+22ms**。

**根因**：主 Agent 用**共享的 VPIO 引擎**（那套 IO 重配置本机实测 ~2 秒，`开发经验/09` 早有记录），
用户按键后头 2 秒的话**根本没进采集**；录音那条用自己的 AUHAL 引擎、不开 VPIO，22ms 就开始采。

**被排除的候选**：✗「每句一条新连接、握手拖慢首字」——连接在按下那一刻就建了，且实测
`新段 @连接后 0.7s`（音频立刻喂）对 `@连接后 2.0s`（音频晚到），差别全在音频何时到；
✗「`publishInterimDraftText` 被节流」——它同步调用，与 provider 出字同拍。

**没改代码，这是取舍不是 bug**：`audioEngineIdleReleaseMinutes`（默认 3 分钟，可设 1/3/5 分钟或
**永久**）决定这 2 秒多久付一次。**修它的办法是用户可选的**：把「引擎保持时间」设长/永久，
代价是常驻麦克风路由 + 一直压低别的软件的音量（那一项自己的说明里写着）。
要彻底消灭这 2 秒得让采集先于引擎起来（先挂一条不开 VPIO 的 tap 再切换），那是引擎层的结构性改动，
与「一条音频路径」「VPIO 启用顺序」两条已写死的决定冲突 —— **交由用户定，我没有拍**。

---

## 第四轮：把「识别延迟 2 秒」从取舍变成修复（2026-09-27 深夜）

用户不接受"你来拍板"：「**为什么录音的时候，长录音瞬间显示呢？**你这个主 agent 的快捷跟录音快捷键，
虽然说快捷键是不一样，但**它们整个的逻辑应该是一样的呀**。」并且自己把方案定死了：
**先采（不开回声消除）→ 立刻出字 → 用户还在说的过程中把引擎切到开 AEC → 到"回答开始播"时 AEC 已经在位**
（他的推理：打断只发生在"说完之后、执行过程中"，那时候才需要回声消除）。

**差距定位到哪一步**（按下算起，见 `09-实测数据.md` 二十二）：识别会话建好 **0ms**、
**tap 装好 1537ms**、第一块音频 1892ms —— **全在共享引擎的 VPIO 重配置上**；
录音那条用 AUHAL、不开 VPIO，**22ms** 就出第一块。所以差距不在识别、不在握手，在**采集**。

**改动**（`BuddyDictationManager.startRecognitionSession`）：**按下先用本类自己的引擎（不开 VPIO）
把采集接上**（~200ms），这一场录音**全程走它**；共享引擎（带 AEC）**按需**起来 ——
回答开始播 / 连续追问窗口开的时候（那条路本来就存在）。**只有按下时正在播报**才走老路
（等 VPIO 就位再采），已写死的 AEC 契约不变。

**第一版做错了，量出来了**（D28）：第一版是"立刻在后台把 VPIO 拉起来、起来就交班"，
实测**缝 1204ms**（重配 IO 把快采那条掐停）—— 用户还在说的 1.2 秒整段丢。改成按需之后
**68 块连续、无缝**。

**三条验收数字**：
1. **出字延迟**：③ 第一块音频 **1892ms → 299ms**（② 1537ms → 195ms）。
   ⚠️ **出字的总延迟没量到**（本机没有真实语音）：识别器出第一句那一段只能用早先一次
   真识别的 `新段 @连接后 0.7s` 作参考，预期总延迟 1s 量级。
2. **识别完整度**：改后快采**连续 68 块无缝**（改前那一版缝 1204ms）；录音那条路**一行没动**。
3. **打断仍然工作**：**没有用真语音验** —— 需要"回答正在播时说话能打断、且不自打断"，
   本机没有真实语音（音箱进不了麦克风）。**能间接确认的**：AEC 所在的共享引擎由
   `startContinuousListening` 在回答开播时拉起，与本次改动无关（那条路一个字没改）；
   但"到那一刻 VPIO 确实在位"**没有实测**。

---

## 第五轮：修回被打断逻辑（D29）+ ESC 的粒度与三条界面问题（2026-09-27 深夜）

用户四条，第 3 条他判定为致命。

### 3️⃣ 打断 + 30 秒持续监听被我的"提速"改死了（D29）—— 已修回

**根因**：上一轮为了让主 Agent 出字快，我让它改走"自己的引擎（不开 VPIO）"。但**共享引擎
（开 AEC 的那条）本来就热着**，同一个输入设备上再起第二条 → 把带 AEC 的那条掐死 →
**播报中打断**与**播完 30 秒内的连续追问**一起死。**解法**：只在**共享引擎没开着**时才允许快采
（新增只读口 `VoicePlaybackEngine.isEngineCurrentlyRunning`）；它热着时本来就只要 ~139ms，
冷的时候（那 2 秒的场景）快采独占设备、没有冲突。**实测**：没有播报时连按三次，三次都走快采 ✓；
共享引擎一旦被播报拉起来，那条路自动回到共享引擎 ✓（按代码路径确认，见下）。

**没验到的（如实写）**：**"播报中说话能打断、且不自打断"没有用真语音验**（本机音箱进不了麦克风）。
能确认的是：这条路的代码（`startContinuousListening` → 共享引擎 `installInputTap`）**一行没改**，
而修改后**热着的共享引擎不会再被第二条引擎抢**。

### ESC 的粒度改了：从"这一轮"改成"这一个周期"

用户重新界定：「终止的是**从第一次按快捷键到最后一轮 AI 回复结束**这中间出现的**所有 agent**；
对其他轮、对全新的一轮没有任何影响。」一个周期里可能有好几轮（播报中打断、或播完 30 秒内继续
说，都在同一个连续监听窗口里续下去），所以新增 `EphemeralAgent.cycleID`（`decodeIfPresent`）：
**一次全新的按下**生成、`endContinuousListeningWindow` 清掉。ESC 改用
`AgentActivityBoard.cancelRunningTasks(inCycle:reason:)`。为什么不用 `groupID`/`sessionID`/`startedAt`
写在 `EphemeralAgent.cycleID` 的注释里。

### 1️⃣/4️⃣ 已修

- **ESC 之后不该还有 Thinking**：ESC 落在 Listening 时除了停录音/存录音，
  还调 `forceActivityPhaseIdle()` —— 界面立刻收掉（相位里那个 2.5 秒 hold 的唯一绕过口）。
- **字幕从左边冒出来再跳**（D30）：`SmoothRevealedTranscriptText` 的位移只在 `onAppear` 算过一次，
  而 D26 把这行的**宽度**做成了动画 → 初始位移是按"还很窄"的宽度算的。补 `.onChange(of: availableWidth)`
  不带动画地重新钉右边缘。

### 2️⃣ 「带子底部中间那两块空白」—— 量到的是 ≤2px，但**他看到的不是这一版**

我上一轮逐帧量过：展开过程中字幕比带子**每侧最宽 ≤2px**、方向是"字幕略宽"（不会露白）。
但他这次仍说"还是显示出来了" —— **他手机上跑的是 `/Applications/Wanna.app`，而那一份从 09:10 起
就没同步过**（任务要求不动它），所以最近两轮（D26 的"两块读同一个值"、以及本轮的改动）
**都不在他看的那一版里**。他说的"反圆角"重画也还没做 —— 需要他先看到 D26 之后的版本再判。
