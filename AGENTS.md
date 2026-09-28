# Wanna - Agent Instructions

<!-- This is the single source of truth for all AI coding agents. The user's agent is Claude Code — it reads this file through the CLAUDE.md symlink. cloud.md is also a symlink here, so there is only ever one copy of these instructions; edit AGENTS.md itself. -->
<!-- AGENTS.md spec: https://github.com/agentsmd/agents.md — supported by Claude Code, Cursor, Copilot, Gemini CLI, and others. -->
<!-- Git: single branch `main`, commit straight to it and push — see the Git Workflow section at the bottom. -->

## 改完代码必须自己编译、自己重启，直接把能用的成品交给用户（最高优先级）

**这一节高于本文件的其他所有内容。** 任何时候改动了 `Wanna/` 下的代码，先把它编译出来、跑起来，再去做别的事。

### 三条规则

1. **改完代码必须重新编译，并重新启动 App。** 不重新编译，用户跑的是旧版本，改动等于没做。
2. **编译和启动由 agent 自己做，不要交给用户。** 不要写「你在 Xcode 里按 Cmd+R 试一下」——用下面的 CLI 流程自己跑完。终端 `xcodebuild` 在当前签名配置下是安全的（见 [Code signing](#code-signing)）。
3. **交付的是一个能直接用的成品。** 用户的参与度越低越好，不要留半成品给用户收尾。

### 标准流程

```bash
# ① 问构建系统 app 落在哪 —— 不要写死 DerivedData 里那段哈希，每台机器都不一样
cd /Users/mjm/Documents/SuperAgent/Wanna
APP_DIR=$(xcodebuild -project Wanna.xcodeproj -scheme Wanna \
  -configuration Debug -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{print $2}')

# ② 最快的语法检查（不碰签名、不碰 TCC）
#    -I "$APP_DIR" 不能省：MacosUseController.swift 真的 import MacosUseSDK，
#    而那个模块的 .swiftmodule 就在构建产物目录里。
cd /Users/mjm/Documents/SuperAgent/Wanna/Wanna
xcrun swiftc -typecheck -sdk $(xcrun --show-sdk-path --sdk macosx) -I "$APP_DIR" \
  -target arm64-apple-macos14.2 -swift-version 5 -default-isolation MainActor \
  $(ls *.swift)

# ③ 完整构建
cd /Users/mjm/Documents/SuperAgent/Wanna
xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug build

# ④ 关掉旧进程，再启动新的
pkill -TERM -f "$APP_DIR/Wanna.app/Contents/MacOS/Wanna" || true
open "$APP_DIR/Wanna.app"
```

**用户机器上跑的那一份是 `/Applications/Wanna.app`，而它必须整包同步。** 2026-09-26 实测踩到：`Wanna.app/Contents/MacOS/Wanna` 只有 59 KB —— **真正的代码在同一个 bundle 里的 `Wanna.debug.dylib`（34 MB）**，主二进制只是个入口。所以 `cp .../Wanna.app/Contents/MacOS/Wanna /Applications/Wanna.app/Contents/MacOS/` 会**静默无效**：进程起来了、日志照打，跑的却全是旧代码（表现为「改了没反应」，而且哈希对比主二进制还显示两边一致，因为它确实一致）。同步用整包工具：

```bash
ditto "$APP_DIR/Wanna.app" /Applications/Wanna.app   # 或 rsync -a --delete
```

另外两条按上面的流程走时要知道：`$APP_DIR` 里那份**不会**自动同步到 `/Applications`（CLAUDE.md 的流程 `open "$APP_DIR/Wanna.app"` 开的是 DerivedData 那份，用户自己双击的是 `/Applications` 那份，两边会各自漂移）；而从终端直接跑 bundle 里的可执行文件（`"$APP_DIR/Wanna.app/Contents/MacOS/Wanna" > 日志 2>&1 &`）能把 `print` 探针落盘，这是量延迟时唯一能看到 App 内部打点的方式，要用 pty 转发（`script` 的日志是块缓冲的，直接重定向也会因为 stdout 非 tty 而块缓冲）。

**④ 一步都不能省。** macOS 不会给正在运行的进程换代码——这是设计，不是 bug（[`开发经验/10-踩过的坑.md`](开发经验/10-踩过的坑.md) F3）。只做 ①②③ 就宣布做完，用户屏幕上跑的还是旧代码，他只会看到「为什么我没看到任何功能」。这个项目真的这么错过一次，不要再犯。

（这里曾经要把 `WannaApp.swift` 从文件列表里 `grep -v` 掉：那个文件是唯一 `import Sparkle` 的，而裸 `swiftc` 解析不了 SwiftPM 的 Sparkle 模块。2026-09-26 把 Sparkle 整个删掉之后这条 workaround 一并去掉了 —— 实测全量 typecheck `EXIT=0`、0 error。若将来再引入任何 SPM 依赖，这条限制会以同样的方式回来。）

### 怎么确认真的生效了

**编译成功 ≠ 改动生效。** 启动完之后要复核——新进程的启动时间必须**晚于**你改过的源文件的修改时间：

```bash
# 新进程的启动时间
ps -eo pid,lstart,command | grep "Wanna.app/Contents/MacOS/Wanna" | grep -v grep

# 源文件的修改时间（上面那个时间必须比这些晚）
ls -lT Wanna/*.swift | tail -5

# 没有新的崩溃报告
ls -lt ~/Library/Logs/DiagnosticReports/ | head -5
```

### 只有这三种情况可以留给用户

| 情况 | 为什么躲不掉 |
|---|---|
| 系统权限弹窗（录屏 / 辅助功能 / 麦克风） | TCC 弹窗只能由人在系统对话框里点。证书签名下**只需要点一次**，之后重建不会再问 |
| 纯主观的视觉判断（淡出快慢好不好看、箭头尖有没有对准鼠标） | 这是审美，agent 判断不了，必须用户自己看一眼 |
| 用户自己的密钥 | 密钥只能由用户提供。拿到之后写进 gitignored 的 `BailianSecrets.plist` 或仓库外的 `0600` JSON，**永远不要在输出里回显** |

**除这三种之外，一律自己做完。**

### 一个例外：改「设置」不用重启

`AppSettings.json` / `ModelConfiguration.json` 里改的是**数据**，存储类会发通知，运行中的 App **立刻生效**，不需要重启。改**代码**才必须走上面的流程。别把这条规则用过头。

## 遇到问题：先找根因，再改代码（最高优先级）

**这一节和上面那节同级，而且先于本文件其他所有内容被使用。** 功能不对、偶发、时好时坏、**改了没反应**——遇到这类问题时的第一动作是**调查**，不是改代码。

### 三条硬规则

1. **同一个问题，自己动手两次没解决，立刻停手。** 不再改、不再猜。继续改只会制造新变量，让下一次归因更难。
2. **真实存在的缺点 ≠ 本次症状的原因。** 一个改动"确实是个缺陷"和"改了症状就好了"是两件事。只改前者，会得到"改了但没有任何变化"。
3. **没量到的一律写"推测"，不许写成结论。**

### 该怎么做（顺序不能换）

1. **把用户的感受翻译成仪器能回答的问题。** 「展开时卡一下」→「主线程在动画的哪一段被占住、占多久」。**如果你的"问题"里没有数字、时间点或状态量，说明还没翻译完。**
2. **装仪器，而不是加日志。** 时间戳打点（同时打印"距起点"和"距上一步"+**所在线程**）、run loop 跨度探针。让数据先于结论。
3. **并发派多个 agent，每个一个互不重叠的角度，至少一个是批判者。** 要求 `file:line` 证据、要求写出"这条结论会被什么推翻"、要求列出"哪些候选被排除了、凭什么"。**只有一个 agent 指向某处是线索；两个互不相关的角度收敛到同一处才是根因。**
4. **把测到的数字放进用户描述的时间窗里做算术。** 算得对才叫解释；算不对就还是猜测。
5. **改一处 → 验证 → 再改下一处。**

### 两个已经踩过的读错方式，别再踩

- **探针报告的是"刚刚结束的一段忙碌"时，紧跟其后的日志是下一步工作，不是原因。** 用日志的**相邻**做归因，等于倒因为果。先读清探针报告的是跨度的起点、终点还是长度。
- **一个计时器只覆盖它包住的那几行。** 用它去否定一个候选之前，先确认它包住的是这个候选的全部——本仓库有一次因为计时器漏掉了同段代码里的三行，把真凶排除了，多花了三轮。

完整方法、案例时间线、反模式清单、以及三个可复用探针的位置，见 [`开发经验/00-问题根因排查法.md`](开发经验/00-问题根因排查法.md)。**遇到问题先读它。**

### 改录音/音频采集之前，先跑那条探针（2026-09-26 新增）

```bash
cd /Users/mjm/Documents/SuperAgent/Wanna && swift scripts/recording-capture-probe.swift
```

**退出码非 0 = 故障已复现，这时候不要动 App 代码**，先去改采集本身。

这条规矩是拿十次真实损失换来的。「录音又坏了」连续发生过十次，每一次都是用户在真实使用里撞出来的
—— 因为**静音是一种看不见的失败**：时长正确、文件写好了、没有报错、没有崩溃，只是全是零。
所有「看起来在正常运行」的信号它都有，所以它只在用户开口说完一整句之后才由服务端超时暴露。

而这个故障三分钟二十行就能复现（探针里就是）。它一直没被复现，只是因为没人写。
**发现故障的位置必须从用户手里挪到机器手里。**

**根因是两层，别再只记一层**（2026-09-26 实测更正，全文见 [`开发经验/15-录音采集与设备自愈.md`](开发经验/15-录音采集与设备自愈.md)）：

1. `AVAudioEngine.start()` 会**静默把输入重绑到系统聚合体**（官方 TN2091）—— 这是「钉设备没用、
   放掉引擎也没用」的原因。**这一层 AUHAL 能修。**
2. **别的软件能把麦克风这个设备搞成「对谁都只给数字零」**，之后连 `AudioOutputUnitStart` 都返回
   `kAudioHardwareNotRunningError`。这一层**跨进程**（全新进程、`ffmpeg` 都只拿到零），
   **AUHAL 修不了，只能换设备**。

所以现在的做法是**候选设备队列 + 看门狗自愈**（连续 90 块精确全零就换下一个设备、同一场不断）。
旧结论「污染是进程级、改用 AUHAL 就没事了」**已被推翻，别再照它排查**。

## 修完一定要写进 `开发经验/`（最高优先级）

**任何时候一个问题被修好、一个功能落地、一次排查有结论，就把它写进 [`开发经验/`](开发经验/) ——
不需要用户提醒，也不需要等用户问。**

- **踩坑** → [`开发经验/10-踩过的坑.md`](开发经验/10-踩过的坑.md)：要写**根因**，不是把现象复述一遍；根因还没查清就写「还没查清 + 已经排除了什么」。
- **量到的数字** → [`开发经验/09-实测数据.md`](开发经验/09-实测数据.md)：带**日期**和**测法**；没量过的一律写「推测」，不许写成结论。
- **一条子系统的经验** → 对应那篇（光标 `02` / 语音 `05` / 操作电脑 `11` …）；**一整件事**（用户可见的功能、几轮才落地的方案、一次事故）→ `开发经验/` 根下新开一篇。
- **文档和代码一起提交。** 过期的文档比没有文档更坏 —— 改了哪个子系统就顺手更新那一篇。

[`开发经验/README.md`](开发经验/README.md) 是索引，也写着这套规矩。

## Overview

macOS notch-based companion app. Lives entirely in the notch (no dock icon, no main window, no menu bar icon). A black pill fused into the hardware notch expands into the app's main sheet — sessions sidebar, conversation, embedded settings. Uses push-to-talk (ctrl+option) to capture voice input, transcribes it via Alibaba Bailian streaming ASR, and sends the transcript + a screenshot of the user's screen to a Qwen vision model. The model responds with text (streamed via SSE) and voice (Bailian TTS). A blue cursor overlay can fly to and point at UI elements the model references on any connected monitor.

This fork talks to Alibaba Cloud Bailian (Model Studio) directly. The the earlier Cloudflare Worker proxy is no longer in the request path — the API key lives in a gitignored plist on the user's machine.

## 当前状态（2026-09-27 记，用户口述）

> **整个排版重新设计，工程完全正常。合并了语音、语音 agent 和 screen 三种模式为全新的模式。
> 当前主页面排版为最终版本设置，页面排版暂定。**

拆开说清这几句指的是什么，免得下次读到的人猜：

- **「三种模式合并成新的模式」**：侧栏原来那个「对话 / Agent / 语音聊天」分区切换器**没有了** ——
  现在侧栏是**卡片**（一张卡片 = 一个 Agent 主体），每张卡片各有四个**聊天模式**
  （文本 / 图文 / 语音 / 视频，见 `CardChatMode`）。原来那三个分区不再各自是一个页面，
  而是同一张卡片上的四种用法：文本 / 图文走这条 Agent 自己的管线（工具、MCP、执行都在），
  语音 / 视频走语音聊天子系统（只带会话记录 + 角色，不执行任务）。所以「screen」那个分区
  变成了「图文」这个模式，「语音 agent」变成了「语音 / 视频」两个模式。
- **「主页面排版为最终版本」**：主页面 = 刘海展开的那块面板（左卡片列 + 右内容列）。
  它的几何已经是**量出来的**，不是调出来的：两侧页头总高 **64**（= 录音带的高度：刘海 32 +
  转写条 32），分割线与录音带下沿**同一条线**；侧栏宽 **207**，使它的右边缘与录音带左边缘
  **重合**（684.5 = 684.5，实测）。这一带的常量都在 `NotchSupport` 里，且各自带一条
  「怎么算出来的」注释 —— 改之前先读那几行。
- **「设置页面排版暂定」**：设置那十页仍是旧排版（每页自己一格一格的 `SettingsCard`），
  不在这一轮的重设计范围内，**没有跟着改**，所以别拿主页面的那套「表格」去要求它。
- **录音功能现在多了两种「参考材料」的选择，但接下来准备做一次大调整。**（用户 2026-09-27 的原话：
  「录音功能增加了两种选择，但接下来准备进行一个大调整。」）两种选择是：说了「保存笔记」这个总开关
  之后，还能说**「参考剪贴板」**（复制内容 / 选中内容 —— 剪贴板里的文本、图片、文件或文件夹当材料）
  与**「参考屏幕」**（说到就当场截一张，说几次截几张）；刘海左侧最多会出现三颗按钮
  （取消 / 剪贴板 / 屏幕，从刘海那侧往左排），每颗只管自己那一件事。**这一段是"当前状态"，不是终点** ——
  「大调整」还没开始，所以下面这些实现细节都可能被它推翻：三颗按钮的形状与数量、
  参考材料的读法（`.md`/`.txt`/`.pdf`，文件夹递归）、以及两条提示词分支
  （没材料 = 整理原文不许扩写；有材料 = 用户的话是"指令"）。改之前先问清楚"大调整"是什么。
- **「工程完全正常」**：`xcodebuild … build` 通过、`WannaTests` 全绿、真机跑着没有崩溃报告。

## Architecture

- **App Type**: Notch-only (`LSUIElement=true`), no dock icon, no main window, no menu bar icon
- **Framework**: SwiftUI (macOS native) with AppKit bridging for the notch panel and cursor overlay
- **Pattern**: MVVM with `@StateObject` / `@Published` state management
- **AI Chat**: any vision model the user configures (default Qwen VL `qwen3-vl-plus` on Bailian), with SSE streaming
- **Speech-to-Text**: two backends, chosen by 设置 → 听 → 「说话时用哪个识别」 — **Doubao streaming (`VolcengineRealtimeASRClient`, the same client the 长录音 path uses) for the main Agent's press-to-talk, its follow-up window and the card call** (the default since 2026-09-27, reading the credentials configured on the 录音 page), and Bailian real-time streaming (`qwen3-asr-flash-realtime`) for everything that names a Bailian recognition model — which is every 语音聊天 三段式 preset, so the voice chat keeps 百炼. Apple Speech remains the local fallback when neither is configured. See [Model Configuration](#model-configuration).
- **Text-to-Speech**: Bailian Qwen-Audio-TTS (`qwen-audio-3.1-tts-flash` by default, cloned voice 赵今麦 via voice-enrollment) via the `SpeechSynthesizer` endpoint
- **Model Configuration**: all three models above are user-configurable — see [Model Configuration](#model-configuration). Provider/model choices are made in the settings window, not in code.
- **Settings**: twelve pages — 通用 / 交互 / 模型 / Agent / 对话与记忆 / 听（识别）/ 说（播报）/ 看与截图 / 操作 / 快捷键 / 导出设置 / 导入设置 — see [Settings](#settings). 64 settings live in `AppSettings.json` (65 stored properties, one of which — `voiceWebProjectFolderPath` — is plumbing rather than a row); the other three are the model roles. The sidebar groups pages — an untitled 「通用 / 交互 / 模型 / Agent」 block, then 「对话」 (对话与记忆 / 听 / 说 / 快捷键) and 「看与操作」 (看与截图 / 操作) under uppercase-tracked section labels, and a fourth 「导入导出」 block (导出设置 / 导入设置), above a footer carrying 「返回」 and 「退出 Wanna」. **导入导出 is a sidebar SECTION, not a row pinned under the footer** (2026-09-23, the user: 「我还是觉得不应该放在设置页面左侧边栏的下面，应该类似于左侧边栏的通用…或者在"看与操作"下面增加一个导入导出，然后把它作为两个选项的方式，不要放在这个下面，太不舒服了」) — so it reads as a peer of 对话 and 看与操作, and its two entries are ordinary page rows. Those two pages are **actions, not preferences**, which is why `SettingsPage.isSettingsTransferPage` exists and why they draw no 恢复默认 / 保存 / 关闭 bar: they write the whole settings set out or read it back, so a 「保存」 on them would mean nothing. The old per-page count badges are gone, as are the identity card that used to head this sidebar and the version line that used to close it (both deleted 2026-09-23 — the first with the sidebar's own account card, in one instruction to drop the username everywhere). **That footer is a divider-topped row with 「返回」 pinned left and 「退出 Wanna」 pinned right** (2026-09-23, the user's 「设置页面左下角也应该有一条线」「返回按钮跟设置按钮必须样式完全相同，但返回按钮改成绿色」「退出按钮靠右对齐，返回按钮靠左对齐」): both buttons are the same `NotchBarActionButton` the sidebar's 「设置」 row is built from, so their shape cannot drift, and 返回 only differs by `tint: DS.Colors.success` — green is what tells the user this is the way back, since in a dark panel a chevron alone reads as decoration. **The content header carries the page's actions, not a ✕**: 恢复默认 / 保存 / 关闭 sit at the right end of the title row (`GeneralSettingsActionBar(style: .headerInline)`) and the close button the user deleted twice (「把设置页面右上角的叉号去掉」, 「把标题右侧的叉X删掉」) is gone. Its `closeAction` must be the sheet's collapse, never the action bar's default `NSApp.keyWindow?.close()` — the expanded notch panel *is* the key window, and `.close()` orders it out while `NotchWindowController.isExpanded` stays true, stranding a notch that can neither collapse nor reopen. The two rows on 操作 that are not settings are the 「辅助功能权限」 readout — it reports and requests a macOS permission rather than storing a preference — and the 「它能做什么」 capability inventory, which describes what the companion can do but stores nothing.
- **Screen Capture**: ScreenCaptureKit (macOS 14.2+), multi-monitor support
- **Voice Input**: Push-to-talk via `AVAudioEngine` + pluggable transcription-provider layer. System-wide keyboard shortcut via listen-only CGEvent tap.
- **Element Pointing**: The model embeds `[POINT:x,y:label:screenN]` tags in responses, where `x` and `y` are on a **normalized 0–1000 grid**, not screenshot pixels. The overlay converts them to pixels, maps them to the correct monitor, and animates the blue cursor along a bezier arc to the target.
- **Computer Control**: The same 0–1000 grid drives real actions — `[CLICK:]`, `[SCROLL:]`, `[TYPE:]`, `[PRESS:]`, `[OPEN:]`, `[WAIT:]`, `[AX_TREE]` — executed through `MacosUseSDK` (SPM, pinned to a revision). A reply carrying action tags keeps going as an agent loop: **one action per step, enforced in code** (only the reply's first tag executes; the continuation prompt reports the rest as not executed), a settle delay and a fresh screenshot + automatic continuation after each step, until the model reports done or a 15-step cap. See [Acting on the computer](#acting-on-the-computer); the coordinate-space and safety decisions live there.
- **Concurrency**: `@MainActor` isolation, async/await throughout
- **Analytics**: None. The earlier PostHog integration was removed — it reported to someone else's account, uploaded the user's raw transcripts, the model's raw responses and the user's email address, and did synchronous disk writes on the main thread on every message.

### The Agent subsystem

The sidebar has a second half: a 「对话 / Agent」 switcher (`SidebarSection`, state on `AgentSessionManager`) swaps the session list for an agent roster, and the sheet's content column swaps `NotchHomeView` for `AgentSessionView`. One agent = one `AgentSession` record + one `claude -p --input-format stream-json …` subprocess whose `cwd` is the agent's project folder; **the record's UUID is literally the CLI's `--session-id`**, so thread identity and record identity never need a mapping. A process death does not kill the thread — the next turn relaunches with `--resume`; a live process takes further turns by writing another user line to stdin (steer). Streaming deltas never touch the store's lock-and-disk path — they live in `AgentSessionManager.streamingTextByAgentID`, and only finished turns (and tool-activity lines) go into the persisted transcript. **The agent subsystem deliberately shares nothing with the voice pipeline**: `currentResponseTask`/`voiceState` are the voice slot, agents are the `historyCompressionTask` precedent — own tasks, own state, held lazily by `CompanionManager`, terminated on `willTerminateNotification`, with `.running` records demoted to `.interrupted` at the next launch. Permission is the user's three-way choice (只读规划 `--permission-mode plan` / 自动改文件 `--permission-mode acceptEdits --allowedTools …` / 完全授权 `--dangerously-skip-permissions`), and `--permission-prompts none` is always passed because a headless process has nobody to answer an approval prompt. Protocol facts (frame shapes, the interrupt control_request, per-turn `total_cost_usd`) are measured, dated and written up in `开发经验/14-Agent子系统.md`.

**Phase 2 adds voice dispatch, the desktop HUD, TTS announcements and the running cost total.** The voice companion is the dispatcher: a reply may carry `[AGENT_SPAWN:name:task]` (spawn — or reuse, on a name collision — a background agent for work that needs no screen) or `[AGENT_SEND:name:message]` (hand a follow-up to an agent matched by name, exact case-insensitive first, containment as fallback). Dispatch requests live in `ActionParseResult.agentRequests`, **never in `actions`** — a dispatch must not cost a screenshot-and-continue cycle — and every outcome (spawned / handed off / refused, with reason) rides `pendingAccessibilityContext` as an `<agent_dispatch_results>` data block so the model sees what happened on its next step; the 总闸 is the Agent page's 允许 Agent 后台任务, and the system prompt caps spawns at one per reply. When an agent's turn finishes, `AgentSessionStore.addTurnCost` records both the per-turn and accumulated cost, and — gated on `announcesAgentCompletion` AND `voiceIdleProvider() == .idle` AND an `isAnnouncingCompletion` serialization flag, because `speakText` stops whatever is playing — the first sentence of the result is read aloud; while the user is in a voice conversation only the `answerFinished` chime fires. Non-idle agents also appear as floating chips top-right (`AgentHUDController`, 「Agent 悬浮图标」 toggle), tap-through to the agent's transcript page.

**2026-09-26, later the same day — the sidebar became cards, and the fallback became real (the user's design philosophy, verbatim: 「我希望全部都由我自己设计…因为考虑到我自己设计的能力问题，所以我才会去增加一个兜底策略…然后在过程中间我会去持续地升级我自己的主 Agent 的循环，然后在未来可能会持续地弱化这个 Claude Code」).** Four pieces, each committed and each verified in the accessibility tree rather than by reading code. **(1) Cards.** A card is an Agent body — a main-loop card IS a `ConversationSession`, a Claude Code card IS an `AgentSession`; no new table, the card id is that entity's UUID string. The 「对话 / Agent / 语音聊天」 switcher is gone (聊天的角色 list became a bottom row); `HomeSpaceSidebarView` went 1543 → 857 lines when the replaced views were deleted, one mechanical pass with git as the net (it left exactly two stray `@ViewBuilder` lines, which is why that deletion gets its own commit). Under each card sit four collapsible **status** columns, fixed order — 进行中 / 任务完成 / 任务失败 / 历史任务 — and his definition of the last one is 「已经结束的，才叫历史」, implemented as *ended and off the live board* so the four columns stay disjoint (a failed task appearing in two lists would be the obvious wrong reading). Card order between cards: main-loop first, Claude Code second (he only specified status ordering within a card). 「设为默认」 (`AppSettings.defaultSessionID`, `decodeIfPresent`) appears on main-loop cards only — he asked for that in so many words; the shortcut-sent question now has a target. **(2) Attribution, because that is the point of the screen**: `EphemeralAgent` gained `cardKind`/`cardID` (who owns it NOW — the handoff rewrites this), `handoffReason`/`handedOffAt`, `failureReason`, and `attempts[]` (who ran each try, how it ended, why). It persists through the *existing* `FinishedTaskStore` — a first draft added a second store and was thrown away when that one turned out to be what the archive already reads. Every new field is Optional and only the raw string of the kind is stored, so the 23 records already on disk still load (`finishedAt` became Optional for tasks recorded while a fallback is still running; the archive sorts by `sortDate`). The archive groups by **the card that owns the task now**, not by the conversation that asked — otherwise a handed-off task hides the one fact the retrospective is for. **(3) The fallback** lives in `MainLoopFailurePolicy.swift` and that file holds the only knob (`consecutiveFailuresBeforeHandoff = 2`): he will keep pushing that number up and eventually remove the fallback, so it must exist in exactly one place. At the loop's exit the pipeline counts a failure or resets, builds a `TurnOutcome` from what it already knows, and on hand-off records the failure reason to disk, dispatches with a **briefing** (original request + what the loop already tried + where it got stuck, and an explicit "don't redo these") rather than re-asking the question — Claude Code is heavy and expensive and re-walking the same ground is pure waste — then moves the task onto the Claude Code card. Pure-question turns are explicitly not tasks, so two questions in a row cannot count as two failures. 11 assertions on the policy and the briefing pass in a standalone probe; the display half (the task showing under the Claude Code card with a 兜底 badge) was verified by the card-area test; **the end-to-end trigger needs two real failures and has not been exercised** — the log line is 🪂. **(4) The composer** grew `controlsRow` and `bottomLeadingAccessory` slots in `MessageComposerField`: above the box, 连续对话 / 临时对话 on the left and 新建 · 屏幕 · 声音 on the right, with 音色 living in the conversation page's top bar immediately left of 复制全文 (his 「复制全文左边，放在这」; the two buttons share the 34 pt height so the row does not look broken). 「屏幕」 is real: unchecked, the typed question runs with `sendsScreenshot: false`, which skips the capture *and* leaves the pre-captured screen for a question that does want it. 音色 reuses the chain 设置 → 音色查看 already uses (`VoiceCatalog` + `VoicePreviewService` + `CompanionManager.playVoicePreview`, generation-counted so a second preview cuts the first) and reaches TTS through the `voiceOverride` parameter both `speakText` and `beginStreamingSpeech` already had. The temporary conversation is its own model object that touches `ConversationSessionsStore` **not once** (verified: every session's `updatedAt` unchanged after a temporary question) and borrows exactly one thing from the main pipeline — `speakTemporaryReply`, so both sound the same voice; its 屏幕/语音 both default off, as he specified. 新建 now stamps `archivedAt` on every live conversation before appending (soft delete, same as the sidebar's 删除), which is what keeps the card list to one main-loop card.


**2026-09-26, last piece — 角色 併进两张卡片：每张卡片四个聊天模式（文本 / 图文 / 语音 / 视频）。** His spec verbatim: 「在主模型或 Claude Code 模型右侧分割线上方增加选项，包含图文聊天、语音聊天、视频聊天…在语音聊天、视频聊天、图文聊天左侧添加「角色」按钮…只有点击语音或视频模式时，才只关注历史记录文本部分，不具备 agent 能力，不执行用户任务，只知上下文」. The row went where his screenshot pointed — the top of the right column, above the rule the code itself already called 「分割线**上方**」, left-aligned — as one shared view (`CardChatModeBar`) because all three content columns must draw it at the same y. **One line carries the whole feature**: `CardChatMode.usesAgentCapability` is false for 语音/视频, which is his rule made executable. 文本/图文 differ only in the screenshot flag — they *are* the 屏幕 toggle the composer used to have, promoted to an explicit mode, so that toggle is gone for the main loop (kept only for the temporary conversation, which is not a card). The mode drives the chat channel, so 「语音聊天不用画面」 disables 摄像头/屏幕 **with no new code** — that gate is keyed on channel, and the dependency layer is still the single source. **The prompt**: `CardChatContextAssembler` (pure, its limits in one place — 20 turns / 4000 chars / 3 screenshots) builds `<history_reference>` + `<role>`; the user's new question stays a user message, since a question and background material are two different levels of authority. It reaches both engines as a **copy** of the role whose `systemPrompt` is swapped — both paths already read that one field, so no engine changed — and the copy is load-bearing: `selectMode` / `selectChannel` / `selectPreset` all write `currentRole` back through `upsertRole`, so putting the assembled text on the real role would leave thousands of characters of conversation inside the user's own prompt (verified byte-identical after a real turn). Every finished turn is written back to the card at `finishTurn` — the one place a turn is finalised — as a normal `ConversationHistoryEntry` for the main loop or user+assistant transcript entries for Claude Code, so 切回图文 continues in the same conversation and it survives a restart. **The 角色 list changes with the mode** (his 「角色列表变化」): 文本/图文 show only 默认角色 — that agent's own system prompt, pinned and uneditable — while 语音/视频 show the roles he designed, falling back to the built-in one when he has none (otherwise the mode would speak with no role at all). 「管理角色…」 and the sidebar's 角色 row both now lead to 设置 → 角色, whose right half is untouched. Verified on screen and on disk: asking 「我们刚才聊的是什么？」 in a card-bound 三段式 session came back describing the VS Code window and browser preview — facts that exist **only** inside the injected history — the turn then appeared in `ConversationSessions.json` (3 → 4 entries), and the mode choice survived a relaunch for both cards (主循环 图文 / Claude Code 文本 by default). Two failures were caught by clicking rather than reading and are written up in `开发经验/10-踩过的坑.md`: a `.overlay`-drawn list that **looked** right but could not be clicked (SwiftUI does not route hits outside the parent's frame), and a new setting field that was written to disk on every click and silently dropped on every launch (added to `CodingKeys` but not to the hand-written `init(from:)`). And a third, found while wiring it: **`connectToRole` had no call site anywhere** — the 连接 button died with the sidebar's role rows in the cards redesign, so a voice session could not be started at all; it now lives at the right end of that page's header, three states in one control.

**2026-09-26, the same evening — his second pass over the row and the sidebar.** Nine more
adjustments, all of them his, all verified on screen. **The sidebar went 245 → 343** (+40%) and
**the panel widened by the same 98 pt** so the right column keeps its 565 — that was forced, not
chosen: the row he asked for in the same message (角色 + four modes + call ≈ 312, plus 摄像头/屏幕/语速
≈ 254) cannot fit in the 466 that a wider sidebar alone would leave. Width is now
`expandedSidebarWidth + columnDividerWidth + contentColumnWidth`, so one constant moves the panel.
**One row above the divider on every page**: 角色 · 文本 · 图文 · 语音 · 视频, then the call button
(icon only, no text, present only in 语音/视频), and on the right 摄像头 · 屏幕 · 语速 with **音色 only in
图文/文本** — for 语音/视频 the voice belongs to the two preset rows below the line, which is where he
said it already is. The chips lost their checkmark (selection is border + fill now, and they are all
the same width — the checkmark used to shove everything to its right). 图文/文本 lost its title, its
复制全文 and its little activity chip. On the cards, 设为默认 moved left of 通话, and selected vs not
finally reads as two different objects (bright fill + accent border + bright title against a dark fill
and almost no border) — the old 0.10/0.05 pair was indistinguishable in his own screenshot. 录音 moved
out of the search row into its own row above it, right-aligned over the ＋, as a rounded rectangle with
a **waveform** icon (his reasoning: a waveform fills a rectangle, a ring cannot). And the voice page's
composer gained 新建 + 声音, where **声音 off means the model outputs text only** — 三段式 does not
synthesise or play at all, 全双工 sends `modalities: ["text"]`, which is the officially documented
text-only mode this repo already uses on the understanding path. 连续对话/临时对话 were **not** copied to
that page: its conversation is the card's own and every turn is recorded, so there is no second
"temporary" place to be, and two inert buttons are worse than none.

**2026-09-26, last piece — the card's 通话 button is two different things, one per mode, and the card itself became 「标题 / 状态 + 收藏」.** His two instructions, verbatim. On the card: 「删除备注的功能，只保留标题，（第一行），第二行显示（状态、收藏按钮）」 — the 备注 built an hour earlier is deleted outright (property, accessors, view, drafts, `CodingKeys` entry and decode line), and the change also settled the truncation reported in between: with only the title on line one it gets the whole row, so **the 194 pt sidebar never had to be widened** (the four-item row needed ~132 pt of fixed furniture and left ~50 for a title that wants ~122 — the fix was rearranging, not resizing). Two details came from looking at the result rather than the code: the title shrinks (`minimumScaleFactor` 0.78) instead of truncating to 「我喜欢谁，刚…」, and the Claude Code badge moved to line two because on line one the two split ~104 pt and the AX tree showed the title at **19 pt wide** (「W…」) while line two had room all along.

On the call button — 「文本模式和图文模式的通话按钮路线是使用语音识别的形式，跟用户通过快捷键识别屏幕、然后提问、在鼠标右下角显示窗口回复内容是同一个方法……**它的功能就是替用户发送文本，不用手动输入**，识别到用户的文本后自动发送过去就可以」 — the button forked by mode **until 2026-09-27, when the user took that fork away** (he wants the card's phone to always mean 语音 — see the paragraph after the next one; the text-call route survives, but only on the right column's own chip). **语音/视频** keeps the voice-chat route (`startCallForCard`). **文本/图文** is `TextCallController`: it does not touch the voice engines at all, it attaches 「连续监听 + 自动发送」 to the card's *own text pipeline* — one spoken sentence equals typing one line into that card's composer and pressing return. The listening is the same `BuddyDictationManager` window the voice chat and the 对话 page's follow-up use; the sending is `CompanionManager.sendTextCallQuestion`, which routes main-loop cards to `submitTypedQuestion` and Claude Code cards to `agentSessionManager.sendTurn`, **with the screenshot decided by the same `CardChatMode` the composer uses**; the answer takes the ordinary path (screenshot → vision → bubble by the cursor + TTS). The notch reuses the voice call's phase (`.externalChatting`, drawn as 「Call」 + the red phone), which is what he asked for — 「整个样式、刘海的样式跟语音视频的样式一样，就是一个通话的状态」 — and all three hang-up routes (that wing, the card button pressed again, `NotchActivityView`'s) now funnel through one `hangUpAnyActiveCall()`. His third requirement is the one that shapes the rest: 「通话过程中间，允许用户在输入框里面发送问题，这是一定要允许的」 — so the call never takes the composer; verified by typing a question mid-call and watching it go (field cleared, stop button red, history 6 → 7 with 截图 1 张).

**Three structural boundaries, each learned rather than chosen** (full write-up in `开发经验/16-卡片通话的两条路.md`). (1) **Only one call can exist**, because both routes need the *same* single continuous-listening window — and since 2026-09-27 the card button is no longer the fork that guarded it: that guard now sits in `callButton` as an explicit "hang up whatever else is alive before dialling", because dialling while another card is connected **on the same role** (`resolvedRole` returns the one built-in role for every card until the user authors their own) makes `connectToRole` return early — card switched, mode switched, **no call placed**. (2) **The call is alive iff that window is**: `bindListeningWindow` subscribes to `isContinuousListening` and ends the call when it closes, because the window can be closed by paths that are none of the call's business (the user presses the talk shortcut to record, permission is lost, the voice chat takes over) — and a notch still saying 「Call」 with a deaf microphone is worse than no feature. (3) **`armContinuousListeningWindow` must stand down** (`guard !textCallController.isActive`): it fires on *every* answer starting to play, and the call's answers are those answers — letting it through schedules the follow-up window's expiry, which `endContinuousListening()`s the call's ears out from under it. Barge-in follows the voice chat's shape exactly: `onSpeechDetected` only interrupts, and the new turn is the user's own final transcript (sending from there opens two turns). **Verified on screen with the user's own voice** — their real sentences went out one after another in 图文 mode (history 6 → 10 on one card, each with 截图 1 张, one answer describing the code on screen), and the notch's red phone ended it with `📞 文本通话结束` + `continuous listening ended`. **What was not exercised: the ASR itself, by me.** Playing `say` through the speakers cannot drive it — measured with `recording-hal-amplitude-probe.swift`, speaker→built-in-mic coupling peaks at **212/32768** (75% volume) and **447/32768** (100%, longer phrase) against 1868/32768 for a real voice and a 0.25 VAD gate, i.e. ~20× below the threshold (开发经验/09-实测数据.md §18.6). The send half was therefore verified with a one-shot probe feeding an already-recognised sentence; the recognition half is pre-existing machinery two shipped features already use.

**2026-09-27 — 卡片那颗电话不再分模式，收藏变成开关。** 用户两句话，逐字：「你要让用户点击通话按钮的时候，自动切换到右侧的语音模式。**无论用户在右侧选择哪一个模式，应该把它自动切换到语音模式，然后通话，而不是在当前模式下说话。我指的是左侧卡片这个按钮**」＋「左侧卡片的收藏按钮（让它能取消收藏，现在不能取消收藏）」。**电话**：`callButton` 现在无条件走语音，顺序不能换 —— ①`cardModel.open(card)` 先把右列切到**这一张**（模式与角色都按卡片 id 存，少这一步就是"点这张、通那张"）→ ②`setMode(.voice, …)`（右列那排四个模式因此跳到「语音」，内容列整块换成语音页 —— 路由只读这一个值）→ ③`startCallForCard`（摆正角色 / 聊天类型 / 引擎，然后真的连上）→ 再按一次挂断。所以 `TextCallController` 从侧栏这张卡片上**够不着了**，它只剩右列页头最右那颗 chip 一个入口（`NotchSheetRootView.textCallChip`）；侧栏仍持有它，只为两件事：那张卡片上一通**文本**电话在打时按钮要亮着、以及拨新号前先把别的收掉。**收藏**：`AgentCardModel.setDefault` → `toggleDefault`（已经是它就落 `nil`），`defaultSessionID` 是唯一落点，而它今天只被卡片读来显示（"屏幕快捷键的问题进这一条"是给将来的承诺，不是现在的接线）。**上机验过**（真机、当前构建）：右侧先切到「图文」→ 点卡片的电话 → `AppSettings.json` 里那张卡片 `imageText → voice`、右列整块变成语音页、刘海 `Connecting → Call` 且真的连上（连接按钮变「挂断」、卡片按钮 help 变「挂断这一通」）；再按一次挂断，按钮与刘海双双回到拨号态。收藏连点两次：`defaultSessionID` 先变 `null`、再变回原值。

**2026-09-28 — 输入框能粘贴图片 / 文件 / 文件夹了（文本 · 图文 · 视频三个模式）。** 用户的原话与四条拍板写在 [`开发经验/21-输入框附件.md`](开发经验/21-输入框附件.md)，这里只记形状与那条根因。**形状**：附件条画在 `MessageComposerField` 里、`controlsRow` **之前**（他红框圈的位置）；最左一颗折叠钮在缩略图条与列表之间切；点缩略图在**面板内**预览（他的选择，不是"用系统默认 App 打开"）；**发出去之后仍然留着**直到手动删 —— 所以它的行为与既有的「参考材料」同一档：只要条里还有东西，之后每一轮（含按住快捷键说的那一句）都带着。**三条送法**：主循环把图片追加进 `analyzeImageStreaming(images:)`（该方法本来就吃多图，协议一个字没改）、文件/文件夹进 `<attachments>` 块；Claude Code 卡片**图片落盘 + 给路径**（沿用 `writeScreenshotForTurn` 那条既有决定 —— `--input-format stream-json` 没有官方文档，不许猜 content block）；视频走 `CascadeVoiceEngine` 的 `images`（**这一页的打字发送从来只走它，全双工也一样**，所以一处就够）。**根因（值得单独记住）**：`isRichText = false` 的 `NSTextView` **不接受图片类的粘贴板**，AppKit 于是把菜单里的「粘贴」判为不可用，⌘V 作为快捷键**根本不会派发到视图上** —— `paste(_:)` 一次都不会被调到，而"没被调到"与"调到了没认出来"在屏幕上一模一样（粘了没反应）。修法是在 `keyDown` 里拦 keyCode 9 + command（这个类本来就为回车做过一样的事），`paste(_:)` 的覆写保留给纯文本那一路，两条入口共用同一个判定闭包。**验到什么、没验到什么**：主循环与视频模式都验到了模型侧（它读出了粘贴图的内容，甚至说出了图的像素尺寸）；Claude Code 那一轮的**模型侧没验到** —— 这台机器上的 claude CLI 自己报 402/403 配额耗尽（与附件无关），App 侧的落盘与前言发生在 CLI 失败之前。

### The 临时 agent strip（屏幕右上角，菜单栏下面一行）

When the main agent dispatches a sub-agent (`[AGENT:角色:任务]`), the work gets a chip **at the screen's top-right corner, on the row under the menu bar** — `AgentStripView` in its own transparent panel (`AgentStripPanelController`), with `EphemeralAgent` as its model and `AgentActivityBoard` as the store. The user asked for it in so many words (「派活过程是一个非常大的问题…既要方便用户看见，又要能够点击查看：具体做了什么？做到哪？做到什么程度？」), and then moved it there on 2026-09-26 in so many words too: 「刘海左侧这个 agent 的小图标…应该放在右侧，电脑屏幕的时间日期这个菜单栏的下面一行……在这个位置上从右到左依次显示各种各样的任务，用户点击之后可以展开。**这样就不会影响整个窗口或者其他组件的位置**」 — the notch's flanks, the recording band and the expanding sheet all compete for the left side, which is what covered the chips. One chip = one task (「每一个 agent 都是临时的，所以你不能用一个对话来固定它」), at most three at once, **right to left with the newest at the corner**.

**It no longer lives inside any other window, and that is what fixed two things.** `AgentStripPanelController` gives it a transparent, non-activating, click-through (`ignoresMouseEvents = true`) `NSPanel` at `NotchSupport.agentStripWindowLevel` (`.mainMenu`), installed and torn down with the notch subsystem (`rebuildScreenPresences` / `teardown`) because its clicks are routed by that controller's monitors. Because the panel is the strip's own, its height is the strip's own: **the cards (time + 任务内容) were being clipped away entirely before this move** — the resting notch window is 54 pt tall (notch 32 + `restingPillAnimationHeadroom` 22) while a card starts at y≈37 and needs 74, so they fell outside the window and were silently cut (the commit that added them says outright "not verified by looking"). The new panel is sized 按钮那一行 + 两张卡片 (190 pt here) and the cards render for the first time.

**Its geometry is the part that keeps breaking, so it lives in `NotchSupport` and is locked by unit tests.** Drawing and clicking still share one arithmetic, now through the panel: the view fills its panel **top-trailing**, and the panel's right/top edges *are* the first button's right/top edges (`agentStripPanelFrame` vs `agentButtonFrame(indexFromTrailingEdge: 0)`). Positions come from **screen** coordinates — the right edge is `screen.maxX − agentStripOuterMargin` (14), the top edge is `screen.maxY − menuBarHeight(on:)`, which is `safeAreaInsets.top` (32 here) on a notched screen and the `visibleFrame` gap elsewhere — and the chip is as tall as the menu bar. `WannaTests` asserts five things: the panel agrees with the hit rect on both edges, the strip hangs below the menu bar, the button height equals the menu bar's, the strip clears the notch's **right** wing (`trailingWingWidth` — the side that now expands toward it), and the card sits exactly one `agentStripRowSpacing` under the button row (the view's `VStack(spacing:)` must be that same constant). The move also let `restingWindowFrame` go back to `activeFlankWidth` on both sides — its left flank had been widened to `restingLeadingFlankWidth` only to make room for the strip, and a separate test now pins that symmetry.

Clicks land in "那一排临时 agent 的按钮" in `handleGlobalClick`, **checked before the expanded-sheet branches**; the panel ignores mouse events, so the global monitor is the only thing that sees them. Clicking toggles `AgentActivityBoard.manualPanelID`, which `AgentPanelController` watches to show a read-only detail panel (steps, the original request, collapsed tool calls, a copy-the-id button) — anchored by `NotchSupport.agentDetailPanelTopRightAnchor` to the strip button row's bottom-right corner, so it opens under the chip rather than at the notch (measured here: `(1394, 69, 320×282)`); the panel follows the board so an open panel keeps up with a running task. Lifecycle: `running` breathes blue, `failed` breathes red and **stays**, and the two finished states retire themselves (verified 4 s, unverified 12 s) — unless their panel is open, because taking away what someone is reading is the worst option. **Deliberate limit**: the strip sits *below* Wanna's own panels (`.mainMenu`, against the sheet's `mainMenu + 1`), so in the fullscreen sheet the chips are behind the sheet — where they would otherwise cover that panel's three window buttons.

**Two known gaps, both about status**: nothing ever produces `.doneVerified` (the green state is unreachable — the dispatcher only distinguishes cancelled/errored from everything else), and an action that *failed* still reports 完成（未核验）because a failed tool call sets `lastActionDescription` but not `lastErrorMessage`. Deciding what "verified" should mean is the user's call, not a guess to make in code.

**Two known gaps, both about status**: nothing ever produces `.doneVerified` (the green state is unreachable — the dispatcher only distinguishes cancelled/errored from everything else), and an action that *failed* still reports 完成（未核验）because a failed tool call sets `lastActionDescription` but not `lastErrorMessage`. Deciding what "verified" should mean is the user's call, not a guess to make in code.

### The 语音聊天 subsystem（全原生，无 Chrome）

**Wanna 自己的语音对话，不依赖任何外部进程、浏览器或页面。** 这条路曾经是「Wanna 驱动外部 VoiceWeb 项目在 Chrome 里的一个页面」（Chrome 实例 + HTTP 桥接 + 页面补丁轮询），2026-09-24 整条废弃：桥接方案无法可靠地自动化屏幕共享（浏览器要求真实用户手势），而且多出一个必须活着的进程树。用户的原话是「完全放弃 Chrome」，只保留 VoiceWeb 的「怎么调 API、数据流怎么转换」。外部项目 `~/Documents/SuperAgent/APP/Test/voice-web` 与本仓库再无关系；历史复盘留在 `开发经验/03-语音聊天外部会话方案.md`（已标注废弃）。

**2026-09-24/25 完整重塑成「预设极简化」方案**（用户对上一版的判定是「只不过是一个样式……没有真正实现相互之间的依赖关系」—— 所以这一版的每一处选择都必须**真的接线**）。形状：

```
聊天类型（视频聊天 / 语音聊天）× 模式（全双工 / 三段式）× 预设 = 唯一的选择
```

- **预设是唯一真相**（`VoiceChatPreset.swift` + `VoiceChatPresetStore.swift`）：每条预设 = 一组**已验证**的模型组合 + 音色 + 设备默认值。用户定的规矩：「把能够验证的、已经验证出来的、完整的、能够使用的不同模型组合作为一个预设来使用，不允许用户自定义」—— 三段式预设全部由代码写定（只能改名/备注/收藏），全双工预设可换模型、可新建。默认预设永远第一、不可编辑。
- **预设矩阵**：视频聊天 = 全双工（3 个全模态模型）+ 三段式（1 条标准组合）；语音聊天 = 全双工（**只有全双工语音模型**，全模态不进语音聊天 —— 用户的严格限制）+ 三段式（标准组合 + 快问快答）。
- **每个预设背后是一条不同的管线**（用户 2026-09-25 的关键判断）：三段式的「理解」按预设分派 —— 实时模型走 `RealtimeTextUnderstandingClient`（WebSocket：`conversation.item.create` 喂 `input_text`、收 `response.text.delta`，官方文档逐条核对，实测首字 **0.48s**），其余走 HTTP 图文。**识别出文字 → 实时模型出回复文字 → 文字交给 3.1 TTS 用选定音色发声**这条链已真机实测（`开发经验/09-实测数据.md` 第十节）。
- **依赖关系只有一处实现**（`VoiceCatalog.capability(for:channel:role:)`）：界面（置灰/留空）与引擎（真正发什么）读同一份 —— 「看得见」和「真的会生效」结构上不可能分家。画面判据 = 聊天类型是硬闸（语音聊天永远不开）+ 所选模型吃不吃图。
- **音色真的生效**（用户报的「点了使用但连接时播的不是那个音色」的直接修复）：`BailianTTSClient.speakText/beginStreamingSpeech` 带 `voiceOverride`，穿透到合成请求体的 `input.voice`；全双工的 `voice` 经能力层校验后才进 `session.update`。每次连接与每次合成都打一行日志（模型 + 音色）——「真的用了吗」唯一可核对的判据。
- **聊天绑定角色**（用户 2026-09-25：「语音聊天和视频聊天其实是绑定角色的，所以应该放在设置页面的角色里」）：角色编辑页提示词下面一节，视频/语音 → 全双工/三段式 → 预设三级选择写进角色草稿；换角色 = 连聊天方式一起换（手语教练带视频、口语教练只要声音）。附「可用的模型」折叠清单，每个模型带复制按钮（复制完整 id 给 AI）。
- 侧栏：`Ask / Agent / Chatting`（用户 2026-09-25 定名）。

| 文件 | 作用 |
|---|---|
| `VoiceChatController.swift` | 会话编排 + 预设状态机（`currentChannel` / `currentPreset` / `capability`；`selectChannel` / `selectMode` / `selectPreset`；换聊天类型或模式时自动回落到该组默认预设并写进角色）。连接时打一行完整事实日志（聊天类型/模式/预设/三模型/音色/画面） |
| `CascadeVoiceEngine.swift` | 三段式的**一个回合**：理解按预设分派（实时模型 → `RealtimeTextUnderstandingClient`；其余 → `BailianVisionChatAPI`）→ 文字边收边喂 `BailianTTSClient` 逐句快答（带预设音色） |
| `RealtimeTextUnderstandingClient.swift` | 用实时模型做「理解」：喂一条 `input_text`、流式收 `response.text.delta`。协议逐条照官方文档（`modalities:["text"]`、`turn_detection:null` 由客户端发起回合）；**不吃图片**（`qwen-audio-3.x` 不能理解图像，能力层因此把画面置灰） |
| `VoiceChatPreset.swift` / `VoiceChatPresetStore.swift` | 预设数据 + 内置矩阵；覆盖层（标题/备注/收藏/全双工换模型/用户新建的全双工预设）落 `VoiceChatPresetOverrides.json`（0600 + NSLock + 通知，形状照 `VoiceChatRoleStore`）。**模型组合不存盘** —— 它属于代码，不属于用户 |
| `VoiceChatRole.swift` | 角色模型 + `VoiceChatRoleStore`（`VoiceChatRoles.json`，0600、变更通知、逐字段 `decodeIfPresent`）。**角色里禁止存 API Key**。 carries `chatChannel`/`presetID` 与五个模型字段；**五个模型字段曾经只 encode 不 decode**（选择静默丢失）—— 已修，教训见该文件的注释 |
| `VoiceChatPreset.applied(to:channel:)`（在 `VoiceChatPreset.swift`） | 「应用一条预设」的唯一实现（纯函数）：写三个（或一个）模型 + 音色 + 设备默认值。控制器与设置页的角色编辑器都走它 —— 两处各写一遍必然漂 |
| `VoiceChatSessionView.swift` | 页头三段：分割线上方 = `[视频聊天│语音聊天]` 分段控件（绿滑块）+ 音色昵称（带 waveform 符号）｜ 摄像头 · 屏幕 · 语速；下方两行 = 全双工 / 三段式选择按钮（绿勾）+ 预设下拉（卡片式，带默认标记/收藏/模型组合）+ 位置名（`识别=理解=表达` / `识别│理解│表达`，**常显**、靠右、明暗表选中）+ 行尾音色按钮（未选中行置灰）。音色面板按行服务、分类只有「系统音色 / 克隆音色」（用户明确废弃流式/非流式分类），绿色标题显示**能力层算出的**有效音色 |
| `VoiceChatRoleSettingsView.swift` | 「角色」编辑页：标题 / 备注 / 头像 / 提示词 / **聊天节**（视频/语音 + 全双工/三段式 + 预设下拉 + 可复制的模型清单）/ 连续对话 vs 全新对话 / 设为默认。聊天节改的是草稿，「保存修改」一次落盘 |
| `VoiceChatPreviewStrip.swift` | 顶部两个预览框（摄像头 / 屏幕），各自可折叠成一条、可全屏。**常驻**：折叠只是收成一条，入口永远在 —— 早期版本把「缩起来」做成整条消失，用户点一下之后就再也叫不回来 |
| `CameraPreviewService.swift` / `ScreenPreviewCaptureService.swift` | 采集。屏幕走 `SCStream`（2fps、`queueDepth=1` 故意丢帧、缩到 640），摄像头走 `AVCaptureSession` + `AVCaptureVideoPreviewLayer`，各自给预览与「送模型的那一帧」两条路 |
| `VoiceCatalog.swift` | 音色表 + 模型清单 + **能力层**：`capability(for:channel:role:)`（`VoiceChatCapability`：`isVideoInputAllowed` / `effectiveVoiceEngine` / `effectiveVoiceID` / `usableVoiceEngines` / 理由）—— 界面与引擎读的唯一一份依赖真相；`isSelectable` / `fallbackVoice`（跨家族音色会让整条 `session.update` 被拒，实测 `Unsupported voice: 'Tina'`，所以合法性必须是可查询的判断）；`modelCanUnderstandImages`（画面判据）；`modelInventory(for:channel:)`（设置页可复制的模型清单）。**故意不照搬 VoiceWeb 那 19 个全双工音色**：其中大半在今天的官方列表里不存在 |
| `VoiceLibraryStore.swift` | 「音色查看」的本地状态：**收藏**（按 `voice_id` 命名空间存，`omni:`/`duplex:` 前缀，**稳定分区**不是排序）与**克隆音色的昵称**（官方复刻 API 不保存备注，所以只能本地存；展示名三级回落：本地昵称 > 云端给的 > 原 id）。形状照抄另外三个 store（`nonisolated` + `NSLock` + 原子写后补 0600 + 通知）。刷新只换云端列表，昵称按 id 存活，用户感觉不到中间刷新过 |
| `VoicePreviewService.swift` | 试听音频的合成，**三条路**（三个模式的音色各由不同模型发声）：三段式走用户配的合成模型；全模态走 `qwen3-tts-flash`（**Tina 试不了**，它不在那张表里）；全双工**必须让实时模型自己说**（那套龙安音色任何独立 TTS 都不认），所以那一条开一个真会话、发一句纯文字、收 `response.audio.delta`（24 kHz PCM16，要自己包 WAV 头）。缓存落在 `VoicePreviews/`，key 是**可读的**（出问题能看出哪个文件对应哪次试听） |
| `CustomVoiceLibraryClient.swift` | 声音复刻的四条动作（`list_voice` / `create_voice` / `query_voice` / `delete_voice`）。`createVoice` 是**四步**且每一步都实测过：`getPolicy`（全局域名，不在业务空间域名下）→ **HTTP multipart 上传**拿 `oss://` 地址（**这就是 VoiceWeb 要 shell 出去跑 `bl file upload` 的那一步，官方文档写全了协议，所以本 App 无任何命令行依赖**）→ `create_voice`（**必须带 `X-DashScope-OssResourceResolve: enable`**）→ 轮询 `query_voice` 到 `OK`（实测 **8~10 秒**，所以界面必须轮询/进度，不能同步等）。`deleteVoice` 会**真的删云端** |
| `VoiceCloneWorkflowView.swift` | 「声音克隆」工作台：选单个文件或整个文件夹（wav/mp3/m4a）→ 逐个试听（`AVAudioPlayer`，**只有它能暂停**；共享 TTS 引擎的 `stopChunk` 只有停）→ 上传前先确认一次 → **一件一件克隆**（并发会让账号里堆一串分不清谁是谁的任务）→ 按**克隆调用返回的 id** 认结果（账号里原有的音色不在其中）→ 每行可改名/试听/删除。**昵称默认取文件名**，克隆成功立刻落盘。这一页**没有「使用」按钮**（用户明确要求），右上角「完成克隆」跳回「克隆音色」并强制刷新 |
| `VoiceCatalogSettingsView.swift` | **设置 → 语音聊天 → 音色查看**：三个模式按钮（大、左对齐）→ 三段式下面再分「系统音色 / 克隆音色 / 声音克隆」三栏 → 搜索框（带边框）+ 右侧刷新 → 每行 试听/使用/删除/★。「使用」写进**当前活动角色**的对应音色字段（`ttsVoice`/`omniVoice`/`duplexVoice`）。试听的「合成中」**只影响被点的那一行**（代次判定，切一个会停掉上一段）；克隆音色那一栏的按钮是**二次确认的删除**（改名靠双击标题）。当前模型用绿色显示在子标签同一行，因为它**决定可用音色** |

**它和「对话」页面共用同一批音频设施，这条边界是历次回归的来源，必须记住：**
`BuddyDictationManager`（连续监听 / VAD / 打断）、`VoicePlaybackEngine`（唯一的 `AVAudioEngine`，含 VPIO 回声消除）、`BailianTTSClient`（播报）三个都是**两页共用**。尤其 **`BuddyDictationManager` 只有一份连续监听窗口**——一个 `isContinuousListening` 标志、一个 `continuousListeningCallbacks` 槽、一份 utterance 状态、一个窗口级阈值。所以：

- `startContinuousListening` 在**已有窗口打开时会静默返回**（`BuddyDictationManager.swift` 的两个 guard），调用方若拿「`isContinuousListening == true`」当作自己成功的证据，就会连到**另一个页面**的窗口上：回调是别人的，说话不显示、阈值也不是自己的。这是「有时完全识别不了」的可达路径之一。
- 改这个文件的任何一行，都会同时作用于对话页面和语音聊天页。为语音聊天调的参数必须显式传入（如 `minimumContentCharacters`），不要改默认值。

记忆复用仓库既有的 `ConversationSessionsStore`（会话侧栏 / 归档页就是它的界面），不另建一套：角色的「连续对话 / 全新对话」映射到「延续本会话 / 开新会话」。


### The voice conversation, end to end — the user's requirement model

**This is the definitive statement of how the whole voice loop is meant to behave** (user's words, finalised 2026-09-24; the full requirement-to-implementation mapping lives in `开发经验/02-语音对话完整方案.md`):

1. **说话** — press the talk shortcut, speak. The notch expands into Listening, recording and recognition start.
2. **发送, two ways** — press the shortcut again (`finishContinuousListeningUtteranceByShortcutSend`, bypasses the silence wait), or fall quiet for 「静音多久自动发送」 (default 2 s; the VAD loop's silence countdown requests the final transcript). The shortcut is the reliable "I'm done" because human thinking pauses are unbounded; silence is the auto fallback.
3. **播报** — the reply streams and is spoken; the notch shows Speaking.
4. **打断, by speaking** — while the reply is playing, the user's voice is the interrupt. The ONLY turn-start source is the local energy VAD (a transcript may never start a turn — the recogniser's guesses off the canceller's residual would stop the answer on their own). Barge-in is once per utterance. **And a barge-in puts the display back to 「在听」** (2026-09-27, the user: 「我打断他的意思就是说我在说话，那么他就应该继续进入这个说话的循环模式」 — the screen must look like the beginning again, i.e. the subtitle row under the notch): `handleContinuousListeningSpeechDetected` used to *only* stop playback, leaving `voiceState` on `.responding`, whereupon the post-playback reset task saw `isPlaying == false` and flipped the whole panel to idle — while the user was speaking. It now writes `voiceState = .listening` for the two 「它在忙、我插话」 states (`.processing` / `.responding`); everything downstream (phase → the transcript panel's `show()` → the row, the squared wing corners) follows automatically, and the reset task stands down by its own `guard voiceState == .responding`.
5. **追问, hands-free** — after the reply finishes, the continuous-listening window (「持续监听时间」, default 30 s, **0 = mic closes when the answer ends**) keeps the microphone open; speaking there follows the SAME chain as an interrupt, sent by the same two ways (shortcut or 2 s silence).
6. **会话结束** — the window closes; the notch retracts (the turn resets its own `voiceState` after playback drains — `.responding` is set at first audio and NOTHING else may clear it; `scheduleVoiceStateResetAfterPlayback` → `forceActivityPhaseIdle`, skipping the 2.5 s thinking→speaking gap hold, retracting at once). **The engine stays warm.**
7. **下一问** — the next press is fast because `audioEngineIdleReleaseMinutes` (default 3; 1/3/5/永久) holds the shared engine past the conversation, and 「释放引擎」 (⌃⌥4 default) is the manual way out that makes 永久 usable.

The shortcut's double identity while the bot is speaking is two separate questions with separate answers (`isContinuousListeningUtterancePending`): did the user interrupt (barge-in) → stop vs send; is there ≥4 content characters to send → whether the send branch produces anything. Both are needed — the barge-in alone made the stop path unreachable, the bar alone made a one-character barge-in a dead press.

One audio engine serves playback, continuous listening AND push-to-talk recording (`BuddyDictationManager`'s own `audioEngine` is fallback-only) — the one-audio-path rule, and the reason a session's FIRST question is fast: the ~2 s voice-processing IO reconfiguration starts when the recording does, while the user is still speaking. A new recording ends an open listening window first (on one engine the recording's tap replaces the window's, and the window's ASR session would turn the recording into a second question).

**That same ~2 s is also why「从实时模式转到 agent 模式要 5 秒」—— 它是真的，但它落在了应答那一刻，
而"提交时预热引擎"那一版当天就被撤回了（2026-09-28）。**
Measured with five timestamped stages in the pipeline (`MainFlowDiagnostics` 的开始截屏 / 截屏完成 /
请求已发出 / 模型第一个字 / **出声**): `🔊 VoicePlaybackEngine: engine started` and the first audio were
**the same millisecond** — every reply pays the VPIO reconfiguration at the moment the user is waiting
for sound, and 第一个字 → 出声 is **2.50 s**. The obvious fix — warm the shared engine at submit
(`Task { await warmUpEngine.warmUpForVoiceChat() }`) — **made things worse and is gone**:
**`VoicePlaybackEngine` is `@MainActor`, so `Task { }` changed the ordering but not the executor** —
it blocked the main thread (~1 s, measured as 「提交一轮 → 开始截屏」 = 0.93–1.33 s on the press path
against **0.00 s** on the follow-up path where the engine is already warm) **and** its VPIO
reconfiguration killed the follow-up window's capture, so a loudly-spoken sentence produced
**0 字** — the user's two reports that day (「打断之后不再是瞬间回复」/「打断几次之后就卡了」) are both
that one line. The comment left at that call site says outright not to add it back.
**To actually reclaim the 2.5 s the engine start has to move off the main actor** — the class is
`@MainActor`, so wrapping a `Task` around it is not that. See `开发经验/10-踩过的坑.md` D42 and
`开发经验/20` 9.69 补.

The cost of the held engine is the user's own setting and says so in its description: the app stays in macOS's communication-app class, other audio is ducked at `.min`, and the microphone route stays open.

### Model Configuration

Every request goes straight to whichever provider the user configured. There is no proxy.

The app needs three models, called **roles**:

| Role | What it does | Default |
|------|--------------|---------|
| 👂 `transcription` | Speech-to-text **of the paths that use Bailian** (语音聊天 三段式; and the main Agent when 设置 → 听 → 「说话时用哪个识别」 is set to 阿里百炼). The main Agent's default backend is Doubao, which is **not** this role: it is configured on the 录音 page | `qwen3-asr-flash-realtime` over websocket |
| 🧠 `vision` | Looks at the screenshot and answers | `qwen3-vl-plus` |
| 👄 `speech` | Reads the answer aloud | `qwen-audio-3.1-tts-flash` + cloned 赵今麦 voice |

⚠️ **快采只允许在"共享引擎没开着"时用**（2026-09-27，修回被打断逻辑）：共享引擎（开 AEC 那条）热着的时候再起第二条引擎，会把**带 AEC 的那条掐死** —— 于是「播报中说话能打断」和「播完 30 秒内还能追问」一起死（用户报的「你把打断的逻辑删掉了」）。`BuddyDictationManager` 现在先问 `VoicePlaybackEngine.isEngineCurrentlyRunning`：热着就走共享引擎（本来就 ~139ms），冷着才快采（独占设备、无冲突）。改任何碰麦克风/输入设备的代码之前，先列出**还有谁在用这个独占资源**（`开发经验/10-踩过的坑.md` D29）。

**ESC 落在"正在说话"时，界面要瞬间消失（2026-09-27）**：`forceActivityPhaseIdle()` 只按当前
这一刻，而相位是从 `voiceState` 派生的（此刻录音还在收尾、`voiceState` 仍是 `.listening`），
下一拍又算回 Listening。所以新增 `NotchPanelModel.isActivityPhaseHeldAtIdle`：ESC 打断"正在听"时
置上，`refreshActivityPhase()` 在标志清掉之前一直返回 idle；**收尾时不松开**（那一刻 `voiceState` 还是 `.processing`，一松开相位立刻算成
Thinking/Typing 又亮起来 —— 用户报的「还是显示 thinking」就是这个）；松开放在**下一次真正开始一轮**
（按下快捷键 / 打字提问）（`开发经验/10-踩过的坑.md` D32）。

**鼠标旁那张卡片只留任务的结果**（2026-09-27 用户：「不要在鼠标右下角显示内容……关键是 Agent 的
任务回复之后的这个结果，**不应该显示用户提示词**」）：任务一旦开始执行（派活或执行动作），
该循环的**流式文字不再写进卡片**，卡片只留收尾 settle 写入的最后那份结果（`D33`）。

**ESC 的打断范围 = 一个「周期」**（2026-09-27 用户重新界定：「终止的是**从第一次按快捷键到最后一轮 AI 回复结束**这中间出现的**所有 agent**；对其他轮、对全新的一轮没有任何影响」）：一个周期里可能有好几轮（播报中打断、播完 30 秒内继续说都会在同一个窗口里续下去），所以 `EphemeralAgent` 新增 `cycleID`（`decodeIfPresent`），**一次全新的按下**生成、`endContinuousListeningWindow` 清掉，ESC 走 `cancelRunningTasks(inCycle:reason:)`。`groupID` 是"一轮"的粒度（侧栏按它折叠），`sessionID` 是会话（跨很多周期）——都不够用，理由写在该字段的注释里。

**「识别要 2 秒才出字」已修（2026-09-27）：根因是音频采集晚，改法是"先采（不开 VPIO）→ 立刻出字 → 按需再上 AEC"。** 用户自己的方案与理由（「一开始不开，让它能快速显示用户的文字，然后在显示的过程中间再去开……打断本质上用户说完话之后、在执行的过程中间才会出现，那时候才会需要用到这个回声消除」）。实测按下算起：识别会话建好 **0ms**、**tap 装好 1537ms**、第一块音频 1892ms —— 全在共享引擎的 VPIO 重配置上；录音那条（⌥C）用自己的 AUHAL、不开 VPIO，**22ms** 就出第一块。现在 `startRecognitionSession` **先用本类自己的引擎（不开 VPIO）把采集接上**（~195ms）并**全程走它**，共享引擎（带 AEC）**按需**起来（回答开播 / 连续追问窗口——那条路本来就存在）；**只有按下时正在播报**才走老路等 VPIO，AEC 契约不变。⚠️ 第一版是"立刻在后台把 VPIO 拉起来、起来就交班"，实测**缝 1204ms**（重配 IO 把另一条引擎的 tap 掐停，用户还在说的 1.2 秒整段丢）—— 所以**不做中途交班**（`开发经验/10-踩过的坑.md` D28）。改后：第一块音频 **1892ms → 299ms**，快采连续 68 块无缝。

**上一轮的原始测量（保留）**：：按下说话键 → **第一块音频进 provider** 实测**冷 2025ms / 热 139ms**（同一份日志里录音那条路是 `AUHAL 已启动` +17ms、`第 1 块` +22ms）。差在**引擎**：主 Agent 走共享的 VPIO 引擎（那套 IO 重配置 ~2 秒，本仓早有记录），按键后头 2 秒的话根本没进采集；录音那条用自己的 AUHAL 引擎、不开 VPIO。**被排除的候选**：每句一条新连接的握手（连接在按下那一刻就建了；实测 `新段 @连接后 0.7s`（音频立刻喂）对 `@连接后 2.0s`（音频晚到）——差别全在音频何时到）与 `publishInterimDraftText` 的节流（同步调用，与 provider 出字同拍）。**没有改代码**：`audioEngineIdleReleaseMinutes`（1/3/5 分钟或永久）决定这 2 秒多久付一次，把它调长/永久是用户的取舍（代价是常驻麦克风路由 + 压低别的软件音量）；要彻底消灭它得让采集先于引擎起来，与「一条音频路径」「VPIO 启用顺序」冲突，不由代码擅改。

**Recognition is the one role with a second backend, and since 2026-09-27 the main Agent runs on it.** 设置 → 听 → 「说话时用哪个识别」 picks 豆包（火山引擎）or 阿里百炼; it defaults to 豆包, so the press-to-talk shortcut transcribes with Doubao out of the box. **A dropped connection must not end the recording** (2026-09-27, the 「第二次按不提交、退不出来」 regression): the Doubao client's own watchdog declares a connection dead after 15 s with no reply *while audio is being fed* — which for press-to-talk is a **false positive**, because a user who presses the key and thinks in silence gets no replies from the server — and the provider used to surface that as a fatal error, so `handleRecognitionError` cancelled the whole dictation: nothing was submitted, nothing was said on screen, and the next press started a *new* recording instead of submitting. The provider now **reconnects** (bounded at 3 per utterance, keeping everything already recognised as a sealed prefix because a fresh connection restarts the server's millisecond timeline), `handleRecognitionError` submits whatever text exists instead of discarding it, and a dictation that dies with **no** text notifies `onDictationAbandoned` so the turn recorder does not leave a turn open. See 开发经验/10-踩过的坑.md D21. The Doubao path takes its credentials, 档位, language and hotwords from **the 录音 page's existing fields** — one Volcano account, so one place to type the API key — which is why that switch's settings row says outright that the 听 page's 识别语言 and 识别模型 only apply to 百炼. Which path gets which backend is decided in exactly one place, `BuddyTranscriptionProviderFactory`; see its Key Files entry for the three rules.

Which provider serves each role, and that provider's URL, API key and model names, are the user's to set. Settings are changed in the notch sheet's embedded 设置 pages (the notch subsystem is the primary entry) or, where the subsystem cannot host them, the titled window; both write:

| Setting | Where it comes from | Purpose |
|---------|---------------------|---------|
| everything | `~/Library/Application Support/Wanna/ModelConfiguration.json` (0600) | Source of truth |
| `BailianAPIKey` | `BailianSecrets.plist` (gitignored) | Seed only — read once, when no `ModelConfiguration.json` exists yet |
| `BailianWorkspaceBaseURL` | `BailianSecrets.plist` (gitignored) | Seed only, same as above |

The JSON files live outside the repo so they survive a clean checkout and never need a `.gitignore` entry. They are **not** watched for changes: editing one by hand takes effect after a restart. `AppSettings.json` is the same idea for the 36 settings the [Settings](#settings) page writes, and `ConversationHistory.json` is the conversation itself — written only when 「重启后保留对话」 is on, and deleted when it is turned off.

Request paths are a property of the provider's protocol, not something the user types:

| Route | Protocol | Serves |
|-------|----------|--------|
| `POST {base}/compatible-mode/v1/chat/completions` | Bailian | 🧠 |
| `POST {base}/api/v1/services/audio/tts/SpeechSynthesizer` | Bailian | 👄 (returns a 24h WAV URL) |
| `WSS {base}/api-ws/v1/realtime?model=…` | Bailian | 👂 (only when the main Agent's recognition is set to 百炼, or on the 语音聊天 三段式 path) |
| `POST {base}/chat/completions` | DeepSeek | 🧠 only — DeepSeek has no ASR or TTS |

`ProviderProfile.effectiveFlavor` is the single source of path truth; the three clients ask it rather than hardcoding endpoints. DeepSeek is OpenAI-shaped but its chat route has **no `/v1` prefix**, which is why the protocol — not the base URL — decides the path.

**The reasoning pass is switched off by default, and it was most of the latency.** Measured 2026-09-21 with the app's real payload (1280×827 JPEG + the 4923-character system prompt), asked "屏幕右上角有什么？": `deepseek-flash` emitted **664–868 reasoning tokens before the first word of the answer**, so of a 4.5 s request 3.4 s was thinking, 0.5 s was upload, and 0.3 s was the answer. Wanna's questions are perception questions answered out loud — that thinking is time the user spends watching a spinner and cannot hear. `BailianVisionChatAPI.reasoningSuppressionBodyFields(for:)` now sends `thinking: {"type": "disabled"}`, which returns the first token in **817 ms median over four rounds** (vs 4298 ms) and still emitted a well-formed `[POINT:x,y:label]` on the 0–1000 grid **4 times out of 4**.

**That suppression is the user's setting, not a DeepSeek special case.** Each provider card in the settings window carries a 「推理」 switch writing `ProviderProfile.visionReasoningEnabled`, and the field is sent whenever the provider's `allowsVisionReasoning` is false — which is the default, so a user who never opens the settings window gets the fast path and a user who wants a reasoning model can ask for it. Two details are deliberate. The stored property is `Bool?` **so an existing configuration file still decodes** — the synthesized `Codable` throws on a missing key, so a plain `Bool` added now would make every file written before this setting existed fail to load; `nil` reads as off in the accessor, and the toggle writes an explicit `true`/`false` so a file records the choice once it has been made. And the field is only ever *sent* when it is on the suppression side: Bailian accepts `thinking` and ignores it (HTTP 200, no change in output, on a model with no reasoning frames to suppress), which is what lets one user-facing switch cover whichever provider serves 🧠, but there is no reason to spend the bytes otherwise. Of the candidate switches only `thinking:{type:disabled}` and `reasoning_effort:"none"` actually work — **`enable_thinking:false` (629 reasoning tokens still) and `chat_template_kwargs.thinking:false` (378 still) look plausible and do nothing**, which is why the constant is documented rather than guessed at. `ResolvedModelRole.allowsVisionReasoning` carries the decision to the request body the way `requestPath` already carries the protocol to the route.

**The second cost is TTS, and it is linear in the answer's length.** Measured 2026-09-21 on `qwen-audio-3.1-tts-flash` + the cloned voice: synthesis plus download runs ~19 ms per character plus ~450 ms fixed — 10 characters 0.72 s, 90 characters 1.98 s, 250 characters 5.85 s, 600 characters 9.43 s. Because `maximumCharactersPerChunk` is 500, a normal spoken answer is a *single* chunk, so the user waits for the whole thing before hearing anything. Unlike the reasoning pass there is no switch to flip here; the levers are shorter answers (the system prompt already asks for one or two sentences) and, for long ones, starting synthesis on the first sentence while the rest still streams.

**Only `deepseek-flash` can serve 🧠 on DeepSeek.** Measured 2026-09-21: the endpoint exposes exactly two models, and `deepseek-v4-pro` rejects the screenshot outright ("Unsupported Image") while `deepseek-flash` answers it — including emitting `[POINT:…]` tags on the normalized grid, which is the part that could not be assumed. `deepseek-flash` is therefore what the DeepSeek provider pre-fills as its 🧠 model. It is also a reasoning model — see the reasoning-suppression paragraph above for how that is handled, and why the `max_tokens` budget still has to stay generous: reasoning tokens are spent before any content is emitted, and a small budget returns HTTP 200 with an empty `content` — a silent failure the vision client now turns into a thrown error rather than "nothing happened".

**The `max_tokens` budget is capped by Bailian, not DeepSeek.** One value serves every provider, so it has to be legal on all of them, and their ceilings are an order of magnitude apart. Measured 2026-09-21 by probing each service: DeepSeek accepts `[1, 393216]` and Bailian rejects above `[1, 32768]` with `InternalError.Algo.InvalidParameter`. 32768 is therefore the largest value that is legal everywhere, and that is what `AppSettings.visionMaxCompletionTokens` defaults to — raising it toward DeepSeek's ceiling would break 🧠 the moment the user switched back to Bailian. Both were re-verified at 32768 with a real 1.2 MB screenshot and the app's own 4923-character prompt, and both still answer and still emit `[POINT:…]`. The 看与截图 page exposes it as 「单次回答字数上限」, a slider over `256...32768`, and `clamped()` keeps a hand-edited file inside that range. The budget has to stay generous for a second reason: a reasoning model bills its chain of thought against it, and an exhausted budget returns HTTP 200 with an empty `content` — a silent failure the vision client turns into a thrown error rather than "nothing happened". (The separate small `max_tokens` values in `ElementLocationDetector` and `ModelConnectionTester` are unrelated paths and deliberately tiny.)

`ModelConfigurationStore` holds the configuration behind an `NSLock` and is deliberately `nonisolated` (see the Concurrency note below); `BailianConfiguration` is now only a façade over it (`resolvedTranscription` / `resolvedVision` / `resolvedSpeech`) plus the seed constants. All three clients read the configuration **per request**, so a save is live: nothing needs rebuilding, and a change mid-utterance can't split one request across two providers.

A Cloudflare Worker used to proxy the old providers; it is no longer part of the repository.

### Settings

The twelve settings pages live in TWO hosts showing the same views. The primary host is the notch sheet (its 「设置」 sidebar entry). The titled settings window is the FALLBACK host — `CompanionManager.openSettings` routes into the notch through `NotchWindowController.expandShowingSettings(initialPage:)` (the sheet consumes the request off `NotchPanelModel.requestedSettingsPage` on appear and on change) and only falls back to the titled window when the notch subsystem cannot show a sheet — no notched screen, 「刘海屏入口」 off, or another process's fullscreen covering every notched display. Nothing calls `openSettings` today (the menu bar panel's 「更换…」 was deleted with the panel); it stays as the documented settings entry for those fallback states. Page list, in order:

| Page | Holds | Stored in |
|------|-------|-----------|
| 通用 | 开机自启动、启动时自动打开面板、刘海屏入口、刘海屏音效、光标的显示方式/形状/跟随距离/闲置后自动隐藏、回答时显示文字、回答文字多留一会儿 | `AppSettings.json` |
| 交互 (named 交互样式 until 2026-09-23, renamed at the user's request — 「设置页面的"交互交互样式"改为"交互"」) | 卡片颜色 + 展开方式 + 发送方式, in three groups under a 卡片预览 card. **卡片颜色** is 蓝 / 黑 / 宣纸 — the AI reply card's theme and text rendering, with a live preview card so the choice is seen before it is saved. 黑 is the default since 2026-09-23 (the user's 「气泡调成暗色…主题应该跟背景颜色一致」), so the cards read as part of the panel's ground rather than as blue objects sitting on it. **展开方式** is 中心缩放 / 边缘缩放 / 幕布垂落 — how the notch sheet opens (see [Key Architecture Decisions](#key-architecture-decisions)); it renders no preview, because 「不需要提供预览，因为很难预览」. **All three names are the user's, and the third exists because the first was mislabelled**: what shipped as 中心缩放 was a scale animation that anchored the panel's *bottom* edge, so the sheet grew upward from the bottom-left — the user's verdict was 「这个不叫中心缩放，你这个叫边缘缩放…我给你提供的中心缩放是从刘海的位置向下弹出」. The behaviour was therefore kept under its true name (边缘缩放) and a real 中心缩放 was added beside it, anchoring the top edge so the panel grows down from the notch (2026-09-23). **发送方式** is 按 Enter 发送 (the default) / 按 Command + Enter 发送 — which key submits from the composer. Neither takes the other's key away: whichever is chosen, the other combination still inserts a newline, so a multi-line question can be written under either (the user's 「增加一个选项，即输入方式，或叫发送方法…提供两种发送方法，供用户根据个人习惯选择」). The page was called 卡片样式 — a page of its own since 2026-09-23, at the user's request 「必须在设置页面的左侧边栏添加一个“卡片样式”选项」, the picker having previously sat inside 对话与记忆 — and was widened to 交互样式 the same day when the window style joined it (「把设置页面的"卡片样式"页面调整为"交互样式"，里面包含两个选项：卡片样式 / 窗口样式」) | `AppSettings.json` |
| 模型 | the three roles and their providers | `ModelConfiguration.json` |
| Agent | 允许 Agent 后台任务、Agent 悬浮图标、Agent 完成时语音播报、Agent 权限（三档）、claude 命令路径、默认项目文件夹、最多同时运行 | `AppSettings.json` |
| 对话与记忆 | 记住最近多少轮对话、重启后保留对话、历史自动压缩、历史里带截图、回答长度、补充指令、系统提示词 — plus 清空对话记忆 and 恢复默认, actions rather than settings (卡片样式 moved to its own page 2026-09-23, and that page is 交互 now) | `AppSettings.json` |
| 听（识别） | **识别服务**（说话时用哪个识别：豆包流式 / 阿里百炼，2026-09-27 新增，默认豆包 —— 选豆包时这一页的「识别语言」「识别模型」都不生效，它读的是「录音」页那一套，两处的说明里都写明了）、识别语言、热词（专有名词偏置）、松键后等最终结果、静音自动断句（免按键连续对话）、录制期间自动静音系统扬声器，避免录入系统声音 — plus the 持续监听 group: 回答时持续监听、静音多久自动发送、监听时长、回声消除、**引擎保持时间**（`audioEngineIdleReleaseMinutes`，1 / 3 / 5 分钟 / 永久，默认 3，坐在「回声消除」下面——两项是同一件事的两面：一个决定引擎开着时付什么代价，一个决定它开多久） | `AppSettings.json` |
| 说（播报） | 播报方式（逐句快答 / 整段合成）、语速、播报音量、新提问立刻打断播报、长回答分段合成 | `AppSettings.json` |
| 看与截图 | 截图清晰度、截图压缩质量、多显示器发送策略、追问时自动截屏、说到“屏幕”立即截屏、回答里的位置自动飞过去指、圈选提问、单次回答字数上限 | `AppSettings.json` |
| 操作 | 允许 Wanna 操作电脑、允许打字和按快捷键、输入方式 — plus 辅助功能权限 (a status readout) and the 「它能做什么」 capability inventory (click / scroll / type / select / press / open / read the interface), an inventory of `MacosUseController`'s real branches rather than preferences | `AppSettings.json` |
| 快捷键 | 触发方式（按住说话 / 点两下说话）、松开立即发送（仅按住说话模式下生效）— plus the 说话快捷键 row, whose control is a click-to-record shortcut button (`ShortcutRecorderButton`), not a picker; the recorded combination is the setting — and the 「VoiceWeb 语音模式」 group: three mode shortcuts (三段式 ⌃⌥1 / 全双工语音 ⌃⌥2 / 全双工全模态 ⌃⌥3, each a `ShortcutRecorderButton`) plus the 三段式 「发送屏幕内容」 switch and the 全模态 语音/摄像头/屏幕 switches — and the 「音频引擎」 group: 「释放引擎」（`releaseAudioEngineShortcut` 是用户录的那一条，可为 nil；`releaseAudioEngineShortcutBinding` 把它解析成有效值——没录就用 ⌃⌥4 预设，和 `pushToTalkShortcutBinding` 同一个 resolve-once 形状），按一下立刻停引擎、关回声消除、解开对所有其他软件的音量压制 | `AppSettings.json` |
| 导出设置 / 导入设置 | not settings and not stored — the two halves of `SettingsTransferPage`, under the sidebar's 「导入导出」 section. They carry `AppSettings.json` **and** `ModelConfiguration.json` (the two halves of a working install) to and from a file the user picks, so a second machine can be brought up without re-entering the API key by hand. **The exported file holds the API key in the clear**, which is why the page says so on screen before writing anything and why the two pages draw no 保存 bar — there is nothing to save | — |

Every row is wired to real behaviour. The three model roles are the only settings outside `AppSettings.json`.

The one exception is 操作's 「辅助功能权限」, which is a **status readout plus a button**, not a preference: it shows whether macOS has granted Accessibility, offers 「去授权」 (raises the system prompt) and 「打开设置」, and re-reads the grant every 1.5 s so it turns green without a restart. It is deliberately outside the 3 the sidebar counts. Two reasons it exists at all: permissions need a reachable, always-working request path now that no separate permissions UI exists anywhere; and `MacosUseController` asks for it itself — the first `[CLICK:]`/`[TYPE:]`/`[PRESS:]` that arrives without the grant raises the system dialog once per launch and says so in `lastActionDescription`, instead of silently doing nothing.

Five settings need a subsystem rather than a flag, because a setting that saves but does nothing is worse than no setting:

- **「显示方式」** — whether the blue cursor is up all the time, only during a conversation, or only while pointing. It is the setting the app used to have and not honour: `isWannaCursorEnabled` (UserDefaults, default `true`) was the only gate, its only control was a commented-out toggle in the panel, and `scheduleTransientHideIfNeeded`'s first line read `guard !isWannaCursorEnabled && …` — so the transient machinery never ran once. It is now three settings in the 通用 page's 「蓝色光标」 group, and `CompanionManager.isBuddyShown` is what the overlay multiplies into everything it draws. See **Cursor Presence** below for why the overlay *windows* stay up and only the drawing is gated.

- **「重启后保留对话」 / 「历史自动压缩」 / 「历史里带截图」** — the memory pipeline. `CompanionManager` replays the last N exchanges as real conversation turns (each with its own screenshots when 「历史里带截图」 is on), compresses the ones that age out into a running summary, and skips all of it when the persistence setting is off. The summary is sent as a **second system message**, not appended to the system prompt — a drifted summary must not read as an instruction the user gave. **The replayed turns are the model's raw replies, action tags included, and only turns recorded since the companion could act are replayed at all.** Both halves of that are measured, not stylistic: the history used to store `spokenText`, the *tag-stripped* sentence, on the reasoning — written when `[POINT:…]` was the only tag and pointing was purely visual — that a stale coordinate would only confuse the model. Actions made the tag the record of what happened, so stripping it left every past turn reading as «user asked for something, assistant replied with a past-tense sentence and did nothing» — the exact shape the system prompt forbids, delivered in the `assistant` role, which is where the model looks for how to answer. Measured 2026-09-22 asking 「帮我点一下 7」: ten such turns → 「点了计算器里的 7。」 with **no tag at all**; **one** such turn → `[POINT:824,638:7 button]` and still no click; none → `[CLICK:700,700:7]` and a real click. A system message inserted before the live turn saying "those older entries predate your ability to act, do not copy their shape" did **not** help — the nearest demonstration beats any instruction about it, which is the lesson worth keeping. `ConversationHistoryEntry.recordedWithActionTags` is the fix: new turns write `true`, and the replay filters on it. It is the only predicate that needs no guessing, because a turn recorded before action tags existed *cannot* contain one, whatever its text says. Old entries are **not deleted** — they stay in the file and keep their place in the window, so nothing the user said is lost; they simply are not replayed, the compressed summary covers that stretch of context, and they age out on their own. `Bool?` with an absent key reading as nil, per the `decodeIfPresent` rule (E1). A reply that came back empty is not recorded at all: an empty assistant message is not a turn, and it teaches the model that silence is an acceptable answer.
- **「松开立即发送」 off** — confirmation mode. The transcript is held and shown next to the cursor instead of being sent, and a *tap* of the shortcut (under 0.6 s — see `confirmationTapMaximumDurationSeconds`) sends it. The tap rule is phrased in press duration rather than in what was said, because at release the recognition service has not yet returned this press's final transcript, so "did they say something this time" is not a question the release event can answer. An empty transcript never sends and never clears, which is what lets a user whose first attempt was not heard hold the key again without losing what they said.
- **「回答时显示文字」** — one bubble in the overlay showing **the AI's answer** (streaming, then the settled text). **It no longer shows the live transcript**: 2026-09-27, the user — 「用户在点击主 Agent 的快捷键的时候，他的鼠标的右下角**不应该**显示实时字幕，就在刘海的下面显示才对。鼠标右下角显示内容应该是用户发送问题出去、**AI 返回出来的这个结果**」 — so words you are speaking go to the notch's own row (`NotchListeningTranscriptModel`) and the mouse-side bubble is for results only. The old per-utterance feed (`showsLiveTranscript` 通用页那颗开关 + `liveTranscriptText = partialTranscript` in the dictation interim callback) is **deleted**, setting and all: one utterance's words have one home, and two homes necessarily fight (what the user saw was both showing at once). `liveTranscriptText` now has exactly one content writer left — confirmation mode (「松开立即发送」 off), which parks the held sentence beside the cursor so a tap can send it; that is read-back, not live display. An empty string is the single gate the overlay keys off, so in normal mode nothing is drawn while you speak beyond the waveform. **The bubble's TOP-LEFT corner is anchored to the mouse, not to the buddy, and never moves while the text streams** (2026-09-23, the 「卡片距离鼠标太远」 + 「左上角总是上下跳」 reports). The old placement was center-based — `.position(x: cursor.x + … + w/2, y: … + h/2)` fed by a one-frame-late `onPreferenceChange` size measurement — so two defects were structural: the anchor was the buddy (mouse + the 35/25 follow offset) + 10/18, i.e. ~45 pt right and ~43 pt down of the pointer, and the top edge oscillated by Δsize/2 on every streamed update, which the user saw as up-down jumping. The new placement is `Color.clear.overlay(alignment: .topLeading) { bubble }.offset(x: mouseAnchorPosition.x + 12, y: mouseAnchorPosition.y + 32)` (`conversationBubbleAnchorOffset`; the raw `mouseAnchorPosition` state is updated at every mouse-read site and carries NO follow offset). `.overlay` never contributes to layout, so the bubble draws at natural size while its position is size-independent — top-left fixed, card grows downward. `.frame(width: 0, …)` would have proposed 0×0 to the card and collapsed its `maxWidth: 340` layout; `Color.clear.overlay` is the idiom that keeps natural size. The +32 vertical clears the companion drawn under the default 「稍远」 follow distance so neither covers the other.
- **「回答文字多留一会儿」** — how long the answer bubble outlives the voice reading it. The reading time is not the user's to set: `scheduleAnswerBubbleClear(lingerSeconds:)` polls `bailianTTSClient.isPlaying`, which is true until the *last* chunk is done, and only then starts the user's linger. Clearing at `speakText` return instead — which is what the app did — showed the answer for the second or two the first chunk took to synthesize and removed it at exactly the moment the user began listening, because `speakText` returns when playback *starts*. Two consequences are deliberate: the streamed text is replaced by `spokenText` at that point, since the raw stream still carries the `[POINT:…]` tag and it would now sit on screen for seconds; and every path that takes the bubble over goes through `clearAnswerBubble()`, because a clear left pending from the previous answer would otherwise fire mid-stream and take the next one's opening words. `scheduleTransientHideIfNeeded` waits for the bubble too — the bubble is drawn *by* the cursor, so fading out during the linger would take the text with it.
- **「系统提示词」** — the base prompt itself, readable and editable, with 「恢复默认」 beside it. The stored property is `String?` and **nil is the meaningful value**, not a fallback: nil means "follow the built-in", so a later build that improves the default reaches a user who never opened the editor. Storing the shipped text as the property's default instead would freeze every existing install on whatever wording happened to be in the binary the day it first ran, and the only way out would be to ask the user to rewrite five thousand characters by hand — which is why `init(from:)` uses a bare `decodeIfPresent` with no `?? defaults` tail, unlike every other property in the file. The editor reads `customSystemPrompt ?? CompanionManager.defaultVoiceResponseSystemPrompt`, so it shows whichever prompt is actually in force and reading it never writes; 恢复默认 writes nil rather than a copy of today's text. That constant is `internal` for this one reader. The length line and 补充指令 still append *on top* of whatever the base is, so touching the editor does not silently kill those two settings.

`AppSettingsStore` and `ConversationHistoryStore` both follow `ModelConfigurationStore`'s shape exactly — `nonisolated`, `NSLock`-guarded cache, atomic write followed by `setAttributes([.posixPermissions: 0o600])` — because `.atomic` writes land as 0644 and every one of these files holds something the user would not want world-readable. Both live outside the repo, and both post a notification on change so the running app picks the change up without a restart.

### Key Architecture Decisions

**The notch is the only entry.** On a notched screen a `NotchWindowController` panel rests as an invisible black pill fused into the hardware notch (a black pill over a black notch is invisible *by design*), and a click on it expands the app's main floating sheet — sessions sidebar, conversation, embedded settings pages, plus 「退出 Wanna」 at the settings sidebar's bottom (the panel's quit button was the app's only one). **Only a click expands it.** Hover-dwell — a 0.35 s poll with a progress ring — was removed on 2026-09-22 at the user's request (「鼠标滑动触发太影响体验」): the pill sits inside the menu-bar band, so a cursor merely travelling along the menu bar kept yanking the sheet open. Click-only deleted the whole machinery: the 30 Hz `NSEvent.mouseLocation` poll, the growth-commit timer and the creeping silhouette that existed to make the 0.35 s wait feel alive, the ring, and the enter/exit hysteresis margins. What survives is the click hit test, which insets `restingPillFrame` by `pillClickHitMargin` (4 pt) — the one remaining reason a margin constant exists at all. `enablesNotchPresence` (通用 page) turns the subsystem off entirely — with the menu bar panel gone this leaves the app with no visible UI, which the row's description states outright. A machine without a notch (or with the subsystem off) can still be configured through the titled settings window fallback (`CompanionManager.openSettings`), which nothing invokes today but which is the documented recovery path. `playsNotchSoundEffects` gates the ported chimes (`SoundEffectPlayer`). Multi-session state lives in `ConversationSessionsStore` (`ConversationSessions.json`, migrated from the legacy file); `CompanionManager.conversationHistory` is now the *active session's mirror*, double-written on every append.

**Expansion is a user-picked style — 中心缩放 (the default), 边缘缩放 or 参考页's 02 幕布垂落; collapse is still its winClose (2026-09-23).** All three live behind 设置 → 交互 → 窗口样式 (`AppSettings.windowExpansionStyle`, `WindowExpansionStyle.notchBloom` by default because the user asked for it in so many words — 「并将中心缩放样式设为默认样式」), and **all three run the identical machine**: the window takes its final frame in ONE `setFrame` and the reveal is a Core Animation on the content hosting view, so none costs a single frame of main-thread work. That is not a coincidence to preserve by habit — it is the whole reason the first attempt was rejected. It took 参考页's **01 中心缩放** card literally — winScale .08 → 1 over 340 ms on `cubic-bezier(.22,.9,.3,1)`, transform-origin 50% 0 — and drove it as a per-frame `NSWindow.setFrame` on a 60 Hz `Timer` (`driveCenterScaleFrames`, since NSAnimationContext can only linearly interpolate two frames and *stretched* the sheet from its top edge instead of scaling it). **The user rejected that outright**: 「你刚才的效果比之前还要卡顿…现在是从左到右展开，展开过程中非常卡顿」 plus a reflow visible as the same line going from ten characters to eleven once the sheet finished opening. Both symptoms are one **category error**, and it is the lesson worth keeping: *every one of 参考页's twelve window animations is a `transform` or a `clip-path` — **not one changes an element's size*** — because both are compositor properties the GPU re-rasterizes per frame for free. Porting that to a per-frame window resize means the window rebuilds its drawing surface each frame, SwiftUI re-lays-out the entire 810×940 sheet each frame, and text re-wraps each frame. **Width being constant from frame 0 is what makes the re-wrap structurally impossible rather than merely tuned away** — true of the curtain (which never scales) and, once it is a layer transform rather than a window resize, true of the pop as well. The original fix was 参考页's own **02 幕布垂落** (`winCurtain`: `clip-path: inset(-44px -44px 100% -44px round 0 0 16px 16px)` → `inset(… 0 …)` over `.43s ease-out both`), which is exactly the shape the user asked for — 宽度从第一帧起固定，内容由上往下垂落. `beginExpansion` now sets the window to its **final** frame in a single `setFrame` (so x, width and the top edge are final from frame 0) and the reveal is a `CALayer` **mask on the content hosting view** (`installRevealCover` / `startCurtainReveal`), animating `bounds.height` 0 → H together with `position.y` topEdgeY → H/2 in one `CAAnimationGroup` on `CAMediaTimingFunction(controlPoints: 0, 0, 0.58, 1)`; the main thread does no per-frame work at all. **中心缩放 is the notch bloom — a mask expansion from the notch point, and NOT a transform** (`startNotchBloomReveal(on:expandedFrame:)`; the case was renamed `centerPop` → `notchBloom` on 2026-09-23, and a stored `"centerPop"` migrates to it through the String-based decode in `AppSettings.init(from:)` — decoding `WindowExpansionStyle` directly would THROW on the no-longer-valid rawValue and take the whole `AppSettings.json` down, so the raw value is read as `String?` first and matched by `rawValue`, unknown/legacy falling back to `.notchBloom`). The transform version was tried twice and rejected twice — 「修来修去，中心缩放这个设置跟边缘缩放没有任何区别，都是从左下角向上展开，而我要的是从刘海向下展开」 — because a transform-anchored reveal has TWO silent failure axes (the `CATransform3DConcat` order AND which view's flippedness the pinned edge reads), and fixing one left the other wrong. The redesign removes the whole class: it reuses the curtain's proven mask machinery, but the mask's `bounds` animate **0×0 → full frame** while its `position` animates **top-edge centre (the notch) → frame centre** in one `CAAnimationGroup` on `curtainRevealDuration` and `curtainRevealTimingControlPoints` — the sheet's top edge stays pinned under the notch for the whole animation while the visible area grows down, left and right simultaneously, which is the effect the user asked for in so many words. The opacity ramp rides a separate `CABasicAnimation` on the hosting layer under the same animation key with the same duration and timing function, so the pair still shares one clock. **边缘缩放 keeps the transform** (`startScaleReveal(on:expandedFrame:)`, added 2026-09-23 at 「把我刚才提供的中心缩放样式也作为一个选项」, trimmed the same day to a bottom-edge pin when the top-edge variant was deleted with the broken transform 中心缩放): a `CABasicAnimation(keyPath: "transform")` from `edgeAnchoredScaleTransform(scale: 0.08, contentSize:superlayerIsFlipped:)` to identity over `centerPopRevealDuration` (0.34 s) on `centerPopTimingControlPoints` (.22, .9, .3, 1) — 参考页's own numbers, which is where the 「弹开」 feel comes from. **Its compensation translation is derived, not tuned**: a layer's transform acts about its `anchorPoint`, so a point `p` lands at `position + T(p − c)`; requiring the pinned edge's midpoint `a` to stay put gives `d = (1 − s)·(a − c)`, which `edgeAnchoredScaleTransform` builds as `CATransform3DConcat(translate(d), scale(s))` — scale first — and the pinned edge is the BOTTOM one, whose offset sign is fixed in code rather than read from a view, because the same flippedness ambiguity that broke the old 中心缩放 lives in any top-edge reading. **Which way is "up" is the SUPERLAYER's flippedness, not the hosting view's own** — the only place flippedness is consulted is the mask styles' `topEdgeY` read (`presence.contentHostingView.isFlipped ? 0 : contentHeight`), the same proven read the curtain uses. Opacity **is** animated in 中心缩放 and 边缘缩放, and it is load-bearing rather than decorative: 参考页's own keyframe carries the ramp (`@keyframes winScale{ 0%{ transform:scale(.08); opacity:0 } … }`), and at 8% the sheet is a ~65 pt nub — without the ramp that nub pops into existence at the notch before it grows, whereas fading it in is what makes the sheet read as emerging from the notch instead of appearing at it. Three details are deliberate across all three styles: the reveal's geometry is expressed in the **final expanded frame**, because the cover is a sublayer and a sublayer's geometry does not follow its parent's bounds (and the window is still at resting size when it goes on); the model values are the **end** state, so a dropped animation leaves a fully revealed sheet and never a permanently half-drawn panel; and the reveal is torn off on *every* path out — `convergeOnExpandedState`, `convergeOnRestingState`, the start of `collapse` (so the winClose fade carries the whole sheet away) and its teardown branch — plus a `duration + 0.05` removal and a `duration + 0.25` watchdog, both guarded by `expansionGeneration` and `isExpanded`. `removeReveal` clears everything a reveal could leave behind — the mask (`installRevealCover`, all three styles — for 中心缩放 its animation is removed by key BEFORE the mask is nilled, since removing an animation from a layer that is already nil is a silent no-op) and, for 边缘缩放, the layer transform and the layer opacity, the model values its scale reveal is supposed to converge on — and removes the animation **by key** while doing it, and that last part is load-bearing rather than tidy: an explicit `CABasicAnimation` still attached keeps driving the presentation layer until it finishes on its own, so setting `transform` back to identity while one is in flight would visibly do nothing. A mask left behind would clip the sheet forever and a transform left behind would draw the whole sheet at 8% in a corner of its own window, which is why the method is idempotent and runs on every path that claims the panel is fully open or fully closed. **All three styles install the same zero-height mask first** — for 幕布垂落 and 中心缩放 that mask IS the reveal; for 边缘缩放 a cover works whatever the resize does to the hosting layer, whereas its natural zero state is a transform *on that very layer*, and AppKit re-syncing a layer-backed view's geometry during a frame change is not something that may be assumed to preserve a hand-set transform — so it drops the cover in the *same* transaction that installs the transform and sets the layer's model opacity to 1 (the animation's `fromValue` is 0, the model value is the end state), making the first presented frame the animation's `fromValue` rather than a hopeful ordering. The style is read **once** at the top of `beginExpansion` and carried through the whole expansion, so saving in the settings window mid-animation cannot turn one reveal into two, and `NotchSupport.expansionRevealDuration(for:)` / `expansionContentEntranceDelay(for:)` are the single style→timing mapping — a second switch inside the controller would say "how long the animation lasts" twice and leave a deadline that never fires. Collapse is unchanged (`centerScaleCollapse*`: scale 1.0 → 0.92 + window fade over 0.16 s ease-in) and is now the **only** caller of `driveCenterScaleFrames`, so the 60 Hz `Timer` runs only while a panel is closing. The one-animation-source rule survives where it still applies: `expansionProgress` still derives from the live frame on `windowDidResize`, so the SwiftUI silhouette cannot desync during a collapse. The sheet's content entrance is still 参考页's 'line' mode (+8 pt, 8 px blur, transparent → clear) at the style's own delay — `curtainContentEntranceDelay` 0.14 s, `centerPopContentEntranceDelay` 0.23 s; each is the delay 参考页 pairs with its animation, and pairing them the wrong way round draws the content in full while the panel is still half-grown, which reads as two unrelated animations — with a reduce-motion fallback. Two invariants the winClose fade added remain: the resting frame is restored **while the window is still transparent** (restoring it after alpha came back would show a visible frame jump), and `convergeOnRestingState` defensively restores `alphaValue = 1` + `hasShadow = false` so a skipped fade completion can never strand an invisible, unclickable pill.

**2026-09-26 — the expansion is now 「骨架先出、内容后到」, and it is measured.** The user's requirement (「我要的就是高速启动，最短时间、最高速…先给用户一个最短的反馈，然后那些会话这些东西你可以后续再使用后台去加载出来」) came from a measured fact: **the panel was invisible for as long as the active page's content took to build**, not for a fixed time. `sample` on the live process during four expansions (`开发经验/运行日志/wanna-展开采样-*.txt`) showed the main-thread time going almost entirely into *repeated* SwiftUI layout of the whole sheet tree (`NSHostingView.layout` → AttributeGraph update, 250–500 ms per pass), several passes per expansion: one for the content insert, one for the column width arriving as 0 and then as its real value (which rebuilt **every** answer card — 8 cards were planned 16 times), one for the scroll-to-bottom. **The tree's size is what every pass costs**, so the three pages measured Screen 410–433 ms, Agent 89–106 ms, Call 44–58 ms — exactly the user's 「Screen 最慢，Agent、Call 秒开」. The fix has three parts. (1) **`NotchPanelModel.isSheetContentReady`** — set `false` at the top of `beginExpansion` (and in `collapse`), flipped `true` by the reveal; while it is false `NotchSheetRootView` renders the content column as `Color.clear` and `HomeSpaceSidebarView(showsSectionList:)` draws its chrome (switcher, search, bottom row) but no list. The first pass therefore builds only the skeleton and is cheap; the heavy subtree is built one pass *later*, with the panel already on screen. (2) **The reveal is triggered by the skeleton existing, not by a guessed delay**: `NotchPanelRootSwitchingView.sheetDidAppear` (called from the `NotchExpandedSheetView` `onAppear`) → `NotchWindowController.revealExpandedSheetIfPending(on:)`, which does `removeReveal` + `isSheetContentReady = true` and defers `finishExpansionCommit` **one more tick** (it calls `NSApp.activate`/`makeKeyAndOrderFront`, which must not re-enter AppKit from inside a SwiftUI view update). The old `+0.05 s` timer existed to wait out the content build inside the same pass; it is now only a backstop (0.15 s), and the 1.0 s watchdog funnels through the *same* method — safe because `revealedExpansionGeneration` makes the reveal happen once per expansion, which is also what keeps the reveal chime from playing twice. Removing the cover inside `onAppear` is deliberate: that is the same CA transaction that draws the skeleton, so there is neither a frame of the blank 「空面板皮」 **nor** a transparent one. (3) **The double card measurement is gone**: `NotchHomeView.rememberedContentColumnWidth` seeds `contentColumnWidth` with the last measured column width (the sheet is always the same width), so `.id(contentColumnWidth)` no longer changes on open and the cards are built once (16 → 7 plans). `LazyVStack` replaced `VStack` in the conversation flow and in all three sidebar lists, for the user's stated scale worry (「未来窗口就是几十个、几百个」). Measured after, same driver, medians: **skeleton 19 / 17 / 14 ms** (Screen/Agent/Call), **content +63 / +46 / +41 ms** after it, **total main-thread busy 181 / 89 / 51 ms** (Screen was 410 ms). Verified separately that the flow still lands at the bottom (`scrollTo` against a lazy stack was the risk) and that the sidebar lists still appear. **Still open**: a card costs ~20 ms, a settled card still builds its full streaming machinery, and scrolling to the bottom materialises nearly every turn — so a session with hundreds of turns would still fill in slowly *after* the (now instant) panel. The next levers are windowing the flow (render the last N turns, extend on scroll-up) and a settled-card fast path.

**2026-09-26, second pass — the flow is windowed, and it was verified at 200 turns.** `LazyVStack` alone did not bound the conversation column: scrolling to the bottom materialises nearly everything above the anchor (measured: 7 of 8 turns), so cost still grew with the session. `NotchHomeView.renderedTurnCount` (initial 10, `renderedTurnExtendChunk` 20) now renders only the last N turns, and the flow's first child is a 「载入更早的 N 条对话」 button when older turns exist. **The button is deliberately explicit rather than a sentinel view's `onAppear`**: the lazy stack's prefetch materialises a sentinel on its own, which would extend the window, materialise the next sentinel, and cascade until the whole session was rendered again. Its action extends the window and then re-pins the previously-first rendered turn to the top (`Task { @MainActor }` + `proxy.scrollTo("entry-N", anchor: .top)`) — without that, inserting content above the viewport shifts everything down by the inserted height, since `ScrollView` remembers distance from the content's top. The residual is ~45 pt of shift; measured, not zero. **Verified with a synthetic 200-turn session** (`开发经验/运行日志/wanna-200轮规模*`): Screen measured 6 card plans and 167 ms of main-thread busy against the same build's 7 plans and 181 ms for the real 8-turn session — i.e. **flat in session length** — and the AX tree showed exactly turns 191–200 rendered, with the button appearing when the flow is scrolled to the top and loading 20 more on click. Two things that synthetic test cost, worth knowing before repeating it: the sessions file is decoded with `try?` (`loadFromDiskWithMigration`), so **one wrong type anywhere silently becomes "no conversations at all" and the app then writes that empty state over the user's file** — a `summary: null` and an ISO date string each did exactly that (real dates are `timeIntervalSinceReferenceDate` floats) — so any hand-edit of that file must copy an existing session's values and change only what is meant to change, and must be validated with the app's own model source before launching. The app's private active session being an empty 「新会话」 (all others archived) is a *valid* state that also prints 「restored 0 exchanges」, which is easy to misread as a decode failure.

**Same day, third piece — the reveal chime was costing 130 ms on the first open, and it is warmed at launch now.** `sample`ing the live process during four expansions put `SoundEffectPlayer.play(_:)` at **130 ms of main-thread time**: `warmUpIfNeeded()` builds an `AVAudioPlayer` (plus `prepareToPlay()`) for every chime in `SoundEffect.allCases`, and it ran lazily on the *first* play — which is `finishExpansionCommit` → `play(.notchRevealed)`, i.e. the instant the panel appears. `SoundEffectPlayer.warmUp()` (called from `CompanionManager.start()`, next to the `visionChatAPI` eager touch) moves that cost into launch, where it is invisible. Measured after: the first expansion of a launch went from **275 ms → 75 ms** of main-thread busy, and every later one from ~181 ms → **80 ms**, with the heavy content arriving 32 ms after the skeleton rather than 63 ms. **One more recurring cost was found in the same measurement and has since been fixed** (the fix is the paragraph below): `startPermissionPolling`'s 1.5 s timer used to call `refreshAllPermissions()` forever (not just until the permissions land), and each tick spent ~21 ms on the main thread — `CGPreflightScreenCaptureAccess()` measured ~150 ms of cumulative samples over a 22 s window. It is small, but it was a periodic stall that could land on a click, which is why it was fixed — with the coverage it existed for kept (a permission granted *after* launch, including a re-grant following a signing change). And the per-card cost (~20 ms each) is **SwiftUI's own layout, not our code** — the sample shows no `AnswerCardView` or `CardRenderPlanCache` frames at all, so a "settled-card fast path" in our code would not move it; the lever there is fewer/simpler subviews per card, against the layout invariants the card documents.

**The 1.5 s permission poll no longer runs forever (2026-09-26, at the user's instruction 「我没有闹钟，删除吧」).** It was a repeating timer, armed unconditionally in `CompanionManager.start()` and running from launch to quit, inherited from upstream where a menu-bar panel showed a row of live permission states — a panel this fork deleted. Every tick it read four permissions, **unconditionally rewrote all four `@Published` properties** (`ObservableObject` does not compare before publishing, so every tick invalidated each observer — and the observers include the *permanent full-screen overlay windows*, plus the whole sheet while it is open), and called `installCompanionPresenceIfReady()`. `sample` put ~300 ms of main-thread time inside that closure over a 22 s window, about half of it in `CGPreflightScreenCaptureAccess()`. **The polling itself was not deleted, because three real behaviours depend on it**: a permission granted *while the app runs* must install the overlay and the notch pills without a restart; the 操作 page's 「辅助功能权限」 row promises 「加完之后不用重启，这里的字会自己变成『已授权』」; and `refreshAllPermissions` is what starts the global push-to-talk monitor once Accessibility lands. What changed: the timer is **armed only while something is still missing** (`needsPermissionPolling` = not (all four granted && `isOverlayVisible`)), **invalidates itself the moment everything is in place**, and a `NSApplication.didBecomeActiveNotification` observer (`bindPermissionRefreshOnActivation`) re-checks and re-arms on every activation — which is exactly the moment a user returns from System Settings after granting. On a machine that is already set up the timer never runs at all; on a fresh install the behaviour is unchanged. Note the practical limit of measuring this: the poll's per-tick cost is below the 40 ms `[hitch]` threshold, so idle `[hitch]` lines will never show it — the way to see it is a `sample` grepped for `startPermissionPolling` / `refreshAllPermissions`.

**The 2026-09-23 UI 化改造 retuned the whole chrome to 参考页's design language** (「对整个刘海屏和鼠标做一次完全的 UI 化改造…完全仿照过来」). The DS token values were remapped to 参考页's palette: background `#050506`, surface1 `#18181C`, surface2 `#0C0C0E`, surface3 `#101014`, borders `#1D1D21`/`#2A2A2E`, text `#F2F2F4`/`#B9B9C2`/`#8A8A93`, accent `#0A84FF` with an `accentGradient` `#0A84FF→#7A5CFF` (135°) for identity tiles. The elevation hierarchy is deliberately INVERTED from the old "higher surface = lighter": 参考页's cards (`#0C0C0E`) sit **darker** than the window ground (`#18181C`), so surface2's role reversed. Shapes follow 参考页: buttons are 10-pt rounded rectangles (no more capsules) whose hover raises the border to `accent.opacity(0.6)` and the fill to `#101014`; icon buttons are 7-pt rounded squares (参考页's `.close`); the expanded sheet surface is `rgba(24,24,28,.94)` with bottom radius 16. The three content views' outgoing bubbles are solid `DS.Colors.accent` at 参考页's `.unit.user` geometry (corner 14, tail corner 4) — the violet gradient and white border are gone. Deliberately NOT converted: the light 保存 capsule (`DSPillButtonStyle` — the app's signature light capsule), `AnswerCardView`'s card-spec blue #0B57D0 (that card has its own reference spec), and the sheet's square top corners (notch fusion). `overlayCursorBlue` was aligned to `#0A84FF` so the cursor overlay shares the accent.

**First run needs no UI to click.** The menu bar panel used to host the first-launch flow (permission rows + a 开始使用 button). With it deleted, a fresh install auto-runs the flow in `CompanionManager.start()`: the four permission prompts are raised immediately, then `triggerOnboarding()` completes onboarding so the welcome animation and video play; the 1.5 s permission poll's `installCompanionPresenceIfReady()` puts the overlay up and installs the notch pills the moment the last permission lands — no restart, and it also covers a permission re-granted after a revoke (e.g. a signing change).

**Cursor Overlay**: A full-screen transparent `NSPanel` hosts the blue cursor companion. It's non-activating, joins all Spaces, and never steals focus. The cursor position, response text, waveform, and pointing animations all render in this overlay via SwiftUI through `NSHostingView`.

**Global Push-To-Talk Shortcut**: Background push-to-talk uses a listen-only `CGEvent` tap instead of an AppKit global monitor so modifier-based shortcuts like `ctrl + option` are detected more reliably while the app is running in the background.

**Shared URLSession for Streaming ASR**: A single long-lived `URLSession` is shared across all streaming transcription sessions (owned by the provider, not the session). Creating and invalidating a URLSession per session corrupts the OS connection pool and causes "Socket is not connected" errors after a few rapid reconnections.

**Provider teardown must never escape `self` out of `deinit`**: Every transcription provider serializes its mutable state on a private `stateQueue` and reaches it through `stateQueue.async { self… }`, so `cancel()` implicitly retains `self`. Calling `cancel()` from `deinit` therefore retains an object whose reference count has already reached zero. When that queued block is later released, the extra release over-releases `self` and the process dies with `EXC_BAD_ACCESS` inside `_Block_release` on the `stateQueue` thread. `BailianRealtimeTranscriptionSession` did exactly this and crashed immediately after every final transcript. `deinit` may only message objects directly (such as closing the websocket) — the owner calls `cancel()` explicitly on every teardown path.

**Normalized Point Coordinates**: Qwen's vision models rescale images internally before looking at them, so `[POINT:x,y:...]` values arrive on a 1000×1000 grid rather than in screenshot pixels. `CompanionManager.screenshotPixelCoordinate(fromNormalizedPoint:…)` performs the documented `value / 1000 × dimension` mapping before the display-point conversion. Skipping it fails silently, because a normalized value is indistinguishable from a plausible pixel coordinate — the cursor simply lands short.

**TTS Chunking**: Bailian's TTS endpoint documents a per-request character limit, so `BailianTTSClient` splits the response into sentence-aligned chunks, plays the first immediately, and queues the rest. This also means playback starts as soon as the first chunk's audio arrives rather than after the whole response is synthesized.

**TTS playback and continuous-listening capture still share ONE engine (`VoicePlaybackEngine`), and the system AEC (voice processing / VPIO) is ON again — it was removed earlier on 2026-09-23 for the ducking, and restored the same day at the mildest ducking level macOS offers, because the removal was what caused both the self-interruption and the slow barge-in.** Measured 2026-09-23: an `AVAudioEngine` input with `setVoiceProcessingEnabled(true)` marks the app as a "communication app" (the FaceTime/Zoom class), and macOS then DUCKS every other application's audio for as long as that engine runs. The ducking itself cannot be switched off (third-party tools like Unduck-Pro exist purely to fight it) but its LEVEL is configurable on macOS 14+ — `voiceProcessingOtherAudioDuckingConfiguration`, whose header documents the default as "disable advanced ducking, with a ducking level set to `AVAudioVoiceProcessingOtherAudioDuckingLevelDefault`" — so the level that caused the complaint was the DEFAULT one and `.min` sits strictly below it. (The history is worth keeping: the same-engine rule WAS correct for AEC — WWDC23 "What's new in voice processing", and VoiceWeb's README 技术要点 #1 as the browser equivalent — and AEC was verified genuinely working here, a loud 0.8-amplitude 440 Hz tone through the same VPIO engine driving the boosted mic level to 0.000. The rule was killed by its side effect, not by being wrong.) **What the removal cost, reported by the user the same day**: with no AEC the answer reaches the microphone raw while it plays (the recording mute has to lift so the user can hear it), and the recognizer transcribes OUR OWN ANSWER as perfectly real words. That one fact produced BOTH reported failures, in opposite directions — heard correctly, our words matched the text-level echo filter and were refused as a barge-in, so the answer kept playing over the user's real speech and interrupting seemed to need three or four sentences; mis-heard by a single character, the same words failed that filter's containment test, were taken for the user's, and the answer interrupted itself. No text filter can win that, because on a mixed signal the transcript is unreliable in both directions; the fix is to un-mix the signal. Apple's own sample for the ordering is `setVoiceProcessingEnabled(true)` followed by a ducking configuration (WWDC23 session 10235). 「回声消除」 (`AppSettings.echoCancellationEnabled`, default on, 听 page) is the user's way back out if their music dips.

**Voice processing comes with an ordering rule that cost every reply its first spoken segment until it was measured**: the main mixer node must be touched BEFORE voice processing is enabled, or `engine.start()` dies with `Code=-10875 ... PerformCommand(*outputNode, kAUInitialize, NULL, 0)`. Reading the mixer's output format is what instantiates it and wires it to the output node, creating the output audio unit; enabling voice processing then reconfigures the whole IO to the voice-processing hardware format (48 kHz / 9 input channels here, against 44.1 kHz / 1 channel before). With the mixer untouched, the output unit is instead created lazily *after* voice processing, comes up at the stale 44.1 kHz, and `kAUInitialize` fails against 48 kHz hardware. Measured 2026-09-23, four runs of one probe differing ONLY in which node's format was read first: nothing read → mixer 44100 Hz → -10875; input node read → 44100 Hz → -10875; **main mixer read → 48000 Hz → OK**; both read → 48000 Hz → OK. `VoicePlaybackEngine.warmUpMainMixerNode()` is that single read, called both before voice processing is enabled and inside `connectGraphAndStart` (the give-up-voice-processing fallback toggles the IO a second time, which leaves the mixer holding a format that no longer exists).

The recording mute is now the between-replies half, and the AEC covers the window it cannot: `SystemSpeakerMuteCoordinator` (the 听 page's 「录制期间自动静音系统扬声器，避免录入系统声音」, default ON, wired in `CompanionManager.start()`) mutes the default output device while `recording && !TTS-playing` — a 0.5 s poll over CoreAudio `kAudioDevicePropertyMute`, the device's prior mute state captured before the first mute so a speaker the user muted THEMSELVES stays muted, restored on recording end, on `willTerminateNotification`, and at the next launch via a UserDefaults leak flag if a crash left it muted. Silenced speakers cannot reach the microphone, so the user's request that other apps' audio stay out of the transcript is covered for every window in which nothing is playing; during playback the mute lifts so the answer is heard — which is exactly the window voice processing exists for, so between the two every window is covered and the ducking is only paid while an answer plays. The content-gated barge-in defences below remain in force underneath both. The engine keeps everything else: `BailianTTSClient` plays every chunk through it (`AVAudioPlayerNode` → `AVAudioUnitTimePitch` → mixer, WAV decoded via a scratch `AVAudioFile` and `AVAudioConverter`d to the engine format), it starts on demand and is released when idle (no tap, nothing playing) so the mic route isn't held open between replies, continuous listening installs its mic tap on THAT engine's input unconditionally (injected via `sharedVoicePlaybackEngineProvider`, set in `CompanionManager.start()`), and the own-engine fallback only serves the case where the shared engine is missing. **During the unmuted playback window the answer's own voice is the loudest thing in the room, and that makes the level a liar.** Because the engine is released when idle, each reply also begins with no prior state on the mic path; the boosted level crosses 0.25 the moment playback starts, and the level path used to fire. Measured from the app's own log (2026-09-23, archived as `wanna-before-bargein-fix.log`): **6 of 13 replies were silenced by an early barge-in — 46%, against the user's reported 40% — and all 11 level-triggered barge-ins carried an EMPTY transcript**, meaning the recognizer heard no words whatsoever; the only two ASR fires in the same run carried a lone 「嗯」. A converged echo measures 0.111 peak, BELOW the room's own 0.167 floor, and that is the proof no threshold can do this job: at its worst our own voice is the loudest thing in the room and at its best it is quieter than silence, so level cannot separate the two states — only content can. **Both readings were of a signal that had been through an amplifier, and finding that amplifier is what unblocked the port** (2026-09-24). `AVAudioIONode.h:228` — `voiceProcessingAGCEnabled`, "Enable automatic gain control on the processed microphone uplink signal. **Enabled by default.**" — sits AFTER the canceller, so the residual the canceller left was re-normalised back up towards speech level. That is why two readings of one signal differed by an order of magnitude and inverted in sign: the canceller measured 0.111 against a 0.167 room floor while the microphone this app reads reached 1.000. No threshold survives that — the 0.25 that separates speech from a quiet room reports "someone is talking" for the whole of every reply — and the recognizer consumes the same re-gained, clipped signal, which is what it turned into 「嗯。」/「哎」/「那」 off our own answer. `VoicePlaybackEngine.disableAutomaticGainControlOnProcessedUplink(on:)` turns it off; measured live after, the microphone peaks at **0.241** while an answer plays, and the echo diagnostic has not fired once. **A pipeline whose VAD and recognizer both read the canceller's own output never meets this** because its VAD and its recognizer both read the browser AEC's own output — the failure class it records as 坑 1 (实现方案/08-踩坑总表.md:11), "capture and playback must both travel through the AEC for it to work".

**With the microphone clean the interruption path is bar-free, which is the structural shape and not a compromise.** It had carried a four-content-character bar justified by pipecat's `MinWordsUserTurnStartStrategy` (`min_words = self._min_words if self._bot_speaking else 1`). **That justification was wrong: VoiceWeb never instantiates that strategy.** Its 三段式 builds its user-turn-start list from `VADUserTurnStartStrategy` and `TranscriptionUserTurnStartStrategy` alone (`server.py:3753-3754`), and neither carries any word, character or bot-speaking condition — `TranscriptionUserTurnStartStrategy` triggers on every `InterimTranscriptionFrame` outright, `enable_interruptions` being its only gate, and `llm_response_universal.py:1328` broadcasts the interruption with no `_bot_speaking` check on that branch. The bar exists in pipecat for deployments whose canceller does not keep the bot's voice out of the recognizer; VoiceWeb's does, and now this app's does. So the bar, the bot-speaking level refusal, the echo-of-answer filter as a behavioural gate, and the `continuousListeningDidReportEchoLevelRise` flag are all deleted. **But "bar-free" was only half of it, and the missing half is what broke the feature (2026-09-24).** Removing the bar had left the ASR interim as a turn-start source in its own right, and that is precisely the thing a VAD-segmented pipeline makes structurally impossible: VoiceWeb's cascade STT is `SegmentedSTTService` (`server.py:699`), which emits one final transcript per VAD segment and **never an interim** (`services/stt_service.py:906-918`), so a transcript cannot exist until the VAD has already ruled the user spoke; and even the final cannot fire a turn start, because `UserTurnController`'s only dedup is `if self._user_turn: return` (`turns/user_turn_controller.py:353`) and the segment's transcript lands in the same pass as the turn end, while `_user_turn` is still true. **In VoiceWeb the only thing that can interrupt mid-reply is the VAD's QUIET→SPEAKING transition.** On this app's free-running streaming recognizer the same strategy became the one hole in the wall: measured 2026-09-24, the canceller's residual made the recognizer guess 「噻」 and 「是」 at mic peaks of **0.214 / 0.241 — both BELOW the 0.25 level gate**, so the VAD was silent and only the transcript stopped the answer. No threshold can take that job (Silero rates a smeared echo of speech as speech at frac ≥ 0.7 of 0.90–0.94 against 0.89 clean, measured on the shipped ONNX model), so the fix restricts the SOURCE: `markContinuousListeningUtteranceActive` is now reached from the 50 ms VAD loop alone, the interim handler records the transcript and prints the echo diagnostic but never starts a turn, and real barge-in is unaffected (the user's speech measures 0.3–1.0 against 0.25). The same pass closed the other half of 坑 1 in `VoicePlaybackEngine.installInputTap`: `prepareCaptureHost` snapshots `isEngineStarted`, a network await (opening the ASR session) sits between it and the tap, and the window arms on the first-audio hook — so with a stale snapshot the tap could land on the **capture-only engine, which has no voice processing**, while the playback engine kept playing. The host is now decided at install time from the live state, and the playback engine wins whenever it is running. The level 0.25 / 0.35 s debounce still governs utterance **opening** — and may now interrupt as well; the calibration behind 0.25 is unchanged and still the reason for it. The silence-send (user-set, default 2.0 s) and the ≥4-character SEND bar are untouched. **0.25, not 0.06**: a 15 s quiet-room probe on the built-in mic + VPIO (formula RMS×10.2, smoothing `max(new, old×0.72)`) measured an ambient floor peaking 0.167, typical 0.09–0.11, so the original 0.06 sat BELOW the noise floor and the room itself read as speech (the 「即便我没有说话它也循环」 complaint); normal speech measures 0.3–1.0. **1.6 s → user setting, and the shortcut is the send marker.** The utterance-end silence is now `AppSettings.continuousListeningSilenceSendSeconds` (「静音多久自动发送」, default 2.0 s, clamped 1–5, snapshot into the window at arm time so a mid-window change never moves the VAD loop's threshold under it). The change came from the user's live test and their own framing (2026-09-23): "人类的思考可能是断的…没有办法通过等待两秒、三秒这样的方式来自动触发" — no single silence value can be the finished-speaking verdict, so **pressing the talk shortcut while an utterance is pending is the explicit "I'm done, send it" marker**: `CompanionManager`'s shortcut-busy branch checks `isContinuousListeningUtterancePending` BEFORE the interrupt branch — pending → `finishContinuousListeningUtteranceByShortcutSend()` (requests the final immediately, bypassing the silence wait), and only when nothing is pending does the press mean interrupt + exit listening. "Pending" there means the user has produced something the send could actually accept — not merely that the VAD or the recognizer reacted, both of which the assistant's own residual echo can trigger; the exact bar and the defect it fixes are in the `BuddyDictationManager.swift` entry. The auto path stays as the fallback and is surfaced in the 听 page so it can be pushed out of the way of the user's own pauses. The old 1.6 s number is dead as a constant; its history (1.1 s killed inter-sentence pauses into separate questions) is why the default is 2.0 rather than lower. **The final has a grace fallback, because the session can die silently**: a Bailian websocket can go down with "Socket is not connected" and deliver NEITHER a final NOR an error event (measured 2026-09-23 — the 「说完它也不回复」 complaint), so `requestContinuousListeningFinalTranscript` captures the latest interim, waits `continuousListeningFinalGraceSeconds` (2.4 s, the push-to-talk fallback's figure), then — generation-guarded so a stale grace task can never cancel a newer request — cancels the dead session and submits the interim as the final if it clears the 4-character gate. `handleContinuousListeningFinalTranscript` drops a late final with no pending request, which is what stops the replaced socket double-submitting the utterance. **4 chars, not 2**: an interjection hummed while listening (「嗯。」) transcribes to 1–3 characters and must not become a brand-new question. **The ASR path also carries an echo filter, and it is a BACKSTOP under the AEC rather than a defence in its own right** (2026-09-23, the 「AI 自己打断自己」 regression report): during the window when voice processing had been removed and the recording mute lifted during playback, the recognizer transcribed the app's OWN answer as real words, and those words clear the ≥4-char bar — so the answer interrupts itself. It was fixed with text first, and the user reported the SAME failure back the next time they used it, which is the lesson: on a mixed signal the transcript is unreliable in both directions, so a containment test can refuse a real question and accept a mangled echo. Voice processing is the fix; this filter stays underneath it. The fix is `continuousListeningTranscriptIsEchoOfSpokenAnswer(transcript:spokenAnswerText:)` in `BuddyDictationManager`: both sides are normalized to letters+digits only, and a transcript whose normalized form is CONTAINED in the answer currently being read aloud (`CompanionManager.spokenAnswerTextForEchoFilter`, set at both TTS feed sites — 逐句快答 per segment, 整段合成 whole text — cleared in `clearAnswerBubble()` so a stale answer can never mask a new question that quotes it) is echo, not user. Containment, not equality, because the recognizer delivers the cumulative utterance. **It is now a diagnostic and nothing else** (2026-09-24): with the ASR off the turn-start path entirely, a transcript no longer decides anything, so the filter gates no decision point — it fires a single log line per reply when the recognizer's text is contained in the answer being read, which is the regression signal that tells a reintroduced leak apart from a fix. Its own doc comment says the same thing it always did: on a mixed signal the transcript is unreliable in both directions, so containment can refuse a real question and accept a mangled echo, which is why it was never able to be the defence.

**TTS endpoint families are not interchangeable**: Bailian serves speech synthesis from two different routes and picking the wrong pairing fails with a misleading `InvalidParameter: url error, please check url` rather than anything that names the mismatch. Qwen-Audio-TTS / CosyVoice models (`qwen-audio-3.1-tts-flash`) live on `/api/v1/services/audio/tts/SpeechSynthesizer` and take `input.{text, voice, format, sample_rate}`; Qwen-TTS models (`qwen3-tts-flash`) live on `/api/v1/services/aigc/multimodal-generation/generation` and take `input.{text, voice, language_type}`. Voice names are model-family specific too — the Qwen-TTS name `Cherry` is rejected by Qwen-Audio-TTS with `[cosyvoice:]Engine error [411]`, whose correct voices are `yuxiaoyun_v3.1`, `yeqinghe_v3.1` and friends. Model, voice, body fields and path therefore have to move together. Alibaba's own list (`bl model code --model …`) is the way to tell which family a model belongs to: it emits the `tts_v2` websocket sample for Qwen-Audio-TTS and the HTTP sample for Qwen-TTS.

**A 403 on TTS speaks the apology, not the answer**: `speakCreditsErrorFallback(failure:)` reads a fixed Chinese apology through `NSSpeechSynthesizer` whenever the vision call or the TTS call throws, so a billing-side failure (`AllocationQuota.FreeTierOnly` — free quota exhausted with "use free tier only" still on in the Alibaba console) presents to the user as the companion repeating "抱歉，我这边出了点问题" no matter what they ask. The vision model is unaffected and answers correctly, which makes it look like a model problem when it is an account problem. The apology is kept — the user is waiting for audio — but the same error is now also recorded in `CompanionManager.lastErrorMessage` and shown verbatim as a dim line above the notch sheet's composer (tap to dismiss), so the actual cause is never hidden behind the apology alone. Check the account before touching the pipeline.

**Model configuration reads are per-request, never frozen at launch**: all three clients (`BailianVisionChatAPI`, `BailianTTSClient`, `BailianRealtimeTranscriptionProvider`) resolve their role from `ModelConfigurationStore` inside the request they are about to send, rather than capturing a URL/key/model in an initializer. This is what makes saving in the settings window take effect immediately, with no client rebuild and no "changed it but nothing happened" trap. Two consequences are deliberate: `BailianTTSClient.speakText` snapshots the role **once** at the top and reuses it for every chunk, so one answer can never be half-read in one provider's voice and half in another's; and a transcription session receives its `websocketURL` and `apiKey` as plain values, so a save landing mid-recording cannot produce a socket whose host and model disagree.

**The configuration layer is `nonisolated` on purpose**: the target builds with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` and `SWIFT_VERSION = 5.0`, so an unannotated type is main-actor-isolated. Everything in the configuration path — `ModelConfiguration`'s value types, `BailianConfiguration`, `AppBundleConfiguration`, `ModelConfigurationStore` — is therefore marked `nonisolated`: the value types have no shared mutable state, the store guards its one cache with an `NSLock`, and marking them keeps a configuration read from having to hop actors. Without the annotation the compiler flags the store's use of these types, since `nonisolated` on the store alone does not extend to the types it touches.

**The settings window must call `NSApp.activate()`**: this is an `LSUIElement` app, so it is never the active application on its own. Without activating first, the window appears but never becomes key — and a non-key window's text fields silently swallow every keystroke, which looks exactly like a broken form. The controller also needs both a strong reference (held by `CompanionManager`) and `isReleasedWhenClosed = false`; either one alone gives a crash on close or a vanished window.

**Deleting a provider never hands its roles to another provider**: `ModelSettingsViewModel.removeProvider(withID:)` unassigns the roles it served and leaves them unassigned. Silently reassigning would start sending the user's screenshots to a company they did not choose. The confirmation dialog names exactly which roles will stop working before the deletion happens.

**Cursor Presence**: The overlay *windows* are permanent — they are built once when onboarding is done and permissions are granted, and never torn down. What the three 显示方式 modes control is whether the companion is *drawn*, through `CompanionManager.isBuddyShown`, which `OverlayWindow` multiplies into the triangle, the waveform and the spinner. Rebuilding the windows instead would flash, lose `cursorPosition` (it is only initialised in `onAppear`), and dismantle the onboarding video player. Three details are deliberate. The fade animation is keyed to `isBuddyShown` **alone**, so 「只在指位置时出现」 shows the companion the instant a flight starts rather than materialising mid-arc. The waveform and spinner are gated only on the voice state, never on `buddyIdleAppearanceIsAllowed` — hiding them too would mean recording with no feedback at all. And onboarding forces the presence factor to 1, so the welcome animation never plays to an invisible companion. `isOverlayVisible` keeps its original meaning ("the windows exist") — it was once what a menu bar panel's status row read, which is why it is no longer used as a status signal anywhere: with permanent windows that value is always true.

**Cursor Shape and Follow Distance**: `ArrowCursorShape` draws the macOS pointer with its **tip at `rect` centre**, matching `Triangle`, so `.position(cursorPosition)` means the same thing for both and no anchor correction is needed. `CursorFollowDistance` replaces the four hardcoded `+35 / +25` sites — the `init` default, the `onAppear` placement, the per-frame follow in `startTrackingCursor`, and the landing point in `startFlyingBackToCursor`. Missing the last one makes the companion fly back to the old spot and then jump. The pointing offset in `startNavigatingToElement` (`+8 / +12`) is deliberately untouched: "rest beside the element" is a different idea from "follow the mouse".

### The 长录音 subsystem（转写 + 自定义风格）

**一个和语音管线零共享的独立子系统**：按住快捷键开始录、再按一次结束，音频和文字边录边落盘。用户对这个功能的硬要求是「独立接线，跟当前整个面板里任何功能都没有关系」—— 所以它有自己的 `AVAudioEngine`（`BuddyDictationManager` 只有**一份**连续监听窗口，共用必然串台）、自己的状态、自己的快捷键。刘海是唯一共享的东西，而那是**画布不是状态机**。

**四条腿撑起「3 小时不断」，缺一条都站不住：**

1. **连接是可替换的。** 单次连接能活多久官方**没有给上限**（这一点专门查过），所以设计上不依赖它 —— 每 `recordingRotationMinutes`（默认 20 分钟）在**静音处**换一条，加上**间隔两倍的硬上限**。硬上限是必须的：只有「静音才换」的话，连续说 20 分钟、中间从不停顿 1.5 秒的用户永远不会轮换，连接就无限跑下去。小时版按音频**时长**计费、不按连接数，所以轮换不额外花钱。
**而且判重窗口每一场录音都必须清零** —— 它只在 `reconnect()` 里被写过，而每一场录音服务端的时间轴都是从 0 重计的。少了这一步，**第一场重连之后每一场录音开头 N 毫秒识别到的字都会被当成重喂的重复丢掉**，用户看到的就是「按下录音后整整 8 秒屏幕上一个字都没有」（N = 8 秒环形缓冲 ≈ 7898ms）。诊断行打在客户端、丢段发生在它下游一层，所以日志里会同时出现「2 秒就到了字」和「屏幕全白」—— 查这个 bug 时一度量在了截断点的上游，量出来的数字自然是一切正常。

2. **接缝是缝上的，不是假设干净的。** 硬上限让接缝可能落在句子中间，而「静音处无词可丢」正是原来唯一的依据。所以保留最近 8 秒音频，重连时**先重喂**，再用**服务端自己的毫秒时间戳**把重喂那段回来的文字丢掉。用时间戳不用文本：重喂的段会被重新识别、用词不同，只有毫秒位置稳定。宁可重、不可丢 —— 重复有确定的方法识别，丢掉的词没有任何办法找回。
3. **音频直接落盘，永不进内存。** 345MB 攒着必然出事。而落盘的就是上行的字节流（同一个重采样缓冲），所以 `.wav` 可以原样重放给服务端、完整复现一次识别 —— 3 小时的问题只能靠这个性质调试。
4. **文本的运行时开销与会话长度无关。** 磁盘是真相、内存只留「当前句 + 一个滚动窗口」。3 小时的文本塞进一个 `@Published String`，每来一个字重排整串 —— 那是这个仓库在回答卡片上已经踩过一次的坑。

**第五条腿（2026-09-26 加）：「设备哑了它自己换」。** 上面四条保的是「连接不断」，但录音还可能**一个字节都录不到** —— 而那是系统层面的事，本进程防不住。实测（2026-09-26）：内置麦会被**别的软件**搞成「对谁都只给数字零」，之后连 `AudioOutputUnitStart` 都返回 `kAudioHardwareNotRunningError`（`AudioHardwareBase.h:155`，四字符码 `'stop'`）；而**同一时刻、同一份代码**，iPhone 连续互通那个麦克风录得到真实声音（峰值 984/32768，188 块零 0 块）。所以起采落在一条**候选队列**上（`inputDeviceCandidates(for:)`：用户选定的 → 系统默认 → 其余真设备），看门狗报警时 `LongFormAudioCapture.switchToNextCandidateDevice()` 顺着队列往后换，**同一场录音不断、用户无感** —— 实测 1 秒内换完（`AUHAL 已启动 · 设备=iShotAudioPlugin` → `⚠️ 连续 90 块` → `🔁 输入设备已自动换到「MacBook Pro麦克风 [id=91]」` → 这一场照样转写落盘）。判据是**精确的零**，不是「安静」：健康设备永远有底噪（安静房间 188 块里只有 0~3 块全零），坏设备是一个 bit 都不动（187/187 块全零）—— 所以「连续 90 块全零」只有一种解释，而它 ≈ **1 秒**（块速率实测 **90 块/秒**：850 块跨 9.386 秒；原来的注释写「一块约 100ms、100 块 ≈ 10 秒」，**错了约 9 倍**，连给用户看的那句「连续十秒」一起错）。两处刻意的分寸：**用户明确选了设备就只报不停**（虚拟环回声卡「没人往里送声音时就是零」是正当用法，替他停是帮倒忙），没选过（跟系统默认）而候选全死才收尾并说明（这一场注定是空的，让他录 20 分钟静音再拿到一个 0 字更糟）；说不清时**点名** —— `AudioInputDeviceCatalog.processesCurrentlyCapturingInput()`（`kAudioHardwarePropertyProcessObjectList` + `kAudioProcessPropertyIsRunningInput`）报出此刻正在开麦的 App，实测那段时间里唯一为真的就是第三方听写软件 `闪电说`，而「谁占着」正是用户唯一能立刻行动的信息。**而且必须记住：AUHAL 不是这一类的解药。** 早先的结论是「`AVAudioEngine` 被进程级聚合体污染，改用 AUHAL 绕开就好」，当天的实测把它推翻了 —— AUHAL 一样拿到全零、一样起不来，因为坏的是**设备**本身，而且**跨进程**（全新进程、`ffmpeg`、App 自己都只拿到零）。AUHAL 修的是「引擎会重绑设备」那一类，设备被人搞死这一类只有靠换设备自愈。

**`result_type` 必须是 `"single"`，这是长会话能不能跑下去的分水岭。** 默认的 `"full"` 每帧回**整场累积**文本，实测 28.6 秒时每帧已 ~150 字且随会话线性增长；3 小时是它的 377 倍，也就是每秒重下上百 KB 冗余。`"single"` 只回当前这一段，每帧稳定在 1.8–2.1 KB。

**录音历史里每一行都有「重新转写」（2026-09-26）。** 用户要它的理由：「网络问题或者其他的问题，他可能是断开了，然后用户可以通过这样的历史点击重新进行一个重新撰写。」它走的**就是录音那一条链** —— 同一个 `VolcengineRealtimeASRClient`、同一份设置解析出来的配置、同一个 `LongFormTranscriptWriter`，只换了音频来源：`.wav` 的 44 字节头跳过去（`RecordingAudioWriter` 落盘的就是上行缓冲的原样副本，所以不需要转码），100ms 一块喂，最后发末包。音频被保留天数清理掉之后那颗按钮不画（识别器的输入就是那个 `.wav`）。**唯一一处实测逼出来的参数是喂的速度**：`retranscribeChunkPacingMilliseconds = 20`（5 倍实时）。0（尽快喂完）会让服务端**静默跳过中间整段** —— 实测同一条 49 秒的录音，`上行 1523KB`（全发出去了）而服务端自报位置只有 `662ms`，定稿 1 段 15 字（内容是录音尾巴）；改成 20ms/块之后自报位置涨到 29.7s、5 段 114 字，与录制当时那份 `.jsonl` 逐句一致。两条分寸：**旧的转写改名留档**（`.txt`/`.jsonl` → `.superseded`，且**两个都要先清掉**再 move —— 目标已存在时 `moveItem` 是失败的，第二次重跑会留下 `.txt` 新、`.jsonl` 旧的错位，实测踩到并已修），**跑的时候写临时名**、跑完才顶替。测量与两条教训见 `开发经验/15-录音采集与设备自愈.md` 九、`开发经验/09-实测数据.md` §18.7。

**转写完成后可选地走一次「自定义风格」**：勾选中的风格提示词 + 转写原文（+ 可选的屏幕截图）拼成一次请求，回复就是最终内容。**没勾选任何风格、也没勾截图时一步都不走** —— 不建请求、不动文本，和这个功能不存在时完全一致。提示词按用户定的形状组装：**标签在上、内容在下**，`<rules>` 里是要遵守的要求，`<transcript>` 是要处理的材料，截图居中并明确标注为「理解内容的参考，不要描述这张图」。

**这一步最大的开销是模型的思考，不是网络。** `deepseek-flash` 是推理模型，`thinking: {"type": "disabled"}` 是必须发的 —— 这个仓库自己量过那笔账（视觉那条路上 4.5 秒的请求里 3.4 秒是思考）。润色是改写任务，那段思考用户一个字都看不到。实测关掉之前一次 23 秒、一次 8 秒，关掉之后是 1 秒量级。

**刘海 UI 是一块独立面板，不是刘海窗口的子视图** —— 刘海窗口的高度只有刘海加一点余量，而转写那一行挂在刘海**下面**，画进去根本看不见。**而且窗口尺寸建好一次、永不改变**：它是透明窗口、黑色靠 SwiftUI 画，几何在 CA 提交**之前**就改了，中间那一瞬新露出来的区域是空的、桌面会透出来。收起时多出来的透明区靠 `ignoresMouseEvents` 让开，两翼的点击走全局监听。

**滚动那一行反复出问题的根因只有一个，值得单独记住**：它的位移是 `可用宽度 − 文字宽度`，所以**只要文字变短，屏幕上就向右跳**。这条决定了三件事：显示源必须**只增不减**（`transcriptPlainText + livePartialText`，不是那个被 `suffix(90)` 截过的行）；窗口上限必须带**迟滞**（160↔220 先长后裁，否则上限本身就把窗口变回了定长窗口、宽度恒定、`onChange` 不触发、动画再也不被调度）；窗口**必须能长**（`suffix(N)` 永远会饱和，而汉字 advance 完全相同 —— 实测 14.883268pt，纯中文 64 字窗口恒为 952.53pt —— 所以定长窗口满了之后「前掉一个后进一个」宽度一个 bit 都不变）。

**交互规则**（用户逐条定的）：粘贴**只发生在**「窗口没开 + 按快捷键停止」；其余一律**只进剪贴板**，且挂在**关窗**这个唯一收口上，保证没点过复制的也不会丢。ESC 分两档 —— 有活在跑时是「取消整件事」（录音和已转写的部分都保留，因为用户可能只是误触），都停了才是「收起窗口」；顺序不能反，否则用户会以为没生效。取消的闸门是 `cancellationGeneration`：润色正卡在网络请求里时，取消是从**另一个入口**按下来的，两者不在同一条任务链上。

**录音不再靠人发现故障：三层防线（2026-09-26，用户要求「一个非常稳定的方案…我不希望再出现问题」）。** 触发这条要求的是当天那次故障：系统把内置麦克风重挂了一次（`[id=88] 1 声道` → `[id=91] 3 声道`），顺手把它的**输入音量留在 0.275**（那条滑杆是指数式的，约 -30dB）。症状形状值得记住：**设备照常出样本、一个 bit 都不零**，所以「连续精确零」那条看门狗一次都没响，整场录音从 App 的角度完全正常 —— 用户唯一的感觉是「字幕卡顿、转写不出来、像只录了一句」。用探针量过两侧：改之前 28/32768，改之后 1868/32768（×67）。**App 从来不写输入音量**（它只对输出设备做静音），所以这不是它弄坏的，但它必须能发现。三层：

1. **起录前体检**（`preflightInputDeviceCheck`，在 `startRecording` 里、`capture.start()` 之前）：读绑定设备的静音/音量/声道，静音就打开、音量低于 `lowInputVolumeThreshold` (0.5) 就调到 1.0，并在诊断日志里留一行「设备=… · 音量=… · 静音=…」；**设备与上一场不同时单独记一行「设备变了」**（当天那条 `1 声道→3 声道` 的变化，当时只能靠人一行行翻日志才看出来）。**验证**：注入 0.30 → 日志出现 `🩺 输入音量只有 0.30（衰减约 12dB），已调到 1.00`，音量回读 1.000，第一个音频块峰值 0.039。
2. **录制期间每 5 秒复查一次输入音量**（`startInputGainWatch` → `checkInputGainDuringRecording` → `healInputGainIfNeeded`，读+写都在 detached task 上）：**主判据是音量本身，不是电平** —— 这条分工是被实测逼出来的：把音量打回 0.20 之后房间底噪的窗内峰值是 0.004~0.005，而真故障时（用户在说话）只有 0.002~0.003，两者**交叉**，所以任何电平门槛都只能当"去看一眼"的触发器。这条表**只在录音期间存在**，第一个 tick 自查 `phase`、不在录了就把自己停掉（当天刚拆掉一张"从启动响到退出"的权限表，不能再留一张会忘记停的）。例行复查**只在真的改动了什么的时候才说话**，否则每 5 秒一条"一切正常"会把真正的告警淹掉。**验证**：录音中途注入 0.20 → 5 秒内出现 `🩺 录制中例行复查 —— 输入音量只有 0.20（衰减约 14dB），已调到 1.00`，回读 1.000。
3. **录完一个字都没有就说一声**（`finalize` 路径里 `text.isEmpty`）：判据取「一个字都没有」——真在说话的人不可能一个字都不出（识别器连「嗯」都会出），所以几乎不会误报。**验证**：3.6 秒与 28.4 秒两次空录音都出现 `⚠️ 录音结束但一个字都没有（N 秒）`，并在设置页留下说明。

还有一条**次级**触发器：`onAbnormallyQuietInput`（连续 2 个 1 秒窗口的峰值都低于 `quietWindowPeakThreshold` 0.006）→ 走的是与第 2 层**同一个** `healInputGainIfNeeded`，所以动作路径是一样的；它独有的价值是"音量正常但设备交付的声音很小"那一种（盖住麦克风、离得太远）会留下一行日志。**这条触发本身没有被单独观察到**（确定性复查先修好了，见上），如实记在这里。同一天补的还有两件相邻的事：`AudioInputDeviceCatalog` 多了输入侧的音量/静音读写（`inputVolume` / `isInputMuted` / `setInputVolume` / `setInputMuted`，写完都回读确认 —— 返回 noErr 而值没变的设备是存在的），以及探测工具两条：`scripts/recording-capture-probe.swift`（格式）与 `scripts/recording-hal-amplitude-probe.swift`（**样本振幅**，格式对而样本全零时它才是判据）。

**「录音 → Notion 笔记」那一整套 2026-09-27 整块搬去了主 Agent 的快捷键 —— 录音这边一段都不剩。** 用户的原话：「你把这个相关的代码照搬过来，从录音这块剥离出来。就让录音的工程……录完音，然后润色就完事了，把它功能简单一点。但是把这个关键词识别，包括后端的代码的监听，完整这套功能转换到这个主 agent 的快捷键」。所以录音这条路的收尾**只有一条**：原文进剪贴板 → 按设置决定粘不粘 → 收带子；没有关键词、没有参考材料、没有那几颗按钮、没有「保存中」那个第三态（`NotchRecordingBandView` 现在只有两态：在录 / 展开看转写）。搬走的东西落在三个新文件里（`NotionNoteDetector` / `NotionNoteSession` / `NotionNoteButtonRow`），设置页那一节（`RecordingSettingsView` 的「Notion 笔记」）**没搬** —— 它现在配的是主 Agent 的行为，位置还是设置 → 录音，这一点是这次搬迁留下的别扭，见 `开发经验/17-大调整-主Agent接管执行.md`。

**这一条路不是这个目录唯一的来源**（2026-09-27 起）：主 Agent 的**每一条指令**也落成同样形状的
一份（`AgentTurnRecorder`，见下面《主 Agent 的每一条指令都存成一条录音》）。两边**共用**的是
`RecordingAudioWriter` / `LongFormTranscriptWriter` / `RecordingLibraryStore` 这三个组件、
16 kHz 单声道 PCM16 这套格式、以及 `makeSessionID()` 这个 id 形状 —— 所以设置 → 录音 的历史、
播放、重新转写、在访达中显示对两个来源一视同仁，而**长录音这条路的代码一行都没改**。

### 主 Agent 说话时刘海下面那一行字幕（2026-09-27，接线图第 2、3 条）

**一句话记住这一节：主 Agent 说话时屏幕上的那一套，是录音子系统的完整重复。**

**2026-09-27 又加了一块「任务方向看板」**（鼠标右上角，与右下角的结果卡片对照）：说话期间每 3 秒
（**只在识别文本变多时**）拿主 Agent **逐字相同的系统提示词**问一次「你怎么理解这次任务」，
回来说的一段话显示在板上，另外六个方向格子里**预设关键词命中的那格直接用预设短语**（本地匹配，
不花请求）、没命中的行才让 AI 写一个 ≤12 字的短语；用户点确认的方向会在提交时以
`<user_intent_tags>` 块**加在用户原话之前**（只进提示词，不进历史与界面）。
显示判据**与刘海那行字幕同一条**（`notchBandSitsAboveTranscriptLine`），面板是可点击的那一种
（配方 = `AgentHUDController` + `canBecomeKey`，`becomesKeyOnlyIfNeeded` —— **显示时绝不抢 key**）。
全文见 `开发经验/20-任务方向看板-完整方案.md`（**读一篇就够的那一篇**：需求 → 设计 → 实现 → 验证）
与 `开发经验/19-任务方向看板.md`（逐版时间线与根因）；**全部设置**在 设置 → 操作 → 任务方向看板。

**第六版（2026-09-27 深夜，用户八条要求）**：方向不再是代码里的"3 类 × 2 按钮"，而是
**一个文件**（`~/Library/Application Support/Wanna/TaskDirections.json`，0600）里的
「关键词 + 一句描述」清单 —— 出厂 12 条从主 Agent 提示词提炼、用户口述的追加、
**每天中午 12 点**复盘扫最近 7 天对话再追加（只改这一个文件、去重、不轮询）。
判断**不再用大模型**，改用 **Jev 决策模型**（`JevDecisionClient`：一条方向一道 `noul` 题、
回的是概率、一次约 $0.00003）；那段"AI 的理解"也只用「方向清单 + 用户的话」写（约三百 token，
不是五千）。选中过的方向**钉住编号与位置**。字幕卡顿的根因是**每帧拿整串去问 NSString 有多宽**
（采样：body 的 44 个样本里 40 个在那里）→ 改成**增量量化**（+ 黑带摘成独立视图），
修后同一采样 body 44→18、width 40→13、黑带 0。

**它当天下午就被改成了第二版**（用户看完第一版当场提的）：「**根据用户的内容**来去选择到底显示哪一个
卡片……而不是直接就显示」+「没有说话的时候它不应该显示」+「每一行标一个序号」+「可以通过**口述**
的方式……第二个方向，它就自动高亮」。所以现在：**只显示他说到的那些方向**（本地关键词命中，或 AI 给了
标签；一个都没说到就整块不出现）、**说出字了才出现**（判据 = 刘海那行字幕有字，60 行那句"没说话也挂着"
就是这么来的）、每格**连续编号**且点/说都认（「第 N 个方向」，中文数字也认）、类别 1…5 类可改、
**左下角钉住 + 方向区往上长**（说明区与输入框高度固定）、每次请求带上**上一次模型的完整回复**。

**第三、四次调整**（同一天）：发送节奏加第三条闸门 —— **新增 ≥10 字（标点不算）才发**
（用户：「相当于这句话还没说完」；10 这个数在 设置 → 操作 可调，5…20）；以及**总闸门「取消看板」**：
最下面一行**暗红三列**（取消本次 / 取消十分钟 / 取消今日），也可以直接说「取消任务看板」或
「取消任务方向」（**连续子串**，不是模糊匹配 —— 只说「取消任务」不算）。取消之后**定时检测停掉、
不发请求，但录音照旧**；「取消本次」靠 cycleID 判定（新循环自动恢复），「取消今日」到**明天凌晨 0 点**
为止；**全程不轮询**（一个布尔 + 一次日期比较，每个大循环看一次）。（用户 2026-09-27
的原话就是「备注这个主 Agent，**完整的重复**」。）逐件对：

| 屏幕上的东西 | 两家共用的实现 | 主 Agent 这一侧 |
|---|---|---|
| 刘海那条黑带（两翼 + 中段） | `NotchSupport` 的同一批几何（`leadingWingWidth` / `bandSegmentOverlap` / `wingBandWidth`） | 画在**刘海面板**里（`NotchPillRootView` / `NotchExpandedWingBand`） |
| 刘海下面那一行滚动字幕 | `NotchTranscriptLine` + `SmoothRevealedTranscriptText`（同一个文件 `NotchTranscriptMarquee.swift`） | 同一行，只换数据源 |
| 点开之后的转写编辑窗 | `NotchExpandedTranscriptPanel`（同一份排版、材质、圆角、⌘S/⌘Enter） | 同一扇窗，改过的字顶替这一句发出去的话 |
| 每一条都存成一条录音 | `RecordingAudioWriter` / `LongFormTranscriptWriter` / `RecordingLibraryStore` + 16 kHz 单声道 PCM16 + 同一个 `makeSessionID()` | `AgentTurnRecorder`（每一轮一条，音频寄生在既有 tap 上） |

**唯一的差别是"谁在驱动"**：录音那条是 ⌥C 起的**独立子系统**（自己的引擎、自己的状态机、
"跟面板里任何功能都没有关系"，用户对它的要求就是这句），黑带与字幕画在**它自己那块面板**里；
主 Agent 这条挂在说话快捷键那条语音管线上，**由相位驱动**（`== .listening` 就有），
画在**刘海面板**里 —— 这也是 2026-09-27 那一串「接缝 / 动画 / 窗口高度」问题全出在这一侧的原因：
它借用的是刘海那块本来就有一堆不变量的窗口。

**第五版（2026-09-27 深夜）：卡片固定四段，两个静默 bug 的根因都量到了**（用户：「整个卡片分成四段：
上面那段是**选项**，中间那段是**任务结果**，下面那段是 AI 对任务的理解，最下面是用户的输入……
理解是**有格式的**，软件 / 文件 / 目标 / 类型 / 细节，换行显示，可以显示为多行。用户输入默认
可以输入**三行**」）。现在卡片从上到下是：编号方向格（多列，最多 5 列）/ **任务结果**（绿框「结果」，
**模型算不出来就整行不写**）/ **理解五行**（标签定宽 26、值可换行）/ 三行输入框 / 暗红三列取消。
两处根因都值得记住，因为它们都是**静默**的：

1. **「细节」写到一半断在「题目在屏幕右」** —— `cleanParagraph` 的 **200 字上限是"显示"那一层的**
   （看板上那块地方就这么大），却被用在了**模型回的原文**上，于是解析拿到的是被砍掉尾巴的文本。
   `cleanRawResponse`（只去引号空白，**不截断**）现在给解析用，`cleanParagraph`（200）只管显示。
2. **卡片最下面那行被屏幕下沿切掉** —— `NSHostingView.updateAnimatedWindowSize`（← `windowDidLayout`）
   **按内容改窗口尺寸、并且保持顶边**，于是内容每长高一点窗口就往下长一点：
   实测 672,330,680×220 → 672,184,680×147 → 672,135,680×196 → **672,-7,680×338**（y 是 AppKit，-7 = 底边出屏）。
   **`sizingOptions = []` 在这块面板上挡不住**（同一个配方在录音带面板上有效；差别是这块卡片的根视图带
   `GeometryReader` 偏好；`scripts/panel-sizing-probe.swift` 把三个变量各跑了一遍）。修法是**不跟它抢尺寸**：
   **尺寸归 SwiftUI、位置归我们** —— 订阅 `NSWindow.didResizeNotification`，每次改尺寸后
   `repositionForCurrentSize()` 用「锚点 + 夹进屏幕」重算原点（只改原点，所以不成环）。
   用户要的「左下角固定、内容往上长」正是这一下的净效果。
3. 顺带记一条**测量陷阱**：**显示器睡着时 `CGWindowList` 报的窗口坐标是另一套**（整屏像被缩放位移过，
   看板报成 613×… 而不是 680×…），`screencapture` 出全黑、ScreenCaptureKit 报
   `No display available for capture`。**量几何之前先 `caffeinate -u -t 2` 把屏幕叫醒**；
   `caffeinate -d` 要用 `nohup` 起，否则那条命令一结束它就被带走。

**8 条断言**钉住四段解析（`WannaTests/DirectionBoardTests.swift`）：任务结果不被「细节」吞掉、
五行写在同一行也切得开、`任务类型` 嵌着 `类型` 不崩不脏、任务结果续两行、长回复不被 200 字砍断。
真机实测过用户点的那道题：预览里打开《初中数学浙江中考数学真题.pdf》，注入「参考屏幕内容，分析一下
这道题可能选哪一个」→ 绿框里给出「第 1 题:-3 的相反数是 3，选 A（选项 A 为 3）。」

**第八版（2026-09-27 深夜）：参考材料三类（屏幕 / 剪贴板 / 访达选中）+ 卡片上的标签与两个按钮。**
用户把参考材料扩成三类并要求**贯穿全局**（「只要录音识别，最终都要拼接到主 agents 的提示词里……
实时任务理解卡片和任务答案卡片也要参考这部分内容」），动机是**有的网页太长、截图只能看到一部分，
选中复制之后它就能看到全部**。新文件 `TurnReferenceMaterials.swift`（`TurnReferenceMaterials` 模型 +
`TurnReferenceCollector` 单例）**一类一类地采集**：屏幕 = 按下快捷键**自动一张** + 每次说到
「参考屏幕」**再加一张**（说几次截几次）；剪贴板 = 说到「剪贴板/粘贴板/复制内容」时读一条，
**文字文件抽正文、其他文件与文件夹只给绝对路径**（他：「参考文件夹时里面的内容可能特别大……
最好让 agents 来执行，而不是当前这个临时窗口」）；访达选中 = 说到「选中文件」时取**绝对路径**，
**且只在前台是访达时才取**（「如果不是就放弃……可能是用户口误」）。关键词计数复用
`NotionNoteDetector.transcriptMentionCount`，剪贴板读取复用 `NotionNoteReferenceGatherer`
（新加 `isTextReadableFile(at:)`，与 `textFromFile` 的扩展名表**同一份真相**）。
⭐ **`NSAppleEventsUsageDescription` 必须进 Info.plist**（Debug + Release 两处）——
没有它 macOS **静默拒绝** Apple events（不弹框不报错）。⭐ **标签只反映"真的拿到了"**
（他：「只有执行成功、成功获取到，才能显示，而不是根据用户的关键词」）—— 结构上成立：标签读材料，
材料只在取到时才写。⭐ **这一段的意图是"这一轮的屏幕由采集器一处供应"，但接线只做了一半 ——
如实记在这里，别照着这句去读代码**（2026-09-28 发现）：`sendTranscriptToVisionChatWithScreenshot`
里确实算出了 `referenceCaptures`（采集器那几张，按 `deliversScreenshot` 门过一遍），
**但那个变量没有任何读者**（编译警告 `immutable value 'referenceCaptures' was never used`）——
真正发给模型的仍然是管线**自己截的那一张**（`takePendingPreCapturedScreensIfFresh()` 或当场截）。
后果有两个，都不报错：**说两次「参考屏幕」不会带来第二张图**（屏幕上那几个「屏幕一/二」标签是真的
—— 采集器确实拿到了，只是没进请求），以及一轮里**有两次截图**（采集器一次 + 管线一次）。
不是"模型看不到屏幕"（管线那张就是当下的屏幕 ✓，所以功能本身是对的）。修它要选**哪些情况用采集器
那一组**（圈选提问时**必须**现截，因为圈是按下之后画的、采集器那张里没有圈），
所以不是把变量接上就完事 —— 单独一轮做。
「说到屏幕」那个开关继续管着采集器的关键词触发。
卡片上：**标签行**在表格下面（`[屏幕一][屏幕二][剪贴板][文件][文件夹]`），**取消行最左侧**加
`复制`（复制右下角那张卡片此刻的文字）与 `复制并退出`（复制 + 走 `handleEscapeKeyPressed()`，
中性灰、与三档取消留白隔开）。两个只有真跑才会发现的坑写进了 `开发经验/20` 9.5：
**自检没驱动采集器**（自检直接驱动看板，绕过了真实回调 —— 日志里一条 📎 都没有）、
**改了默认关键词老用户收不到**（设置文件里存着老默认值，`decodeIfPresent ?? defaults` 让存着的赢
→ 加了一次性迁移：存的正好是上一版默认值就换新的）。

**第八版补（2026-09-27 深夜）：参考材料的四处调整 + 两个只有真跑才会发现的坑。**
① 说了「参考」但**没拿到** → 看板标签行**右侧**显示琥珀色「无法识别：X」（**不进提示词**）；
重试**三次**就放弃（他：「用这样的方式来避免无限循环」）。② 标签改成矩形/12pt/上下边距 1pt；
两个按钮改成绿色、`复制` 66pt / `复制并退出` 104pt（他：「复制就两个字，要小一点」）。
③ **看板可拖动** —— 这里踩了一个坑：`DragGesture.translation` **在卡片自己的坐标系里量**，
而卡片正随窗口一起动 → **增益正好 1/2**（实测拖 −180 只走 −92），与设置里那个缩放手柄当年同一个坑；
改成 **NSEvent 本地监听 + 绝对定位**，实测增益 **1.000**。⚠️ 监听里 `return nil` ＝**吞事件**，
而 SwiftUI 按钮靠 mouseUp 触发 —— 吞了它板上**每个按钮都点不动**，必须 `return event`
（用合成点击验的：点「复制」→ 剪贴板里出现那段回复）。④ 选项格 3 列 → **4 列**（`columnWidth` 164）。
⑤ 输入框从单行 `TextField` 换成 **`TextEditor`**（三行、能折行、Shift+Enter 换行；竖排 TextField 本仓库
量过拿不到换行）。⚠️ 访达那条实测回 **`-1743 Not authorized`** 且**没弹授权框** ——
键在（`plutil` 核对过）、脚本编译通过，问题是那一发在**非主线程**上发的；现在拿到 -1743 就
**回主线程再发一次**，那一发才会把「控制访达」问出来。

**第八版三补（2026-09-27 深夜）：看板整个不动了 —— 我自己造成的一次回归。**
用户：「我怎么说话，它都整个的卡片没有任何的反应」（截图里 `屏幕一/二/三` 三张截图都在、
四行理解全是 `—`）。根因：「静音才刷」那道闸门读的是**连续监听那条链**的静音计时器
（`continuousListeningSilenceStartedAt`），而它**只存在于连续监听的 VAD 循环里** ——
**按住说话那条路根本没有**，于是静音时长恒为 0、闸门永远不过、一次请求都不发。
修法：判据换成**"距上一次识别到新字有多久"**（`latestTranscriptUpdateAt`，两条路都有），
并抽成纯函数 `hasPausedLongEnough` 加单测。⭐ **为什么没被验到**：自检喂假转写，
而那个 provider 在没录音时返回 `nil`，我写的是 `if let … { }` —— **nil 时整道闸门被跳过**，
自检恰好绕开了它（同一天上午采集器那次是同一个形状：自检没走真实接线）。换成转写时刻之后，
自检会真的经过这道闸门。

**第八版再补（2026-09-27 深夜）：右下角卡片高度封顶 70%。** 用户：「若文本内容过长，建议限定右下角
卡片高度……从菜单栏下方到屏幕最下方的高度，取该高度的 **70%** 作为最大长度，显示不完的内容在下方
隐藏即可」。`OverlayWindow.maximumAnswerCardHeight` = 鼠标所在那块屏的「屏幕高 − 菜单栏高」× 0.7
（**不减 Dock** —— `visibleFrame` 会连 Dock 一起扣掉），用 `.frame(maxHeight:) + .clipped() + 底部渐隐`
（不是滚动条：他说"隐藏即可"，而那是跟着鼠标走的浮层）。**为什么必须做**：答案现在允许长
（见上一条"按需给全"），一封长文能长到比屏幕还高、把鼠标埋掉。

**第八版四补（2026-09-27 夜）：删掉看板的输入框 + 宽度 680 → 480。** 用户：「把卡片右上角说话时的
输入框删掉，这个输入框的功能实在特别低频。然后把卡片的宽度再缩小 50%，现在太宽了」。
① 输入框整块删掉 —— 连带 `typedInput` 恒为空（提交时那行「用户的补充说明是：…」不再出现）、
回车那套里"光标在输入框内"那一支自然失效（`Enter` 恒等于执行、`Cmd+Enter` 恒等于粘贴，正是他要的）、
折叠条自己带高度（原来借输入框那 66pt）。② 宽度：**680 的 50% = 340 会撞两件事**
（4 列选项格要 ~656pt → 掉到 1 列；理解四行大量折行 → 卡片又窄又高），把账算给他看之后他选 **480（−30%）**。
实现上**改基准不改倍数**：`resultCardWidth` 340 → 240，于是 1/1.5/2 倍 = 240/360/480、默认仍是 2 倍 ——
**不用迁移存盘的值**。实测 680×344 → **480×423**。

**第八版五补（2026-09-27 夜）：折叠钮横过来放进按钮行 + 两个复制按钮合并成一整块。**
用户：「这个输入框左侧这个折叠的东西，你就把它显示到**复制的按钮左侧**吧，然后把它**横向**显示……
**左半部分点击一下折叠，右半部分不会被点击**，然后可以按住它的时候拖动。你把这个区域给我**用颜色
区分开**」，以及「你让他们的两个按钮**合并成一个**，就是样式上合并成一个，中间有条细线，就跟右侧
是一样的」—— ① 折叠钮改成横向两半（各 26pt、同一圆角底，**左半亮、右半几乎透明**，颜色区分是他要的），
右半不留任何手势，所以按住它就是按住卡片（拖动归面板那侧的 NSEvent 监听）。
实测：左半点一下 480×377 → **76×46**；从右半拖 −150/+80 精确移动且没被点折叠。
② 两个复制按钮**上一版没改对**（两个各自带底的圆角块夹一条线），现在与右侧三档**完全同款**：
一个圆角底 + 里面一条纯白细线。三组于是长得一样：`[折叠] [复制｜复制并退出] [取消本次｜取消十分钟｜取消今日]`。

**第八版六补（2026-09-27 夜）：看板瘦身成两行 + 修"连续几轮之后没反应"（找到一条静默的吞掉路径）。**
① 卡片：理解从四行砍到 **目标 / 细节** 两行（删掉类型、参考；「目标问题」改名「目标」），
标签行左侧加标题**「参考」**，取消行删掉「取消今日」。删掉的那三行**降级成边界标签**
（模型一时改不过来还会写「类型：做题」，不当边界那截会并进「细节」）。
「细节」现在**支持续行**（标签下面接着的几行并进它的值、用换行连起来 → 按行显示），
提示词写明「要简短、分行写、每行一件事、最多四行」。多张截图时提示词与标签都点明
**以最后一张为准**。卡片 480×377 → **480×249**。
② **「连续几轮之后卡顿、无响应」** —— 诊断日志先给了两个**排除项**：主线程看门狗**一次都没响**
（不是主线程被堵住），音频心跳每 2 秒一行、峰值到 0.8 **一直到日志最后一行**（话筒与采集没问题）。
但**36 分钟里一次「提交一轮」都没有** → 断点在"音频到达"与"提交"之间。
读代码找到**两条静默 guard**（`stopPushToTalk` 里）：`activeStartSource` 不匹配就**静默忽略**；
**`isFinalizingTranscript` 卡在 true 就把之后每一次松手全部吞掉** —— 后者与"连续几轮之后没反应"
的形状完全吻合。修法：① 两条 guard 各记一行日志（下次能直接归因）；② 给 `isFinalizingTranscript`
**加 10 秒看门狗**，超时强制收尾 —— 它是**自愈**的，不是只加日志；③ 补上「拿到定稿」那行
（那条链上唯一没有记录的环节）。**未复现**（本机没有可用语音输入），所以这是"符合证据的候选"
而不是已证的根因。

**第八版七补（2026-09-27 深夜）：回车那套 = Enter 粘贴 / Cmd+Enter 执行，且不用点卡片。**
用户：「在设置页面让用户可以自己设置 Enter 或者是 Command + Enter，**现在默认顺序为 Enter**，
自动将右下角回复的结果**粘贴进光标的位置上**。如果用户输入 Command + Enter，就自动**执行当前任务**。
然后把跟右上角卡片的交互去掉，**直接显示之后就自动识别这两个快捷键**」。设置项复用
`ComposerSendShortcut`（新字段 `boardPasteShortcut`，默认 `.returnKey` = Enter 粘贴）。
（⚠️ **2026-09-27 深夜改**：两下回车重新分配成 **⌥⏎ 执行 / ⌘⏎ 粘贴**，裸回车**放行不吞**；
`boardPasteShortcut` 也更成了自己的小枚举 `BoardPasteShortcut` —— 见本文件后面的第二十七轮那条。）**"不用点卡片"
这一条花了三次才落地，每次都是量出来的**：① 本地键盘监听收不到 —— 卡片是 `.nonactivatingPanel`，
`isKeyWindow` 可以是 true，**但系统只把键盘事件送给"当前激活的 App"**，而 Wanna 从不激活；
② `becomesKeyOnlyIfNeeded = true` 让没有输入框的卡片**永远成不了 key**（改成 false 之后日志才显示
`isKeyWindow=true`）；③ 真正打通的是**一条会吞事件的 CGEvent tap**（`.cgSessionEventTap` + `.defaultTap`），
只在卡片显示时装上、收起拆掉 —— 它**吞掉回车**，所以**卡片显示期间回车不进别的 App**（他明确要这个：
「即便覆盖就覆盖」），代价已写明；`tapDisabledByTimeout` 必须自己重开 tap，否则静默失效。
本地监听保留作兜底，与全局拦截共用同一个 `performReturnKeyAction`。

**第八版八补（2026-09-27 深夜）：卡片定稿 —— 内容区固定预留（不再随内容长高）+ 底部三个按钮 + 折叠贴角。**
① 用户：「目标和细节这两行内容的高度**总是不固定，总是漂移**……渲染到右侧提前预留的空行部分，
**不要因为生成了新内容就让整个标题和内容上下晃动**」→ 每行**高度提前定死**
（`reservedLineCounts`：目标 3 行 / 细节 7 行 / 疑问 4 行 × 16pt）+ `clipped()`。
实测同一张卡片连续两轮：**高度都是 398、位置都是 (860,42)** ✓。
② 细节改成**等宽字体 + ASCII 竖形关系图**（用户要的"线框图/脑图"，理由是**用户用眼睛扫，
字多看不下去**，而关系图还能看出 AI 是否真懂）—— 提示词给了画法，实测模型真的画出来了。
③ 新增第三行**疑问**（4 行，AI 读出来的歧义/矛盾，「没有就整行写「—」，不要为了凑而编」）。
④ 底部按钮：**折叠（贴左下角，去掉它自己那层边框）｜复制｜执行（执行并退出）｜退出（不执行、直接取消）**
——⚠️ **只有「复制」会因为没内容而置灰**（第一版把 `.disabled` 加在 `actionButton` 里，三个全灰了）。
⑤ 选项格 164 → **152**（480 的卡片 → **3 列**）。⑥ 「参考」标题改用与理解行同一个标签列宽 →
那排标签从**内容列**开始，整块竖直对齐。⑦ **折叠后按钮不再漂移**：根因是
`repositionForCurrentSize()` 每次拿**当时**的鼠标位置重算原点，而他为了点折叠钮鼠标早就不在原地 ——
改用 `show()` 那一刻记下的锚点。⑧ 「未来把模型能识别的都显示在卡片上」是下一阶段，
这一轮只把结构腾出来（新增一行＝往 `understandingLabels` 与 `reservedLineCounts` 各加一条）。

**第八版九补（2026-09-27 深夜）：卡片左右两栏重构 + 疑问常驻。**
① 宽度回到 **680**（340×2，"约为右下角卡片的两倍"）。② 卡片**左右两栏**：**左 40%** = 参考标签 +
**目标 + 疑问**（"AI 对用户的理解"）；**右 60%** = **那张脑图**（"AI 对用户需求的整体梳理"），
**不画「细节」标题**、高度撑满。③ 底部两个取消按钮改名 **取消 / 取消十分钟**。
④ 方向格**固定三行高**（不再随方向个数变高变矮）。⑤ **折叠钮改成"左下角的长方形"**：
左 1/3（22pt）折叠、右 2/3（44pt）拖动，**高度 = 按钮行高 + 卡片下边距**，
于是**顶边与复制按钮齐平、底边压到卡片最下沿**（"是对齐不是相同，因为它的底边比较低"）。
⑥ 疑问改成**编号 + 先说关于什么、再说具体**（提示词给了格式示范）。
⑦ **疑问是常驻的、不随每轮重写**（用户：「用户可能会关注某个疑问，并因此补充一些内容。
如果发现这个疑问已经消除……就把它删掉……**疑问就是疑问，不能总是更换**」）：
`DirectionBoardSession.pendingQuestions` 每轮拼成 `<previous_questions>` 带下去，
提示词写死模型只做三件事 —— **删掉已解决的 / 照抄没解决的 / 只有真读出新问题才加**，
并明写"不许换一批新的重说一遍"。

**第七版三补（2026-09-27 深夜）：ESC 之后右下角那张卡片不退（我引入的回归，已修）。**
他按住快捷键提问（右下角出现答案预览）→ 按 ESC 退出 → **卡片没退、一直跟着鼠标**。根因是上一版把"收预览"
从提交那一刻挪走（挪到"真答案的第一个字"）却没给其余出口补上，而 ESC 打断走的
`cancelTurnByEscapeWhileListening()` 不经过答案管线，**没有人来收它**。修法是四道，前两道是结构性的：
① **相位**：把相位收敛到唯一写入口 `NotchWindowController.setActivityPhase(_:)`，**相位一旦变成 `.idle`
就作废预览** —— ESC、窗口到期、空转写、以后新加的出口全经过这里，不可能再漏。判据是 `== .idle`
而**不是** `!= .listening`：提交后相位要先过 `.transcribing`（等定稿）再 `.thinking`（截图 + 视觉请求），
那段正是"等真答案交接"的 1~2 秒，用 `!= .listening` 会清掉它 → 又回到"两个回复"（**两个 bug 会把对方
改回来**，这是量出来的）。② `endListening(keepPreview:)`：提交那一轮留、其余出口默认清（三个调用点各自明确）。
③ 真答案第一个字交接。④ 管线 `defer` 收尾 —— 覆盖"提交了但根本没有答案"（纯执行类任务不写
`streamingAnswerText`，第③道永远不触发）。单测 `onlyTheSubmittingTurnKeepsTheAnswerPreview` 钉着前两道。
**教训**：只在某个出口收的资源，出口一多必然漏；**寿命要挂在那个子系统唯一的那份真相上**。

**第七版再补（2026-09-27 深夜，第二次实测）。** ① 右下角**"显示了两个回复"**：提交那一刻就把
预览收了、而真答案要 1~2 秒才到 → 卡片先消失再被重画。改成**交接**：提交时不动预览，真答案的**第一个字**
到达时才 `clearAnswerPreview()`（同一张卡片换内容，中间不空帧），打断或下一轮真开始时才收。
② **"连续问到第六七轮就卡死"（语音识别那块不再出字、三块界面全无变化）—— 根因未定**：
用户说"你可以看一下刚才的记录"，但**那条路一个字都没落盘**（双击启动的 App 里 `print` 进不了任何地方，
`log show --predicate 'process == "Wanna"'` 返回 0 行；唯一的 `录音诊断.log` 是长录音那条路的）。
所以这一轮**先装仪器**：新文件 `Wanna/MainFlowDiagnostics.swift` 写
`~/Library/Application Support/Wanna/主Agent诊断.log`，记三样 —— **音频心跳**（连续监听期间每 2 秒一行
`N 块/2s 峰值 x`，一句话三分：0 块 = tap/引擎没了 / 有块全零 = 设备哑了 / 有块有峰值 = 故障在下游）、
**识别会话生命周期**（这一句开始、定稿到达带字数、tap 装撤）、**主线程看门狗**（往返 > 2 秒记一行
**带阶段标记**，用来分辨"主线程被堵住"与"主线程闲着、各链各自停摆"）。已排除的：
`beginNextUtterance()` **有**重置 `connectionRecoveryAttempts`，不是重连预算用光。
顺带把截图从"每轮一张"改成"**一句一张**"（说「参考屏幕」时作废重截）——**这是省开销，不是那个卡死的修复**。

**第七版补（2026-09-27 深夜，他真机实测报的两个"没反应"）。**
① 「**他应该直接看到屏幕啊**」—— 原来那一轮的请求**只在他说出「参考屏幕/根据图片」这类组合词时才带图**
（说到才截、存起来给后面几轮复用），而他真说的是「屏幕上的第 2 题该选哪个」——没有那四个字，
于是**一张图都没带**，模型真的看不到屏幕，回的是"我还没看到题目的内容"。现在**每一轮都带一张当下的
屏幕**（`captureScreenForBoard`，与主 Agent 同一条截图链），`screenReferenceRequested` / 截图缓存 /
边缘触发全删，提示词里那段改成常驻的「每一轮都带了截图，请看图；**看不到就照实说，不要编**」。
（他顺带问的"截图应该忽略这两张卡片"：**本来就忽略** —— `SCContentFilter(display:excludingWindows:)`
按 bundle id 排掉本 App 全部窗口。另：我的自检原来注入的是**带**「参考屏幕」四个字的那句，
正好绕开了这个 bug —— 自检的措辞现在就是他报上来的原话。）
② 「**我问他问题他也没回复我**」—— 答案落地时是**无条件**写预览（`answerPreviewWriter?(answer)`，
`answer` 可能是 nil），于是同一句话里第 N+1 轮（模型这次没写「答案」那一行）会把第 N 轮**已经显示出来
的答案抹掉**，屏幕上"闪一下就没了"。现在**只在真取到答案时才写**，清空只发生在轮次结束
（发送 / ESC / 新一轮）。量到的原文也证明两个方向都需要：同一句里第 1 轮确实没写答案
（那一刻屏幕翻到的不是他问的那道题，模型在「细节」里如实说了），第 2 轮写了。

**第七版（2026-09-27 深夜）—— 用户判定「整个的复杂度太高了」，做了一次结构性简化。**
他的原话：「**就是一个固定的文件**。我记得之前我是添加了 3 个还是 4 个来源，什么实时的，**这都不要**」。
删掉的：`TaskDirectionsTemporary.json` 整个文件、运行时追加用户口述的新方向、带屏幕参考时把模型给的
标签变成一条方向、`forcedDirectionIDs`、`spokenNewDirection`。`TaskDirections.json` 于是只剩三个写入口
（人手改 / AI 之后改 / 复盘追加）。**固定状态搬进第二个小文件 `TaskDirectionPins.json`**（他选的是
「一直保留到他说取消」，跨大轮跨对话都在，所以要落盘；而不写进那份清单 —— 清单只由那三个写入口改）。
显示规则：**固定项永远排最前、编号稳定、✓ 和 ✗ 都显示**（他：「无论是对还是不对都要显示」），
后面才是 JEV 补的（可轮换），列数满了**先砍 JEV 那部分**。**判定改成"两拍"**（他讲得很明确：
「这个理解是由大语言模型在**第二轮**……你必须要知道用户表达的是对**上一轮** JEV 模型它的结果的一个
选择」）：请求带上「上一轮显示的是哪几格」，模型回一行 `选择：1 对，3 不对`，代码按**上一轮的编号**
回填 —— 本地那套口述选择正则（含上一版刚加的编号映射表）**整块删掉**，口述走模型那一拍、
**点击仍然瞬时**。请求还带上**前三轮**的理解（标「最近一次 / 倒数第二次 / 倒数第三次」）。
**右下角多了一个答案预览**：说话期间右下角那张卡片显示模型对用户提问的回答，走的是**同一条渲染**
（`conversationBubbleText` 里插在 `streamingAnswerText` 之后、渲染分支一起判空），所以
「跟正常结果卡片的动效与渲染一模一样」是结构上成立的；不朗读。发送时 `<user_intent_tags>` 里
**只发用户明确确认过的方向（关键词 + 描述）**、否定的与按概率的一律不发、**理解四行无条件发**
（因此理解旁那个 ✕ 删掉了），**用户原话后面**补一段固定的 `<board_reference>` 说明
「转写里那些『方向一 / 任务方向 3』是跟看板交互，不是要执行的任务」。右上角原来那行「任务结果」
**删掉**（答案归右下角）。顺带堵上一个既有漏洞：`endListening()` 只在按住说话那条路上被调，
确认模式轻点 / 连续追问 / 打字提问三条不经过它 —— 现在收在 `consumeTurnDecision()` 里（五条路
唯一都会走的地方）。真机验过两张卡片同屏：右上角固定项 ✓/✗ 排最前、无任务结果行；右下角
数学题答案是「第 1 题选 A。……-3 的相反数是 3，所以选 A。」

**第六版（2026-09-27 深夜）：行的集合恒定（卡片不再跳）+ 说「第 N 个」不再选两格。**
用户的两句判定：「他回复结果的时候**总是跳、总是蹦**……内容有时候有软件目标细节，有时候没有」
+「这几行固定在这，而不是突然间有、突然间没有，这对体验影响太差了，**包括结果这一行也固定在这**」。
所以卡片是**固定四行**：结果 / **目标问题 / 类型 / 参考 / 细节**（顺序、那两个字的「参考」都是他定的），
`parseUnderstandingLines` 的契约改成「**永远返回这四行**，缺的行值是空串」，视图永远画着、
空值画占位符 `—` —— 实测空状态与填满状态面板都是 680×356，**高度恒定所以无处可跳**。
`understandingLabelAliases` 每一行带一串别名（`参考` ← `内容参考/参考/软件/文件`），
因为模型常写回老标签，只认正式名会让那一行掉进正文里；`任务结果` 是**边界标签**（只截断、不成行）。
值上带 `.id(value)` + `.transition`，逐行错开 0.05 秒淡入 —— **逐帧验过**（回复落地那一刻连拍五帧，
第一帧占位符正在上移、错开不同高度，末帧就位，骨架全程不动）。
另一个 bug 是「我让他选择的是第二个方向——看图说话，但他选择了**两个方向**」：识别器给的是**累积**文本，
同一句会被解析好几次，而**选中会把那一格钉到最前、整列重新编号** —— 第二次解析时「第 2 个」已经换人。
修法是把「编号 → 方向 id」记在**这一句**里（`DirectionBoardMatching.resolvedSpokenNumber`，纯函数有单测），
重喂按 id 找、已选中的是空操作。取消那一行的分割线按他的要求改成**纯白、更粗更长**。


**录音带那条字幕 + 那个转写编辑窗，整块搬到主 Agent 的 `Listening` 上** —— 用户的原话是
「在当前的主 agent 快捷键触发之后……下面要显示一个类似于录音这个……**你直接照搬这个代码就可以了，
完整的复制过来**」以及「我让 listening 可以被点击，点击之后展开，展开的是录音，可以让用户编辑录音
里面的内容，整个的排版、整个的效果，包括展开之后这个窗口……**这个东西是完全照搬过来的**」。

- **显示与否只看相位**：`NotchWindowController.bindListeningTranscriptPanel()` 订阅
  `activityPhase`（+ `isFullscreenSuppressed`），**`== .listening` 出现、其余一律收起**。用户定的
  规则就是这个：「如果用户说完了，然后进入 thinking，那么这个录音的内容就消失掉了。什么时候用户说话，
  下面这个内容才会显示」，补的一句是「Listening 时要显示，Speaking 时不显示」（回答本来就会显示在
  鼠标右下角那张卡片上）。**它不碰状态机** —— 打断、说完等待、自动发送、相位全都还是原来那套。
- **文本从两条实时转写回调喂进来**（按住说话那条 **2026-09-27 才真正接上** + 连续追问的
  `onTranscriptUpdate`）—— 它是说话时那些字**唯一的**落点（鼠标旁那颗气泡不再显示实时转写，
  见 Settings 那一节）。
  ⚠️ **按住说话那条原来接的是 `updateDraftText`，而它只在收尾/取消时被调用** —— 于是这行字幕、
  Notion 的实时关键词检测、「说到屏幕立即截屏」、气泡的实时文字**四件事在真机上从来没有活过**，
  而验收用的"注入一句转写"注入点在**收尾**那条路上，正好绕开。现在是 provider 的
  `onTranscriptUpdate`（真·实时）里多喂一次 `publishInterimDraftText` —— **只喂回调，
  不碰录音状态机、不碰 VAD、不碰打断判定**（教训见 `开发经验/10-踩过的坑.md` D24）。
- **展开是一次动画，不是两块各动各的**（2026-09-27 用户：「展开动画非常撕裂……应该把它做成一个
  动画……从刘海向左右两侧展开」）：屏幕上是两块（刘海面板画的黑带 + 这块面板画的字幕行），
  分属两个窗口、没法共用一个 CA 动画 —— 所以"一个动画"= **同一个时长、同一条曲线、同一条几何
  式子**：`NotchSupport.listeningBandRevealDuration`（0.38，两翼的 `.animation` 与字幕的
  `withAnimation` 都读它）+ `NotchSupport.revealedListeningBandWidth(notchWidth:revealProgress:)`
  = `刘海 + (两翼之和) × 进度`（两翼的宽度动画是同一个线性式子，所以边缘每一帧都重合）。
  进度由 `NotchListeningTranscriptPanelController.show()/hide()` 用 `withAnimation` 翻。
  ⚠️⚠️ **2026-09-27 FINAL（第五次，也是最后一次）：那条带子的展开动画被整体删掉。**
  用户第五次看到它时的原话是「你完全没有修好，甚至说一点效果都没有。**我觉得这完全放弃这个方案吧。**
  那就你的这个刘海，用户第一次按快捷键的时候，你就让他**直接显示**吧，就是直接就跟那个录音的时候
  一样的效果，直接显示……但是整个这个东西是直接显示出来，**不需要动画**。注意第一次不需要动画。」

  所以现在：**黑带与它下面那一行都是常数宽度，相位一到就在最终位置**。删掉的东西 ——
  `NotchListeningTranscriptModel.bandRevealProgress` / `isBandPresented`（两个 `@Published`）、
  `NotchPillRootView.wingRevealProgress` 与两翼的宽度乘法、那行
  `.animation(.easeInOut(duration:), value: activityPhase)`、`show()` 里"先出现再翻进度"的两段式、
  以及 `NotchSupport.listeningBandRevealDuration` / `revealedListeningBandWidth(pillWidth:revealProgress:)`
  两个 API（换成**没有进度参数**的 `NotchSupport.wingBandWidth(pillWidth:)`，刘海面板与展开态两条带子
  都读它，`restingWingBandWidth(on:)` 转发到它）。离屏渲染实测：Listening 时黑带与那一行都是
  `x 130…847px`（718px = 359pt，逐像素同宽），接缝 `y=62…66px` **0 列透明**；静止态只有 185pt 那颗胶囊。
  **D25 → D26 → D31 → D34 → D35 五条是同一个东西被修了五次**，终点是"把'两块'这个前提删掉"——
  加回动画之前先读那五条。全文见 `开发经验/10-踩过的坑.md` D36。

  ⚠️ 同一次还修了**「在说话的时候按 ESC 没退出、反而冒出 thinking」**，根因不是相位机而是
  **ESC 根本没有停任务**：`interruptActiveResponse()` 开头有一条给"下一次提问"用的 guard
  （`isAgentJobRunning` 时不取消任务，只停播报），因此主循环继续跑、每进下一步就写一次
  `voiceState = .processing` → 相位算成 Thinking。修法三条：ESC 先清 `isAgentJobRunning`
  再打断；相位用 `holdActivityPhaseAtIdle()`（**按住**到这一轮真的收尾，而不是一次性抑制，
  且 `forceActivityPhaseIdle()` 在"已经按住"时不再翻抑制标志）；主循环 **循环体顶上**
  加 `guard !Task.isCancelled`（原来唯一的取消判断在截屏之后，取消落地那一拍会先写 processing）。
  ⚠️ **这三条没有在真机上按下过"正在跑时的那一次 ESC"**（这台机器没有可用语音输入、打字又被
  输入法吃掉 Return）—— 结构上成立、未实测，如实记在 `开发经验/10-踩过的坑.md` D36 第三节。

- **点刘海左侧那颗「Listening」**（`handleGlobalClick` 里新增的一个分支）走的是**录音两翼那一份矩形**
  （`NotchSupport.recordingWingFrames`）——「画在哪」由视图按 `NotchSupport.leadingWingWidth` 画、
  「点在哪」由控制器用同一个矩形判。判在**录音那条之后**（两者占同一块屏幕，谁真的在跑算谁的）、
  **`panelModel.isExpanded` 之前**（那一整段结尾有一句无条件的 `return`，录音两翼当年就是被它挡掉的）。
- **ESC 打断**（2026-09-27 用户定，见下面《ESC = 打断》一节）：转写编辑窗开着时 ESC 仍然是
  「收起编辑窗」（既有语义优先）；否则这一轮在听/在跑时 ESC 才是打断。
- **编辑窗里改过的字会顶替这一句发出去的话**：`handleFinalTranscript` / `submitFollowUpQuestion`
  最前面取一次 `consumeEditedTranscript()`（取走即清、一轮一次；没改过返回 `nil`，照识别结果走）。
  这是它与录音那条唯一的语义差别 —— 录音那条改的是"存下来的转写"，而主 Agent 这条没有"存下来"，
  它的输出就是这一句要发出去的话。不生效的编辑框比没有编辑框更糟，所以改的字真的会进管线。
- **面板是一块新的独立窗口**（`NotchListeningTranscriptPanelController`，透明、无边框、非激活、
  收起时 `ignoresMouseEvents = true`、**建好一次永不改尺寸**），层级 `notchTranscriptPanelWindowLevel`
  = `.popUpMenu` —— **在刘海面板之上**，所以展开面板时那一行照样看得见（与展开态那条状态带同一条理由）。
  它和录音带那块面板**不共用窗口**（录音是「独立接线、跟面板里任何功能都没有关系」的子系统），
  共用的是**视图**（`NotchTranscriptLine` / `NotchExpandedTranscriptPanel`）与 `NotchSupport` 里那几个数。
- **量到的（2026-09-27）**：条子 x 684.5…1043.5（宽 359 = 两翼 + 刘海）、y 32…64、下圆角 22，与录音带
  逐点同式子；面板窗口算出来 AppKit `(505,525,718×592)`、AX 树 `(505,0,718×592)` 逐点重合；
  命中矩形 Quartz `x 685.5…771.5, y 0…32`，画出来的左翼左边缘 684.5 —— **差 1pt**（86pt 的目标，
  不是 71pt 那种），AX 里那颗 `Listening` 文字 `(702,8,62×16)` 完整落在矩形内，在 (712,16) 合成点击
  → 展开真的发生；字幕的移动用 16 帧截图（~100ms 间隔）做剖面互相关：**15/15 对都向左**，
  单帧 −2.5…−5.0pt，1.549s 累计 50.0pt vs 同期喂进 3.44 字 × 14.883pt = **51.2pt**（位移与文字增长同步，
  没有静止段）；抽出来之后**录音那条编辑窗的 AX 与新面板逐点相同**（都是 `(523,90,682×474)`）。
- **没验到的**：真语音（音箱进不了麦克风，探针注入转写、其余全是真的）；「改过的字真的发给了模型」
  的发送那一步（只验到返回值，发送要真调一次模型并出声）；按住 ⌃⌥ 边说话边点的真实时序。
- **两处照搬过来的取舍**：展开时那 718×592 收鼠标事件（编辑框要用，与录音带同一条）；那一行会压在
  展开面板页头那一条（y 32…64）上，也只在说话那几秒。

**第九版（2026-09-27 深夜）：卡片改成**真正的**左右两栏 —— 表格与标签进左列，右列整块是脑图。**
用户的判定很直接：「你现在还是**上下两种方式**，我说的是**左右布局**。**最上面那个标签和表格也要
放在左边**，**右侧全部都是脑图**。标签 3 行肯定写不下，**写成 2 行就好**。重新弄。」
所以 `expandedCard` 是 `HStack`：**左列 40%**（方向表格 → 参考标签 → 目标 → 疑问，全部竖着排在
左列里）｜**右列 60%**（只有那张脑图，`.frame(maxHeight: .infinity)` 铺满整块）。三处随之而来：
① **表格恒 2 列**（`directionColumnCount`，左列只有 262pt，按 680 算会排出 4 列挤成一团）、
`directionGridHeight` 由 3 行改 2 行；② 参考标签那一行**会换行**了 —— 左列放不下时 `HStack` 是从
**右边截掉**，量到的是「无法识别…」，而被截掉的恰好是"哪一类没取到"这半句，于是写了
`ReferenceTagFlowLayout`（一个真正会折行的 `Layout`），高度**固定两行**（单行时下面空着，
他的规矩是"高度不许晃"）；③ 内容块高度 `contentBlockHeight` = max(左列所需, 上一版 264 的两倍) ——
行数是下限、翻倍是他明写的数，多出来的高度全给右列那张脑图。行数：参考 2 行、**目标 6 行**、
**疑问 10 行**（他说的「参考 +2 / 目标 +2 / 疑问 +5 / 整体高度再增加一倍」）。

⭐ **同一晚量到并修掉一个只在真机上看得见的截断**：屏幕上是
「疑问  一、关于「记到哪里」的」，后半句「疑问：是要写进 Notion 某一页……」**凭空消失**，
而同一轮里不含这两个字的「目标」折行完全正常 —— **这正是指认它的证据**。
根因不在视图在**解析**：`labelPositions` 在整行里扫标签，模型把「疑问」两个字写进了**值里面**
（「一、关于「记到哪里」的**疑问**：…」），于是它被当成第二个标签，**第一个值就在那里被切断**。
修法是 `isAtLabelBoundary`：标签必须落在**行首或空白之后** —— 既挡掉句子里的词，
又不影响模型把几行挤成一行时写的「目标：… 细节：…」。回归测试用日志里那条真实回复钉住
（`labelWordInsideAValueIsNotASecondLabel`）。⚠️ 那条测试**红了两次，两次都是我的断言写错**：
解析会把全角冒号统一成半角；「—」是空值标记、解析出来本来就是空串。**遇到解析类问题先写一个
能编译真源码的小探针**（`DirectionBoardPrompt.swift` 只 import Foundation，加两个类型桩就能
`swiftc` 单独跑），比在测试里猜快得多。

**左下角折叠钮贴边那次也走过一次弯路**：负内边距（`.padding(.leading/-.bottom, -内边距)`）是靠
「**内容的布局高度比它画出来的高度小**」起作用的，后面再套一个 `.frame(height:)` 就把这个高度
顶了回去、负内边距等于没写（第一版就是这样，屏幕上量到的仍是 15pt 的缝）。去掉那个 frame 之后
用 AX 核对：折叠钮 `(1293,580,22×36)`、面板 `x:1293 y:32 w:680 h:584` ——
**左边缘 1293 = 面板左边缘、下边缘 616 = 面板下边缘**，贴住了；三个按钮仍是 26 高、离卡片下沿 10pt。

**第九版三十六补（2026-09-28）：看板"该消失时没消失/退出后粘在鼠标上"= 判据变了没人重判；以及我拿错快捷键导致"验证是假的"。**
① 用户：「进入 agent 模式后这两个卡片为什么没消失？我退出之后**右上角这张卡一直粘在我鼠标上**」。
根因**不是判据写错，是没人重新判**：`DirectionBoardPanelController.applyVisibility()`（显隐的唯一判定点）
原来只在 `sync(...)` 里调一次，而 `sync` 只挂在相位变化上 —— "交给 agent 了 / 用户取消了 /
他终于说出字了 / 设置里关了"这四件事发生时它不重判，面板停在上一次的结论上；而它现在跟着鼠标走，
看起来就是"粘住"。改法两半：**判定点里现读每个条件**（第一版只把 `!isAgentModeActive` 加在 `sync`
的**参数**上 —— 订阅触发时那是旧值 ✗，修完仍然不消失）+ **四个输入各订阅一次**。
② 按他的要求"自己走真实流程、至少三轮"，才发现两件更严重的事：**我合成的 ⌃⌥ 根本不是他的快捷键**
（他录过 **K + ⌘⌥⇧**，`customPushToTalkShortcut` 压过预设）—— 那几次"合成 ⌃⌥ 起一轮"从没真的按过；
**而且我读的是几小时前的旧日志行**（`grep | tail` 打全文件尾巴），"日志里有这行" ≠ "这行是我这次触发的"。
于是补了机器能跑的流程：`WANNA_SYNTHETIC_TRANSCRIPT` 合成识别器（只换"音频从哪来"）、
`scripts/talk-shortcut-probe.swift`（**从设置里读他真正那条快捷键**再发）、
`scripts/board-visibility-probe.swift`（在不在屏上）、`scripts/direction-board-flow-check.sh`
（八步用户流程）—— **连续三轮全绿**。⚠️ 没覆盖"用嘴打断"（VAD 要真实电平，本机音箱进不了麦克风）。
见 `开发经验/20` 9.66 / 9.67。

**第九版三十五补（2026-09-28）：agent 模式下看板一律不显示（含那条链不跑）；30 秒倒计时改从"播完"起算。**
① 用户：「进入 Agent 模式后，**实时模式相关的任何东西都不显示，代码也不需要运行**，
**刚才偶尔有一次看到它显示了一下**，这是完全禁止的」。那一下来自"他打断 agent 时说的那句话
落进追问窗口、`isListening` 又变 true"——显示判据只有"相位 + isListening"挡不住。改法：新旗标
`DirectionBoardSession.isAgentModeActive`（`consumeTurnDecision` 置上 —— 那是"交出去"五条路唯一的
收口；换大轮 / `endBigRound` 清掉），看板判据加 `&& !isAgentModeActive`，并且
`noteLiveTranscript` / `requestIfTheTranscriptChanged` 各加一条 guard（**那条链一个字都不跑**：
没有 JEV、没有梳理、没有截图）。单测走完整条边界。
② 用户：「AI 语音**播放完成**那一秒开始倒计时 30 秒……说话了或打断它就进入全新的小循环，
回复完成那一秒**重新计时 30 秒**……但我发现**对话几轮之后它就不说话了**，我估计是时间
不是在回复之后重新计数的」。**他猜得完全对**：`armContinuousListeningWindow()` 的两个调用点
都在**播报开始**（注释还写着「计时起点 = 播报开始」），回答念 40 秒时 30 秒窗口在它还念着的时候就
到期了。改法：**开窗仍在开播**（那是打断的耳朵），但在 `scheduleVoiceStateResetAfterPlayback`
（"播完"那一拍）**再调一次**，把到期时间重新拨到 30 秒之后。设置页说明同步改成真实语义。
见 `开发经验/20` 9.64 / 9.65。

**第九版三十四补（2026-09-28）：润色之后"文字间距特别大" = 模型自己加的空格。**
用户：「转写之后的文字**中间的间距特别大**……你可以去看一下**最近这几次录音**，可能会辅助你
找到真正的问题」。**照他说的翻文件，一眼分清是哪一层**：同一场录音的两个文件里，识别器给的是
「呃，北京时间上午**2点**，下午**3点**。」（数字旁没有空格），而模型润色完是「上午 **2 点**，
下午 **3 点**。」。全库统计定了判据：源文本里**数字旁的空格只有 11 处**（识别器不这么写），
而**汉字旁的英文空格 836 处**（「主 agent」「notion」—— 那是识别器自己的写法，要留）。
所以规则 = **一个空格只有在"至少一侧是英文字母"时才留**，其余收掉。落地两处、
**都不动用户那份风格提示词**：① 请求的 `<task>` 里加一条"标点与空格以原文为准，不要自己
在中英文/数字之间加空格"；② 出口统一收一遍（`RecordingPolishClient.removingSpacesTheModelAdded`，
纯函数有单测）。**实测**：把规则跑在已录好的 4 份 `.polished.txt` 上 —— 只有用户举的那一条
收掉 4 个空格，其余 3 份 0 处（没有误伤）。⚠️ **源文本一个字都不动**（那是原始记录）。
全文见 `开发经验/15-录音采集与设备自愈.md` 十一。

**第九版三十三补（2026-09-28）：我搞错了方向 —— 那不是"提交"，是实时模式里那两张卡该刷；
外加分隔线删除 + 两张卡留缝。**
用户判定「你**完全搞错了**……按下快捷键是进入**实时模式**，**不是 action 模式**，
你现在直接让我进入了 action 模式；实时模式里我说完话，右上角跟右下角**显示的是实时的卡片**」。
我把他说的「说完 1.5 秒自动发送」读成了"把这一轮**提交**给 agent"，于是给按住说话加了
"静音到点就 stopPushToTalk" 的看门狗 —— **那正好把实时模式掐断**（一提交 isListening 就结束、
两张卡立刻收起）。**整段撤回**（代码 / 状态 / 单测一起）。
**真因是实时那条链上的字数门槛**：`shouldRequest` 要**新增 ≥10 字**、梳理那条更是 `max(10×2,20)`
才重画那张脑图 —— 所以他说一句短的，**两张卡一次都不刷**（他说的"没有反应"）。
现在：唯一的"内容"条件是「比上一次请求多了至少 1 个内容字」（不是字数限制，只是别把同一份转写
反复问）、这一轮一定连梳理一起发、检查节拍 3 秒 → **1 秒**（他要的"说完 1.5 秒"不该被 3 秒的拍
拖成 4 秒）；顺带删掉设置项「每隔 3 秒问一次的门槛」（它编码的就是那个 ≥10 字）。
实测：每句新话一轮、脑图逐轮长、轮次间隔 ≈3.4s（= 夹具节奏）**没有请求风暴**。
另：**分隔线删掉**（那一块读成一个整体），**左半宽回到 360 = 回复卡宽 + 20**，
竖条不再贴着回复卡（上一轮"左半宽 = 卡宽"是为了让分隔线压住卡的右边缘，线没了约束也没了）。
见 `开发经验/20` 9.62 / 9.63。

**第九版三十二补（2026-09-28）：「说完 1.5 秒就发」在按住说话那条路上压根不存在。**
用户回来说「**没有反应**」，并要求"查清到底有哪些地方在限制"。**先读日志**（`主Agent诊断.log`）：
他 07:35:18 说话（峰值 0.315）→ 07:35:22 起静音，**整整 10 秒屏幕上什么都没发生** →
07:35:33 松手才发。根因是**那一整张静音表只长在连续追问窗口的 VAD 循环里**
（`BuddyDictationManager:1416`），按住说话这条一次都没跑过 —— 所以 9.60 改的两处（1.5 秒、字数 1）
虽然都对，却都不在它那条路上。补法：给按住说话也加「说完就发」的看门狗，判据是
**转写停更**（纯函数 `shouldAutoSubmitPushToTalk`，有单测）：不用麦克风电平（这条不开 VPIO，
刻度与监听那条不同，卡 0.25 会时灵时不灵）、不用字数（用户明说无关），挂在
`updateAudioPowerLevel` 那段 ~47 次/秒的主线程回调上（本身就是现成的时钟，不用再养一张表），
`pushToTalkTranscriptAtLastAutoSubmit` 保证同一句只发一次；三个前提是"正在按住说话 / 不是确认模式 /
定稿没在收尾"。他的机器是 `doubleTapToTalk` + 「松开立即发送」开 + 静音项自己设的 **1.0s**。见 `开发经验/20` 9.61。

**第九版三十一补（2026-09-28）：「说短句它就不执行」——静音自动发送与字数完全无关。**
用户：「我按一下快捷键之后说话，它有没有**字数限制**？我要的是说完话 **1.5 秒**之后自动发送，
但说话字数特别少时它就不执行……【**跟说话字数完全无关**】」。**是两道闸门叠着**：
① 静音 2.0 秒（默认值）→ 改成 **1.5**（配老值迁移：存的正好是上一版默认值才换，他改过的不动）；
② 一句转写的**内容字数门槛 4**（主 Agent 传的）→ **1**（只挡"一个字都没有"）。
② 就是"没反应"的来源：`handleContinuousListeningFinalTranscript` 里不够门槛 → `onUtteranceDropped`，
屏幕上什么都不显示。它当年的理由（识别器从播报残余里猜出「嗯。」这类假句子）**2026-09-24 起已堵死**
—— 开一轮只能由本地能量 VAD 触发、而 AGC 关掉之后播报期间麦克风峰值 0.241 < 0.25 的门槛，
残余回声过不了 VAD，所以 1~3 字的转写只可能是人真的说了。**三处一起改**：窗口参数 4→1、
快捷键发送那条闸门（原来写死 4）改读**本窗口门槛**、socket 死掉时那份兜底同理。
单测 `silenceAutoSendIsOneAndAHalfSecondsAndIgnoresWordCount` 钉住全部四条。见 `开发经验/20` 9.60。

**第九版三十补（2026-09-28）：分隔线的位置 = 回复卡的右边缘。**
用户：「七字形上面这个卡片，它的左半部分宽度，也就是**中间那条分隔线的位置**，我希望
**左侧的宽度刚好等于右下角这个卡片的宽度**……注意我调整的**不是高度和宽度，而是内部这条分隔线的位置**」。
改法一行：横杠宽从写死的 360 改成 `answerCardMaximumWidth`（340）—— 面板 680 = 340 + 340，
分隔线落在回复卡右边缘的延长线上（卡最宽时严丝合缝，窄时自然让缝）。竖条宽本来就是同一个数，
现在三个数同源。单测里那条「竖条左边缘必须比回复卡右边缘更靠右」的断言随之改成「等于」。
实测面板 680×264、左侧 340、Δx 11~12、顶边在鼠标上方 281 ✓。

**第九版二十九补（2026-09-28）：看板不再夹在屏幕里 —— 为了和右下角那张卡同步。**
用户：「右下角这个卡片**可以显示到屏幕外面**……右上角那个卡片**撞到边缘之后就不移动了**，
我希望它**能够到屏幕外边** —— 因为我要让这两个卡片的**相对位置固定**，任何时候都是固定的，
用户看起来就会非常舒服，因为它们是**同步移动**的」。根因：`directionBoardPanelFrame` 有两处"修正"
（`min/max` 夹进 `visibleFrame`、撞到刘海带子时整体下移），而右下角那张画在覆盖层里、位置就是
`鼠标 + (12, 32)`、从来没夹过 —— 鼠标一到边，只有一张卡还在动，相对位置就散了。
改法：这个函数**只有算术、没有屏幕**（钳制与带子避让整块删掉，`restingBandRectInAppKitCoordinates`
随之没有读者也删了）。**验证**：单测在三个屏幕边角上逐个断言偏移仍是 `(12, 横杠高 + 30)`；
真机读到 `鼠标(31,220) → 看板(42,616)｜Δx 11~12pt｜顶边在鼠标上方 281pt`（= 251 + 30）✓。

**第九版二十八补（2026-09-28）：一大轮结束 = 卡片回到"从来没有过"（用户报的"致命问题"）。**
他的原话：「如果上一次任务已经退出，比如按 ESC 退出了，**第二次按住快捷键启动后，右上角和右下角的
卡片显示的仍然是之前的历史记录**……无论任务完成还是任务取消，只要**大循环结束**，显示的内容都
应该是全新的，相当于没有历史……按住 ESC 就是取消任务、取消所有任务，**并且清空历史记录**」。
根因两条：① `endBigRound()` 只清了 `previousRoundItems` + `jevProbabilities`（真正构成"历史"的
累积脑图 / 说过的话 / 前几轮问答 / 未解决的疑问 / 卡片上那几行**一样没动**），而它是大轮结束的唯一收口；
② ESC「任务执行中」那条路**完全不碰看板**。改法：`endBigRound(reason:)` 变成**整轮复位** ——
停掉在途请求与节奏表、把 `currentCycleID` 置空（**这才是让晚到的回复写不回来的那一道**：
落地闸门是 `guard currentCycleID == cycleIDAtRequest`，光 `cancel()` 不够，取消是协作式的）、
清空全部上下文与屏幕上的那几行；三个出口全接上（窗口关闭 / ESC 正在听 / ESC 正在跑），
`beginListening` 换大轮那个分支再兜一次。**边界没变**：同一大轮里（窗口还开着）照样累积，
换了大轮才清 —— 分界就是 cycleID。真机验过：合成 ⌃⌥ 起一轮 → 日志「新的一次按下（新的大轮）→ 全部清空」；
合成 ESC → 「ESC 取消（按住说话）→ 全部清空」；另有单测 `endingABigRoundWipesTheBoardBackToNothing`。
⚠️ 「任务完成、窗口自然到期」那条没在真机验过（走同一个函数、同一个调用点）。见 `开发经验/20` 9.57。

**第九版二十七补（2026-09-28）：卡片改成「7 字形」，并改成跟随鼠标。**
用户给的形状：**左上一条横杠 + 右侧一整条竖条**（阿拉伯数字 7），右下角那张 AI 回复卡嵌进凹口里 ——
理由是他的原话：「右侧……它非常非常长，而左侧又非常的少，所以就会占用一个很大的空白空间，
这完全没有意义」。这一轮**先出了样式稿**（`设计稿/看板7字形-样式稿.html`）给他过目，
他当场纠正三处，最终定稿：
· **横杠三段**（从下往上）—— ① **3 个方向选项贴死底边**（`maximumItemCount: 3`，一行三个，
  **只有「编号 + 文字」**：圆圈底 / ✕ / 状态边框全删）；② 参考标签一行（没有标题）；
  ③ **矛盾固定 10 行**（有没有内容都占着，逐行淡入）。
· **底部那一行按钮（折叠 / 执行 / 取消）整行注释掉** —— 看板现在是**纯展示**：执行走 ⌥⏎、
  退出走 ESC、取消说「取消任务看板」；按钮实现与宽度常量都留着，`barColumn` 里加一句 `actionRow` 就回来。
· **跟随鼠标**（原来是"显示那一刻锚一次"）：本地 + 全局 `mouseMoved` 各一个监听，每个事件把锚点
  更新成当前鼠标位置；那份"按住拖动"的监听整块去掉（拖动区随按钮行一起没了，留着只会打架）。
  定位改成**钉顶边**（`topEdgeOffsetAboveAnchor = 横杠高 + 30`）：横杠整条在鼠标上方、竖条一直往下。
  **实测 1:1**：鼠标 y 500 → 800，面板 y 219 → 519。
· 竖条宽 = **回复卡的最大宽度**（同一个常量 `NotchSupport.answerCardMaximumWidth` = 340），
  高度 = 内容高、上限 = 菜单栏以下 × 70%；**脑图的左下角有圆角**（凹角）。
· 顺带删掉 `AppSettings.directionBoardWidthMultiplier`（看板宽度倍数）与设置页那一行 ——
  宽度现在由形状定死，那个设置存了也不生效。
**两个只有真机才看得见的形状 bug**（`开发经验/10` D40）：① `Shape` 里**左上角那段圆弧漏了**，
`closeSubpath()` 从底左角直连回起点 → 左边缘成斜线（用户：「它整个机型的左侧边是畸形的，
为什么是个梯形呢？」）；② 竖条末尾的 `.frame(maxHeight: .infinity)` 把它变成可伸缩子视图 →
HStack 高度只由横杠决定、脑图被裁在 224 里（去掉后 16 行脑图 → 面板 700×264）。
**验证**：71 条测试全绿；AX 量到 700×251 / 264；跟随 1:1 实测；`开发经验/20` 9.56 有全过程。

**第九版二十五补（2026-09-27 深夜第二十七轮）：看板上那两下回车重新分配 —— ⌥⏎ 执行 / ⌘⏎ 粘贴。**
用户：「关于（实时对话）**转到 agent 模式**（快捷键替换成 **option+enter**），和**粘贴**的快捷键
（替换成 **com+enter**）」。**改的是判据，不是"哪两个键被监听"**（那条会吞事件的全局 tap 一个字没动）。
① 判据抽成纯函数 `BoardPasteShortcut.action(isCommand:isOption:)` → `.paste` / `.execute` /
`.passThrough`，两个入口共用、**能单测**（整张表钉在 `boardReturnKeysAreOptionToExecuteAndCommandToPaste`）；
② **`passThrough` 是真不吞** —— 那条 tap 原来在 `keyCode == 36` 之后无条件 `return nil`，
现在只有真做了那两件事之一才吞（**裸回车放行**：那两个动作现在都带修饰键，再吞掉裸回车只会白白
吃掉用户在别的 App 里的回车，而他毫无感觉；Command+Option 同时按着也放行 —— 不猜）；
③ 设置项从复用的 `ComposerSendShortcut` 换成自己的小枚举 `BoardPasteShortcut`
（Command+Enter / Option+Enter），编码走 **String 优先**（旧值 `"commandReturn"` 解得出、
`"returnKey"` 落到新默认，**不会抛错** —— 规则 E1）。
**真机三条各按一次读日志**：裸 ⏎ → 放行（不吞）／⌘⏎ → 粘贴并退出／⌥⏎ → 执行（转 agent）。

**第九版二十六补（2026-09-28）：⌘⏎「只是粘到剪贴板」—— 两层根因都不在粘贴本身。**
用户的报告：「**⌘⏎     → ⌨️ 看板：回车 → 粘贴并退出【没有实现，只是粘贴到剪贴板了】**」。
① **启动时 AppKit 把刘海面板选成 key，连窗口焦点一起偷走了**：`NotchPanel.canBecomeKey` 原来是
裸的 `true`，而启动那一刻它是屏上唯一可成为 key 的窗口 → `_sendFinishLaunchingNotification` →
`-[NSWindow makeKeyWindow]` → `_stealKeyFocusWithOptions` → `SLPSStealKeyFocusReturningID`
（新进程 8 秒 1ms `sample` 抓到的栈）。**每次启动 Wanna 都变成活跃 App**，合成的 ⌘V 落进自己的
key window；更要紧的是**用户在别的 App 里打字也进不去**（实测手打 `BBB` 一个字没进去）。
修法：`canBecomeKey` 跟着 `panelModel.isExpanded`（静止态永不 key）+ 收起时 `resignKey()`。
② **本进程合成的键盘事件根本落不到前台 App** —— 判别探针：终端进程发 ⌘V 落地、终端进程**自己装着
一条会吞回车的 `.defaultTap`** 也落地、**Wanna 进程**发 ⌘V 不落地、**Wanna 进程发不带修饰键的裸
字符**也不落地；同时刻 `活跃 App=文本编辑`、`Wanna isActive=false`、`keyWindow=无`、
`AXIsProcessTrusted()=true`、系统日志无 TCC 拒绝 —— 纯静默失败。修法：粘贴改走 **Accessibility**
（`kAXSelectedTextAttribute`，与"粘贴"同义），合成 ⌘V 只作兜底，**顺序不能反**（能落地的地方会粘两次）。
③ 顺带：看板面板原来在显示时 `makeKey()`（为"不点卡片就认回车"加的，而回车早由那条 tap 接住了）
—— 代价是它在屏上时**就是会话的 key window**，用户的字进不去、`holdsTheAutomaticSend()` 里
"面板是 key"那条判据**恒为真**（每次静音到点都被按住重算，自动发送等于从没生效过）。现在显示时
只 `orderFrontRegardless()`、绝不 `makeKey()`，那条恒真的判据删掉。
**连续三轮验证**（每轮全新文档 + 唯一标记）：启动不偷焦点 ✓、板子在屏上打字进得去 ✓、
⌘⏎ 分别插入 103 / 112 / 81 字 ✓。⚠️ **未验到**：`[TYPE:]` / `[PRESS:]` 用的是同一个
`pressKey`，很可能同样落不下去（此前那次"能打字"的实测是在**镜像 harness** 里做的，不是这个进程）
—— 没动它，等用户拍板。全过程见 `开发经验/20` 9.55 与 `开发经验/10` D39。

**第九版二十四补（2026-09-27 深夜第二十六轮）：脑图按「大类 → 具体问题」两级画 —— 就改提示词。**
用户：「右上角的脑图应该按照**内容的类型**来**分类**……它应该有一个**大的分类在外面**，
而不应该直接地去罗列出来」，并且「**实时地、主动地去分类**，而不是定性地强制让他去分什么类……
**即便是两个问题，也要让它有一个分类**」。我第一版方案把它想重了（App 记住分类名 + 每轮回传 +
逐行渲染上色 + 一套分类解析函数），用户一句话打回：「**它不就是一个提示词的问题吗？**」——他是对的：
那张图本来就是一段 **ASCII 文本**、分层靠缩进与树枝符号，所以只要规定
「**第一层是分类名（顶格、不带树枝符号），第二层才是问题（`├─` 打头）**」，解析、渲染、
卡片高度**一个字都不用改**。最终只动两处：① `transcriptAnalysisSystemPrompt` 的「第一件」整段重写
（两层形状 + 分类名由模型现场归纳 + 四条约束 + 一组"只是例子不是清单"的范例）；
② `mindMapWithoutEchoedTitle` 的判据**收窄**（它原来把"无树枝符号 + 以冒号结尾"的首行当回显删掉，
而**分类名现在正好长这样** —— 一个写成「关于明星：」的分类名会被连层级一起吃掉；现在还要**含
『整合/关系图/分类树/梳理』**才算回显）。⚠️ 中途我还**改错了地方**（写进了第二次调用的提示词，
而画图的是第一次）—— 打印真提示词才发现，已还原归位。
**真机一次就成**：分类顶格、问题挂下面、六件事全在，卡片 338pt、无裁字。⚠️ 老毛病复现一次：
模型把两件事写在同一个 `├─` 后面（提示词已警告）—— **没有在解析里替它拆**，拆就是替它编内容。

**第九版二十三补（2026-09-27 深夜第二十五轮）：方向相关性门槛抬到"非常高"，连续三轮干净收工。**
用户：「我发现用户问**北京在哪**，它也显示**保存到 Notion**……**没有阈值的话，相当于相关性 0.1
也放进去，相关性 99 也放进去。一定要是非常高的相关性**」。两个源头都堵：① **Jev 概率门槛
默认 0.5 → 0.8**（0.5 只是"比瞎猜更像"），设置里的范围抬到 0.5…0.95；② **本地关键词那道免费的路
也要过相关性** —— `matchKeywords` 里有「在哪/哪里」这种泛问词，问「**北京**在哪」会命中「指给我看」，
所以只要 Jev 给了概率，本地命中也要过一道 **0.5 的地板**（没配 Jev 时仍只认本地，那是兜底）。
路上还修掉两个真 bug：**「图突然没了」＝一次不带「细节」的回复把图覆盖成空**（落地是整块赋值 →
现在图那一行**只许被非空内容覆盖**）；**「完整的转写」其实是一堆重复前缀**（`spokenTranscript`
每段存的是"从上次回复停稳到现在"，而回复常在他还在说时落地 → 攒起来是「第一句」「第一句+第二句」…
模型看到一团重复只肯画两条 → 改成**存增量**）。**连续三轮（C1/C2/C3）判据与结果**：
每轮真实自检 2 分钟 + AX 取矩形 + 截图 —— 图 5/6/5 条**都是一事一行**、卡片高 338、
**无裁字**、方向格都只有 2 个且都相关、**无崩溃** → **三轮干净，按他的规则终止**。

**第九版二十二补（2026-09-27 深夜第二十四轮）：三连测之后的三处修复。**
用户：「你这测试三次，告诉我结果有问题，截屏，截屏，截屏。告诉我，然后自己修复。」
三轮真实自检 + 截图：图**三轮都出来了、内容也全**（7/6/6 件事）—— 剩下的问题是
**卡片比内容高一截（575pt，下面一大片空白）**、**两条问题挤成一行**，
以及换成"内容自撑"之后暴露的第三处：**左列被切掉**。
修法：① 删掉 `contentBlockHeight` 里那个 `2 × 264 = 528` 的历史地板（卡片该多高只有一个判据：
**内容需要多高**）；② 提示词补「**一件事一行**」；③ **"估算高度"这条路整段删掉** ——
先按固定行数、再按 `split("\n").count`，两版都错在同一处：**文字会折行**，
估算永远小于实际，屏幕上的表现就是"最后一行被卡片下沿切掉"。现在那一块用
`.frame(maxHeight:)` **让内容自己撑**（顶边钉住、往下长），上限只挂在屏幕上（70%）。
**第 6 轮验证**：卡片 338pt（原 575）、一事一行、**没有一处裁字**。
⚠️ 那两份 22:27 的崩溃报告是 **`WannaTests` 崩的**（测试里的强解包，已修）—— App 没崩。

**第九版二十一补（2026-09-27 深夜第二十三轮）："卡完之后就不显示"是晚到的梳理被整块丢掉。**
用户（附图：右列空、答案正常）：「**总是显示不出来**，而且会**明显拖慢速度**……**为什么返回速度
这么慢？而且总是卡，卡完之后就不显示了**」。根因是落地处那道闸
`guard roundGeneration == generation, isListening` —— 梳理**往往在用户已经按了快捷键 /
开了下一轮之后才回来**，于是结果被整块丢掉（`endListening` 里还有 `requestTask?.cancel()` 补一刀）。
**那张图是累积的，晚到几秒无害**，只有换 cycle 才该作废 → 改成 `guard currentCycleID ==
cycleIDAtRequest`，`endListening` 不再 cancel。**"为什么慢"**：梳理每次都要**重画整张图**
（输入是整份转写、输出是全部问题，行数已不限）→ 给它**单独一道更粗的闸**（`max(minimumAdded×3, 30)`
个字才发一次），**答案那条不受影响**。追问那条按他点名的做法把每一轮拆成
**【上一次的问题】/【上一次的结果】** 两块、各有标题（「不要直接一拥在一起，要标清楚」），
并且**最近那一条结果不再截断**（他追问"把最后一个结果展开说一说"，那句就在这段文字里；
原来砍到 600 字就答不上来）。

**第九版二十补（2026-09-27 深夜第二十二轮）：拼写只报"确实错的"；背景与问题机械分离。**
① 用户：「拼写检查过于细致……应该**根据上下文**判断哪些地方**确实**有错误，而不是针对**单个单词**
去思考有哪些拼写方式。**软件名称**这类才是重点」。提示词改成只报"确实错了且影响理解"的、
重点只有软件名/品牌名/英文词，并把他点名的那四种噪音（口语衔接词、普通词同音字、光凭猜测的名字、
断句位置）逐条列成"不要报"，最后一句是**「没有就写「—」，宁可空着」**。
② 「右下角卡片**过度关注屏幕内容和之前的内容**……**一定要 100% 重点关注用户最近的问题**」
—— 这条他第四次说了，所以**不再改措辞、改结构**：原来所有背景都拼在**用户消息**里，
而模型对"这一轮要答什么"的判断读的就是用户消息 —— 等于每一轮都在用一个巨大的用户消息告诉它
"这些都是要回应的"。现在**用户消息里只有那一句问题**，背景全部进**系统提示词**
（`understandingSystemPrompt(context:)`），并在那段前写明「**不是要你回答的东西**……
只让你回答**最后那条用户消息**里的事」。同一轮还清掉一处老话（"答案那一行**必须看图算**"）——
那句话本身就是"过度关注屏幕"的来源。

**第九版十九补（2026-09-27 深夜第二十一轮）：那张图没有行数上限，卡片跟着它长。**
用户纠正（并且对）：「**没有这个限制**。用户的内容可能是**两个小时**，那这个图就应该是两个小时
的内容。**用户所有的问题都应该在图里面显示**」。三处拿掉天花板：① 提示词「最多 20 行」→
「**不限行数**」；② 解析器 `maximumContinuationLines` 24 → **500**（只剩"防写成论文"这一个作用）；
③ **卡片跟着图长** —— `contentBlockHeight` 从定值改成 max(左列所需, **图的行数 × 16pt**, 264×2)，
上限挂在**屏幕**上（菜单栏以下那块高度的 **70%**，与右下角那张结果卡同一条规矩）。
行数用 `split("\n").count` 算而**不去量文字**（等宽字体、行高定；量文字要么再引一层
`GeometryReader`，要么量不到自然高度——它被 `maxHeight: .infinity` 撑着）：**可预测**，
所以卡片高度不会随渲染时机跳。

**第九版十八补（2026-09-27 深夜第二十轮）：⭐ 不再改措辞，去找结构性的东西。**
用户的判决书：「**这个问题已经调了十几遍了。你去思考一下到底问题出现在哪吧？这样调没意思。**」
—— 他说得对：前面十几轮有太多是在**改提示词措辞**，而其中至少三个是**代码里的结构性缺陷**。
① **解析器把长内容截掉了**：`maximumContinuationLines = 4`（整块最多 5 行），
而提示词要模型画"最多 **20** 行"的图 —— 多出来的全丢（他报的"只显示一部分、下面一大片空着"）；
改成 **24**。② **标签下面先空一行，整块就没了**（画树枝图时很常见，而收集循环遇空行就 break）
→ 允许跳过开头最多两行空行。③ **卡片把文字裁掉而下面空着**：左列每行写死 `reservedLineCounts ×
行高` 再 `.clipped()`（那是左列自由高度的年代留下的）→ 改成按内容自然高度、**由整列兜底**，
"卡片高度恒定"仍成立（它挂在**块**上，不挂在行上）。④ **请求里每一块都打 tag**
（用户点名：「用 **tag**，标签、书签这个符号的形式来给它分开」）：`<reference_materials>` /
`<previous_turns>` / `<previous_answers>` / **`<current_question>`**，并新增规则 1.42
「只有 `<current_question>` 是要你回答的，其余全是参考」。
⚠️ **教训：反复调不好时，先怀疑解析/渲染/数据流，而不是措辞** —— 那几个上限与 frame
都**不报错**，只是安静地丢内容，屏幕上却像"模型没做好"。

**第九版十七补（2026-09-27 深夜第十九轮）：树状图"突然消失"是每次按下把行擦了；没关系时不许提参考内容。**
用户（附图，右列全空）：「右上角的卡片，它这个树状图**怎么突然间消失了呢**……是不是某一个模型的
返回没有返回呀？」——**不是**。`beginListening`（＝又按了一次快捷键）里有一行把
`understandingLines` 重置成空占位符，而**下一次梳理要一两秒（现在两次调用）才回来**，
于是每按一次那张图就先整个消失再长回来；拆两次调用让这个空窗更长，所以他觉得"之前还很好、
现在总是突然没了"。这与他定过的规矩直接冲突（「只要没按 ESC，这几个卡片都持续显示」），
改成**一律保留上一次的内容**，新的一轮回来自然覆盖 —— 与 9.38 是**同一个毛病的两个面**
（那次清的是累积的图，这次擦的是画在卡片上的行）。
同一轮把提示词加强两处：① 没关系时 **不要提屏幕上的东西、不要提剪贴板、不要提之前的对话**；
② 新增 1.45「**没关系时的答案长什么样**」—— 就事论事地答他问的那件事、全文不提背景
（他报的现象正是"答一件跟屏幕无关的事时还要说一句'屏幕上是……'"）。

**第九版十六补（2026-09-27 深夜第十八轮）：追问看不到上一条回复 —— 拆两次调用时把那段摘掉了。**
用户（附图：右下角写着"我这边看不到你在上一轮已经给出的那份回复"）：「我追问之前的问题，
我发现他**无法知道我上一次回复了什么**，这是不可以的……我说的是**右下角这部分**」。
**根因是我自己引入的回归**：`previousCornerAnswersPromptBlock()`（"你刚才在右下角回过这几条"）
一直在，但 9.43 拆两次调用时我把第二次调用的参数从 `previousAnswers:` 换成了 `previousTurnsText:`，
那一段就再也没进过请求 —— 而它正是"改写类追问"唯一的信息源（他追问常很短：「重新换行列出」）。
三处修：① 加回 `previousAnswers`；② 提示词强化 —— 「他这一问很可能是在**改/追问**上一条，
**基于上一条改**，绝对不要写"我看不到"」；③ 顺手解耦：答案落地与"记下这一轮"原来都写在
"第一次调用成功"那个 `if let` 里（梳理失败会把答案和记录一起吞掉），现在抽成 `settleRound`。

**第九版十五补（2026-09-27 深夜第十七轮）：⭐ 拆成两次 API 调用 —— 用户给的设计，一次就成立。**
用户点破了根本矛盾：「刚才提示词是**既要让 AI 忽略之前的内容来回复最近的一个问题，
又要让 AI 参考之前的内容来总结所有的问题**」—— **不是模型笨，是我把两个方向的任务塞进了
同一个提示词**，它们互相打架、于是两边都做不好。他给的拆法（照做）：
**第一次调用没有任何上下文**，只喂那份完整转写 → ① 脑图（问过的每一件事）② **矛盾** ③ 可能听错的词
（这一行随后按他的意思从「歧义」改名成「**拼写错误**」——他用的是**语音输入法**，
要找的是"听起来像另一个词"的那种错）；**第二次调用带上下文**（截图 + 最近三轮 + 代码切出的
"这一轮问的那段"标成重点）→ **只出答案**（右下角那张卡片）与「选择」。
自检实测：图上**六件事全在**（前四轮 + 本轮）、矛盾/拼写错误各一行，答案由第二次调用单独产出 ✓。
⚠️ **记住这条判据**：**症状是"两边都做不好"时，先看是不是把两件事塞进了一次调用**。

**第九版十四补（2026-09-27 深夜第十六轮）：按用户口述的形状重写请求，并把提示词的残骸清干净。**
他给的形状逐条落地：① 请求里新增「【他到目前为止说过的**全部内容**（连续的实时转写，按时间顺序）】」
—— `spokenTranscript` 按轮攒、**整份发下去**，「哪些是一件事」**由 AI 提炼**（不是代码替它提炼）；
② 「从**上一次停两秒到这一次**」那一段由代码切出来，单独标成「**重点只看这一段**」并**排在最后**；
③ 历史 5 → **3 轮**，标签改成**「最近一轮 / 最近二轮 / 最近三轮」**。
⭐ 为了回答他"你的提示词到底是怎么写的"，把**真发出去的**两段用探针打出来看 —— 一眼发现
`细节` 那一行里**留着前面几轮反复改的残骸**（一处"最多 20 行"、下面又留"最多 **7 行**"，
中间还夹着一段**讲卡片排版的话**），规则段也还留着「需求/目标」这两个**已经删掉的行**。
⚠️ **教训**：提示词是"改了很多轮"的地方，最容易积下**互相矛盾的残骸** —— 它不报错，
只让模型行为变得莫名其妙。**每次大改之后把真发出去的提示词打出来读一遍**。

**第九版十三补（2026-09-27 深夜第十五轮）：⭐ 用户点破 —— 这就是一次大模型调用的事，我把它搞复杂了。**
用户连着两轮报「右上角**总是**无法把用户所有的问题全都收集起来」，然后一句话点破：
「把之前解决的这个回复的内容……当作一个**参考内容**，然后让他生成几个标签的文本……
**其实就是一次大模型调用就能够解决所有的问题**……**不要涉及很多复杂的逻辑**」。
**他是对的，而且指出了我错在哪**：前两版我都在改措辞（"必须一字不少地带上"、改标签），
而真根因是**输入不全** —— 请求里只给**前五轮**问答，却要模型写出"到目前为止**所有**问题"的图，
它手里根本没有更早的内容，只能靠"记得上一张图"，于是每次都丢几块。
（中间我还试了一版"App 自己按行拼接累积"，被用户当场否掉：复杂逻辑。）
**改法就是把信息给全**：`askedQuestions`（这一会话里他按顺序问过的每一件事，短句，去重，上限 40）
**整份**发下去，模型从完整输入写一张完整的图 —— 不需要记性、也不需要 App 替它拼，
**一次调用解决**。验证：自检第六句「北京跟上海是什么关系」前五句全是别的话题，
最后一轮的图上**六件事全在**。
⚠️ **教训**：当模型"总是做不到"时，先问**"它手里的信息够不够"**，再问"要求写得够不够狠"。

**第九版十二补（2026-09-27 深夜第十四轮）：新问题没进图的真根因是"标签说它已经完整了"；
提交给 agent 的那段现在带上全图和"怎么看最后一轮"。**
用户（附图圈出「问题=北京上海的关系是什么」）：「他把我所有的问题……**没有显示出来**呀？
**他把他放到矛盾里面了**。**他即便是矛盾的话，他也应该在右侧显示，因为他是用户的一个问题啊**」。
上一轮刚加过"这一轮的问题必须在图里"却**没管住** —— 真根因在**我给旧图的标签**上：
请求里写的是「【你上一轮整理出来的那张图（**这是到目前为止所有问题的汇总**）】」，
模型读到"汇总"就认为它已经完整，于是原样抄一遍、把新内容放进更"合适"的「矛盾」里。
改法：标签改成「**它还不包含他这一轮刚问的**」+ 要求写成"两件事，缺一件就是错的"；
并明写「进了「矛盾」**不等于**不用进那张图 —— 同一个问题，图上要有它，矛盾里也可以有它」。
**自检里加了第六句「北京跟上海是什么关系」**（前五句全是别的话题）验证：最后一轮的图上，
前五轮的每一条都在、**新问题也在** ✓。
同一轮还补上了他要的"实时模式的最终产物"：`decoration` 的尾巴现在带着
**到目前为止那张需求图**（标成"只是背景"）+ 一段固定的 `<how_to_read_the_last_turn>`
（没关系→只执行最后一件；有关系→综合全盘考虑，连他那个"旅游景点 → 建文件夹"的例子一起写进去）。

**第九版十一补（2026-09-27 深夜第十三轮）：图上的问题少了 —— 机制是通的，边界错了。**
用户（附图 + 一个大红框）：「屏幕右上角显示的**不是用户所有的问题**……**有大量的问题，
他没有显示出来**」。**先量**：加打点（带上旧图 N 字 / 这一轮的图 M 字）跑自检 ——
`0 字 → 84 字 → 83 字 → 83 字`，**每轮都带上去了也都并回来了，机制完全正常**。
**问题在边界**：`beginListening` 里那句"换了一次 cycleID 就清空"（理由是"一次实时会话一张图"）——
而他那些问题是**分很多次按下**问的，于是**每按一次就把之前整理的全清掉**。
改法：**去掉那次清空**，图跨按下、跨 2 秒一轮、跨"交给 agent"一路累积
（它回答的是"用户到现在为止到底在做什么"）；重开入口留了 `resetAccumulatedMindMap()`，
**目前没有任何路径自动调它**（ESC 也刻意不清 —— 清了才是真丢东西）。
同轮提示词把"并进去"写成硬要求（**每一条必须一字不少地出现，少一条就是错的**），行数上限 12 → 20。

**第九版十补（2026-09-27 深夜第十二轮）：右下角卡片的流式渲染对齐参照物 + 底部蒙版只在截断时挂。**
用户（附图）报「右下角卡片渲染有问题：有一个字溢出了字体范围，而且应该是圆角，实际却不是圆角」，
并直接指了参照物：「你看一下 **Agent 模式下右下角的卡片**是怎么渲染的，**那个比较流畅**」。
逐条对下来两处差别：① **我给看板的流式加了 8 次/秒的限流**，而参照物（主 Agent 的 `onTextChunk`）
**每个分片都写**；模糊焦点那套动画按"字刚到的节奏"设计，8/秒的批量更新把它打乱成一顿一顿
（当初加限流的理由"整块重排白烧主线程"**没量过且是错的**——参照物每条写 100+ 次，`sample` 里没有热点）。
去掉后实测每条回复**边收边画 45–113 次**（限流时 ~16）。② **底部渐隐蒙版原来无条件挂着**，
它是**矩形**的，把卡片最下面 7% 淡掉 → **下圆角和下边框一起被吃掉**（7% ≈ 14pt ≈ 圆角半径那一圈），
屏幕上是"上面圆、下面方"。现在只有"自然高度 > 上限"才挂（`isAnswerCardTruncated` + 量自然高度的
`PreferenceKey`）。⚠️ **「有一个字溢出字体范围」这一轮没动**：那是 `①` 这类要走 fallback 字体的字形，
而流式那条路逐字一个 `Text`、行高取系统字体的 `linePitch` —— 改它要动断行与卡片高度算法，
属于"要量过再改"的那一类，如实记着。

**第九版九补（2026-09-27 深夜第十一轮）：字幕卡顿 —— 量到了，也改小了；脑图要记下这一轮的问题。**
① 卡顿（用户：「刘海下面这个文字**特别卡顿**……**在录音模式下也非常卡顿**」，两处是同一个视图）：
这一行**以前是猜过来的**（文件里那句注释自己就写着「真正的根因要等采样说话」）。
这次先给它**做出可复现的入口**——`=stream` 自检本来就能按 10 字/秒喂假文本，
但那一行只在相位 Listening 时才画、自检永远到不了那个相位，所以**从来没量过**；
现在自检强行显示它，然后连拍 20 帧 + 一个 30 行的 CoreGraphics 探针量"最左亮像素"的位移剖面。
**量到的**：主线程基本闲着（**不是 CPU**），真正的症状是**速度以 ~5Hz 摆动**
（每 100ms 位移 34px/22px 交替，±23%）。**根因**：动画时长取的是"上一条的到达间隔"，
而到达时刻有抖动（0.09–0.12s）——间隔变长那一次**动画先跑完、空等几毫秒、再跳一下**。
**修法**：`时长 = 间隔 × 1.2`，**让动画永远跑不完**（目标值是绝对值，所以"永远差一点点"不累积）。
**改完再量**：摆动 **±23% → ±10%**，剩下的与我的采样抖动同量级。
② 脑图漏掉这一轮的问题（用户：「我明明问的是屏幕里是什么软件……但右上角的脑图为什么没有
把这个问题记录下来呢」）：提示词加了自查（"这一轮问的必须在图里，找不到就说明你漏了"）；
另外模型把提示词那句抄成了图的第一行，两头堵 —— 提示词明写"直接从 `├─` 开始、不要写标题"，
解析处 `mindMapWithoutEchoedTitle(_:)` 再兜一次（判据很窄：不含树枝符号且以冒号结尾）。

**第九版八补（2026-09-27 深夜第十轮）：两张卡片分工定死 —— 右上统筹全部，右下只答当前。**
用户：「**右侧的脑图显示的是用户之前问过的所有问题**……无论是**连续的还是间断的**，只要是在
**实时模式下没有停止**，都会**统一记录**……**无论它们有没有关系**，都梳理出它们的**逻辑关系**……
比如用户第一个问题是关于**行业 A** 的，第二个是关于**行业 B** 的，第三到第十个都是行业 B，
**如果总是以行业 A 为标准，那就没有意义了**」＋「**右下角**是关于**当前这个全新循环**的问题……
**一定要标清楚前一轮、两轮、三轮、四轮、五轮分别是什么**」＋「现在右下角做得很好，
但**右上角应该统筹全部内容**，去思考用户到底在说什么」。他报的 bug：
「说了问题 A，后面又说 200 个关于 B 的问题，系统会认为后面这些问题跟当前没有任何关系，这是不行的。
**之前的内容永远只是参考，重点是要回复用户当前的问题**」——根因是上一轮我把
「没关系就一个字别提之前」写成了**全局规则**。三处改：① **脑图累积**
（`accumulatedMindMap`，每轮把上一轮那张图原样带下去、要求"在它上面继续、换了一件事就新开分支"，
一次实时会话一张图）；② **规则拆开**：新增 1.35「两张卡片分工不同」（图统筹全部、答案只答当前），
1.4 那条**只约束答案**；③ 前几轮的标签按他点名改成「上一轮 / 上两轮 / …」。

**第九版七补（2026-09-27 深夜第九轮）：模式边界（实时 ⟷ agent）+ 左侧再简化 + 右侧要带原话。**
用户把两个模式说开了：「按下快捷键之后……进入**实时模式**……**当用户按下快捷键的那一秒，
就马上切换到 agent 模式**。agent 模式情况下，**右上角的卡片不需要显示**，也没有这些轮询，
**也不需要去用 JEV 模型**……**也不需要去钓大语言模型**，也不需要生成什么脑图……
**你现在实时模式已经延伸到了这个 agent 的模式**，它现在还是显示右上角的内容，**这个我需要不显示**。」
**它为什么会跑进去**：显示判据是相位，而**追问窗口是"回答一开始播"就武装的** —— 那一刻相位回到
`.listening`，板子又冒出来，并且继续轮询（拿的是上一句的转写）。两处改：① **起表挪到"用户真的开口"**
（`onContinuousListeningUtteranceBegan`）——窗口武装只代表麦克风开着，不代表有东西可分析；
② **显示判据再加一道 `DirectionBoardSession.shared.isListening`**（它是唯一说得清"实时还是 agent"
的东西；相位不够用）。
同一轮：**左侧只剩 参考 + 矛盾**（`understandingLabels = ["细节","矛盾"]`，「需求」并进脑图，
老名字降级成边界标签）；**右侧要带上用户的原话**（用户：「太简洁了……**太过度简洁了**，
明明说得很详细你都给他**压缩没了**……**不要过度极简**，因为过度极简的话就让用户觉得
**他没说过一样**」）。卡片总高度不变，左侧少的那一行全给脑图。

**第九版六补（2026-09-27 深夜第八轮）：流式渲染 + 「没关系就一个字别提之前」。**
① 用户：「现在你**没有渲染逻辑**，你相当于是**直接贴上去了**……**延迟非常长**。所以像流式输出，
然后加上渲染逻辑、加点动画啊。」根因是一行：`analyzeImageStreaming(..., onTextChunk: { _ in })`
—— **回调是空实现**，分片全被丢掉（而那个客户端每来一个 SSE 分片就交一次累积全文）。
现在 `applyStreamingParagraph` 接上：**节流 8 次/秒**、**只更新"半截文本里已经有内容"的行**
（否则写好的行会退回占位符再长回来＝闪）、**答案同步流进右下角那张卡片**并告诉它"这条是流式的"
（新增 `isBoardPreviewStreaming`；⚠️ **不复用** `isAnswerStreamLive` —— 那个标志的主人是主 Agent
那条管线，两边同时在跑时共用一个布尔必然互相踩）。行是固定高度 + 值带 `.id(value)` 淡入，
所以流式是"内容一行行长出来"、骨架一个像素不动。
② 提示词：「**有关系的话去回复，没关系的话就不要去回复跟之前问题的任何内容**……
我一开始问**编程**，两秒后他回复了，后来我又问**中国在哪**，那跟编程一点关系没有，
第二个问题就应该**只回复中国的问题**；**有关系的时候才参考，没关系是不参考**」——
系统提示词 1.4 与请求里的 `<previous_turns>` 都按这条重写，并把编程/中国那个例子抄了进去。
⚠️ **我这一轮踩的坑**：验流式时又跑了一次 live 自检，收尾的 `pkill -f "…/Wanna.app/…"`
**把用户正在用的那个实例一起杀了**（他当时正对着麦克风说话）。规矩：**用户在用机器时，
pkill 必须限定到自己启动的那一个 pid**，别按可执行文件路径通杀。

**第九版五补（2026-09-27 深夜第七轮）：⭐ 一个"沉默的空问题"。** 用户报「我问他问题，他没有回复我」
（附图：需求 `—`、矛盾 `—`、右下角没答案、**左上角五行方向格整块消失**）。**前两件是同一个根因**：
`DirectionBoardSession` 里有**两个**孪生字段 `latestTranscriptUpdateAt` 与 `lastTranscriptUpdateAt`，
而**后一个从来没被赋值过**（永远 `distantPast`），`latestTranscriptAfter(_:)` 读的正是它 ——
于是恒返回空串；而我这一轮刚把"这一轮的新问题"定义成它，结果**发给模型的是一段空问题**，
它老老实实回了一屏「—」，不报任何错。两条修法：① **同一件事只留一份状态**（删孪生字段）；
② **兜底：算出来是空就用整段** —— 既然"这一轮的新问题"永远不该是空的，就**不允许**它是空的，
以后再有什么判据失效，最坏也只是退化成"拿整段当问题"。顺带：**方向格不再凭空消失**
（原来是 `if !displayedItems.isEmpty`，本地关键词没命中时整块不见、下面全往上跳 ——
用户：「整个样式和位置不应该变化。我发现左上角这五行突然间消失了」），现在永远画着、没内容画占位，
与「需求/矛盾空着也画 `—`」同一条规矩；**呼吸灯加深**（底色 26% → **70%**、谷底 12% → 30%）。

**第九版四补（2026-09-27 深夜第六轮）：实时那条链收口 —— 两张卡只做一件事、停顿两秒发、前五轮参考、呼吸灯。**
用户把这两张卡片的用途讲死了：「右上角的卡片是**对用户需求的梳理**，右边的脑图也是一样……
**全部都是在做一件事：分析和理清用户的需求**。它可能是连续的，也可能是跳跃的」（他给的例子是
连着问五句北京 —— 「这些都是关于北京的信息，那么在脑图里就可以梳理出关于北京的一些东西」）。四件：
① **停顿判据收口成"两秒"**（原来读的是设置值的一半，故意留出预览比真答案早到的窗口；
他这次明确：「**检测用户说话，停顿两秒，自动发送给 AI，就这么简单**」）；
② **"新问题"是切出来的** —— 「**从 AI 回复停稳那一秒到用户第二次停顿**，中间的内容要提取出来，
**这个文本就是用户全新的问题**」，实现是 `latestTranscriptAfter(recentTurns[0].at)`；
③ **前五轮参考 + 新问题排最后**：新增 `recentTurns`（一轮 = 他说的 + 你回的，保留 **5** 轮）
**取代**原来分开的 `recentReadings`（三轮理解）与 `recentCornerAnswers`（三条答案）——
那两份在提示词里各说各的，而他要的是"一轮 = 问 + 答"；请求顺序是
**参考材料 → `<previous_turns>`（写着"这只是参考"）→ 新问题（写着"重点只看这一段"）**，
系统提示词加了规则 1.4「只看最近这一次」并把北京那个例子抄了进去；
④ **左下角折叠钮的呼吸灯**（`isUserSpeaking`：转写每来一次字亮 0.9 秒，代次计数防旧超时吹灭新灯）——
让用户知道"卡片是不是真的在收他的话"。⚠️ **不许用 `Timer` 逐帧改透明度**（24fps 主线程工作，
这个仓库为逐帧主线程吃过亏），交给渲染服务器；而 `repeatForever` **必须挂在一个会变的布尔上**
（挂在"是否在说话"上是没用的，那个值只说一次）。

**第九版三补（2026-09-27 深夜第五轮）**：左侧两个行名改成 **需求 / 矛盾**
（用户：「把左侧这个**目标**调整为**需求**，把**疑问**调整为**矛盾**，**因为左侧其实就是在了解用户的需求**」）——
`understandingLabels`、`reservedLineCounts` 的键、`questionLabel`、提示词里那两行的标题与措辞一起改；
**老名字一律留成别名**（模型写回「目标：」时那一行才不会空、内容才不会掉进正文）。
`<previous_questions>` 那个**段名不动**（它是协议不是界面）。验证走**不启动 App 的探针**（`开发经验/03` 第四节）：
实测 `["需求", "细节", "矛盾"]` 且老标签照样落在正确的行上 —— **不再用自检模式跑真机**，
因为那块卡片**吞回车**（全局 tap 是故意吞的），而用户当时正在同一台机器上打字。

**第九版再补（2026-09-27 深夜第四轮）**：左列 48% → **38.4%**（用户：「左侧有点太宽了，缩小 20%」）；
**「疑问」那一行的形状定死** —— 用户：「不要用 Markdown 格式，用"关于什么什么的疑问："的形式，
**冒号后留一个空格**，右侧显示具体的疑问内容」。提示词里写成带空格的样式并要求不要 Markdown；
解析处 `DirectionBoardPrompt.formattedQuestion(_:)` 再兜一次（剥 `**`、**第一个**冒号统一成全角、
其后补一个空格，**只对「疑问」这一行**生效 —— 别的行没有冒号约定，套上去只会误伤）。
⭐ 部署后那一轮自检里模型对一句话**自己判定没有逻辑矛盾、直接写了「—」**（上一轮写的是
"要写进 Notion 哪一页、还是只当本轮答复"那种墨迹）—— 上面那三条提示词改动真的起作用了。

**第九版补（2026-09-27 深夜第三轮）：卡片尺寸与底栏统一 + 参考材料改道 + 提示词三条。**
**① 尺寸**：疑问 10 → **5 行**（「太大了，缩小 30%，再缩小 30%」）、表格 **4 行**、参考 **3 行**、
左列 **40% → 48%**、目标 6 → **8 行**。**② 标题换行**（用户：「把右侧的标题和内容**换行显示**……
**这样内容会有更多空间**。标题在上面，内容在下面，标题文字稍微大一点」）：
行从 `HStack(标签, 值)` 改成 `VStack(标签；值)`，标签 11 → **12.5pt**、自己占 18pt 一行 ——
值于是拿到**整列宽度**（原来被标签那一列吃掉 50pt）。**③ 底栏变成"一条按钮"**（用户：
「所有的按钮**样式变成统一的样式**，**用颜色来区分**，可以理解为**它们是一个按钮**……
**用分割线和颜色来区分**」）：一整条圆角底铺满卡片左/右/下三边，每格同高同字号，
**格子之间一律一条纯白细线**，每格刷自己那一组的颜色（折叠＝灰 / 复制·执行·退出＝绿 /
取消两档＝暗红）；行高按他说的 **+30%**（21 → **27**，上一轮刚减了 20% 他说太小）。
⚠️ 贴边仍然靠负内边距，**后面不许跟 `frame(height:)`**（跟了就等于没写，见 9.20）。

**④ 参考材料改道 —— 访达那一整套删掉**（用户：「把**识别选中文件和选中文件夹的逻辑删掉**，
只保留一个自动的、默认的去查看屏幕。参数参考来源：**第一是屏幕，第二是剪贴板**。如果用户说的是
参考文件、参考文件夹，**这时要去看剪贴板的内容是不是文件夹路径或文件路径**……**检测一下剪贴板的内容
是不是一个路径、是不是一个绝对路径就可以了，不需要去看选中文件。我发现这个东西很难实现**」）：
`NSAppleScript` 问 Finder、专用串行队列、`-1743` 回主线程重发、`NSAppleEventsUsageDescription`
整块删掉；第三类关键词改走 `readClipboardForTurn(requireAbsolutePaths: true)` ——
**文件 URL 与绝对路径文本都认**（`TurnReferenceMaterials.absolutePaths(inText:)`，只认 `/` 与 `~/`
开头，**相对路径不认**），拿到就同时写进 `selectedPaths`（标签照常）与 `clipboard`（提示词照常），
拿不到就标「无法识别」。⭐ **"说的那一刻读、读到就冻住"是要害**：剪贴板会变（他一边说一边在别处复制），
所以快照进 `materials`，拼提示词时用它 —— 他自己的理由就是「**写入进去之后，要存到提示词里面**，
因为未来用户复制其他内容的时候，你可能就忘了」。关键词默认值换了（`参考文件/参考文件夹` 放最前）
并配了**老默认值迁移**（不配迁移老用户的新词永远不生效，9.5 踩过）。

**⑤ 提示词三条 —— 关键词是「墨迹」**：**疑问只写逻辑矛盾**（用户：「我问他北京在哪，
他就问**什么地方的北京**；我让他介绍一个人，他就问介绍什么人，这就太墨迹了。**你只需要关注逻辑矛盾**，
其他点以后再说。**用户的问题正常回答就好**」—— 提示词里明写不许问澄清类的问题，并把那个反例抄了进去）；
**目标只看用户自己的话**（「**用户的提示词才是目标**……屏幕上的内容是参考部分」）；
**以当前这一句为准**（「可能跟当前屏幕完全没有任何关系，可能跟上一个问题也完全没有任何关系」——
同一件事往下推就把图接着长，换了一件事就**重开一张图**）。请求里那一段的标签也改了：
「【用户的原话 —— **这是重点，目标以这一段为准；屏幕上的一切都只是参考材料**】」——
他要的「在打标签上、在关注重点上，要告诉 AI 应该怎么去关注」。顺带在 `normalizedValue` 里
剥掉模型硬写进来的 Markdown `**`（屏幕上本来是两个裸星号）。

### ESC = 打断（2026-09-27 用户定）

用户的原话：「1. 第一次按下：开始触发……2. 第二次按下：保持现有逻辑不变。3. 按下 ESC 键：打断……
用户在**录音时**按下 ESC，直接中断录音，但**录音需保存到本地，与正常录音一致**……**执行过程中**……
点击 ESC 为**真打断**，具体停止范围包括：**语音播报、卡片下角的卡片，以及当前任务（即刚才提交的
任务）所涉及的所有 agent**。注意：**仅打断刚才这一次提交的全部内容，之前提交的不算。**」

**接在已有的那条 CGEvent tap 上**（`GlobalPushToTalkShortcutMonitor.escapeKeyPressedPublisher`），
不新建监听：选它的理由和说话快捷键一样 —— **不要求 Wanna 自己是 key window**（用户多半正在别的
App 里干活，而那正是"打断"要发生的场合），而且这个 tap **只读不吞**，所以不属于这一轮的那一按
原样进前台 App。长按重复用 `keyboardEventAutorepeat` 挡掉。

**判不判，由这一轮在不在跑决定**（`CompanionManager.handleEscapeKeyPressed`）：
**编辑窗开着 → 收起编辑窗**（既有语义优先）｜**正在听 → 中断录音，录音照存、什么都不发**
（`turnCancelledByEscape` 只在 `handleFinalTranscript` 里判，且判在 Notion 那道岔**之前**）｜
**正在跑 → `interruptActiveResponse()`（播报 + 卡片 + 主循环含 sub agent）+ 只收这一轮派出去的
agent**｜其余什么都做。

⚠️ **外加一条不随上面各支走的**（2026-09-28，用户报「永远无法停止」）：**那个追问窗口只要开着，
ESC 一定把它关掉**，与这一轮在不在跑无关；实现上它在**所有分支之外**（进门先读一次
`isContinuousListening`，开着就 `endContinuousListeningWindow`），下面那一支读**进门前**那个值。
它为什么必须在分支之外 —— 那一刻控制流落进了「正在跑」那一支（`voiceState` 已是 `.idle`，
但 `currentResponseTask` 还没置空），而**那一支里没有关窗口这一句**：播报、卡片、任务、agent 全收了，
**只有麦克风还开着**，一直听到 30 秒到期。判据是用户自己的话——「我手动退出了 = 我代表这个任务
已经完成了」，而窗口存在的理由正是"对话还在继续"，两者不可能同时为真。根因、复现脚本与教训见
`开发经验/10-踩过的坑.md` D41、`开发经验/20` 9.68（`scripts/listening-stop-check.sh` 按两条退出
方式各带四个断言，**造它之前这个问题只有用户碰得到**）。

**「这一次提交」= `groupID`**（`turnGroupID`，一轮生成一次，派活时写进 `EphemeralAgent.groupID`）。
另外三个候选都被排除，理由写在 `AgentActivityBoard.cancelRunningTasks(inGroup:reason:)` 的注释里：
`sessionID` 是会话（跨多轮，按它停会杀掉之前几轮的活）、`startedAt` 没有边界、`cardID` 会被兜底
交接**改写**。收尾用 `failed` + 一条 reason（对用户就是"这一轮没做成"，reason 让复盘看得出是被
ESC 打断的）。

⚠️ **一处结构边界**：一张 Claude Code 卡片只有**一个**子进程，所以"只停这一轮"在那张卡上做不到 ——
`agentSessionManager.interrupt(sessionID)` 会把这张卡上更早那一轮的活一起停掉。这是那个数据结构
本身的边界，已在注释与 `开发经验/17` 里写明。

### 主 Agent 上的「存成一条 Notion 笔记」（2026-09-27 从录音搬过来）

**用户说话期间跑关键词检测，命中就在刘海左侧长出那几颗按钮** —— 这就是用户在 `开发经验/17` 里说的那件事：录音只管「录 → 转写 → 润色 → 落盘 → 剪贴板」，而「关键词识别 + 后端监听」这整套执行能力归主 Agent（「主 Agent 快捷键本质是一个执行类的 Agent，那就让它真正具备执行能力」）。

三个文件，各管一段：**`NotionNoteDetector`**（`nonisolated enum`，纯逻辑：模糊匹配 / 编辑距离 / 命中计数 / 模型回复的三段切分 / Markdown → Notion 块，一行逻辑没改地搬过来的，所以能脱离整个 App 单独编译跑 —— 15 条断言在真源码上全过）；**`NotionNoteSession`**（`@MainActor ObservableObject` 单例，状态 + 那 2 秒/3 秒的检测表 + 参考材料截图 + `saveNote` + 三颗按钮的动作）；**`NotionNoteButtonRow`**（那三颗按钮的"画"，从 `NotchRecordingOverlay` 原样搬来）。

**接线点是主 Agent 的语音路径**：按下说话键（`beginListening`）与连续追问窗口打开时起表，说话期间每一句实时转写经 `noteNotionLiveTranscript` 喂进去，收尾时 `handleFinalTranscript` / `submitFollowUpQuestion` 各过一道 `consumeNotionNoteTurnIfNeeded`。**它是消费型的** —— 判完状态就清干净，所以随后来的打字提问不会捡到这一轮的残留；连续追问里判完 `.none` 会**重新起表**，否则窗口里说的第二句就没有检测了。

⚠️ **取消语义是两条路唯一一处不同，别再改成一样。** 录音那条点「取消」= **按普通录音走**（照常存一场录音，只是不写 Notion）；主 Agent 这条点「取消」= **这一轮什么都不发**（不截图、不问模型、也不写 Notion）—— 这里没有"照常"可退，退回去就是拿用户已经否掉的东西去问模型、去写一页云端笔记。两条路**都要留下东西**（同一条原则）：录音那条留下录音，主 Agent 这条本该留下本地那条录音 —— 但「每一轮都保留音频」是接线图的第 4 条、**还没接**，所以今天这条只做到"不发出去"。

**按钮那三颗的几何没动**：点仍然是 `NotchWindowController.handleGlobalClick` 里那三个 slot，读的仍然是 `NotchSupport.notionNoteButtonFrame`；改的只是"画"从录音带那块面板搬进了刘海面板（静止 pill 与展开态那条状态带各有一处 `NotionNoteButtonAnchor`）。两者靠**相减**发生关系：`NotchSupport.notionNoteButtonPlacement(on:)` 由 `notionNoteButtonFrame` 与 `restingWindowFrame` 直接相减得出三个偏移，不是另写一份几何 —— 实测屏幕上的 AX frame `(622,1,52×30)` 与算出来的命中矩形 `(622.5,1086,52×30)`（AppKit y 向上）**逐点重合**。那一行 `.allowsHitTesting(false)` 是刻意的：面板展开时它是收事件的，若这里也吃点击，同一个动作会被 SwiftUI 按钮和全局监听各触发一次（"打开那一页"会开出两个标签页）。

### 主 Agent 的每一条指令都存成一条录音（2026-09-27，接线图第 4 条）

**用户的原话**：「把用户的每一条指令都保存为录音，也就是说在录音这个设置页面里面包含的不只是录音
这个快捷触发的用户的提示词和说的话的内容，包括每一条平时的每一条指令也都去以录音的形式保存下来，
包括这个原文啊、转写啊、重新撰写啊这些功能所有的功能」。他拍板的两条：**主 Agent 每一轮都要保留
音频**（所以这一轮也落 `.wav`，历史里「播放 / 重新转写 / 在访达中显示」三颗按钮全部可用）；
**主 Agent 上点取消 = 不发出去，只保留本地一条录音**。

**它是接线，不是合并。** 长录音那条路（上一节）**一个字都没动** —— 用户对那个功能的要求是
「独立接线，跟当前整个面板里任何功能都没有关系」。两边共用的是三样已经跑通的组件：
`RecordingAudioWriter`（边录边写、停止时回填 WAV 头）、`LongFormTranscriptWriter`（`.txt` + `.jsonl`）、
`RecordingLibraryStore`（每场一个 `<id>.json` + 历史索引 + 变更通知），加上同一套 **16 kHz 单声道
PCM16** 与同一个 `makeSessionID()`。所以**设置 → 录音 的历史、复制全文、播放、重新转写、
在访达中显示，一行代码都没有为新来源改** —— 它们只认那几个文件名。

**音频是寄生来的，一个字节都不多采。** `BuddyDictationManager` 本来就在往识别器送音频（按住说话那条、
连续追问那条），这一条只是在**同一个 tap 回调里**多调一次 `capturedAudioBufferObserver` ——
**VAD、连续监听、打断判定一个字节都没动**，观察者是纯读的。连续追问的窗口整场开着麦克风，
所以「这一轮从哪一秒算起」由「用户开口」那一下给：`onContinuousListeningUtteranceBegan`，
挂在 `markContinuousListeningUtteranceActive` 里，同样只是观察，不参与任何判断。

**一轮 = 一条录音，边界是三段**：

```
armTurn()                      按下说话键 / 连续追问里用户开口
  → 第一块音频到达            真的开始录了（**这一刻才建文件**）
  → finishTurn(transcript:)   这一轮结束了（发了 / 存成笔记 / 被取消，三种都算）
```

「第一块音频到达才建文件」是刻意的：`armTurn` 与"真的开始录"之间隔着权限检查、开 ASR 会话、
装 tap 几步，任何一步都可能中断（按住说话模式下快速松手就会取消整个启动任务），一 arm 就建文件
会在历史里留下一串 0 秒的空录音。所以 `AgentTurnRecorder` 分成两半：`AgentTurnAudioSink`
（`nonisolated`，活在采集线程上，三个状态 idle / armed / recording）与 `AgentTurnRecorder`
（`@MainActor`）。`BuddyPCM16AudioConverter` 因此标了 `nonisolated`。

⚠️ **但"标了 nonisolated"只是让它能在那儿被调用 —— 那一半的工作量本身必须挪走。**
2026-09-27 实测（tap 内分段计时，每 100 块；一块音频只有 21.3ms）：`AgentTurnAudioSink.append`
在最开始那版里**在渲染线程上**做重采样（48k 9ch → 16k mono）+ 建文件，平均 **6785µs / 峰值 13874µs**
一块，加上送识别的 9088µs，**采集线程被占到 ~78%** —— 用户听到的就是「正常说话时会卡一下」。
现在 `append` 在采集线程上**只 `memcpy` 一份缓冲**（引擎会复用那一块，所以必须拷），
重采样 / 建文件 / 写盘全在 `writeQueue` 上（`close()` 本来就 `sync` 排干，所以正在转换的那一块
不会被 `finalize()` 抢在前面）。改后同一段按键：**6785µs → 40µs（峰值 155µs）**，
`.wav` 逐项核过（`afinfo` 1ch/16kHz/16bit/31.597s、样本峰值 2551 非静音）。
**剩下的 9ms（识别）是既有成本，不是这条观察者引入的**，但它最大 17.4ms 已经贴近 21.3ms 的块周期。

⚠️ **取消语义是两条路唯一一处不同，别再改成一样。** 长录音那条点「取消」= 按普通录音走
（照常存一场录音，只是不写 Notion）；主 Agent 这条点「取消」= **这一轮什么都不发**（不截图、
不问模型、也不写 Notion），但**本地那条录音照留**。两处都要留下东西（同一条原则），而"照常退回去"
在主 Agent 这条路上是**拿用户已经否掉的东西去问模型、去写一页云端笔记**，所以退不得。
**实现上靠的是顺序**：`finishTurn(transcript:)` 排在 `consumeNotionNoteTurnIfNeeded` **之前** ——
三个去向都经过它，不可能漏。另有一件**不是取消**的事：**没听到话**（转写为空）走 `discardTurn()`，
文件直接删掉 —— 取消是用户对已经听清的一句话说不发，那一条要留；这里根本没有一句话。
**「没听到话」有两条出口，两条都要通知**（2026-09-27 补）：`handleFinalTranscript` 里那次
`discardTurn()` 只管得住"转写为空但走到了提交回调"那一条；**另一条是 `BuddyDictationManager`
里转写为空的正常收尾**（`finishCurrentDictationSessionIfNeeded` 直接 return，根本不调
`submitDraftText`）—— 少了 `onDictationAbandoned` 那一次通知，那一轮会**一直开着**，直到下一次
按键 `armTurn` 才被顺手 `finishTurn("")` 收掉，在历史里留下一条 0 秒 0 字的空录音
（用户 09:11–09:14 那 12 条录音里有 7 条是这种）。识别连接出错那条路也走同一个通知。

**那里的接缝**（用户附图，同一屏上的另一件事）：Listening 时刘海那条黑带的**下边缘**要收成直角，
因为下面那行字幕的上边是方的，而两翼外端 14pt 的圆角会在接缝两端各让出一块 14×14 的三角、
桌面从那里透出来。判据是 `NotchPanelModel.notchBandSitsAboveTranscriptLine`
（`== .listening && !isFullscreenSuppressed`）—— **和「那行字幕显不显示」是同一个属性**
（`syncListeningTranscriptPanel` 也读它），两处不可能分家；实现是 `NotchWingView.squaresBottomOuterCorner`
把外端下圆角归零，中段本来就是方的。**非 Listening 时一切照旧**（用户：「但在其他情况下，
即非录音状态下，保持之前的状态最好」）。

⚠️ **它第一次只改了一半，用户当天就回来说「你没有修好」**：那个参数带默认值 `false`，
而**屏幕上的黑带是收起态的 `NotchPillRootView` 画的**（面板没铺开时）—— 上一版只传给了
展开态那条 `NotchExpandedWingBand`，于是"改了一个调用点、另一个照旧圆角"，编译通过、毫无提示；
当时量到的 100/132 是**展开面板**下的数，用户实际看的那颗 pill 一个像素都没变。
**两处调用点都要传**（`NotchActivityView.swift` 的 `NotchPillRootView(...)` 与
`NotchExpandedWingBand(...)`）。补全之后同一个 build 里 A/B：Listening 时带子最下面一行最左黑
**88**（直角到底），Speaking 时 **88→123**（那 35px 就是 14pt 的圆角在退），字幕条上边 **89** ——
两条边差 1px，缝是通的。

### Acting on the computer

The model can do more than point — `[CLICK:]`, `[RIGHT_CLICK:]`, `[DOUBLE_CLICK:]`, `[SCROLL:]`, `[TYPE:]`, `[SELECT:]`, `[PRESS:]`, `[OPEN:]`, `[WAIT:]` and `[AX_TREE]` are executed for real by `MacosUseController`, the **only file that imports `MacosUseSDK`** (SPM, pinned to revision `a2d78663`; the same SDK the machine's `mcp-server-macos-use` project uses). Four things about it are load-bearing:

- **Three coordinate spaces, and only one conversion between two of them.** The model speaks the 0–1000 normalized grid; `CGEvent` and AX element frames speak **Quartz global** (origin top-left of the main display, y down, displays above it at negative y); the old pointing path speaks **AppKit global** (bottom-left origin, y up). `MacosUseController.displayLocalPoint` is the one place the normalized grid becomes a point, and `quartzGlobalPoint` adds `CGDisplayBounds(displayID).origin` — which is why `CompanionScreenCapture` now carries a `displayID`. **Deriving the Quartz origin from the main screen's height instead is right on one display and silently wrong on every other.** Pointing stays on the AppKit path (`appKitY = displayHeight − y`), so `ActionParseResult` keeps `pointingRequest` out of `actions`: two paths, two spaces, never one list.
- **A named target is found by name — for clicks *and* for pointing — and the model's estimate is only the fallback.** Measured 2026-09-22 against Calculator's "7" key — true centre normalized (572, 668), Quartz (988, 746), AppKit (988, 371) — the same sentence produced (320, 599), (700, 700) and (766, 625) on three runs: errors of ±25% of the screen's width, in *opposite* directions, so no calibration removes them. Hit-testing the estimate cannot repair that, because a hit test only reports the element *under* the point — the estimate has to land on the target before snapping to its centre helps it; it landed on a 1201×1436 `AXGroup` instead, and the click was left beside the key. So `resolvedClickPoint` tries `accessibilityElementFrame(matchingLabel:nearestTo:)` first: it walks the **frontmost** application's tree (a name is only meaningful once you know whose names you are reading) and takes the element whose text contains the tag's label, ranked by exact name → control-sized (≤ 400×120) → nearest the estimate, then uses that element's centre without consulting the estimate at all. On the same sentence the lookup returned `(964, 722, 48, 48)` — the "7" key's ground-truth rect, to the pixel — and Calculator read 7. The estimate and the old `AXUIElementCopyElementAtPosition` snap survive as the path taken when the tag carries no label, the label matches nothing, or the app will not talk; containers stay excluded from snapping, because the centre of a window is not what anyone asked for. The tree walk is blocking IPC and runs in `Task.detached` (0.17–0.37 s measured), never on the main actor, which is why `CompanionManager.screenshotPixelCoordinate` is now `nonisolated static`. The label is therefore load-bearing, and the system prompt requires it in the element's own wording — a tag without a usable label is only as good as the estimate. **`MacosUseController.resolvedPointerLocation` puts the pointing path through the same resolution**, which is what closed the second half of 定位不准: before it, clicking the "7" key landed on the key 5/5 while the cursor — pointed at that key by the same reply — flew to AppKit (1265, 495), 277 pt right and 119 pt below it; four measured runs after, the cursor landed on (988, 371), the key's exact centre, every time. Pointing pays the traversal *before* the flight starts rather than correcting mid-arc, and it flips against the display the point actually landed on rather than the one the model named, since a label can match an element on another monitor.
- **The green screen annotations are drawings, not actions — and the model never sees its own drawings.** `[SHAPE:kind:x1,y1;x2,y2;…:label[:screenN]]` (kinds `circle`/`arrow`/`line`/`curve`/`polygon`, circle = first point the *centre*, second a point just past the edge — distance = radius; same 0–1000 grid and `:screenN` suffix as `[POINT:]`) parses into `ActionParseResult.shapeRequests`, deliberately **not** into `actions`: a ring touches nothing, and putting it in the one-action-per-step loop would make a drawing cost a screenshot-and-continue cycle. `CompanionManager.resolvedAnnotationMarks` (async) anchors each shape to the capture its first point names via `screenCapture(for:among:)` and converts every point with the shared `displayLocalPoint` — which yields display-local y-down points, exactly the coordinate space an `OverlayWindow`'s SwiftUI content draws in, so no second mapping exists to get wrong. **Enclosing shapes (circle/polygon) are resolved through the click path's full chain, not a name-lookup-only variant**: `MacosUseController.annotationEnclosingFrame` tries `accessibilityElementFrame(matchingLabel:nearestTo:)` — which, measured 2026-09-22, resolves "数字5" to nothing until its ASCII-token retry ("数字5" → "5") runs, after which it hits the key's true frame with offset 0.0 — then falls back to the small control under the estimated point, and only nil leaves the model's raw points (which is how rings landed beside their target before this). Arrows, lines and curves stay on the model's points, because a directional stroke snapped to a frame would say something the model did not mean. The remaining deliberate differences from a click: gated by `pointsAtReferencedElements` (drop, not prompt — same as pointing), and capped at 4 shown (`maximumAnnotationShapesPerReply`) while the prompt asks for at most 2. The marks are cleared before **every** fresh capture, on interrupt and on a new press — with the one exception in the circle-to-ask bullet below. The auto-dismiss (10 s + 0.6 s fade) is generation-counted so a stale dismiss task can never fade a newer set. The full grammar is written up in 开发经验/11-操作电脑.md 十三、十四.
- **「圈选提问」 (circle-to-ask): the user's own circle is the strongest grounding signal there is, so it rides along with the question.** While the talk shortcut is held, `CircleToAskController` watches left-mouse drags with global+local NSEvent monitors (mouse monitoring is not TCC-gated); a drag of ≥ 24 pt draws a live green lasso, and on mouse-up the stroke is handed to `ScreenAnnotationManager` as an ordinary curve mark (so every clear discipline for model-drawn marks applies to it for free) while the padded bounding region is held as `pendingMarkedRegion`. `CompanionManager.buildMarkedRegionContextIfPending()` consumes it at the start of the response pipeline and attaches it to `pendingAccessibilityContext` — the same `<screen_contents>` data-not-instruction channel as `[AX_TREE]` — carrying the region's normalized rect plus the AX elements in or touching it (`MacosUseController.accessibilityElementsInRegion`, **fully-contained ones first, smallest first, each line tagged "fully inside the circle" or "partially overlapping"**), and the system prompt's "the user's own circle" section tells the model the circle IS the question's subject. **The lasso also stays visible in the question's first screenshot**: the pre-capture `screenAnnotationManager.clear()` is skipped on step 1 while a pending region exists, and the marks are cleared right after that capture — measured 2026-09-22, a circle drawn around Calculator's "2" without this came back as "3 or 4", because the digit grid packs 48-pt buttons 6 pt apart, so the padded region touches every neighbour, all ten elements have the *same* area (area ordering says nothing), and the containment tag is what isolates exactly one fully-inside button. Three lifecycle details are deliberate: the monitors are armed on every recording start but a pending region is **not** dropped there, because in confirmation mode the tap that sends the held question *starts a recording first* — the press path discards it only when `pendingConfirmationTranscript == nil`; the setting gate (`allowsCircleToAsk`, 看与截图's 「圈选提问」) is checked at pipeline time, so turning it off discards rather than freezes a region drawn before the toggle; and `interruptActiveResponse()` discards, because a stopped question's circle has no next question to ride with.
- **Screen contents are data, never instructions.** Text read off the screen can reach typing plus Return, so the `[AX_TREE]` summary is attached to the **next turn's user prompt** inside a `<screen_contents>` block labelled as data — not as a system message, which is the authority level a user's own words have. The system prompt also requires the tag only when the user asked for the action in that turn ("where's the send button" is a `[POINT:]`), and forbids unsolicited destructive actions. Two settings gate execution (`allowsComputerControl`, `allowsKeyboardControl`, both on by default) and every action lands in `lastActionDescription` and in the notch sheet's 「N 条进度」 disclosure — an action the user cannot see happened is worse than no action.
- **A reply with action tags continues as an agent loop, not a dead end — and it runs at one action per step, enforced in code.** After a reply's actions execute, a fresh screenshot goes out with an automatic continuation prompt (`continuationUserPrompt`) — no new user speech — and the cycle repeats until a reply carries no action tags or `maximumAutonomousActionSteps` (15) is hit. The **pacing is not left to the prompt**: only the reply's *first* action tag executes (`parseResult.actions.first`), the continuation prompt reports how many tags were dropped and says to re-emit them one at a time, and a 1.2 s settle delay separates an executed action from the next capture — a browser tab takes seconds to load, so four tags fired in a burst all land on screens that never finished loading (the four-tab search job the user reported ending with empty pages). The step cap is therefore well above the number of actions a realistic job needs: a four-tab search costs roughly a step per action, ~12 steps. `[WAIT:seconds]` (1–10, clamped by the parser, cancelled by a new user utterance since `Task.sleep` throws on cancellation) is the model's way to sit out a slow load instead of being forced to choose between acting on a half-loaded screen and reporting the job finished. The loop's plumbing is local to one job: `stepHistory` gives each continuation request the job's own prior replies without leaking synthetic turns into future requests, and the permanent history records the whole job as ONE turn — the user's words against every step's raw reply, tags and all, joined — so a replayed turn still reads as the record of what happened. Only the last reply is spoken. The continuation prompt is deliberately its own builder rather than `userPrompt(forTranscript:)` with a synthetic transcript, because that one ends "the user just said, out loud:", which would be a lie in the user role. Measured 2026-09-22 against live Safari (loop mechanics) and, after the pacing change, live Chrome via a harness mirroring the app's loop: the model wrote `[TYPE:北京新闻][PRESS:return]` in one reply, only the type executed, and the very next reply re-emitted the Return alone; it then emitted `[WAIT:3]` on its own when it saw the page loading, and ended the job with a plain sentence when Google raised a CAPTCHA the synthetic click had triggered.
- **Stopping the agent loop is the user's shortcut, and the state machine had holes the stop exposed.** The talk shortcut is also the stop key, **and the first press while busy is a pure stop — it does not open the mic**. Pressing it while `voiceState` is `.processing` or `.responding` calls `interruptActiveResponse()` unconditionally (cancel `currentResponseTask` — the agent loop ends at its next between-steps check, an action already under way always finishes — stop playback with no 「新提问立刻打断播报」 gate, clear bubble/pointing/marks, back to idle) and **returns without starting a recording**; `shortcutPressBeganAt` is nilled so the release cannot misfire the confirmation-tap send. The *second* press starts listening, so a new question interrupts and replaces the running job in two deliberate presses instead of one blur where the old answer is cancelled and the new recording begins in the same instant — which is what the user experienced as 「永远打不断，只是重新听我说了一遍」. `CompanionManager.interruptActiveResponse()` is the *unconditional* variant — no setting gate (the deleted menu bar panel's 「停止」 button called the same method; the shortcut is the stop path now). Three holes this exposed, all fixed: the response task's `catch is CancellationError` left `voiceState` stuck on `.responding` (spinner forever) and left the cancelled-but-assigned task object in `currentResponseTask`, which `bindVoiceStateObservation()` reads to decide transient-hide scheduling — the catch now nils the task and resets state; the observation refuses to override `.responding` by design, so the press path resets that stale state itself after the gated TTS stop; and nothing anywhere told the user the shortcut could stop the AI — the 快捷键 page now ends with a 「停止」 group: a control-less `SettingsRow` (「怎么打断」) that enumerates the three paths, states outright that the stop is built-in, no switch, no separate setting, and promises no voice or prompt after an interrupt — the same not-a-preference pattern as 操作's 「辅助功能权限」, sitting outside the sidebar's count rather than inflating it. Cancelling is cooperative, so "stopped" means "stopped at the next await", which is what keeps a half-click from happening. **Interruption must be silent, and silence took two guards**: a cancelled task's in-flight URLSession stream tears down as `URLError.cancelled`, not `CancellationError`, so it fell into the generic `catch` and `speakCreditsErrorFallback` answered the user's stop with the spoken "抱歉，我那边出了点问题" — the fallback now returns early on every cancellation shape (`CancellationError`, `URLError.cancelled`, `Task.isCancelled`) before setting `lastErrorMessage` or speaking, and the generic catch performs the same task-nilling/state-reset cleanup the typed `CancellationError` catch does, since a stop that surfaced as a URLError otherwise left the finished task in `currentResponseTask` and the state stuck.
- **A missing grant is reported, never silent.** The gate order inside `execute(_:among:)` is `allowsComputerControl` → `[OPEN:]` early return → Accessibility trust → the action switch, with `allowsKeyboardControl` checked inside `.typeText`/`.pressKey`. With no Accessibility grant, the first action of a launch calls `WindowPositionManager.requestAccessibilityPermission()` — which raises the system dialog, or opens the 辅助功能 pane when the dialog has already been spent this launch — and says which one it did in `lastActionDescription`; later attempts in the same launch only report. Doing nothing and saying nothing is the failure mode this avoids: the user hears the model promise a click and the screen does not move.

`ActionTagParser.modifierFlag(named:)` holds the modifier vocabulary for **both** the parser (which of `cmd+a`'s halves is the key) and the executor (word → `CGEventFlags`), because two tables would drift — see `开发经验/10-踩过的坑.md` A4 for what that costs.

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `WannaApp.swift` | ~105 | Notch-only app entry point. Uses `@NSApplicationDelegateAdaptor` with `CompanionAppDelegate` which starts `CompanionManager`, applies the login-item setting, and expands the notch sheet on launch when 「启动时自动打开面板」 is on. No main window, no menu bar icon — the app lives entirely in the notch. |
| `CompanionManager.swift` | ~5060 | Central state machine. Owns dictation, shortcut monitoring, screen capture, the vision chat API, TTS, and overlay management. Tracks voice state (idle/listening/processing/responding), `isAnswerStreamLive` (true while the reply streams, false the moment the vision call returns — what lets the cursor-side card's blurred tail settle instead of staying blurred through the whole TTS reading), conversation history, whether the cursor is drawn (`isBuddyShown`, plus the three cursor settings it mirrors from `AppSettingsStore`), the last error message shown in the notch sheet's conversation view, and the last action it took (`lastActionDescription`). Owns the settings window and re-renders the notch sheet's data when either configuration changes. Coordinates the full push-to-talk → screenshot → vision → TTS → pointing → acting pipeline under the configured 触发方式 — hold-to-talk keys releases as stop, double-tap treats the second press as stop-and-send and ignores releases — and runs a reply's action tags as an agent loop at **one action per step, enforced in code**: only the first tag executes, the continuation prompt reports dropped tags, a 1.2 s settle delay precedes the next capture, and the loop ends when the model reports done or the 15-step cap, with the whole job recorded to history as one turn and only the last reply spoken. **What the answer card is shown during a stream is the tag-stripped text, not the raw reply** (`ActionTagParser.speakableTextFromStreamedReply`, the same helper that feeds 逐句快答 and the echo filter), and the end-of-stream settle re-assigns that same helper's output on the full reply so the value is byte-for-byte what the card already has: the card used to be shown the raw reply with its `[POINT:…]` tag and then switched to a *differently* stripped string (`finalSpokenText`, which trims and only removes claimed ranges), and a different string is a different line break — the user watched the first line go 「八个字 → 九个 → 七个」 and reported it twice as 「渲染完之后字数变了…你还是没有固定」 (2026-09-23). Suspends the global shortcut tap while the settings window's shortcut recorder is armed (`.wannaShortcutRecorderStateChanged`), so the keys pressed to record cannot start a real recording. Also resolves the reply's `[SHAPE:…]` requests into drawable marks (`resolvedAnnotationMarks`, `maximumAnnotationShapesPerReply`) — labeled circles and polygons snapped to the real AX frame — and clears them before every capture, on interrupt and on a new press. Owns 「圈选提问」's pipeline half: `circleToAskController` (a lazy `CircleToAskController` sharing the annotation manager), started/stopped with the dictation session and consumed at the start of the response pipeline via `buildMarkedRegionContextIfPending()`. Owns `interruptActiveResponse()`, the unconditional stop (cancel task, stop playback, clear bubble and pointing, reset voice state) — the talk shortcut's first press while busy and the (deleted) panel's 「停止」 button both ended here; today the shortcut is the stop path — and fixes up the cancellation paths so a shortcut-press stop leaves `voiceState` clean. Owns 对话与记忆's memory: replaying past turns, compressing old ones, and holding a transcript back when 快捷键 → 「松开立即发送」 is off. **2026-09-27 又多两处接线**：说话期间的实时转写除了喂 Notion 检测，还喂一次`NotchListeningTranscriptModel.shared.setLiveText`（刘海下面那行字幕 —— 它是那些字唯一的落点，鼠标旁那颗气泡的实时转写连同它的开关一并删了）；`handleFinalTranscript` / `submitFollowUpQuestion` 最前面取一次 `consumeEditedTranscript()`：用户在那个编辑窗里改过字就用他改的那份顶替识别结果（一轮一次，没改过是 nil，照常走）。它不碰状态机 —— 只是换掉送进管线的那个字符串。**它也是「存成一条 Notion 笔记」那道岔的所在**（2026-09-27 从录音搬过来）：`handleFinalTranscript` 与 `submitFollowUpQuestion` 在把转写送进管线之前都过一次 `consumeNotionNoteTurnIfNeeded` —— 命中关键词就存成笔记（不进对话管线）、用户点过取消就什么都不发。取消语义与录音那条**刻意不同**（见「主 Agent 上的『存成一条 Notion 笔记』」那一节）。 Owns the conversation view's turn display data too: `pendingQuestionText` (the question shown as the outgoing bubble the moment the pipeline starts — the history entry is only written when the turn finishes), `liveJobProgressSteps` (each executed step, feeding the 「N 条进度」 disclosure live), the entry's `progressSteps`/`turnDurationSeconds`/`turnFinishedAt` recording, an interrupted turn recorded in the CancellationError catch (loop accumulators deliberately declared above the `do` so the catch can read them), and `submitTypedQuestion(_:)` — the conversation view's keyboard composer, riding the same pipeline as a spoken question. Holds the `agentSessionManager` (lazy) — the Agent subsystem's owner, deliberately outside the voice pipeline's `currentResponseTask`/`voiceState` slot. Also holds `defaultVoiceResponseSystemPrompt`, the shipped base prompt, which is `internal` only so the 系统提示词 editor can show and restore it. **Turn-session targeting**: a turn belongs to the session active when it STARTED — the pipeline snapshots `turnSessionID` at start and reloads the mirror from that session, and both the happy-path append and the CancellationError catch write through `appendEntry(_:targetSessionID:)` / `persistConversationHistory(toSession:)`, so a mid-response session switch cannot cross-contaminate conversations. **Task lifecycle**: `currentResponseTask` is nilled on the happy path only when `!Task.isCancelled` (a cancelled task can still finish without throwing), and both catches nil it only when `currentResponseTask?.isCancelled == true` — an unconditional nil would clobber a replacement task started by a newer question. The mirror observer stands down while `currentResponseTask != nil`; the turn-start reload compensates for switches missed then, and if the task were never nilled the guard would stay false forever and every later session switch would be invisible to the mirror — the exact mechanism behind the all-sessions-show-the-same-content bug. |
| `ActionTagParser.swift` | ~695 | The whole tag grammar, and nothing else — Foundation + CoreGraphics only, so it compiles and runs on its own. Turns a reply into `ActionParseResult`: the text to speak, at most one `pointingRequest`, the `[CompanionAction]` list, the `[AnnotationShapeRequest]` list, and the `[AgentDispatchRequest]` list (`[AGENT_SPAWN:name:task]` / `[AGENT_SEND:name:message]` — dispatch never enters `actions`, so it never triggers the screenshot loop). Also owns `modifierFlag(named:)`, the modifier vocabulary the executor asks for — one table, not two (see A4 in 开发经验/10-踩过的坑.md). |
| `MacosUseController.swift` | ~1385 | The only file that imports `MacosUseSDK`. Converts a `CompanionAction` into a real click / scroll / keystroke / wait / app launch, owns the normalized → Quartz coordinate conversion (`displayLocalPoint`, `quartzGlobalPoint`, and the inverse for `[AX_TREE]`), resolves a named target in the frontmost app's accessibility tree so clicks *and* cursor flights land on its centre, types multi-line text by splitting on `\n` and pressing a real Return between lines (`typeMultilineText`), selects a text range by content markers in the focused text area's real value (`selectTextByContent`, the coordinate-free way to anchor an edit), and gates everything on the two 操作电脑 settings plus Accessibility trust. **⚠️ 合成键盘事件在本进程里不落地**（2026-09-28 实测：同一个 `pressKey`，终端进程发就落地、Wanna 发连**裸字符**都进不去，而 `AXIsProcessTrusted()=true`、无 TCC 拒绝 —— 静默失败）。所以**粘贴走 Accessibility**：`pasteKeepingClipboard` 先把文本写进系统级聚焦元素的 `kAXSelectedTextAttribute`（= 有选区就替换、没有就插在光标处），只有 AX 失败才退回合成 ⌘V（顺序不能反，否则能落地的地方会粘两次）。`[TYPE:]`/`[PRESS:]` 仍走合成 —— 它们很可能同样落不下去，**尚未实测、也尚未改**（见 `开发经验/10` D39 末节）。 |
| `OverlayWindow.swift` | ~1120 | Full-screen transparent overlay hosting the blue cursor, response text, waveform, and spinner. The response bubble renders `AnswerCardView` directly (the 卡片样式 theme + blur-focus stream, zero added latency — the card replaces the old plain text one-for-one), gated on 「回答时显示文字」; Handles cursor animation (`Triangle` and `ArrowCursorShape`), element pointing with bezier arcs, multi-monitor coordinate mapping, and fade-out transitions. Also hosts the conversation bubble, which shows whichever of the streaming answer or the live transcript is current — **suppressed entirely while the notch sheet is expanded** (`CompanionManager.isNotchSheetExpanded`), because the sheet's conversation flow is showing the same text and the duplicate was reported as 「返回的结果先是两个，后来又合并成一个」. Its `OnboardingVideoPlayerView` (always in the tree; its player is nil outside onboarding) assigns `AVPlayerLayer.player` only on a real change, both in `updateNSView` and in the view's `player.didSet` — the overlay re-evaluates its body on every streamed character, and an unconditional assignment re-attaches the layer ~20×/s in a full-screen window for a player that has not changed. |
| `CompanionResponseOverlay.swift` | ~217 | Dead code — nothing instantiates `CompanionResponseOverlayManager`; the bubble described above is what actually renders answers and transcripts. Kept only because removing it is out of scope. |
| `CompanionScreenCaptureUtility.swift` | ~132 | Multi-monitor screenshot capture using ScreenCaptureKit. Returns labeled image data for each connected display. |
| `ScreenAnnotationManager.swift` | ~345 | Draws the green `[SHAPE:…]` marks a reply asks for — rings, arrows, lines, curves, outlines, each with a label capsule. One transparent click-through `OverlayWindow` per display that has marks, a SwiftUI `Canvas` tracing each stroke on over 0.7 s, auto-dismiss after 10 s with a fade — generation-counted so a stale dismiss never kills new marks. Visual only: marks are cleared before every fresh screenshot, on interrupt, and on a new press, so the model never sees its own drawings. The user's circle-to-ask lasso rides this same path as an ordinary curve mark. |
| `CircleToAskController.swift` | ~265 | 「圈选提问」capture half: while the talk shortcut is held, global+local NSEvent mouse monitors (not TCC-gated) watch left-mouse drags; ≥ 24 pt of drag draws a live green lasso (`LassoOverlayView`, AppKit `NSView` — tens of drag events per second need no SwiftUI diffing) and on mouse-up stores `pendingMarkedRegion` (display frame, displayID, 1-based screen number, display-local bounds, normalized rect) and shows the stroke as a curve mark. Deliberately does not drop a pending region when capture begins — the confirmation-mode send tap starts a recording first. |
| `BuddyScreenKeywordDetector.swift` | ~42 | Edge-triggered 「屏幕」 keyword detector for 「说到“屏幕”立即截屏」: streaming transcription resends the whole cumulative utterance on every interim update, so the detector counts keyword occurrences (屏幕, case-insensitive "screen") and fires only when the count goes UP — each spoken mention captures exactly one screenshot, at the moment the word is heard rather than when the sentence finishes. `reset()` per utterance/recording start. |
| `VoicePlaybackEngine.swift` | ~430 | The ONE `AVAudioEngine` both TTS playback and continuous-listening capture run on, **with the system AEC on (`setVoiceProcessingEnabled(true)` + `voiceProcessingOtherAudioDuckingConfiguration(enableAdvancedDucking: false, duckingLevel: .min)`) whenever 持续监听 is on and the user has not switched 「回声消除」 off** — the ducking is why voice processing was removed earlier on 2026-09-23 and the mildest level is why it could come back; the load-bearing facts are in the Key Architecture Decisions entry above. `warmUpMainMixerNode()` is not a diagnostic: reading the mixer's output format before voice processing is enabled is what makes `engine.start()` succeed at all, and without it every reply lost its first spoken segment to `-10875` (the four-variant measurement is in that method's comment). Voice processing is applied per engine run, never in `init`, because it can only be toggled while the engine is stopped. Playback half: `playWAVData` decodes the synthesis endpoint's WAV through a scratch `AVAudioFile`, converts to the engine format with `AVAudioConverter`, schedules on an `AVAudioPlayerNode` behind an `AVAudioUnitTimePitch` (the playback-rate setting) — **TimePitch, deliberately not `AVAudioUnitVarispeed`**, because varispeed is a tape-speed unit that resamples, so the pitch moves with the rate: at 语速 1.4 the fundamental measured 321.9 Hz against 233.3 Hz for TimePitch, a ratio of 1.38 ≈ the rate itself, and that raised pitch is what the user heard as 「音色还是机器人的音色，不是赵今麦的音色」, and tracks the chunk in `isChunkPlaying` via the `.dataPlayedBack` completion — the `AVAudioPlayer.isPlaying` analogue the client's chunk-gap logic polls. Capture half: `installInputTap`/`removeInputTap` host the tap, and **since 2026-09-24 they host the PUSH-TO-TALK recording's tap too** — `BuddyDictationManager` records through this engine rather than its own (its `audioEngine` is now only the no-shared-engine fallback), which is the one-audio-path rule and is what makes the session's FIRST question fast: the ~2 s bring-up starts when the recording does, while the user is still speaking, instead of when the first TTS chunk is ready. **The engine is no longer released when a reply ends** — `releaseEngineWhenIdle` and its seven call sites are gone, because releasing per reply made every new question re-pay that 2 s (measured 2026-09-24: ~1.1 s card-to-sound inside a held session against ~3 s cold). It goes down only when `AppSettings.audioEngineIdleReleaseMinutes` of inactivity pass (re-armed by `CompanionManager.noteVoiceActivity` on every press, on entering listening and on preparing to record) or when the 「释放引擎」 shortcut is pressed (⌃⌥4 by default) — which is what makes that setting's 「永久」 option usable. The price is the ducking, and it is now the user's own setting: a held engine keeps the app in macOS's communication-app class and holds the microphone route open. |
| `SystemSpeakerMuteCoordinator.swift` | ~265 | 「录制期间自动静音系统扬声器，避免录入系统声音」(听 page, default ON): a `@MainActor` 0.5 s poll computing `setting && recording && !TTS-playing` and bringing the default output device's CoreAudio `kAudioDevicePropertyMute` to it — so the mute never silences the app's own spoken answer, and the AEC covers that unmuted playback window instead (see the Key Architecture Decisions entry). Wrappers in `SystemOutputDeviceMuteController` (`nonisolated`): default-device lookup, a mute-element probe (main element, then stream element 1 — devices differ), get/set. The device's prior mute state is captured before the first mute and only devices WE muted are un-muted (a speaker the user muted themselves stays muted); restore runs on recording end, on `willTerminateNotification` (`restoreAllMutesNow`, called by `CompanionManager`), and at the next launch via the `wannaSystemSpeakersLeftMutedByRecordingMute` UserDefaults leak flag if a crash left the speakers muted. Signals injected by `CompanionManager.start()`: `recordingActiveProvider` (dictation in progress OR continuous listening) and `playbackActiveProvider` (`bailianTTSClient.isPlaying`). |
| `BuddyDictationManager.swift` | ~1980 | Push-to-talk voice pipeline. Handles microphone capture via `AVAudioEngine`, provider-aware permission checks, keyboard/button dictation sessions, transcript finalization, shortcut parsing, contextual keyterms, and live audio-level reporting for waveform feedback. The shortcut matcher is one path for presets and recorded shortcuts alike — `ShortcutOption.defaultShortcutBinding` compiles a preset into the same `RecordedKeyboardShortcut` shape a recorded combo uses, so matching and display never fork. Re-resolves its transcription provider at the start of a recording if the current one is unconfigured, so fixing the 👂 role in the settings window does not require a restart. Also owns the third dictation form, **continuous listening** (`isContinuousListening`, deliberately outside `isDictationInProgress`): one engine + tap + one ASR session per utterance — the tap closure's per-buffer session lookup is what swaps the backend without touching the engine. Since 2026-09-23 the tap's home is the **shared TTS playback engine** (`sharedVoicePlaybackEngineProvider`, injected by `CompanionManager`) unconditionally — one engine serves both halves; the own-engine fallback only runs when the shared engine is missing. Voice processing lives on that shared engine alone (`VoicePlaybackEngine`), never here, which is what keeps this file free of the VPIO ordering rules. A local 50 ms VAD loop over the existing smoothed RMS is the **sole turn-start source** — the only thing that can open an utterance or interrupt (`level ≥ 0.25` accumulated to 0.20 s net → speech detected; 0.25 because the measured quiet-room floor peaks 0.167 and the original 0.06 sat below the noise floor), with the one-shot `continuousListeningDidRequestBargeIn` limiting it to one interrupt per utterance. It became the sole source on 2026-09-24: the ASR interim used to be a second one, and the engine's own line (`echo cancellation ON (voice processing, ducking .min, AGC off)`) is what shows why that had to go — with AGC off the mic peaks **0.241** while an answer plays (it read 0.876–1.000 before `disableAutomaticGainControlOnProcessedUplink`), i.e. BELOW the 0.25 gate, so the VAD stayed silent while the recognizer still guessed 「噻」/「是」 off the same residual and stopped the answer. A transcript may therefore not start a turn, which is structural (a VAD-segmented STT makes a transcript impossible before the VAD has ruled) rather than a local bar. The rolling window (`continuousListeningRecentAudioLevels`, peak exposed as `continuousListeningRecentPeakAudioLevel`) is still filled by the VAD loop and cleared only when the listening window opens and closes, never per utterance; it is now read only to REPORT what the microphone heard, so a regression shows up in the log. The SEND path's ≥4-character bar is deliberately untouched: it governs whether the user's words become a question, not whether the answer stops, and the two are different questions with different costs., utterance end (the 「静音多久自动发送」 silence — `continuousListeningUtteranceEndSilenceSeconds`, snapshot from `AppSettings.continuousListeningSilenceSendSeconds` at window start, default 2.0 s — or the 15 s cap → `requestFinalTranscript()` with the engine left up, the one difference from the push-to-talk stop), and ≥ 4-character final gating (「嗯。」-style interjections must not become questions); session restarts retry 5×1 s. **The final request has a 2.4 s grace fallback** (`continuousListeningFinalGraceSeconds`): a dead websocket delivers neither final nor error, so the latest interim transcript is submitted as the final instead — generation-counted (`continuousListeningFinalRequestGeneration`) so a stale grace task cannot cancel a newer request, the session is cancelled BEFORE the interim submits (a late final from the replaced socket double-sends the question), and `handleContinuousListeningFinalTranscript` drops a final with no pending request (`isContinuousListeningAwaitingFinal`). `isContinuousListeningUtterancePending` is the shortcut-send gate, and its bar is deliberately the SEND path's own bar: a final already in flight, or **≥ 4 content characters of interim transcript** (`continuousListeningMinimumTranscriptCharacters`). Two measured rules are baked into that. A shorter interim must not count, because `handleContinuousListeningFinalTranscript` drops it one line later — counting it spends the press on a delivery that cannot happen and leaves playback running, which is the 「按两次快捷键才能停止播放」 defect (measured 2026-09-23: the recognizer emits 「啊。」/「嗯。」/「中间。」 off the assistant's own leaked audio, one or two content characters each, and every one of them cleared the old `> 0` test). And a confirmed-but-empty utterance must not count either, because the energy VAD reads raw mic level and the assistant's own residual echo trips it as readily as the user's voice (the same run logged "detected speech (mic level, transcript: \"\")" with nobody speaking) — while real speech is never empty by the time the user presses, since the recognizer streams partials throughout the utterance and the press comes after they have finished. `finishContinuousListeningUtteranceByShortcutSend()` is the talk shortcut's "I'm done, send it" during the window — the user's design, see the Key Architecture Decisions entry above. |
| `BuddyTranscriptionProvider.swift` | ~120 | Protocol surface and provider factory for voice transcription backends. The factory is the **single place** that decides which backend recognition runs on, in three rules (2026-09-27): **an explicit `transcriptionModelIDOverride` → Bailian** (only 语音聊天's 三段式 presets pass one, and they all pass a Bailian model name — so that rule is exactly "the voice chat keeps 百炼"), **otherwise the user's 设置 → 听 → 「说话时用哪个识别」** (default Doubao), **and if the chosen one is unconfigured it falls back to the other, then to Apple Speech** — every step prints a line, because a silently swapped backend is the worst outcome. The old Info.plist `VoiceTranscriptionProvider` read is gone: with a user-facing switch it was a second source of truth. |
| `BailianRealtimeTranscriptionProvider.swift` | ~702 | Streaming transcription provider. Opens a realtime websocket at the URL its resolved role supplies, sends a `session.update`, streams base64 PCM16 audio in 100ms chunks, and delivers interim + final transcripts on key-up. Shares a single URLSession across all sessions. |
| `BailianConfiguration.swift` | ~127 | Façade over the stored configuration: `resolvedTranscription` / `resolvedVision` / `resolvedSpeech` resolve the three roles fresh on every access. Also holds the seed constants (`Models.*`, the cloned `textToSpeechVoice`) and the legacy plist readers used only when no configuration file exists yet. |
| `BailianVisionChatAPI.swift` | ~483 | Vision chat client with streaming (SSE) and non-streaming modes, resolving its provider per request. Parses `delta.content` for text and `delta.reasoning_content` for thinking, tolerates the trailing usage-only frame whose `choices` array is empty, and detects image MIME types. |
| `BailianTTSClient.swift` | ~964 | TTS client, resolving its provider per request. Splits text into sentence-aligned chunks, requests audio from the configured endpoint, and plays back through the shared `VoicePlaybackEngine` (see the same-engine AEC decision — playback left `AVAudioPlayer` for it on 2026-09-23). Exposes `isPlaying` for transient cursor scheduling. Also owns the 逐句快答 streaming path (`StreamingSpeechSession`): the reply's tag-stripped text is fed in as it streams, an aggregator cuts only at punctuation the model itself wrote. The two halves of the reply run under different merge budgets (2026-09-22, after the complaint that an eight-segment reply paused at every join): the FIRST segment takes a sentence terminator at ≤ 22 characters (the shipped system prompt makes the model write that first sentence ~15 characters and end it with 。) — a short whole sentence plays whole instead of being comma-cut into a 3-character crumb plus one extra join — then the model's own comma pause once the buffer outgrows the 22-character ceiling, then any longer terminator, with a 40-character no-punctuation backstop; later segments merge to ≥30 at sentence terminators (comma fallback past 30, 60-character no-punctuation backstop) — enlarging later segments is free, since synthesis (~20 ms/char) is ~8× faster than playback (~170 ms/char), so each avoided join removes one synthesis request, one player start, one poll lag and one instance of the service's trailing silence. Never a mid-phrase character-count cut, which the user heard as a torn sentence (fixed 2026-09-22). A `,` or `.` between digits (「1,000」/「3.14」) is not a breakpoint — and because digits stream one at a time, an ASCII `.` or `,` at the very END of the buffer is held until the next character arrives (the lookahead that clears it has not streamed yet); a `。` is unambiguous and never held. `waitUntilPlaybackFinishes` polls at 30 ms (down from 200 ms) because at every join the next segment starts only after this loop notices the last one ended. Up to two syntheses run ahead of the playing segment, so the first segment is audible while the model is still writing. Ported from the voice-web reference project (实现方案/11), whose 15/60 numbers were replaced at the user's instruction on 2026-09-22. |
| `AppleSpeechTranscriptionProvider.swift` | ~147 | Local fallback transcription provider backed by Apple's Speech framework. |
| `BuddyAudioConversionSupport.swift` | ~286 | Audio conversion helpers. Converts live mic buffers to PCM16 mono audio and builds WAV payloads for upload-based providers. |
| `GlobalPushToTalkShortcutMonitor.swift` | ~211 | System-wide push-to-talk monitor. Owns the listen-only `CGEvent` tap and publishes press/release transitions. Also matches the three VoiceWeb mode shortcuts (`externalShortcutBindings`, refreshed from settings on every change) through an identical per-binding matcher, emitting `externalShortcutTransitionsPublisher` — a hit never reaches the talk matcher, which is how ⌃⌥1–3 coexist with the modifier-only ⌃⌥ talk shortcut. |
| `VoiceWebSessionController.swift` | ~1000 | `@MainActor` orchestrator for the outside VoiceWeb project's voice modes (see **The VoiceWeb session subsystem** above): probe/launch the server, ensure a page is open, send bridge commands, wait for the page's own `ready`, poll the bridge state (merged per-reporter phase + the page's `live` transcript lines) into the 语音聊天 view's transcript, poll replies into the answer bubble, toggle-disconnect, best-effort disconnect at termination. Page existence means **a page in Wanna's OWN Chrome instance** (`--user-data-dir=…/Wanna/VoiceWebChrome`, launched `-n -j -g` with the screen-capture automation flags) — with a live page it opens nothing at all, and with a live *instance* but no page it quits that instance and cold-launches rather than handing a running Chrome a URL, because only the cold path stays in the background (see the three measured facts above). Also owns the 语音聊天 tab's model surface: `rolePresets` (fetched from `/config`, refreshed on the tab's appearance), `selectedRoleID`/`activeRoleID`, `selectRole(_:)` (the sidebar's row click — sets the selection and NOTHING else) alongside `connectToRole(_:)` (the content column's top-right button: select + start; a re-click on the already-connected role is a no-op). Splitting them is what fixed the 串台 report, where the connection state appeared to move between role cards: row clicks used to connect, so whichever card was clicked last owned the state, and a connecting session already read as 「聊天中」 because the row's test was `phase != .idle` rather than `phase != .idle && activeRoleID == role.id`. The row's status is now derived from those two ids only, so exactly one card can ever show a connection state. `endSession` clears `activeRoleID` and deliberately leaves `selectedRoleID` — being selected is the user's choice, being connected is a fact about the session. Also `sendText(_:)` (bridge `text` action, connected-only), and `mergeLiveTranscript(_:)` — rewrites the mirrored live tail each poll so cumulative utterances update in place, and presents the reply **so far** (all bot lines after the last user line, concatenated) through `presentAnswer`, since pipecat's per-sentence `botTranscript` events each carry one sentence only. Injected closures (`presentAnswer` / `presentFailure` / `setNotchOverride`) are the only points touching `CompanionManager`'s voice state. |
| `VoiceChatSessionView.swift` | ~2075 | The 语音聊天 content column (see **The VoiceWeb session subsystem** above): header, preview strip, transcript, composer, and the three floating panels (模式 / 语速 / 音色) whose placement is **measured rather than hardcoded** — 2026-09-24, after the user's 「右侧太窄了，不应该留空白……提前找到应该如何设计，如何自适应窗口的宽度和高度」. Each header button reports its own frame in the column's coordinate space through `HeaderAnchorPreferenceKey` (`headerAnchorReporter`), the column reports its own size through a background `GeometryReader`, and `floatingPanelLeftOffset` / `floatingPanelTopOffset` derive every panel's position from those two facts. `floatingPanelLeftOffset(anchor:panelWidth:keepsColumnMargins:)` right-aligns a panel to its anchor and clamps it into the column; the **lower bound differs by kind on purpose** — full-width panels (音色) clamp to `contentColumnHorizontalMargin` so they share the page's gutters, while narrow dropdowns (模式 / 语速) clamp to 0, because clamping them to the margin pushed the speed dropdown 10 pt off its button (measured: the button's right edge is 202 pt into the column, so a 200 pt dropdown belongs at 2, and the margin moved it to 12). That replaced two hardcoded offsets that were both wrong: the voice panel's `trailing 110` left a **120 pt blank gutter** (panel right edge 1149 in a column ending at 1269) and made its two columns 209 pt wide; and the speed dropdown's `trailing margin + 240` landed 110 pt from anything meaningful. Now the voice panel takes the full available width (**442 → 539 pt, cards 209 → 258 pt, right gutter 120 → 12**), which is what lets a card hold 「名字 + ★/使用/▶」 without squeezing. The panel's height is `min(measuredContentHeight, voicePanelMaximumScrollHeight)`, where the cap is `min(448, voicePanelAvailableHeight − voicePanelChromeHeight)` and **both subtrahends are measured too** (the composer row's top edge via a `.composer` anchor, and the panel's own non-scrolling header rows via `VoicePanelChromeHeightPreferenceKey`) — so a shorter sheet shrinks the panel instead of letting it cover the composer. `positionFloatingPanel` places a panel as a **ZStack sibling of `columnBody`, not an `.overlay` child**, positioned by `Spacer`s (which take no hits, so everything outside a panel stays clickable); the four header controls are mutually exclusive, which `expanderButton` now enforces in both directions. **Known limitation, cause not yet found: the voice panel's `ScrollView` does not respond to scroll-wheel events.** The probe proves the layout is right — `measured content height 3075.0, cap 448.0` for 流式, `264.0` for 全双工 — so contentSize (3075) far exceeds the bounds (448) and the view *should* scroll, while the same synthetic wheel events move the 对话 page's transcript. Four fixes were tried and none worked: `.overlay` + `.offset` → `.overlay` + `.padding`, `.overlay` → ZStack sibling, removing the panel's `contentShape`/`onTapGesture`, and `fixedSize` on the scroll content. Because the panel is now clipped to 448 pt, **only the first ~6 rows of a long category are reachable** — see `开发经验/10-踩过的坑.md`. Earlier notes on this view, still true: **the 三段式 mode dropdown is hand-drawn, not a SwiftUI `Menu`** (user's 2026-09-23 「不要让软件自动渲染……你现在这个下拉菜单的样式特别丑」): a `Menu` renders a native `NSMenu` whose row height, radius and hover colour cannot be styled from SwiftUI at all, so the trigger is a plain `Button` toggling `isModeMenuOpen` and the panel is a `VStack` of `modeMenuRow`s — 38 pt tall each, a 12 pt `checkmark` slot that stays present at `opacity(0)` so the names align, hover painted by hand off `hoveredMode`, in a surface2 card with a 1 pt border, 12 pt radius and a shadow. **A session starts from the 连接 button at the right end of its own role row** — the row's left half only selects, and this header no longer carries a connect control (the串台 fix, see the 语音聊天 section) — and the composer enables only while `connectionPhase == .connected`, because a submit while disconnected would clear the draft and then do nothing but raise a failure. State badge deleted, copy buttons under both bubbles, `.textSelection(.enabled)`, `NotchSupport.contentColumnHorizontalMargin`, and a scroll-to-bottom on `selectedRoleID`. |
| `ElementLocationDetector.swift` | ~335 | Detects UI element locations in screenshots for cursor pointing. |
| `DesignSystem.swift` | ~1084 | Design system tokens — colors, corner radii, shared styles. All UI references `DS.Colors`, `DS.CornerRadius`, etc. |
| `WindowPositionManager.swift` | ~262 | Window placement logic, Screen Recording permission flow, and accessibility permission helpers. |
| `AppBundleConfiguration.swift` | ~88 | Runtime configuration reader. Checks the bundle Info dictionary, `Info.plist`, a bundled `BailianSecrets.plist`, then the Application Support copy. Now only used to seed a first-run configuration. |
| `ModelConfiguration.swift` | ~440 | Pure data + resolution, no I/O. `ModelRole` (👂/🧠/👄), `APIProviderFlavor` (owns request paths and preset model IDs), `ProviderProfile`, `ModelConfiguration`, `ResolvedModelRole`, and `RoleConfigurationStatus` — the last of which carries *why* a role is unusable, not just that it is. |
| `ModelConfigurationStore.swift` | ~271 | Reads/writes `ModelConfiguration.json` (atomic write, then `0600`), caches it behind an `NSLock`, seeds a first-run configuration from the legacy plist, and posts `.wannaModelConfigurationChanged` on save. Seeding is in memory only — nothing is written until the user presses 保存. |
| `ModelConnectionTester.swift` | ~242 | One minimal request per role (chat without an image, two characters of TTS, a real websocket handshake) run against a *draft* configuration, so the user learns whether a provider works before committing to it. Reports the service's own error text. |
| `ModelSettingsViewModel.swift` | ~277 | `@MainActor` state for the settings window: the draft configuration, dirty tracking, role assignment, and save/test actions. All provider bindings resolve by id rather than array index. |
| `AppSettings.swift` | ~1032 | Pure data, no I/O: every user-facing setting that is not a model choice, plus `AnswerLengthStyle`, `AnswerCardStyle` (蓝/黑/宣纸 — the reply card's theme; **黑 is the default since 2026-09-23**, because the user asked for the bubbles to be dark and to match the panel's ground (「气泡调成暗色…主题应该跟背景颜色一致」), which demoted 参考规范's blue from the starting point to an option), `WindowExpansionStyle` (中心缩放 / 边缘缩放 / 幕布垂落 — how the notch sheet opens; 中心缩放 the default at the user's request, and 边缘缩放 the name given on 2026-09-23 to what had been mislabelled 中心缩放), `TranscriptionLanguage`, `CursorPresenceMode`, `CursorShapeStyle`, `CursorFollowDistance`, `TextEntryMethod`, `RecordedKeyboardShortcut` (a recorded shortcut's raw modifier mask + optional key code), `ShortcutTriggerMode` (hold-to-talk / double-tap-to-talk), `SpeechSpeakMode` (逐句快答 / 整段合成), `ComposerSendShortcut` (按 Enter 发送 / 按 Command + Enter 发送 — which key submits from a composer; `.returnKey` is the default, and whichever is chosen the other combination still inserts a newline) and `clamped()`. `pushToTalkShortcutBinding` resolves the live shortcut — the user-recorded one when present, otherwise the preset — so display and event matching share one shape. The 65 stored properties cover the settings pages' 64 rows plus `voiceWebProjectFolderPath` (the VoiceWeb launch path, plumbing rather than a row); `voiceWebShortcutBinding(modeIndex:)` and `voiceWebDefaultShortcutBindings` give the three VoiceWeb mode shortcuts the same preset-vs-recorded resolution. The five 持续监听/自动截屏 properties (`continuousListeningEnabled`, `continuousListeningWindowSeconds` clamped 10–120, `continuousListeningSilenceSendSeconds` clamped 1–5 — 「静音多久自动发送」, the utterance-end silence, default 2.0 s because human thinking pauses are unbounded and the shortcut is the real send marker, `autoScreenshotOnFollowUpSpeech`, `autoScreenshotOnScreenKeyword`) drive the continuous-listening window and the two pre-capture settings. |
| `PushToTalkShortcutRecorder.swift` | ~278 | The 快捷键 page's shortcut recorder, two halves: the display half (key code → readable name, `RecordedKeyboardShortcut.capsuleLabels` / `displayText`) is pure data any caller can use; `ShortcutRecorderButton` is the click-to-arm capture button — NSEvent global+local monitors installed only while armed, Esc alone or any click cancels, a bare key with no modifier is refused (it would be stolen system-wide), and arming posts `.wannaShortcutRecorderStateChanged` so the live event tap is suspended for the duration. |
| `AppSettingsStore.swift` | ~155 | Reads/writes `AppSettings.json` (atomic write, then `0600`), caches it behind an `NSLock`, and posts `.wannaAppSettingsChanged` on save. Same `nonisolated` + `NSLock` shape as `ModelConfigurationStore`, and the reason that shape exists: the project builds with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, so an isolation mistake in a store would be silent. |
| `GeneralSettingsView.swift` | ~1651 | The nine non-模型 settings pages (通用 / 交互 / Agent / 对话与记忆 / 听 / 说 / 看 / 操作 / 快捷键) and the components they share — `SettingsRow`, `SettingsCard`, `SettingsSwitch`, `SettingsSlider`, `SettingsStepper`, `SettingsTextEditorRow`, the two pickers. None of them is decorative. The 交互 page (卡片样式 until 2026-09-23, then 交互样式 while the window style joined it, renamed 交互 at the user's 「设置页面的"交互交互样式"改为"交互"」) holds the theme picker with a live `AnswerCardView` preview beneath it, then a 窗口样式 group whose 展开方式 row picks `WindowExpansionStyle` — and deliberately renders no preview of the animation, because 「不需要提供预览，因为很难预览」 — then a 发送方式 row picking `ComposerSendShortcut` (按 Enter 发送 / 按 Command + Enter 发送), which is also the page's own table entry above. The restyle's tokens and shapes (uppercase-tracked group labels, surface2/12-pt cards, insettable row dividers, SF-Symbol sidebar icons) live in these shared components, so the rows pick the look up without per-row edits. 导出设置 / 导入设置 are **not** here: they are `SettingsTransferPage` in `SettingsTransfer.swift`. |
| `GeneralSettingsViewModel.swift` | ~186 | `@MainActor` draft-and-save state for those pages, mirroring `ModelSettingsViewModel`. Also owns 清空对话记忆, which is deliberately *not* routed through the draft — deleting a file should not depend on the user also pressing 保存. Its count of what is on disk uses `ConversationSessionsStore.allSessionsIncludingArchived()`, not `allSessions()`: `clearAllSessions()` deletes archives too, so counting only the live conversations would have the settings page state that there is nothing to delete while the button it labels goes on deleting things. |
| `ConversationHistoryStore.swift` | ~785 | Two halves. The legacy store (unchanged) reads/writes `ConversationHistory.json` (atomic write, then `0600`) and posts `.wannaConversationHistoryCleared`; screenshots are held in memory and excluded from `CodingKeys`. Appended to it is the multi-session store: `ConversationSession` + `ConversationSessionsStore`, persisted to `ConversationSessions.json` with the same `nonisolated` + `NSLock` + 0600 shape. Every mutation goes through one private `mutate` funnel (lock, mutate cache, disk write only when 「重启后保留对话」 is on, post `.wannaSessionsDidChange`). First load migrates a legacy `ConversationHistory.json` into a 「默认会话」, renames the old file `.migrated` (kept, never deleted), and sessions file writes always carry `activeSessionID` — the API is `allSessions / activeSession / setActiveSession / createSession / deleteSession / renameSession / appendEntry / replaceEntriesAndSummary / clearAllSessions`, plus the 2026-09-23 pair that makes deletion reversible: `deleteSession` **stamps `archivedAt` instead of removing the record** (soft delete — the row leaves the sidebar, the conversation does not leave the disk), `restoreSession` clears it, and `purgeSession` is the only thing left in the app that actually drops a conversation from the file. `setPinned(_:forSessionID:)` writes/clears `pinnedAt`. `allSessions()` and `activeSession()` both filter `archivedAt == nil` — **both**, and that is load-bearing rather than tidy: `activeSession()` is two separate expressions (the `activeSessionID` hit, then a `sessions.max { updatedAt }` fallback), so excluding archives from only the first would let the fallback hand back a just-archived conversation whose id the sidebar no longer lists, and the app would answer into a conversation with no row and no highlight. Archiving the active session therefore re-points `activeSessionID` at a live sibling inside the same `mutate` (creating one if none is left, so it is never nil), and the fallback picks from non-archived sessions only. `allSessionsIncludingArchived()` exists for the one caller that counts what is on disk — 「清空对话记忆」 in the settings, which deletes archives too. `ConversationSession.pinnedAt` / `archivedAt` are `Date?` on a hand-written `init(from:)` in a `nonisolated extension` (not in the struct body — that would displace the memberwise init four call sites depend on); both use `decodeIfPresent`, because a synthesized decoder throws on a missing key and every file written before these fields existed would fail to load. `ConversationHistoryEntry` also carries four optional turn-meta fields — `progressSteps` (the agent loop's executed steps for the conversation view's 「N 条进度」 disclosure), `turnDurationSeconds`, `turnFinishedAt` (the footer line) and `wasInterrupted` (the 「已被用户打断」 chip) — all `decodeIfPresent`-shaped per rule E1 so files written before them existed still decode. |
| `SoundEffectPlayer.swift` | ~70 | `@MainActor` singleton playing the app's chime set (the wav and mp3 set at the source root, bundled as resources). Lazy warm-up builds one `AVAudioPlayer` per chime on first play; volume 0.5; a missing file is skipped silently. The whole thing is gated on `AppSettings.playsNotchSoundEffects` (「刘海屏音效」). Four hooks used to fire from `CompanionManager` — listening started, transcript sent, answer streaming started, error — and they went on 2026-09-26 with the six `wanna-*` files they played: those were the only assets in the set whose origin could not be established, so they were removed rather than shipped. The remaining chimes are untouched. **Two more fire from the voice chat, and they are deliberately asymmetric**: `.sessionConnected` existed until 2026-09-24 and was removed at the user's request (「连接时，用户点击连接按钮的声音要去掉，挂断时的声音保留」) — the old justification was that the pair are mirrored up/down tones so only one would sound lopsided, and that described the *Chrome-era* layout where connecting took seconds and the tone meant 「好了」; natively the connect is instant, so the same tone became the app shouting after a button the user had just pressed, carrying no new information. `.sessionHungUp` stays, and it must stay inside `disconnectCurrentSession()` — the single funnel all three hang-up routes pass through — and **after** `restoreSpeakerMuteNow()`, or it plays into a muted device. |
| `MascotAvatar.swift` | ~140 | The colour rule behind the sidebar avatars. `MascotRoster` maps a session id's top two bits to one of four pastels (#D7E5FF/#E4DDFF/#D3F2E0/#FFEEC8 — one per identity), so every conversation keeps a colour of its own, and names `homeHero` (the third one). **The character artwork itself was removed from the repository**: it came from somewhere else and did not belong here. The file was already built to survive exactly that — `image(named:)` returns nil for a missing file and every caller leaves the slot empty — so the avatar disc now degrades to its pastel circle alone and the home hero to the voice pill alone, with no error and no empty frame. `MascotAvatarDisc` is the sidebar avatar; `HomeHeroMascotPill` is the home hero. If artwork is ever added back, it loads as a loose bundle resource by URL — not through `Image("name")` — which is the same packaging the chime wavs use. |
| `NotchSupport.swift` | ~852 | Pure geometry + the fullscreen heuristic, plus the shared layout constants the sheet's three columns measure from: `contentColumnHorizontalMargin` (12 — the single left/right margin for the header, bubbles and composer of all three content columns, so nothing in a column is wider than anything else in it) and `sheetHeaderTopInset` (the `restingPillAnimationHeadroom + 8` expression that used to be written out at four call sites; lifted when the Agent and 语音聊天 pages lost their top bar, since the panel's top edge is the screen's top edge and those columns need the same offset their deleted bar supplied). `hasNotch(_:)` (`safeAreaInsets.top > 0`), `notchRect(on:)` (the gap between the auxiliary top areas), `restingPillFrame(on:)` (notch rect + 2 pt per side — the **hit-test** geometry, widened by `pillClickHitMargin` (4 pt) in `handleGlobalClick`; the *window* frame is `restingWindowFrame(on:)`, the pill inset by `−activeFlankWidth` (150 pt) per side so the resting window carries a transparent flank canvas for the voice-activity animation); and `restingTrailingWingFrame(on:)` — the resting pill's **right wing**, which is a click-to-hang-up button while a VoiceWeb session runs (2026-09-23, see the 语音聊天 section). Its left edge is `NotchSupport.trailingWingOriginX(inWindowOfWidth:)`, derived from the three-segment centered `HStack(spacing: -2)` in `NotchPillRootView` rather than guessed — and `leadingWingWidth` (86) / `trailingWingWidth` (88) live here for the same reason: the wing is drawn in `NotchActivityView` and clicked on in `NotchWindowController`, so one pair of numbers shared beats two copies that drift), `expandedSheetSize(on:)`/`expandedSheetFrame(on:)` (width min(810, screen width−40), height `expandedSheetHeight(on:)` — a **user-resizable** height persisted as a fraction of screen height under `wannaNotchSheetHeightFraction` so it scales across displays, clamped to [520, screenHeight−80], default ~940 — and **the live drag height and the persisted preference are two different things since 2026-09-24**: `setLiveDragSheetHeight` updates an in-memory `liveDragSheetHeight` on every mouse event and posts `.wannaNotchSheetSizeDidChange` (the expanded panel re-frames itself with `display: false`, so AppKit coalesces the redraw instead of forcing a synchronous full-sheet draw per event), while `commitExpandedSheetHeight` writes the UserDefaults fraction **once, on release**, and clears the live value; `expandedSheetHeight(on:)` prefers the live value while a drag is in flight, so the accessor keeps returning the same number across the handover), centered at the screen top), and the animation constants (2026-09-23, ported from the user's 12-animation reference HTML): the **02 幕布垂落 expansion** — `curtainRevealDuration` 0.43 s on `curtainRevealTimingControlPoints` (0.0, 0.0, 0.58, 1.0), which is 参考页's `ease-out`, plus `curtainContentEntranceDelay` 0.14 s (the delay 参考页 pairs with 02) — the **01 中心缩放 expansion**, added the same day when the user asked for the pop as a pickable style — `centerPopInitialScale` 0.08, `centerPopRevealDuration` 0.34 s on `centerPopTimingControlPoints` (0.22, 0.9, 0.3, 1.0), plus `centerPopContentEntranceDelay` 0.23 s (the delay 参考页 pairs with 01); these four now serve 边缘缩放 alone, since 中心缩放 was redesigned the same day as the notch-bloom mask expansion and reuses the curtain's timings (`expansionRevealDuration(for:)` maps `.notchBloom` and `.curtain` to the same pair) — and the **winClose collapse** — `centerScaleCollapseDuration` 0.16 s to `centerScaleCollapseFinalScale` 0.92 with `centerScaleCollapseTimingControlPoints` (0.42, 0.0, 1.0, 1.0) — plus `timingCurveValue(atProgress:controlPoints:)`, a CSS `cubic-bezier` evaluator (Newton–Raphson on x, then y; endpoint passthrough; y-control > 1 overshoot supported) so the collapse's Swift driver reproduces 参考页's easing exactly. The styles' timings are read through **one** pair of functions — `expansionRevealDuration(for:)` and `expansionContentEntranceDelay(for:)` — so "how long the animation lasts" is stated once; a second switch inside `NotchWindowController` would leave a deadline or a watchdog that never fires. The *old* 01 中心缩放 expansion constants (`centerScaleInitialScale` / `centerScaleExpansionDuration` / `centerScaleTimingControlPoints`, which drove the rejected per-frame window resize) and the even older `expansionAnimationDuration` + `morphTimingControlPoints` are all gone — see the expansion decision above for why that port was rejected and how the scale styles work instead. `displaysCoveredByOtherProcessFullscreen` suppresses a pill only when BOTH a layer-0 other-process window covers the display AND the menu bar is hidden (`visibleFrame == frame`) — either signal alone misfires (the resident `cua-driver` overlay defeats the first; Dock auto-hide would defeat the second). **2026-09-27 又多了三个共用的数**：`notchTranscriptRowHeight`(32) 与 `notchTranscriptEditorBodyHeight`(560)（原来住在 `NotchRecordingBandView` 里，现在那一侧是转发 —— 因为主 Agent 的字幕与编辑窗要和它逐点一致），以及 `notchTranscriptPanelWindowLevel`(= `.popUpMenu`，主 Agent 那行字幕的面板层级：**在刘海面板之上**，展开面板时也要看得见)，以及 `bandSegmentOverlap`(2) —— 黑带三段之间那处 `HStack(spacing: -2)` 的重叠量，**它同时是「带子实际有多宽」的定义**（= 三段之和 − 2 × 它）：`restingWingBandWidth` 与 `revealedListeningBandWidth(pillWidth:revealProgress:)` 都减它，后者是黑带与它下面那一行字幕**共用的唯一宽度式子**（那一行原来比带子每边宽 2pt，就是因为它按「三段之和」算 —— 见 D35）。`restingWindowFrame(on:)` 的高度是 `pillFrame.height + notchTranscriptRowHeight`，**原点跟着减**（`y: pillFrame.maxY − 窗口高`），所以顶边永远钉在屏幕顶边、多出来的高度往下长 —— 只加高度不动原点会让窗口向上长到屏幕外（D35）。 |
| `NotchWindowController.swift` | ~1900 | The notch subsystem: **`toggleSheetFullscreen()` 是第 2 档尺寸**（2026-09-26）：面板在 `expandedSheetFrame` 与 `fullScreenSheetFrame`（= `screen.frame`）之间切，两个 frame 都由 `NotchSupport` 给，控制器只负责挪面板 + 翻 `NotchPanelModel.isSheetFullscreen`（收起时归零）。没有动画 —— 逐帧改窗口尺寸是这个面板反复踩过的坑。one `NotchPanel` (a `KeyablePanel` copy) per notched screen, doing both roles — **expanding** by taking its final frame in a single `setFrame` and revealing the content with one Core Animation on the hosting view, in whichever of the three styles 设置 → 交互 → 窗口样式 selects (read once at the top of `beginExpansion` and carried through, so a mid-animation save cannot split one reveal into two): 参考页's 02 幕布垂落 (`installRevealCover` / `startCurtainReveal` — a `CALayer` mask, `bounds.height` 0 → H together with `position.y` topEdgeY → H/2 in one `CAAnimationGroup`, 0.43 s ease-out) or 中心缩放 (the default; `startNotchBloomReveal(on:expandedFrame:)` — the 2026-09-23 mask-expansion redesign: mask `bounds` 0×0 → full frame while mask `position` runs from the notch point to the frame centre, on the curtain's duration and timing curve, with a same-key opacity ramp on the hosting layer) or 边缘缩放 (`startScaleReveal(on:expandedFrame:)` — a `CAAnimationGroup` carrying a `CABasicAnimation` on `transform` from `edgeAnchoredScaleTransform(scale: 0.08, …)` to identity **and** an opacity ramp 0 → 1, 0.34 s on `cubic-bezier(.22,.9,.3,1)`, pinned to the panel's bottom edge by the derived compensation translation `d = (1 − s)·(a − c)`; the old top-edge variant was deleted with the broken transform 中心缩放 — see the expansion decision above) — and **collapsing** by `driveCenterScaleFrames`, a 60 Hz `Timer` that `setFrame`s each frame along a **top-center-anchored scale path** (`x = anchorMidX − W·s/2, y = anchorTopY − H·s, w = W·s, h = H·s`) — the collapse's single animation source, with `NotchPanelModel.expansionProgress` derived from the live frame per `windowDidResize` (the sheet's fill deliberately does **not** read it — see `NotchActivityView`). All three styles start from the same zero-height cover — 边缘缩放 drops it in the *same* transaction that installs its transform and opacity, because a cover works whatever the resize does to the hosting layer while a hand-set transform on that layer is not something AppKit may be assumed to preserve across a frame change. At rest the panel is wider than the pill by `activeFlankWidth` per side — the wings' slide-out canvas, so `panel.ignoresMouseEvents = true` there and the toggling is load-bearing: false in `expand(on:)` before `makeKeyAndOrderFront`, true again in `collapse(...)` after the `setFrame` animation — otherwise the transparent flanks would block clicks on the menu bar items beside the notch (click-to-expand still works because the global monitor sees that click fall through). `handleGlobalClick(at:)` additionally tests `NotchSupport.restingTrailingWingFrame` against every screen's screen **before** the pill hit test, and when the panel is in `.externalChatting` that click calls `companionManager.voiceChatController.disconnectCurrentSession()` instead of expanding (2026-09-23; the VoiceWeb controller it used to name was deleted when the voice chat went native — **one funnel either way**, that method is where the hang-up chime and the speaker-mute restore live) — the wing and pill rects do not overlap, so the order changes no outcome today; it is written this way so a future widening of `pillClickHitMargin` cannot swallow the hang-up. **Expansion is click-only** — hover-dwell, its 30 Hz poll and its progress ring were removed 2026-09-22 (see the key decision above), so `expand(on:)` is a single immediate-commit path whose **content flip is deferred one run-loop tick** (2026-09-23, the user's 「用户点击刘海之后没有马上开始展开，而是等了一段时间…反应时间必须快」): measured with temporary file instrumentation, with the flip inline the sheet's SwiftUI build + draw ran inside the `setFrame(display: true)` synchronous draw — **317 ms with a populated conversation, 44 ms empty** — so the reveal did not begin until click+350 ms. `beginExpansion` now installs the cover, commits the final frame, adds the reveal, and only THEN flips `panelModel.isExpanded` + runs `finishExpansionCommit` in a `DispatchQueue.main.async` block, so the click's own transaction commits with the reveal animations attached and the render server (its own clock) starts the expansion ~1–5 ms after the click while the sheet builds mid-animation. Two load-bearing details: the growing mask would otherwise reveal a transparent hole onto the desktop, so `installRevealCover` also paints the hosting layer's `backgroundColor` with the sheet surface (`NotchExpandedSheetStyle.surfaceColor`, bottom corners 24, chosen by `isFlipped` — restored in `removeReveal`); and `isExpansionCommitPending` (set at entry, cleared **unconditionally** first thing in the deferred block) blocks a second click inside the one-tick gap from double-expanding, since `!panelModel.isExpanded` no longer covers that window. The reveal cover goes on **first** (installed at zero visible height, because the `setFrame(display: true)` that follows forces a synchronous draw and would otherwise paint the finished sheet for one frame), then the final frame, then the style's reveal, then — one tick later — `isExpanded` and the content, with a generation-guarded `removeReveal` at `expansionRevealDuration(for:) + 0.05` and a watchdog at `+0.25`. Collapse paths: Esc (local keyDown monitor while expanded), **a second click on the notch itself** (2026-09-23, the user's 「用户再点击刘海屏的时候它自动缩回去，增加这样一个动画效果」 — the re-click test sits at the TOP of `handleGlobalClick`'s expanded case, before the outside-click test, and it has to: the pill's hit rect is *inside* `expandedSheetFrame`, so a click on the notch is also a click outside the sheet, and the outside test would otherwise claim it first), click outside, resign-active, close button. **刘海左侧那三颗「Notion 笔记」按钮的点击也在 `handleGlobalClick` 里**（三个 slot，排在展开态那些分支之前），它们的状态从 2026-09-27 起读 `NotionNoteSession.shared`（原来是录音控制器）—— 命中矩形仍是 `NotchSupport.notionNoteButtonFrame`，与视图那边靠 `notionNoteButtonPlacement` 同源。**2026-09-27 新增两处**：`bindListeningTranscriptPanel()`（订阅 `activityPhase` + `isFullscreenSuppressed`，`== .listening` 就 `show()` 那块字幕面板、其余 `hide()` —— **只读相位，不碰状态机**；`teardown()` 里也收掉它），以及 `handleGlobalClick` 里那条「刘海左侧那颗 `Listening` 可点 → 展开转写编辑窗」的分支（读的还是 `recordingWingFrames`，判在录音两翼之后、`panelModel.isExpanded` 之前）。**`handleGlobalClick` is reached by both monitors** — the global one sees clicks delivered to other apps, the local one sees clicks destined for this app's own windows, and this panel counts as one, so a notch click never arrives through the global monitor alone. **The collapse is 参考页's winClose, not a reverse scale**: `collapse(expandBackToPill:)` drives scale 1.0 → 0.92 over 0.16 s on `centerScaleCollapseTimingControlPoints` while `driveCenterScaleFrames(fadesToTransparent: true)` fades the whole window's `alphaValue` (shadow included) to 0; the generation-guarded completion then sets `hasShadow = false`, resets the frame to `restingWindowFrame` **while still invisible** (never `restingPillFrame` — the wide frame is what keeps the flanks' 150 pt slide-out canvas alive; morphing back to the pill rect, as an earlier version did, clipped that canvas away permanently so the wings could never slide out again), restores `alphaValue = 1`, and converges. The pill rect stays the hit-test geometry for click-to-expand; only the window frame has to come back wide. **The panel shadow is expanded-state-only**: `beginExpansion` sets `hasShadow = true` when the scale lands (the sheet is #161615 on whatever the user has behind it — often near-black windows — and without a shadow its silhouette, rounded bottom corners included, disappears), the collapse completion sets it back to false so the silhouette never pops mid-animation; the resting pill must never cast one (it would halo under the menu bar). `convergeOnRestingState` also defensively restores `alphaValue = 1` and `hasShadow = false`, because a fade whose completion were ever skipped would otherwise strand a transparent, unclickable pill. **For the collapse there is ONE animation source: the window frame.** `expansionProgress` is not animated on its own — `syncExpansionProgressWithPanelFrame` derives it from the panel's live frame on every `windowDidResize` (the frame driver produces real per-frame resizes), so the SwiftUI silhouette tracks the window exactly and cannot desync or stall behind it. That dual-animation desync was the 2026-09-23 「刘海缩不回去」 bug (window at rest, progress frozen high, the mid-collapse outline drawn forever); `convergeOnRestingState(_:)` remains as a frame-only snap (no animation, idempotent, in the completion handler plus a generation-guarded watchdog 0.25 s past each animation's deadline — `collapseGeneration` guards collapse, `expansionGeneration` guards expand, so a stale watchdog on one screen can never snap another screen's panel after an expand→collapse→expand), because progress follows the frame one snap converges both. Strong `companionManager` reference is a deliberate app-lifetime cycle (same as the overlay windows). **The temporary-agent strip rides this lifecycle too** (2026-09-26): it draws in its own panel on the menu-bar screen (`AgentStripPanelController`, installed from `rebuildScreenPresences` and removed in `teardown`), because the strip's chip/card hit tests are the first branches of `handleGlobalClick` — the two must appear and disappear together, or the user gets chips that are pure decoration. Holds one screen's sheet expanded at a time; fullscreen suppression per display. or under another process's fullscreen window. `expandShowingSettings(initialPage:)` is `CompanionManager.openSettings`'s way in: it sets `requestedSettingsPage` BEFORE expanding — the sheet view is inserted by the same `expand(on:)` call, so only its onAppear can consume the request — and reuses the last-expanded screen, or returns false so `openSettings` falls back to the titled window. `expandForLaunch()` is 「启动时自动打开面板」's entry: same screen choice, no page request. **`lastSheetHostScreen` + `revealSheetAfterTemporaryHide()` are the 「让一下位」 pair** (user's 2026-09-23 Agent-page request: 「用户点击"打开"按钮之后，整个弹窗直接缩回去，就是隐藏一下，要不然用户没有办法去点击选择哪一个文件夹」): the Agent header's 打开 button tells the sheet to get out of the way before raising an `NSOpenPanel`, then puts it back. `lastSheetHostScreen` is written in `beginExpansion` and deliberately **never cleared**, because `collapse` nils `expandedScreen` — a reveal that asked `expandedScreen` for its screen would find nothing. `revealSheetAfterTemporaryHide()` is a no-op when the panel is already expanded (that path only exists for a sheet that just stepped aside) and a no-op when the remembered screen is gone, since the pill is still there and one click brings it back. `expand(on:)`/`collapse(expandBackToPill:)` also write `CompanionManager.isNotchSheetExpanded` — the overlay's answer/transcript bubble reads it to hold itself back while the sheet shows the same text. Observes `.wannaNotchSheetSizeDidChange` and re-frames the expanded panel live (the resize grip writes the height; the controller must not be rebuilding it). `bindDictationFinalizing` subscribes `BuddyDictationManager.$isFinalizingTranscript` and folds it into `refreshActivityPhase()`, which overrides the voice-state phase with `.transcribing` while the final result is pending — the moment `legacyDictationTypingDashes` covered. |
| `NotchActivityView.swift` | ~1250 | `NotchActivityPhase` (idle/listening/thinking/speaking/transcribing — transcribing is 「松键后等最终结果」's gap while the ASR finalizes, shown as 「Typing…」; plus the two external-session phases: `externalConnecting` — 「Connecting」 + AMBER (#FBBF24 tint over a deep-amber glow) pulsing dots in the trailing wing, drawn with `NotchThinkingDotsView`, deliberately no hang-up glyph because until the page reports `ready` there is nothing to hang up (2026-09-23, the user's 连接中 feedback requirement) — and `externalChatting` — a PERSISTENT 「Chatting」 for the whole connected VoiceWeb session, green #4ADE80 tint over the #0B4627 glow, equalizer animation), and the resting pill's **wing layout** as measured: the pill NEVER grows — two black wings exactly the notch's height slide horizontally out of the notch's left and right edges (`.easeInOut` 0.38 s keyed to the phase) while the companion is active. The leading wing carries the bold state word (「Listening」/「Thinking」/「Speaking」/「Typing…」) **right-aligned against the notch** (measured 2026-09-22: "Listening" ends ~5 pt before the notch's edge — the band's content clusters at the notch instead of stranding the word at the far left; wing widths 86/88 pt match the measured ~78/87 band — hoisted into `NotchSupport.leadingWingWidth` / `.trailingWingWidth` on 2026-09-23 so that this drawing and the hang-up hit rect read one pair of numbers; the statics here are forwarders); the trailing wing — the only wing with colour — carries the phase animation in its phase colour (teal 4-bar mic waveform / purple 3-dot pulse / orange equalizer / grey typing dashes — with one exception added 2026-09-23: while `phase == .externalChatting` the whole cell is replaced by `NotchHangUpGlyph`, a red `phone.down.fill` under a breathing glow, because that wing is then a real button — a click on it hangs the VoiceWeb session up without expanding the notch, see the 语音聊天 section) over an `EllipticalGradient` glow that is a **soft blob contained inside the wing, not a ramp running to its outer edge**. Three parameters carry it, all fitted 2026-09-22 to the supplied Listening screenshot (595 px of band = 364 pt, so 1.635 px/pt — it is scaled, not a 2× capture): `center: UnitPoint(x: 0.84, y: 0.5)` puts the peak **~14 pt inside** the outer edge, `endRadiusFraction: 0.40` gives a radius of only ~40% of the wing's width so the fade reaches black while still 40–45% of the wing away from the notch, and the frame stays **taller than the wing** (64 pt) so the light — genuinely still ~36% bright where it meets the band's top and bottom edges — **reaches past them and is trimmed by the wing**; sizing the frame to the wing's own 32 pt would force the light to zero at those edges and leave a dark rim along a glow that should be touching them. `notchGlowStops` is the Gaussian-ish falloff fitted to the scan (1.00 / 0.85 / 0.62 / 0.36 / 0.16 / 0.00 at 0 / .30 / .50 / .70 / .85 / 1.0), and `notchGlowColor` is a **separate colour table from `notchAnimationTint`** — thinking draws bright magenta dots (`#F35FD7`) over a glow that peaks at `#540067`, a fully saturated violet with zero green; listening is `#12464C`, speaking `#45230F`. Compositing the animation tint at 50% opacity instead (what this used to do) gives at best a desaturated version of the tint, which on the user's teal desktop read as the same hue at half the saturation — a grey-green smudge, reported as 「效果非常差」. The shape it replaced was `center: .trailing` with `endRadiusFraction: 1`: a wedge whose peak sat on the outermost pixel and whose fade ended exactly at the notch side. That is the wrong model — the glow is **cut off by the silhouette at ~55–70% brightness**, not faded out before it — so the visible result was a long grey-green wash across the whole wing ending in a hard jump to the wallpaper at the band's edge. Re-measured live after the fix with the app's own shortcut: peak 16 pt inside the outer edge, black 45% of the way in, ~55% at the silhouette, against the measured 14 pt / 49% / ~60%. `EllipticalGradient` (not `RadialGradient`) because its radii are **unit-space fractions** (`startRadiusFraction`/`endRadiusFraction`), so the fade lands on zero at the frame boundary whatever the frame measures — the circular `RadialGradient` it replaced was still >0 opacity at its frame edge, and the wing's clip cut it mid-fade into a hard-edged rectangle patch. **The middle segment goes square (radius 0) the moment the wings come out** — `PillShape(bottomCornerRadius: isActive ? 0 : 6)`, with `animatableData` exposing the radius so it interpolates with the 0.38 s wing slide instead of snapping. This is the fix for 「刘海左下角有一个空白」: wing + middle + wing are three views, and a rounded corner on the middle's bottom-left punched a notch-shaped hole where it met the square-cornered wing, on both sides of the hardware notch. Square on all four bottom corners of the middle makes the whole assembly ONE black band whose bottom edge is a single straight line, with rounded corners only at the two outermost ends. **Each wing's outer bottom corner was 14 pt, measured off the user's target screenshot, and is now SQUARE (radius 0) — the user rejected the rounding on 2026-09-23 (「圆角位置目前是空白状态」): the curve recedes from the bottom edge and lets the wallpaper show through under the arc, which on a bright desktop reads as another gap like the old seam. The band's bottom edge is now one straight black line from the notch out to each wing tip. (The restructure that made the rounding true is still load-bearing: the wing used to be a `ZStack { black rounded rect; content }`, and a ZStack sizes to its largest child — the trailing wing's 64 pt glow pushed the rect's bottom edge 16 pt below the band, where the call-site `.clipped()` sliced the corner square, so the live band had one rounded corner and one square one from the same code. The wing is now the outline shape as the base with everything else in an `overlay` (which never contributes to layout size) clipped by `clipShape(outline)`.** Both wing frames still clip **outside** the animated width — a `.clipped()` inside the wing clips to the content's natural size, and a width-0 SwiftUI frame does not clip on its own, which leaked the idle glow past the pill's edge until the clip was moved to the call site. **The wings overlap the middle segment by 2 pt (`HStack(spacing: -2)`), because with flush adjacency the wing's edge and the pill's edge antialiased independently at the SAME coordinate, and whenever that coordinate landed on a pixel boundary the pair left a full-band-height see-through hairline on both sides of the notch (the user's 「刘海的左侧和右侧分别有一个空白间隙」). With the overlap every one of those four edges lands inside the other view's solid black, and the layout still resolves to the pill exactly centered at rest.** **`NotchExpandedWingBand` is that same band, drawn over the EXPANDED sheet** (2026-09-24, the user's 「在整个对话界面顶部，刘海屏左右两侧应该持续显示 chatting 和挂断按钮，并覆盖在窗口上方。现在要么没有显示，要么被窗口覆盖了…用户在对话页面时也应该有这个动画效果，无论是正常对话、打断，还是未挂断的运行状态，都要能看到当前状态」): the expanded branch of `NotchPanelRootSwitchingView` only drew `NotchExpandedSheetView`, so the wings did not participate in the layout at all and a user working in the sheet — which is nearly always — saw no state whatsoever. It is an `overlay(alignment: .top)` on the sheet, gated on `activityPhase != .idle`, and it reproduces the resting band **pixel for pixel** by laying itself out in a virtual window of the resting band's width (`NotchSupport.restingWingBandWidth`) centred on the notch (`notchBandCenterXInExpandedWindow`, computed as two real rects subtracted rather than `width / 2`, because the notch is not guaranteed to sit at the screen's centre) — so switching between the two states does not shift the band sideways. Its height is `expandedWingBandHeight` = **min(notch height, `sheetHeaderTopInset`)**: the sheet's content starts at that inset and the notch is 32 pt against its 30, so a full-height band clipped the top 2 pt off the header buttons the right wing passes over. **Only the trailing wing's button takes clicks** — the decorative layer is `.allowsHitTesting(false)` with the button as its ZStack sibling — because otherwise the band would swallow 「再点一次刘海收起」 and the notch would stop responding. The button's hit rect comes from `NotchSupport.trailingWingOriginX(inBandOfWidth:)`, the same function the resting hit rect derives from; that distinction cost a real bug on the day it was written (the band width was fed to the window-width variant, and the drawn red phone and its click target sat **71 pt apart** — visible to the AX tree as `挂断 (890,0 88×30)` against a glyph at ~956, and invisible on screen). While resting, that button is not a SwiftUI control at all: the panel passes clicks through and the **global monitor** hits `restingTrailingWingFrame`, so both routes the user asked for exist and both end in `disconnectCurrentSession()`. **The band needs one thing from the phase machine to persist, and that was the other half of 「没有显示」**: `forceActivityPhaseIdle()` — the 对话 page's stop entry — now sets `externalSessionOverride ?? .idle` rather than a flat `.idle`. A stop ends *a turn*, not *a session*, and the override is the session; clearing it left the notch idle for good, because `refreshActivityPhase()` only recomputes on a voice-state **change** and a stop leaves that state parked on idle, so nothing was left to restore it.

`HomeSpaceSheetShape` draws the expanded sheet: all four corners rounded, and since 2026-09-23 the **top pair is wider than the bottom pair** — `topCornerRadius` 36 against `bottomCornerRadius` 24 (the user gave 24 for both, then asked for the top two to be 「再大一点」; the panel's top edge IS the screen's top edge, so the wider arcs show a sliver of menu bar and wallpaper behind them, which is the intended look and the panel's shadow is what keeps the silhouette readable against it). Both radii are clamped to half the body's shorter side, and that clamp is not defensive tidiness: the collapse animation walks the body back down to the resting pill's 190×32, where not even 24 fits — 16 happened to equal exactly half that height, which is why the arcs never crossed before the radius grew. **`NotchExpandedSheetView` fills `HomeSpaceSheetShape(expansionProgress: 1)` at a constant** and clips all sheet content into it: reading the animated `expansionProgress` here produced a sheet that intermittently rendered transparent (the value is written by `withAnimation` and the view is inserted in the same frame, so it can read 0 and draw at pill size); the window frame being the sole animation source carries the visual expansion, and the constant fill makes transparency impossible by construction. The fill is `NotchExpandedSheetStyle.surfaceColor` = `rgb(24,24,28)` — **参考页's `rgba(24,24,28,.94)` with the 6% alpha dropped on 2026-09-23**, at the user's 「整个弹出窗口调整为完全不透明，现在是透明状态」. That enum is `internal`, not private: `NotchWindowController`'s expansion-time temporary surface (see its entry) paints the same color and bottom radius onto the hosting layer, so the two files read one pair of constants rather than drifting. 参考页's window floats over its own page background where a little bleed-through is part of the design; here the "background" is the user's desktop, so what showed through was their wallpaper and other people's windows. The resting pill stays pure black to fuse with the hardware notch; the grey surface plus the panel shadow (`NotchWindowController` toggles it on at expand, off when the collapse morph lands) is what makes the silhouette and its rounded bottom corners read against a near-black window. The sheet's old 1.5 pt edge-light layer is gone entirely — 「把整个弹出窗口的外边框高亮线删掉」, one fewer layer and one fewer clip. An `overlay(alignment: .bottom)` on the sheet hosts `NotchSheetResizeGripView` — the 18 pt bottom hit strip (40×4 capsule, brighter on hover) which resizes the sheet by **reading the cursor's absolute screen position** (`NSEvent.mouseLocation`), never `DragGesture.translation`, and that is the whole point of the view since 2026-09-24. The grip sits on the panel's bottom edge, so the edge it sizes moves *because of* the drag: a `.local` translation is measured against the grip's own frame and therefore loses exactly what the panel gained — with cursor movement Δ and panel growth Δ′, `Δ′ = Δ − Δ′`, a steady-state gain of **1/2**. Measured 2026-09-24 by scripting a real 100 pt drag down through the live grip: 782.49 pt → 832.49 pt, i.e. 50, matching `1/2` exactly; the user's report of it is 「鼠标已经移动到上面了，窗口还没有移动」「闪跳」. `NSEvent.mouseLocation` is AppKit-global and no window frame can move it, so the gain is 1 — re-measured after the fix at **−399 for a −400 pt drag**, which fits a constant ~1 pt grab offset rather than a residual gain error. The grab's own offset is captured once, on the drag's first event, so the edge never jumps when the drag begins. |
| `ConversationSessionsModel.swift` | ~165 | `@MainActor ObservableObject` over `ConversationSessionsStore` for the notch sheet: sessions + active id reloaded on `.wannaSessionsDidChange`, `searchQuery` matching titles and entry text (case-insensitive) with hit previews, and select/create/delete/rename delegating to the store. Its list is **not** the store's raw array: `sidebarRows` puts **pinned sessions first** (ordered by `pinnedAt`), then everything else in disk order, and the search filter preserves that ordering — so 固定 sticks rather than merely decorating a row. It also carries the archive surface the 归档 page drives (`archivedSessions`, `restoreSession`, `purgeSession`) so the view never reaches into the store itself, and its membership check (`contains(_:)`-shaped guard used by the mirror observer) filters archives the same way `activeSession()` does — a conversation that has been archived is not an active session, however recently it was used. |
| `NotchSheetRootView.swift` | ~775 | **顶栏那几颗窗口按钮住在这里**（2026-09-26 用户要求）：右上角三颗 = 收起侧栏（纯图标）/ 把窗口收回刘海 / 展开↔收缩（全屏与刘海下方小窗来回切），左上角一颗 = 同一个「收起侧栏」。它们挂在一个 `ZStack` 上、**不挂在两列那个 `HStack` 的 overlay 上** —— 那一排 177pt 宽，一旦参与两列的布局，收起侧栏时 `HStack` 的最小宽度就变成 810+177，两列会一起被居中撑出面板（实测见 开发经验/10 G13）。左列在 `HomeSpaceSidebarView`（245）与 `HomeSpaceSidebarRailView`（62，折叠态）之间二选一，折叠与否存 UserDefaults 的 `wannaSessionSidebarCollapsed`（**刻意没走 AppSettings**：那条保存链会在「重启后保留对话」关着时清空全部会话）。 The expanded sheet's root. The content column switches on `AgentSessionManager.selectedSidebarSection` (NotchHomeView ↔ AgentSessionView ↔ VoiceChatSessionView); **the top-bar strip is gone from the Agent and 语音聊天 pages** (the user deleted the whole chip + activity indicator + ✕ row), so those two columns start with their own title, offset by `NotchSupport.sheetHeaderTopInset` — the lifted `restingPillAnimationHeadroom + 8` that the deleted bar used to supply, which is not optional because the panel's top edge *is* the screen's top edge and a title without it would sit under the menu bar. Only the conversation page keeps a top bar, and it is a centered session chip — a real switcher, a `Menu` listing every session (checkmark on the active one, 新建会话 at the bottom) behind a session-title + chevron label — **deliberately no avatar in the label**: a `MascotAvatarDisc` inside a `Menu` label renders at the PNG's intrinsic 256 pt and blows the top bar up to 255 pt tall (measured 2026-09-22; overlay/clipShape/frame cannot prevent it — see 开发经验/13-顽固问题排查法.md), so characters appear only in the left sidebar session list, per the user's explicit 「右侧的小人必须删除掉」. Closing is never lost: Esc, a click outside the panel, and `didResignActive` all still work, plus the settings/archive pages carry their own close button. **Settings and the archive are exclusive of the sidebar** — `showsSettings` swaps the whole HStack for `NotchSettingsArea`, and `showsArchive` for `NotchArchiveView`, **settings winning when both are set**. Settings is a ~245 pt sidebar with a 26 pt bold 「设置」 title + the page list grouped under uppercase section labels (untitled 通用/交互/模型/Agent block, then 对话, then 看与操作, then 导入导出) + a divider-topped bottom row with 「返回」 pinned left and 「退出 Wanna」 pinned right (2026-09-23: 「设置页面左下角也应该有一条线」「返回按钮跟设置按钮必须样式完全相同，但返回按钮改成绿色」「退出按钮靠右对齐，返回按钮靠左对齐」 — both are `NotchBarActionButton`, the same struct the sidebar's 「设置」 row is built from, so their shape cannot drift and 返回 differs only by `tint: DS.Colors.success`) — and a content header carrying the 19 pt page title at the left with `GeneralSettingsActionBar(style: .headerInline)` at its right: 恢复默认 / 保存 / 关闭, the ~60 pt bottom action bar folded into the title row at the user's request to save vertical space. **That header has no ✕** — the close button was deleted twice (「把设置页面右上角的叉号去掉」「把标题右侧的叉X删掉」), and `closeAction` must be the sheet's collapse rather than the action bar's default `NSApp.keyWindow?.close()`, because the expanded notch panel *is* the key window and `.close()` orders it out while `NotchWindowController.isExpanded` stays true, stranding a notch that can neither collapse nor reopen. Three things were deleted from that footer area at the user's request on 2026-09-23 (「返回按钮放在设置页面的左下角，退出按钮放在返回按钮的右侧。去掉版本号」): the account card that used to head the settings sidebar (initial disc + name + 「免费版」 badge), the 「‹ 返回」 pill that used to sit *above* the page list, and the `Wanna x.x (build)` version footer. The account card went for the same reason it went from the conversation sidebar — the user deleted the username from both places in one instruction — leaving 通用 as the first row and the whole sidebar as nothing but navigation. `consumeRequestedSettingsPageIfNeeded()` clears `showsArchive` as well as setting `showsSettings`, because an external settings request arriving while the archive page is up must not land on the archive (the easiest of these to miss, since the archive page otherwise looks fine). The page views themselves (`GeneralSettingsView(generalSettingsViewModel:page:)`, `ModelSettingsView`, `GeneralSettingsActionBar`) are reused unchanged; it owns its own draft ViewModel pair, so a titled settings window open at the same time is last-save-wins. **Two of its ten-ish pages are actions rather than preferences** — 导出设置 / 导入设置 under the sidebar's 「导入导出」 section, rendered as `SettingsTransferPage(mode:)` — which is why the content header skips its 恢复默认/保存/关闭 bar for them (`SettingsPage.isSettingsTransferPage`). **The sheet takes `collapseAction`, `hideSheetAction` and `revealSheetAction` as three separate closures, and the split is semantic rather than tidy**: `collapseAction` means "the user put the sheet away" (Esc, close button), while the hide/reveal pair means "step aside for a moment, you are coming right back" — the Agent page's 打开 button, which must get out of the way of the folder picker. Collapsing with the wrong one of them leaves the user with no way back. |
| `HomeSpaceSidebarView.swift` | ~1079 | 文件末尾还有**折叠态的 `HomeSpaceSidebarRailView`**（62pt 宽，2026-09-26）：从上到下是当前页标识（Screen / Agent / Call）、一圈按各自颜色描边的头像列表（亮到 1.0 的那一颗就是当前激活的会话）、最底下只有「设置」——用户定的「其余内容隐藏」。它与展开态是两个视图（245pt 里那套在 62pt 里放不下），但头像与选中语义是同一套。The notch sheet's session sidebar. The order is the user's, fixed 2026-09-23 in two steps: **the 「对话 / Agent / 语音聊天」 switcher is three rectangular buttons at the very top** (bound to `AgentSessionManager.selectedSidebarSection`; 30 pt tall with 13 pt labels since 2026-09-23, up from 25, with the row's bottom padding cut from 10 to 5 so the divider below it does not move — that is the whole point of the pair of constants: 「按钮高度调大一点，文字也大一点…间距小一点、按钮大一点，这样分割线位置不变」), then a divider, then **one search field + round 「＋」 shared by all three sections**, then the section's list, then — pinned at the very bottom — the **「设置」 / 「归档」 pair** (that order since 2026-09-23: the user asked for the two to trade places, putting the everyday destination on the left and the rarely-visited one on the right). Nothing sits above the switcher: the account card that used to head this sidebar (initial-letter disc, `NSFullUserName()`, 「本地模式」 status line, gear into settings) is deleted, and the two whole-sheet pages moved into the bottom row, so the sidebar reads top-down as *which column am I in* and bottom-up as *the whole app*. The three sections are one surface on purpose — same order, same field, same rows, same margins. Lists: the 对话 half is the session list (blue-dot active indicator at the left edge, `MascotAvatarDisc` 38 pt — one fixed character + pastel per session id, title + relative time or the search preview, a second preview line from the last entry, hairline separators, hover delete, right-click rename inline, and a small `pin.fill` on a pinned row so it is visible which ones are pinned); the Agent half (`agentList`) mirrors those interactions with status-dot rows and a 「＋ 新建 Agent」 row whose NSOpenPanel hands the picked folder to `createAgent`; the 语音聊天 half (`voiceChatRoleList`) is the VoiceWeb role presets, where **a row click only SELECTS** (`selectRole`) and the 连接 / 挂断 button sitting at that same row's right end is the single place a session can begin — two sibling `Button`s in one `HStack` (never nested: a button inside a button makes it indeterminate which one a click hits), with the connect control deliberately large and rounded so selecting a role and starting it are one short mouse move apart rather than a trip to the content column's far corner. The row context menu carries 固定 / 取消固定 and 归档 — deletion is a soft delete now, so the row's help says where it went and the 归档 page restores it. The ground is the opaque `DS.Colors.surface3`, not `Color.black.opacity(0.35)` composited over the sheet, per the user's 「整个弹出窗口调整为完全不透明」. Deliberately not drawn: a quota ring and an info icon — no real data backs them locally. |
| `NotchArchiveView.swift` | ~428 | The 归档 page: a whole-sheet takeover exactly like 设置 (`showsArchive` swaps the HStack for it in `NotchSheetRootView`), so none of the sidebar's `showsSettings` mutual-exclusion checks had to change. Its own 245 pt left column lists the archived sessions (title / relative time / entry count) with a 「‹ 返回」 pill pinned **bottom-left**, matching 设置's footer, and the right column shows the selected archived conversation read-only, reusing `AnswerCardView` and the user-bubble geometry. The header carries 恢复; each row's context menu carries **恢复** and **彻底删除**, the second behind an `.alert(…, presenting:)` confirmation (this repo has no `confirmationDialog` — the sample is `ModelSettingsView`). An empty archive gets a centered hint. Its rows reuse `previewText` / `relativeTime`, which is why those two stopped being `private static` in the sidebar. |
| `MessageComposerField.swift` | ~436 | The ONE text box at the bottom of all three content columns (对话 / Agent / 语音聊天) — shared rather than cloned three times, because the behaviour the user asked for is fiddly and identical everywhere. Its row is `HStack(alignment: .bottom, spacing: 6) { composerBox; stopButton }` — the box and the **stop button** are the only two things on it (the 语音 / Agent state badges are gone). The box is a **three-line rounded rectangle** rather than a 34 pt capsule (a single-line box made a long typed question unreadable), with a 展开 button in its **own top-right corner** (「点击这个展开按钮后，输入框的高度占据右侧高度的 30%」) and the clear ✕ at the **bottom-right**, so the two never fight for one spot; the height is the caller's (`threeLineHeight` collapsed, 30% of the measured content column expanded, with `maximumVisibleLineCount` derived from it so an expanded box can be filled instead of showing three lines above a field of blank). **The stop button is 24 pt wide and its height is EXACTLY the box's own `height` parameter** (「停止按钮的高度必须与输入框高度完全相同」, 2026-09-23 — the earlier fixed 24×42 read as a stub beside the three-line box and collapsed further against the expanded one; verified 24×67 in the AX tree against `threeLineHeight`), a vertical rounded rectangle just outside the box's bottom-right with a 6 pt hairline gap** (「长方形的、竖向的……跟输入框要留一条小的边距，小细缝就可以……减少空间的占用」), carrying no label and three states off its one input `isResponding`: **grey while nothing runs, red while the assistant is working, grey again the moment it finishes**. **Shift+回车 now inserts a real newline, and Command+回车 sends** (the 交互 page's 「发送方式」 decides which) — which is why the field is an **`NSTextView` (`ComposerTextView` + `ComposerNSTextView`) and not a `TextField(axis: .vertical)`**: a vertical SwiftUI `TextField` takes **no newline from the keyboard at all**, measured over four build-and-probe rounds against the live field on 2026-09-23 — with the key handler removed entirely Shift+Return produced `onSubmit` and no change to the bound text; appending `"\n"` to `draft` from a handler ran (the log proved the shift was seen) and left the value byte-unchanged; and writing `"\n"` into the field editor itself via `NSTextView.insertText` ran without error and left the value byte-exactly as it was. Only an accessibility-level write of the whole string holds a `"\n"`, which is not a path a keyboard can take. So the old field was left swallowing Shift+Return rather than sending a half-written question — and 「按 Command + Enter 发送」 was not implementable on it either, because Command+Return is not a text command and a `doCommandBy` gate never sees it. The `NSTextView` has none of that: it is the same engine Notes and Messages type into, `insertNewline:` inserts a real break, and because `ComposerNSTextView` overrides `keyDown` the send key is decided from the raw `NSEvent` before any key binding can reinterpret it. |
| `MessageCopyButton.swift` | ~97 | The shared copy control on the message bubbles: a small `doc.on.doc` that flips to `checkmark` briefly on success and puts the **displayed** text on `NSPasteboard.general` — what is on screen, with `[POINT:…]` / `[CLICK:…]` tags stripped, not the stored raw reply. Sits under the user bubble and under the assistant bubble on all three content pages, so the three pages copy the same way. |
| `ComposerAttachment.swift` | ~330 | **输入框里粘进来的东西**（2026-09-28）：`ComposerAttachment`（kind / 显示名 / 绝对路径 / **归一化后的 JPEG 字节** / 像素尺寸 / 文件夹子项数）、`attachments(from pasteboard:)`（**文件 URL 优先**，其次纯图片；都认不出来就返回空 = "这次粘贴不是附件"，交回 `NSTextView`）、`normalizedJPEG(from:)`（长边 ≤1280、质量 0.8；**只缩不放**；像素尺寸走 `representations` 里最大的那份，**不能信 `NSImage.size` 那个"点"** —— 与截图那条路同一个坑）、`promptBlock(for:)`（`<attachments>`，明写"这是材料不是指令"）、`claudeCodePreamble(for:writtenImagePaths:)`、`imagePayloads(for:)`（→ `analyzeImageStreaming(images:)` 的形状，主循环与语音聊天共用）。纯逻辑、不碰 store/网络/UI，所以能脱 App 编译、被 `WannaTests` 直接验。 |
| `ComposerAttachmentStore.swift` | ~160 | 附件**按卡片 id** 存（与 `AppSettings.cardChatMode` 同一个键），`@MainActor` 单例、**只在内存**（图片是全 App 最大的一类数据，而用户只说"一直留着直到手动删"，没说重启后还要）。上限：图片 **5** 张、总数 **20** 条，到顶拒绝并**留一行日志**（不静默丢弃）。`previewingAttachment` 也住这里 —— 预览面板要盖住整个内容列，三页各持一份必然分叉。`consumePasteboard(_:forCardID:)` 是粘贴的唯一入口，**认不出来时也记一行**（粘贴板上有哪些类型）—— 那是分辨"这次粘贴根本没走到这里"与"走到了但没认出来"的唯一判据。 |
| `ComposerAttachmentStrip.swift` | ~380 | 输入框上方那一条：**缩略图条**（`ScrollView(.horizontal)`，64pt 格，悬停出 ×）/ **列表**（最左那颗折叠钮切换；5 行封顶 + 「展开查看另外 N 条」）/ **预览面板**（`ComposerAttachmentPreviewOverlay`，图片大图或文件信息 + 用默认 App 打开 / 在访达中显示 / 移除；纯粘贴的图没有路径，那两颗置灰）。面板由**三个内容列各挂一行** `.overlay { … }`，状态在 store 里 —— 挂在那条 64pt 高的附件条上会画得出、点不动（D14）。 |
| `AgentSession.swift` | ~160 | Pure agent data, no I/O: `AgentSession` (its `id` is simultaneously the record id and the CLI's `--session-id`), `AgentSessionStatus` (idle/running/completed/failed/interrupted), `AgentTranscriptEntry` (+ kind: userMessage / assistantMessage / toolActivity), the 60-entry transcript trim constant, and a `decodeIfPresent`-shaped `init(from:)` per rule E1. Streaming text is deliberately NOT on this struct — per-second deltas behind the store's lock and disk write is the wrong home. |
| `AgentSessionStore.swift` | ~270 | The agent roster's persistence — `AgentSessions.json` with the same `nonisolated` + `NSLock` + atomic-write-then-0600 + change-notification shape as `ConversationSessionsStore`. API: `allAgents` / `createAgent` / `deleteAgent` / `renameAgent` / `updateStatus` / `appendTranscriptEntry` (trims to 60, keeps `lastPreview` fed) / `updatePreview` / `updateLastTurnCost` / `replaceTranscript` / `demoteInterruptedAgentsOnLaunch` (`.running` records from a dead app instance become `.interrupted`, so the roster never shows a zombie). |
| `ClaudeAgentProcess.swift` | ~480 | The one-to-one bridge to a claude CLI subprocess — the project's first `Foundation.Process` client, `nonisolated` with all mutable state confined to a serial `parsingQueue`. Builds the launch arguments (`--session-id` vs `--resume` decided by `hasLaunchedOnce`), writes user turns and the interrupt `control_request` to stdin, parses stdout frame-by-frame into `AgentProcessEvent`s (stream deltas, tool-activity summaries, `result`-frame turn-finished with `total_cost_usd`), keeps a 12-line stderr tail for post-mortems, and treats any non-`success` result subtype as a recorded failed/interrupted turn rather than a silent one. |
| `AgentSessionManager.swift` | ~503 | `@MainActor` orchestration: the roster (`@Published`, reloaded on `.wannaAgentSessionsDidChange`), the sidebar's section selection, per-agent streaming text, the turn pipeline (gate checks → record → spawn-or-reuse → write, with one `--resume` relaunch retry on a failed stdin write), the concurrency cap, the master-switch refusals, interrupt, and process-event handling that turns CLI frames into store writes and sounds. Also owns the voice-dispatch entry points the model's `[AGENT_SPAWN:]`/`[AGENT_SEND:]` tags call (`spawnAndSendFirstTurn` — folder default `~/Desktop/WannaAgents/<名字>`, name-collision reuses the existing agent — and `dispatchFollowUp`) and the completion-announcement machinery (`voiceIdleProvider`/`speakAnnouncement` closures injected by `CompanionManager`, serialized by `isAnnouncingCompletion`). Also owns `SidebarSection`, the switcher's vocabulary shared by the sidebar and the sheet root. |
| `AgentHUDController.swift` | ~580 | The desktop HUD — one small INTERACTIVE `NSPanel` per screen in the top-right corner hosting a trailing-aligned chip stack: an accordion handle + one chip per non-idle agent not dismissed this run (34×34 gradient tile from the agent's id-hashed palette + status dot; hover expands to a strip with name, status word, `lastPreview` and a close ×). Panels clone `CompanionResponseOverlay`'s parameters except `ignoresMouseEvents = false`; the `NSHostingView` is installed once and refreshes update a shared `AgentHUDStackModel` in place (a rebuild would drop hover state, and a running agent mutates the store every few seconds); rows are a fixed 56 pt tall so hover never changes the layout; the controller re-frames panels off `stackModel.objectWillChange` when the handle collapses the stack. Nothing shows at launch until a turn leaves `.idle`; the vision model never sees the HUD (screenshot capture filters the app's own bundle id). See 开发经验/14-Agent子系统.md 八. |
| `EphemeralAgent.swift` | ~278 | **一个临时 agent = 用户的一次任务**（不是一段长期对话），加它身后的看板 `AgentActivityBoard`。四种状态：`running` / `doneVerified`（**没有任何代码产生它** —— 见 Architecture 里那两条已知缺口）/ `doneUnverified` / `failed`；记的是给人看的四样东西（标题、原话、步骤、工具调用，后者在面板里默认折叠，因为用户说过「工具调用的部分一定要折叠起来，因为它会占用很多的空间」）。看板负责 `beginTask` / `appendStep` / `appendToolCall` / `finishTask`、卡片的 2 秒自动收起、**做完的按钮自己退场**（核验过 4 秒、未核验 12 秒，代次计数，面板开着的那一个不拿 —— 与 `pruneExpired` 同一条规矩），以及 `manualPanelID`（点按钮开的那块面板，**收/开都只改这一个 id**，不让按钮和看板各持一份真相）。**2026-09-27 多了 `cancelRunningTasks(inGroup:reason:)`** —— ESC 打断用：把**这一轮提交**（同一个 `groupID`）里还在跑的任务收成 `failed` + 一条 reason；为什么用 `groupID` 而不是 `sessionID`/`startedAt`/`cardID`，那个函数的注释里逐条写了（会话跨多轮、时间戳没有边界、cardID 会被兜底交接改写）。 |
| `AgentStripView.swift` | ~200 | 屏幕**右上角、菜单栏下面一行**那一排按钮 + 按钮下面叠着的卡片（**同时最多两张**）。它铺在**自己那块面板**里（`AgentStripPanelController`），**右对齐、顶对齐**铺满 —— 所以画的位置就是面板的位置，和命中矩形（`NotchSupport.agentButtonFrame` / `agentCardFrame`）只有一处算术。按钮**高度 = 菜单栏高度**、形状**上直下圆**（复用刘海那条带自己的 `PillShape`）、宽 40 让 id 一行放得下（30 时它会折成两行、看着像乱码）；**从右到左**排，最新的在最右边。**不接收点击**（面板 `ignoresMouseEvents`，点击由 `NotchWindowController` 的全局监听接走）；呼吸只给 `running` 和 `failed`。 |
| `AgentStripPanelController.swift` | ~110 | 那一排住的**窗口**：透明、无边框、非激活、`ignoresMouseEvents`（点击穿透，所以菜单栏和别人的窗口照常可点）、`hidesOnDeactivate = false`（去别的 App 干活时它必须还在）、层级 `NotchSupport.agentStripWindowLevel`（`.mainMenu` —— 在普通窗口之上、在我们自己的面板之下）。**窗口建好一次、之后只挪 frame**（透明窗口改尺寸会让新露出来的区域空一帧透出桌面，见录音那条带的「背景穿透」）。`install()` 幂等，由 `NotchWindowController.rebuildScreenPresences` 调用（启动 / 权限到位 / 屏幕参数变化都从这里过），`teardown()` 在关掉「刘海屏入口」和退出时撤掉 —— **因为它的点击是那个控制器的监听接的，两者必须同生同死**。 |
| `AgentPanelController.swift` | ~300 | 点那一排按钮之后弹出的**只读**详情面板（320pt `NSPanel`）：标题 + 状态 + 复制 id、原话、逐步的「做了什么」、默认折叠的工具调用。**不是控制台**（用户要求「不可以输入」），也不并进 Agent 页。位置由 `NotchSupport.agentDetailPanelTopRightAnchor` 给 —— 挂在那一排按钮的**右下角**（那一排 2026-09-26 搬到屏幕右上角，面板跟着走）。它**跟着看板走**：`manualPanelID` 决定开关，`agents` 一变就按同一个 id 重建 —— 少了后一条，「点开一个正在跑的任务」会永远停在点开那一刻的样子（用户报的「任务完成了，但按钮跟任务状态没有同步」）。 |
| `AgentSessionView.swift` | ~739 | The Agent tab's content column: status + project-folder header, transcript flow cloned from `NotchHomeView`'s bubble geometry (violet outgoing / dark assistant cards, gray monospace tool lines), the streaming bubble + breathing-dots working indicator, the dim-red error line (tap to dismiss), and the shared `MessageComposerField` submitting through `sendTurn`. **The cost readout is gone** (user's 2026-09-23 「在 agent 页面右侧顶部把这个费用也删掉，我不太需要这个费用」) — the store still records `addTurnCost`, the page simply no longer displays it. **The 「打开」 button is a rounded RECTANGLE rather than a capsule and is pinned to the row's far right** (「把"打开"这个按钮做成一个长方形加圆角的形式，而不是胶囊的形式，然后把"打开"按钮放在最右侧」); 中断 appears only while a turn runs and sits to its left, so 打开 never moves. **Picking a folder hides the whole sheet first** (「用户点击"打开"按钮之后，整个弹窗直接缩回去，就是隐藏一下，要不然用户没有办法去点击选择哪一个文件夹」): `openFolderPicker()` calls the injected `hideSheet()`, raises the `NSOpenPanel`, and calls `revealSheet()` when it returns — an `NSOpenPanel` raised over an expanded 810 pt sheet that covers the top of the screen is otherwise unclickable. Brought in line with the conversation page in the 2026-09-23 UI pass: the left-hand agent state badge is deleted (it was display-only, so nothing is lost), a `MessageCopyButton` sits under **both** the outgoing and the assistant bubble, the scroll region takes `.textSelection(.enabled)`, horizontal padding is `NotchSupport.contentColumnHorizontalMargin`, and the view scrolls to the bottom when `selectedAgentID` changes — not only while a turn streams. The header sits at `NotchSupport.sheetHeaderTopInset`, which is where the deleted top bar's padding went. |
| `CardChatMode.swift` | ~131 | **一张卡片用哪种方式跟它对话**：文本 / 图文 / 语音 / 视频（`CardChatMode`）+ 清单里的一项（`CardChatRoleChoice`）。纯数据，不碰 store，所以能脱离 App 编译。它承载整件事唯一那条分界线 —— `usesAgentCapability`：文本 / 图文走该 Agent 原本的管线（工具、MCP、sub agent、提示词全在），语音 / 视频**只把会话记录与角色当上下文**（用户原话：「不具备 agent 能力，不执行用户任务，只知上下文，其他什么都不关心」）。还有两个映射：`sendsScreenshot`（图文 = 文本 + 截图，就是输入框那颗「屏幕」开关升格成的显式模式）与 `voiceChatChannel`（语音 / 视频 = 该子系统的两种聊天类型，于是「语音永不开画面」那条闸门自动生效）。默认值按卡片分：主循环 **图文**（= 今天的行为，所以用户察觉不到变化）、Claude Code / 复盘 **文本**。 |
| `CardChatPreferenceModel.swift` | ~155 | 模式与角色的读写 + 那张角色清单的组装，**三个内容列共用一处**。`shared` 单例，理由与 `AgentActivityBoard.shared` 一样：真相本来就在磁盘上的两个 store 里。设置按**卡片 id** 存进 `AppSettings`（`cardChatModeRawValues` / `cardVoiceRoleIDs`，键 = 背后那条会话 / 代理记录的 uuidString），值存**原始字符串** —— 将来多一个模式、或读到不认识的值时降级成默认，而不是让整份设置解不出来。`roleChoices(for:kind:)` 就是用户那句「角色列表变化」的实现：文本 / 图文只有**默认角色**（Agent 自己的系统提示词，置顶、不可改），语音 / 视频只有他**自己设计的角色**（一个都没建时用内置那条兜底，否则这个模式会拿着一份空提示词说话）。**展开状态 `openRoleListCardID` 也住在这里**：清单必须画在 frame 足够大的那一层（见 `NotchSheetRootView`），三个页面各自持有必然漂。 |
| `CardChatContextAssembler.swift` | ~212 | **语音 / 视频模式的系统提示词组装**，纯函数（会话记录由调用方读好传进来，这里不碰任何 store，所以能脱离 App 验）。用户定的三部分里它做前两部分：`<history_reference>`（「请参考历史记录，请参考之前的对话」）+ `<role>`（「请你作为「X」来回答用户的问题」+ 角色提示词 + 一句固定的"只说话、不执行操作、不要输出 `[CLICK:]` 一类标签"）；第三部分（用户的新内容）走用户消息，因为用户的话与背景资料是两种权威级别。上限只有这一处：**20 轮 / 4000 字 / 3 张截图**，从最近的往回装。空的部分整段不出现（空壳等于告诉模型"这里本该有东西"）。主循环那一侧答的话取 `displayResponse ?? assistantResponse` —— 与界面上那张卡片读同一个字段，让语音模式看到的东西**与用户看到的一样**。 |
| `TextCallController.swift` | ~190 | **文本 / 图文模式下的「通话」**：说一句话 = 在那张卡片的输入框里打一行字并按回车。它**不碰语音聊天那套引擎**，只把「连续监听 + 自动发送」接到卡片原本的文本管线上 —— 听用 `BuddyDictationManager` 那个（与语音聊天、对话页追问共用的）连续监听窗口，3 字门槛；发交给 `CompanionManager.sendTextCallQuestion` 按卡片种类分派（主循环 → `submitTypedQuestion`，Claude Code → `sendTurn`），截不截屏由卡片的 `CardChatMode` 决定；答走原来的路（截图 → 视觉模型 → 光标旁气泡 + 播报）；刘海借语音 / 视频那条通话的相位。**它的入口自 2026-09-27 起只剩右列页头最右那颗 chip**（`NotchSheetRootView.textCallChip`）——侧栏卡片那颗电话改成一律走语音了（用户：「无论用户在右侧选择哪一个模式，应该把它自动切换到语音模式，然后通话」），侧栏留着这个控制器只为"那张卡片上一通文本电话在打时按钮要亮着"和"拨新号前先把别的收掉"。三条结构性边界：**只有一条通话能活着**（两条抢同一个窗口）、**通话是否活着由那个窗口定义**（`bindListeningWindow`：窗口一关就收尾，否则屏幕上会留下一个还在说「Call」却听不见的刘海）、**`armContinuousListeningWindow` 必须让路**（它在每次回答开播时被调用，放行就会把通话的耳朵排期摘掉）。打断与语音对话同一条规矩：开口只打断，新的一轮由那句话自己的最终转写去开。见 `开发经验/16-卡片通话的两条路.md`。 |
| `CardChatModeBar.swift` | ~298 | 右列页头最上面那排 **`[角色][文本][图文][语音][视频]`**（用户钉的位置：截图红框圈着语音聊天页原本那排 `[视频聊天│语音聊天│音色]`，「放在这里，右侧分割线上面，左侧对齐（四个模式）」）。做成一个三页共用的视图，因为三页必须在**同一个 y** 上画同一排东西，各画一份只要有一页改个内边距线就会漂（`NotchSupport.contentColumnHeaderRuleY` 那条注释反复强调过的不变量）。**它不认识任何引擎**：只读写"这张卡片选了哪个模式"，换页 / 带不带截图 / 用哪个角色由各页自己按这个值决定。同文件末尾是 **`CardChatRoleListPanel`** —— 那份清单**由 sheet 根画**，因为模式条只有 36pt 高，清单挂在它的 `.overlay` 上时画得出、**收不到点击**（实测穿透到下面那行预设按钮，见 `开发经验/10-踩过的坑.md` D14）。 |
| `NotchHomeView.swift` | ~788 | The notch sheet's conversation home. An empty session shows the **centered hero** — `HomeHeroMascotPill` (the mint mascot sitting on the glossy blue-white voice pill with a green glow, ±2 pt sine bob), a 26 pt time-based greeting and the hint line. The flow's turns: the user's words in a solid `DS.Colors.accent` bubble at 参考页's `.unit.user` geometry (corner 14, tail corner 4 — the 2026-09-23 UI 化改造 replaced the violet gradient + white border), the assistant's reply as the themed card from `AnswerCardView` (the dedicated 卡片样式 settings page; `answerCardStyle` snapshotted into `@State` and re-read on `.wannaAppSettingsChanged` so a settings save re-renders the flow's cards), each with action tags stripped for display only — the streaming reply passes `isStreaming: true` (the card's blur-focus animation), history replies `false` (one plain Text inside the card). A turn carrying `progressSteps` folds them into a 「N 条进度」 `DisclosureGroup`; `wasInterrupted` renders an 「已被用户打断」 chip and `turnDurationSeconds`/`turnFinishedAt` the footer line + copy button. While a job runs, `pendingQuestionText` shows the outgoing bubble immediately and `liveJobProgressSteps` feeds an always-expanded live disclosure. **A copy button sits under the user bubble as well as under the answer** (`MessageCopyButton`), so this page matches the other two — the answer's `turnFooter` copy already existed, and the pair is what the user asked for. The scroll region carries `.textSelection(.enabled)` (one modifier on the container covers every `Text` below it, the user bubble and the cards alike) and re-scrolls to the bottom on three changes: `entries.count` (a finished turn), `streamingAnswerText` (the reply arriving) and `liveJobProgressSteps.count` (each agent-loop step) — **and on `sessionsModel.activeSessionID`**, which is the one that was missing: the scroll target used to be an id that only existed transiently (`"streaming"`), so picking a different session in the sidebar left the view where it was instead of showing that conversation's last turn. The composer is `MessageComposerField` — three lines, 展开, Return sends — and submits through `CompanionManager.submitTypedQuestion`; the row's old 「按住 ⌃⌥ 说话」 pill with its 松开发送 caption is gone with the other two badges (the ⌃⌥ hint now lives only on the empty-session hero line). Below it, a dim red line shows `lastErrorMessage` verbatim, tap-to-dismiss (the deleted menu bar panel used to be the only surface for it). All horizontal padding is `NotchSupport.contentColumnHorizontalMargin` (12) — the old 28s are gone, and that had to move *everywhere* in the column (header, bubbles, composer) rather than just the composer, or the input box would have been wider than everything above it. |
| `AnswerCardView.swift` | ~427 | The assistant reply's card, in one of three themes ported from the user's reference spec (「clip 卡片样式」/`实现说明.md`): blue #0B57D0 with a 30% white border, black #000 with a 16% white border (**the default since 2026-09-23** — the user wanted the cards to read as part of the panel's dark ground rather than as blue objects on it), paper #F7F2E7 with an 18% black border, ink #2E2A24 text and one very faint ruled line every 22 pt (`Canvas` over the fill). Card geometry is the spec's: corner 10, border 1.5, padding 10/12, font 13.5 on a ~22 pt line pitch, letter-spacing .02em, rows capped at 460 pt wide — `CardTextFlowLayout` (a `Layout` wrapper) reports the widest row actually used in `sizeThatFits`, so the card hugs a short reply and only caps once the text wraps. The signature text animation, the **blur-focus stream**: text is split into units (`CardTextUnitBuilder` — one unit per CJK character, contiguous ASCII letter/digit runs kept whole so English never wraps mid-word; `"\n\n"` becomes a 14 pt paragraph gap, a bare `"\n"` a row break, both carried as custom `LayoutValueKey` values because Layout sees only subviews), and while streaming each unit is its own small `Text` whose blur (2.6) and opacity (0.2) animate to sharp over 0.3 s `easeInOut` once five units have arrived behind it — a ~5-unit blurred tail at the writing edge. A finished reply renders as ONE plain `Text` inside the same card (a 600-character reply would otherwise be 600 Texts in a ScrollView rebuilt on every session switch), and `NSWorkspace.accessibilityDisplayShouldReduceMotion` degrades the stream to fully sharp. Empty rows are skipped in the layout so a trailing 「\n」 gains no phantom blank line and 「text\n\nmore」 does not double its paragraph gap. **Measurement is cached and incremental, and that is what makes the stream smooth rather than merely themed** (2026-09-23): the layout value is rebuilt on every streamed character, so measuring every unit per pass made one character cost `3 ×` the reply's length — the old `computeRows` measured all N units inside `sizeThatFits`, ran the whole thing AGAIN inside `placeSubviews`, and measured each unit a third time while placing it — which is why a long reply hitched hardest at its last line (「尤其是最后一行的时候会卡顿」). `CardTextUnitSizeCache` is held by the view in `@State` and handed to the layout (a class, not the layout's own `Cache`, because what SwiftUI does with a cache across a changed layout value is not something correctness may rest on), and because `CardTextUnitBuilder` closes a unit only when the next character starts a different kind of run, appending a character can only extend the final unit or begin a new one — so every cached size except the last is reused verbatim and only the tail is re-measured. One streamed character now costs one measurement; an invalid cache degrades to the old full re-measure, never to a wrong layout. |
| `SettingsWindowController.swift` | ~354 | The titled fallback settings window: an `NSWindowController` hosting all the pages (178pt sidebar plus the selected page, `ModelSettingsView` swapped in for 模型). Only reachable through `CompanionManager.openSettings`'s fallback branch — the notch sheet is the primary host — which nothing invokes today (the menu bar panel that called it was deleted); kept as the documented recovery path for a non-notched Mac or 「刘海屏入口」 off. Calls `NSApp.activate()` before showing — see the key decisions. |
| `SettingsTransfer.swift` | ~454 | 「导出设置 / 导入设置」 — the user's own scope, verbatim: 「注意导入导出的是配置页面的参数，对话页面的内容不需要管，因为它特别复杂。重点是这个设置页面的整个参数。而且要说明一下，导入导出的其实是设置页面的参数，让用户知道导入的是什么」. So the file holds exactly the two things the ten settings pages sit on — `AppSettings` (nine pages, one file) and `ModelConfiguration` (the 模型 page: the three roles plus every provider's URL, key and model names) — and **deliberately not the conversations**, whose screenshots and compressed summaries are not what "settings" should carry. Everything is wrapped in `SettingsTransferDocument` with a `formatIdentifier` and a `formatVersion`, so importing the wrong file fails with a sentence instead of a half-applied mess, and a file from a newer build is refused before anything is written. `SettingsTransferService.applyImportedData` **checks everything that can fail before the first write** — half-applied (new settings, old models, or the reverse) is worse than refusing — and one of those checks is `importedFileHasNoModelProviders`: `ModelConfiguration`'s decoding is fault-tolerant, so a file with a malformed model entry decodes to "zero providers and all three roles unassigned" and would otherwise silently wipe a working configuration with no way back. Both saves clamp and post their own change notifications, so an import takes effect without a restart (「导入，自动加载出来」). **The exported file contains the user's API keys in the clear** — it cannot be a "carry this to another machine" credential otherwise — so it is written 0600, the file name is dated (`Wanna设置-2026-09-23.json`) so exporting twice does not overwrite yesterday's copy, and the page says outright what the file holds rather than hiding it. The two pages are `SettingsTransferPage(mode:)`; they were a pinned row at the bottom of the settings sidebar until the user rejected that placement. |
| `ModelSettingsView.swift` | ~602 | The 模型 page: 「当前使用」 (one row per role) and 「服务商」 (credentials only), with the test/save bar pinned outside the scroll view. Rendered inside the settings window's content area, so it draws no window chrome of its own. |
| `geometry-dsl/` | — | **画图技能子项目（第五出口的引擎）**。完整的上游 Git 项目（shand001/geometry-dsl，自带 `.git`，历史上游），Wanna 不改它、只通过 CLI 调用：`node dist/cli.js 文件.geom -o 图.svg` 渲染、`node scripts/validate_geometry.mjs 文件.geom` 校验（退出码 0 = 通过）。出口⑤的桥接脚本 `geometry-dsl/figure_agent.py` 也住在这里（不在上游仓库的追踪里）：Wanna 的大模型在回复里写 `[SVG_AGENT:任务]`（开文件模式）或 `[SVG_BOARD:元素名：任务]`（屏幕白板模式，加 `--no-open`）→ `MacosUseController`（`figureAgentScriptPath`）用 python3 跑它 → DeepSeek 写 .geom → 校验失败自动让模型修（最多 3 轮）→ SVG 落 `~/Desktop/Wanna图形/`；开文件模式自动打开预览，白板模式由 `FigureBoardController` 画在屏幕上。stdout 第一行固定是「图已画好：<路径>」，Swift 靠这一行取路径。分工是「模型只描述，编译器算坐标」。 |
| `scripts/panel-sizing-probe.swift` | ~111 | **独立最小复现：`NSPanel(.borderless + .nonactivatingPanel)` + `NSHostingView`，`setFrame` 之后窗口会不会被 AppKit 自己改掉**（看板被推下屏幕那件事的探针）。三个变量各跑一遍（`PROBE_VARIANT=emptySizing` / `emptySizingPlusMask` / `defaultSizing`），跑法 `swift scripts/panel-sizing-probe.swift`：只有 `defaultSizing`（即 `.standardBounds`）会让窗口自己变成内容的固有尺寸并移动 —— 所以问题不在"透明无边框面板"这个配方本身，而在**嵌套了什么内容**。 |
| `scripts/listening-stop-check.sh` | ~120 | **「手动退出之后，那个 30 秒追问窗口到底关没关」—— 一条能自己跑的检查**（2026-09-28 新建，为 D41 那个 bug）。走完整条真实流程（合成识别器 + 他真正在用的快捷键），然后断言四件事：A 回答念完后窗口**真的**武装了（否则是空跑）/ B 手动退出后窗口关掉 / C **之后 10 秒不许自己武装回来**（修之前它 30 毫秒就回来）/ D 麦克风 tap 撤掉了。参数 `1` = 再按一次快捷键、`2` = 按 ESC —— **两条路各跑一次就分出了好坏**：修之前快捷键那条全绿、ESC 那条当场红，从红到定位到那一行 `print` 只读了一次日志。判据全部取自日志（"continuous listening started" / "ended"），不猜时间点。 |
| `AudioInputDeviceCatalog.swift` | ~213 | 输入设备的清单与身份：列出所有**真有输入声道**的设备（**聚合体一律不列** —— 它的声道数会随成员变，变到某个形态就是纯静音，选它等于把修掉的故障装回去），每条带 UID / 声道数 / 是否系统默认 / 是否虚拟。设置页那个下拉和录音绑设备读的是同一份真相，所以不会出现「设置页说有、录音说没有」。另有一个查进程的口子 `processesCurrentlyCapturingInput()`（`kAudioHardwarePropertyProcessObjectList` + `kAudioProcessPropertyIsRunningInput`，macOS 14.2+）：**此刻正在开麦的 App** —— 全零故障里「谁占着麦克风」是用户唯一能立刻行动的信息，实测那段时间唯一为真的就是第三方听写软件 `闪电说`。 |
| `LongFormRecorderController.swift` | ~2600 | 长录音的编排器 + **「重新转写」**（把落盘的 `.wav` 重新喂给同一个识别器，5 倍实时；节奏与两条分寸见上面 长录音 那节）。它和语音管线**零共享** —— 自己的 `AVAudioEngine`（`BuddyDictationManager` 只有一份连续监听窗口，共用必然串台）、自己的状态、自己的快捷键。音频 tap 每 ~100ms 出一块，重采样到 16kHz 单声道 PCM16 之后**一份落盘、一份上行**（同一个缓冲，所以 `.wav` 里的字节就是发给服务端的字节，可原样重放复现一次识别）。3 小时不断靠四条腿：`recordingRotationMinutes`（默认 20 分钟，在**静音处**换连接）、**间隔两倍的硬上限**（连续说话没有停顿的用户也要换，否则连接无限跑）、断线重连、以及接缝的**重叠重喂 + 毫秒时间戳去重**（`RecentAudioRing` 留最近 8 秒，重连时先喂回去，`seamSuppressionMilliseconds` 把重喂那段回来的文字按服务端时间戳丢掉 —— 用时间戳不用文本，因为重喂的段会被重新识别、用词不同）。转写结束后按「自定义风格」重写一遍（`polishIfConfigured`），**没勾选任何风格也没勾截图时一步都不走**，原文直接就是最终内容。`polishScreenshotJPEG` 在**停止那一刻**抓 —— 晚几百毫秒屏幕上就可能换了样。`cancellationGeneration` 是取消的闸门：润色正卡在网络请求里时取消是从另一个入口按下来的，两者不在同一条任务链上，代次是唯一能跨入口说的「这件事作废了」。`transcriptPlainText` 与 `livePartialText` 都**只追加**，`marqueeText` 由两者拼成 —— 位移是 `可用宽度 − 文字宽度`，**文字一旦变短就会向右跳**，而 `liveTranscriptLine`（尾巴 `suffix(90)` + 当前段）每定稿一次就变短。**采集挂在一队候选设备上**（`inputDeviceCandidates(for:)`：用户选定的 → 系统默认 → 其余真设备），看门狗发现「连续 90 块**精确全零**」就 `switchToNextCandidateDevice()` 换下一个、同一场接着录；换不动了才收尾并说明是谁占着麦克风 —— 见上面第五条腿。**2026-09-27：「录音 → Notion 笔记」那一整节（关键词检测 / 参考材料 / 那几颗按钮 / 保存）从这个文件里整块删掉，搬去了 `NotionNoteSession` —— 这里现在一段 Notion 代码都没有，录音只剩「录 → 转写 → 润色 → 落盘 → 剪贴板」。** |
| `VolcengineTranscriptionProvider.swift` | ~425 | **主 Agent 那条路的识别：豆包（火山引擎）。** 把 `VolcengineRealtimeASRClient` 包成一个符合 `BuddyTranscriptionProvider` 协议的 provider，与百炼那个并列 —— 音频管线、VAD、连续监听、打断一行没动，换的只是「音频送给谁」。配置读「录音」页那一套（同一个火山账号、同一份密钥；「听」页的识别语言因此只作用于百炼，那里写明了）。**两处与录音那条路不同，都是实测逼出来的**（见 `开发经验/09-实测数据.md` 二十）：**不发末包**（这条路末包不回定稿，两次都等满 2.04 秒兜底且回来的文字与实时文字一字不差），改成盯「文字不再变长」（连续 0.4 秒没变就交，收尾 2.04 → 0.40 秒）；`beginNextUtterance` **重连**而不是复用连接（复用会让上一句「定稿晚到」的那一帧落进下一句的累积，而按时间戳做水位又会吃掉「按了发送之后继续说」的半句 —— 重连干净，握手期间音频在 URLSession 里排队不丢）。**第三处不同是 2026-09-27 加的：连接死掉不结束这一场录音**（`handleConnectionLoss`）—— 长录音那条自己会 `reconnect()`，所以同一条看门狗在那边误报一次只是换条连接；这条路原来把连接死亡当致命错误，于是「按住键沉默思考」触发看门狗 15 秒判死 → 整场录音被取消 → 用户说的话一个字都没提交（见 `开发经验/10-踩过的坑.md` D21）。现在：**一句还没定稿时连接死掉就重连**（上限 3 次），已经认出来的字冻成 `sealedTranscriptPrefix` 拼在最前面（新连接的时间轴从零重计，留在同一个按毫秒索引的字典里会被同键覆盖）。 **同一天又给这三处各补了一行诊断日志**（`beginNextUtterance` / `connectFreshClient` / `handleConnectionLoss` 的两条路，含**重连预算用尽要放弃**那一条）：它们原来只有 `print`，而用户的 App 是双击启动的 —— **stdout 进不了任何地方**，于是「用户大声说了话（麦克风峰值 0.634）、定稿却是 0 字」那一次在现场**一个字都查不到**。见 `开发经验/20` 9.70。
| `VolcengineRealtimeASRClient.swift` | ~450 | 豆包流式识别的 WebSocket 客户端。**可以注入一条共用的 `URLSession`**（`init(configuration:urlSession:)`，不注入时行为与从前一字不差、自己建自己销毁）—— 主 Agent 那条路每句话一条连接，自建就成了仓规 E3 那条坑，所以它注入一条长命的并共用；注入的那条**永不被 invalidate**（归调用方所有）。**四条实测出来的硬约束**（2026-09-25，真服务）：`result_type` 必须是 `"single"`（默认的 `"full"` 每帧回**整场累积**文本，实测 28.6 秒时每帧已 ~150 字且线性增长，3 小时是它的 377 倍）；`compression: none` 服务端接受（省掉手写 gzip 外壳 —— Foundation 的 `.zlib` 出的是裸 deflate，实测 `73 74 1c 05`）；**末包一发出服务端立刻关连接**，所以长录音中途绝不能发；跨重连的判重必须**按文本**不能按时间戳（新连接的时间轴从零重计，按时间戳比会丢真实内容、留重复）。`finishAndAwaitFinalResult` 的定稿回调由**定稿到达**触发，超时只作兜底 —— 原来它是 `asyncAfter(timeout)` 到点才回调，于是每次停止都白等满 4 秒，和说了两个字还是两百个字无关。 |
| `VolcengineASRFrame.swift` | ~195 | 豆包识别的二进制帧编解码。**只有纯函数**：没有网络、没有状态、没有并发，所以能脱离整个 App 单独编译运行 —— 一个探针就能把每一帧验到底。帧结构是「≥4 字节可变 header + payload 长度 + payload」，header 描述消息类型 / 序列化方式 / 压缩。 |
| `RecordingAudioWriter.swift` | ~186 | 边录边写的 WAV 落盘器。3 小时 = 345MB，攒在内存里必然出事，所以开文件时先写 44 字节占位头、之后每来一块追加一块、停止时 seek 回开头回填两个长度字段。`appendingToExistingFile` 是「挂断后继续录、内容追加」的地基 —— `createFile` 在文件已存在时是**截断**，直接复用会把上一段录音抹掉且不报错。 |
| `LongFormTranscriptWriter.swift` | ~188 | 转录落盘：磁盘是真相、内存只留窗口。`.jsonl` 逐段追加（带毫秒时间戳），`.txt` 是给人看和给剪贴板用的纯文本，`definite` 一到立刻 `synchronize()`。`commit` **返回是否真的落盘** —— 调用方必须跟着返回值走，否则被判重丢掉的那一段仍然会显示出来，屏幕上就是每句出现两遍。 |
| `RecordingLibrary.swift` | ~188 | 录音元数据与历史索引。每场录音自己带一份 `.json`（所以一整场可以直接拖走，不需要外部索引也对得上），`Recordings.json` 只是缓存 —— `rescanFromDisk` 能只靠目录重建历史。**只删索引不删文件**：删录音是删除文件本身的事，由界面上带确认的操作负责。 |
| `NotchRecordingOverlay.swift` | ~1540 | 刘海上的录音 UI：左右两翼 + 刘海下方那一行滚动转录。**是一块独立面板，不是刘海窗口的子视图** —— 刘海窗口的高度只有刘海加一点余量，而转写那一行挂在刘海**下面**，画进去根本看不见。**窗口尺寸建好一次、永不改变**：它是透明窗口、黑色靠 SwiftUI 画，而几何在 CA 提交**之前**就改了，中间那一瞬新露出来的区域是空的、桌面会透出来（用户报的「背景穿透」）。收起时多出来的透明区靠 `ignoresMouseEvents` 让开，两翼的点击走全局监听（刘海 pill 用的就是这套）。`SmoothRevealedTranscriptText` 的位置是 `可用宽度 − 文字宽度`，所以**文字变短就会向右跳** —— 这是它反复出问题的唯一原因，改动的每一次都要先问「这个改动会不会让宽度变小」。窗口上限必须带**迟滞**（160↔220 先长后裁），否则上限本身就把窗口变回了定长窗口、宽度恒定、动画再也不被调度。 **摄像头小窗不在这块面板里 —— 它有自己的全屏面板**（2026-09-26）。用户要求把小窗挪到屏幕左侧中间／底部中央／右侧中间，理由是「当用户的纸上文字很小、需要把纸拿得很近时，由于小窗位于上方附近，会导致用户看不到小窗里的内容」—— 而这三个位置**全在带面板之外**，带面板的帧又不能改（见 `panelFrame` 那段「背景穿透」）。所以小窗搬进 `CameraStripPanelView` 那块**全屏、永远 `ignoresMouseEvents = true`、永不移动也不改尺寸**的面板（层级 `NotchSupport.cameraStripWindowLevel` = statusWindow+1，**不是** `OverlayWindow` 生来的 `.screenSaver` —— 那会盖住右键菜单，而左中/右中正好在菜单弹出区），位置变成纯对齐与边距，窗口几何一次都不碰。四个位置 `CameraStripPlacement`：`belowNotch`（与旧矩形**逐点一致**，离屏探针断言过）／`left`／`bottom`／`right`，对齐分别是 topLeading（水平靠 `notchCenteredLeadingInset` 对准**刘海中心**，不是面板中心——面板是全屏的，两者今天相等是巧合）／leading／bottom／trailing；用对齐而不是绝对坐标是因为小窗高度随画面宽高比变（`previewHeight`），AppKit 侧根本算不出来。标题栏中间四颗按钮：还原／左／下／右，**当前所在位置那颗标绿**。**命中矩形由视图用 `GeometryReader` + `PreferenceKey` 发布上来，不在 AppKit 里镜像一份**（`NotchSupport.trailingWingOriginX` 那次画的和点的差 71pt 的教训），控制器只做 `NotchSupport.appKitGlobalRect` 那个 y 翻转换算——**那个符号是整个改动里风险最高的一处，写反是静默的**，所以它住在 `NotchSupport` 里能被探针直接测。小窗面板**单独一个 `cameraStripPanels` 数组，绝不能进 `panels`**：`reframePanels()` 会翻转那里的 `ignoresMouseEvents`，而 `installDismissMonitors()` 的「点外面」判定是全屏成员会让每一次点击都算「里面」。**⌘Enter 是切换**（刘海下 ⇄ 底部），按 `isCameraCapturing` 装卸监听所以摄像头没开时它在系统里根本不存在，另加 `isARepeat` 去重——这个动作不是幂等的，ESC 那两个是。⚠️ 它和 ESC 一样只读不吞，所以也会传给前台 App（Slack 里就是「发送」）；本仓库没有任何能拦截全局按键的机制，别为此去接一个会吞的 tap。顺带钉死一条不变量：`NotchRecordingBandView` 的根加了 `.frame(maxHeight: .infinity, alignment: .top)`——宿主视图是铺满整块面板的，而内容只有 64pt 高，不写这一行带子的位置就由 SwiftUI 默认对齐说了算，而 `collapsedWingHitRects` 等三处矩形都硬假定它贴着顶边。**2026-09-27：那条带子只剩两态（在录 / 展开看转写）—— 「Notion 笔记」那三颗按钮的画连同「保存中」第三态一起删了**（按钮搬去 `NotionNoteButtonRow`，画在刘海面板里）。**同一天稍晚：展开的转写编辑窗抽成了共用视图**（`NotchExpandedTranscriptPanel`，住在 `NotchTranscriptMarquee.swift`）—— 主 Agent 说话时的 `Listening` 要一模一样的那一个窗口，这边只剩「哪几个字段接到哪几个参数上」；`ribbonHeight` / `expandedPanelBodyHeight` 也改成`NotchSupport` 的转发，`EmbossMaterial` 从 `private` 放开（两处共用同一份材质）。实测抽完之后录音这条编辑窗的 `AXTextArea` 是 `(523,90,682×474)`，与新面板逐点相同。 |
| `NotchTranscriptMarquee.swift` | ~250 | **刘海下面那一行滚动字幕**，两个入口共用（2026-09-27）。`SmoothRevealedTranscriptText`（平滑左移的那一个：位移 = `可用宽度 − 文字宽度`，所以文字一变短就往右跳；显示源只增不减、窗口上限 160 带 60 字迟滞、窗口必须能长 —— 这三条是十次失败换来的，注释里全写着）与 `NotchTranscriptLine`（那一行的外壳：黑底、两端 13% 渐隐、上直下圆）。**同一天又把展开的转写编辑窗也抽到这里**（`NotchExpandedTranscriptPanel`）：录音带与主 Agent 的 `Listening` 用的是**同一份**排版、材质、圆角与三个快捷键，用户要的「完全照搬」由同一份实现保证 —— 实测两处的 `AXTextArea` 都是 `(523, 90, 682×474)`，逐点相同。 |
| `TaskDirectionStore.swift` | ~294 | **「任务方向」的清单 —— 整个功能只有这一个文件**（用户的设计）。两份文件放同一目录、**发送时拼接**：`TaskDirections.json`（固定：出厂 12 条 + 每天中午复盘追加）与 `TaskDirectionsTemporary.json`（临时：这一大轮口述出来的，**每一大轮结束清掉**）。一条 = `id` / `keyword`（显示的那 3~7 字）/ `detail`（给判断用的判据）/ `matchKeywords`（本地匹配的同义说法，**只影响免费那条路**）/ `source` / `addedAt`。形状照其它 store（`nonisolated` + `NSLock` + 原子写后补 0600 + 变更通知）。⚠️ **公开入口只加一次锁**，内部一律 `…Locked`（假定已持锁）—— `NSLock` 不可重入，第一版在这里**第一次读清单就死锁**，App 卡死在 Listening。 |
| `DirectionBoardMatching.swift` | ~299 | 「这一轮显示哪几条」与口述解析的**全部判定**（纯逻辑、能脱 App 编译）：本地关键词命中（比较前只留字母数字；**4 字以下只认精确**）、`displayedItems`（本地命中优先 → Jev 概率过阈值，**钉住的排最前、编号不变**）、`spokenSelectionNumber` / `spokenCancelSelectionNumber`（中文数字也认，越界忽略）、**`resolvedSpokenNumber(_:remembered:in:)`**（「第 N 个方向」一句之内**一旦定下就不改** —— 修「说第二个方向却选了两格」，见 `开发经验/19` 第九版）、`spokenCancelBoardRequested`（只认「取消任务看板 / 取消任务方向」两个精准短语）、`spokenNewDirection`、`screenReferenceRequested`（**相邻**组合词才算：参考/根据/请看/看一下 + 屏幕/图片/桌面/截图/画面）。 |
| `JevDecisionClient.swift` | ~145 | **方向判断用的 Jev 决策模型**（用户点名要的，因为便宜且回的是概率）。协议是**实测**的：`POST https://openrouter.ai/api/alpha/decisions` + `~typesafe/jev-latest`，OpenRouter 的 key，**一个请求问多题按次计费**，`noul` 的 `criteria` 键**必须字面量是 `"true"`/`"false"`**（写 yes/no 一律 400），只回一个 P(true)。实测一次 $0.0000318。Key 在 `~/Library/Application Support/Wanna/JevKey.txt`（0600，**不进 AppSettings**，所以导出设置不会带出去）。 |
| `TaskDirectionReviewJob.swift` | ~161 | **每天中午 12 点**的复盘：睡到下一个本地中午（`nextNoon`），读最近 7 天会话的最后 20 轮，一次 LLM 调用提炼高频方向，**只追加**到 `TaskDirectionStore`（`source: .review`）、去重、不轮询。 |
| `DirectionBoardPrompt.swift` | ~351 | 看板那次请求的**提示词与解析**。系统提示词**只给方向清单**（约三百 token，不是主 Agent 那五千字）。**卡片固定四行**（`understandingLabels` = 目标问题 / 类型 / 参考 / 细节，顺序是用户定的）：`parseUnderstandingLines` 的契约是「**永远返回这四行**，缺的行值是空串」（视图画占位符，卡片高度因此恒定 —— 用户：「这几行固定在这，而不是突然间有、突然间没有」）；`understandingLabelAliases` 每行带一串别名（模型常写回 `软件`/`文件`/`目标` 这些老标签）；**去重叠**是必须的（`目标问题:` 里嵌着 `目标:` 与 `问题:`，不处理那一行会被切成三段空值）；`任务结果`/`答案`/`选择` 是**边界标签**（只截断、不成行，见 `boundaryLabels`）。另有 `parseAnswer` / `parseSection`（「答案」那一节，取最后一次出现，最多续两行）、`parseLabelLine`（**不能只认行首**：实测模型写在同一行上）、`leftoverParagraphText`（按"保留没被覆盖的字"拼 —— 删区间会在别名互相嵌套时崩）。⚠️ **`cleanRawResponse`（不截断）给解析、`cleanParagraph`（200 字上限）只给显示**。 |
| `DirectionBoardSession.swift` | ~668 | 看板的状态机（`@MainActor ObservableObject` 单例）：`beginListening(cycleID:)`（新的一大轮 → 清临时文件）/ `noteLiveTranscript` / `endListening` / `endBigRound` / `consumeTurnDecision`；节奏闸门三条（每 3 秒 + 文本变了 + **新增 ≥10 字、标点不算**，阈值设置页可调）；**一个请求里并行发两路** —— `JevDecisionClient` 判方向（给概率）+ 小提示词写那段理解（说「参考屏幕」时带上当场截的那张图）；代次计数丢弃过期回复；`contentRevision` 每次回复落地 +1（视图据此播那一下淡入）；点过/说过的方向**钉住编号与位置**（口述编号的映射表 `spokenNumberTargets` 见 `DirectionBoardMatching.resolvedSpokenNumber` 的注释）；总闸门三档（取消本次 / 十分钟 / **今日到明天凌晨 0 点**，全程**不轮询** —— 一个布尔 + 一次日期比较）。**纯观察者**：不碰 `currentResponseTask` / `voiceState` / 历史 / TTS / 截图。含 `WANNA_DIRECTION_BOARD_SELFCHECK` 自检（`1` 假转写不发请求 / `live` 真发一次 / `stream` 只喂字幕量卡顿）。 |
| `DirectionBoardView.swift` | ~695 | 那张卡片。**左右两栏**（2026-09-27 深夜定稿）：左列 40% = 方向表格（**恒 2 列 × 2 行**，`directionColumnCount`）+ **参考标签**（`ReferenceTagFlowLayout`，会折行、高度固定两行）+ 目标（6 行）+ 疑问（10 行）；右列 60% = **那张脑图**（不画标题、铺满整块）。`contentBlockHeight` = max(左列所需, 上一版的两倍) —— 每一行的高度都**提前定死**，空值画 `—`，因为他反复要求「不要让高度总是晃」。最下面一行：折叠钮（`22×36`，**左边缘/下边缘分别贴住卡片左边缘/下边缘**，负内边距实现，⚠️ 后面不许再套 `frame(height:)`）+ `复制｜执行｜退出`（一整块底 + 两条纯白细线，只有「复制」会因无可复制内容置灰）+ `取消｜取消十分钟`（暗红，自成一组）。外壳复用结果卡片的常量与 `cardBackground`。宽度 = 340 × 设置倍数（默认 2 → 680），**与内容无关、恒定**。表格读 `displayedItems`（本地关键词命中 + JEV 概率），值带 `.id(value)` 逐行错开淡入。 |
| `TurnReferenceMaterials.swift` | ~350 | **这一轮的两类参考材料：屏幕 / 剪贴板**（2026-09-27）。`TurnReferenceMaterials` 是模型（截图组 + 剪贴板那条 + **从剪贴板取到的绝对路径** + `tags` + `<reference_materials>` 提示词块）；`TurnReferenceCollector` 是单例采集器（`beginTurn` 自动截第一张 / `noteLiveTranscript` 关键词边缘触发 / `promptBlock`）。**文件与文件夹不再问访达**（那套 AppleScript + 授权整块删了，用户：「我发现这个东西很难实现」）—— 说「参考文件/参考文件夹」时**读一次剪贴板、只认绝对路径**（`absolutePaths(inText:)`），**读到的值立刻冻进 `materials`**（剪贴板会变）。**标签只反映真拿到了什么**（结构上成立：标签读材料、材料只在取到时写）。 |
| `MainFlowDiagnostics.swift` | ~175 | **主 Agent 这条语音链的诊断日志 + 主线程看门狗**（2026-09-27 新建）。用户报「连续问到第六七轮就卡死」而那条路**一个字都没落盘**，所以先装仪器：日志落 `~/Library/Application Support/Wanna/主Agent诊断.log`，记**音频心跳**（连续监听期间每 2 秒一行 `N 块/2s 峰值 x.xxx` —— 0 块 = tap/引擎没了、有块但全零 = 设备哑了、有块有峰值 = 故障在下游）、**识别会话生命周期**、**主线程看门狗**（后台每 1 秒往主队列投一次，往返 > 2 秒记一行并带上当时的阶段标记 —— 用来分辨"主线程被堵住"与"主线程闲着各链各自停摆"）。只写文件、纯入队不阻塞调用方、2MB 轮转、不改变任何行为。与长录音那条路的 `录音诊断.log` 是同一条规矩：**发现故障的位置必须从用户手里挪到机器手里**。 |
| `DirectionBoardPanelController.swift` | ~330 | 看板住的那块**可点击**面板。⚠️ **尺寸归 SwiftUI、位置归我们**：`NSHostingView` 会按内容改窗口尺寸（`updateAnimatedWindowSize`，保持顶边），**刻意不设 `sizingOptions = []`**（这块面板上它挡不住 —— 根因与实测见本节上面第五版那段），改成订阅 `NSWindow.didResizeNotification` → `repositionForCurrentSize()` 每次用「锚点 + 夹进屏幕」重算原点（只改原点，不成环）。显示时只 `orderFrontRegardless()`、`becomesKeyOnlyIfNeeded`（**点了输入框才是 key**）；⚠️ **显示时绝不 `makeKey()`**（2026-09-28：加了它之后面板在屏上时**就是会话的 key window**，用户的 ⌘V 和打字全被它接走 —— 见 9.55 与 D39；回车那条路由全局 tap 走，不需要 key）；`holdsTheAutomaticSend()` 是"他正在跟看板打交道"的判据（鼠标在板上 / 2 秒内交互过 —— "面板是 key"那条判据已删，它是 `makeKey` 时代的产物、恒为真），静音自动发送那一下据此按住不发。 |
| `DirectionBoardSettingsView.swift` | ~225 | 设置 → 操作 的「任务方向看板」一节：总开关、宽度倍数（1 / 1.5 / 2×）、最小新增字数（5…20）、概率阈值（0.3…0.9）、取消状态 + 恢复显示、**两份文件分开显示**（固定那份给「在访达中显示 / 恢复默认」，临时那份给「立刻清空」）、方向清单（每条可删 + 手动添加）、JEV key 一行（保存进 `JevKey.txt`，不在 AppSettings 里）。 |
| `NotchListeningTranscript.swift` | ~390 | **主 Agent 说话时刘海下面那一行字幕，和点开之后的转写编辑窗**（2026-09-27，接线图第 2、3 条）。三块：`NotchListeningTranscriptModel`（这一轮的文本 + 编辑草稿，单例）、`NotchListeningTranscriptView`（收起=那一行 `NotchTranscriptLine`，展开=`NotchExpandedTranscriptPanel`）、`NotchListeningTranscriptPanelController`（它那块透明、点击穿透、永不改尺寸的面板，层级 `.popUpMenu` —— 在刘海面板之上，所以展开面板时那一行照样看得见）。**只由相位驱动**：`== .listening` 就出现、其余收起（用户：「如果用户说完了，然后进入 thinking，那么这个录音的内容就消失掉了」），**不碰状态机**。`CompanionManager` 在两条实时转写回调里喂它（按住说话 + 连续追问）—— 它是说话时那些字**唯一的**落点（鼠标旁那颗气泡不再显示实时转写，见 Settings 那一节）；刘海左侧那颗「Listening」的点击归 `handleGlobalClick`，读的是录音两翼那一份矩形（`recordingWingFrames`）。**编辑窗里改过的字会顶替这一句发出去的话**（`consumeEditedTranscript()`，取走即清、一轮一次）—— 这是它与录音那条唯一的语义差别，也是「可以让用户编辑录音里面的内容」唯一有意义的落点。 |
| `RecordingSettingsView.swift` | ~597 | 设置页「录音」。历史在最顶、其余参数在下；每条历史两行（标题 + 复制/播放/在访达中显示/展开，第二行预览或十行全文）。「自定义风格」那一节含总开关、屏幕截图开关、模型 URL/Key/模型 ID，以及**从「模型」页导入**的选择器 —— 模型 ID 跟着服务商一起换，因为一个地址配别家的模型名必然 404。 **2026-09-27 起这一页的历史有两个来源**：长录音（`LongFormRecorderController`）与主 Agent 的每一轮（`AgentTurnRecorder`）—— 两者落的是同一套 `<id>.wav` / `.txt` / `.json`，所以这一页一行都不用改。同一处加了一层 `RecordingLibraryChangeObserver`（一个只订阅 `RecordingLibraryStore.didChangeNotification` 的小 `View`）：主 Agent 每问一句就多一条，而这一页的 `@State` 是 ViewModel 的，中间缺一层的话列表要等下一次别的原因重绘才更新；做成独立 `View` 而不是 `@State` 是因为 **extension 里不能声明存储属性**。 |
| `RecordingPolishStyle.swift` | ~280 | 「自定义风格」的数据与存储。多条风格各自一个开关 + 可改名的名称 + 提示词，出厂那条是用户给的 3556 字「文本后处理引擎」提示词，**逐字照抄**（那是他写好的规则，改一个字都可能改变行为），**可以关但不给删** —— 恢复它意味着让用户重新贴一遍三千多字。 |
| `RecordingPolishClient.swift` | ~206 | 转写结束后的模型调用。**必须发 `thinking: {"type": "disabled"}`** —— `deepseek-flash` 是推理模型，会在给出答案前先吐几百上千个推理 token，而这个仓库自己量过那笔账（视觉那条路上 4.5 秒的请求里 3.4 秒是思考）。润色是改写任务，那段思考用户一个字都看不到，全是白等；实测一次 23 秒、一次 8 秒，关掉之后是 1 秒量级。地址留空时回落到「模型」页里 🧠 那个服务商。**失败就用原文** —— 用户要的是「整理一下再给我」，整理失败时他最需要的仍然是他说过的话。 |
| `AgentTurnRecorder.swift` | ~330 | **主 Agent 的每一条指令都存成一条录音**（接线图第 4 条，2026-09-27）。两半：`AgentTurnAudioSink`（`nonisolated`，活在采集线程上 —— 把 tap 缓冲转 16 kHz 单声道 PCM16、排在一条串行队列上落盘；三个状态 idle / armed / recording）与 `AgentTurnRecorder`（`@MainActor` —— 元数据、转写、写库）。**没有新增任何采集**：音频寄生在 `BuddyDictationManager` 已有的输入 tap 上（`capturedAudioBufferObserver`，三处 tap 各一行），VAD / 连续监听 / 打断一个字节没改；「这一句从哪一秒算起」由 `onContinuousListeningUtteranceBegan`（挂在 `markContinuousListeningUtteranceActive` 里的纯观察者）给。**采集线程上只做 `memcpy`**（2026-09-27 改）：最初那版在渲染线程上做重采样 + 建文件，实测平均 6785µs / 峰值 13874µs 一块（一块音频才 21.3ms），加上送识别那 9088µs，采集线程被占到 ~78% —— 那就是用户报的「正常说话时会卡一下」；现在重采样 / 建文件 / 写盘全在 `writeQueue` 上（改后 40µs / 峰值 155µs）。「没听到话」有**两条**出口都要收尾（`discardTurn()` 与 `onDictationAbandoned`），少一条就会留下一轮开着的录音 + 历史里一条 0 秒空条目。落盘用的是长录音那三个**已经跑通**的组件（`RecordingAudioWriter` / `LongFormTranscriptWriter` / `RecordingLibraryStore`）+ 同一套 16 kHz 格式 + 同一个 `makeSessionID()`，所以设置 → 录音 的历史、播放、重新转写、在访达中显示**一行都没为新来源改**。「第一块音频到达才建文件」是刻意的：`armTurn` 与「真的开始录」之间隔着权限检查、开 ASR 会话、装 tap，任何一步中断都不该在历史里留下 0 秒的空条目。⚠️ **取消语义是它与长录音唯一一处不同**：主 Agent 上点取消 = 什么都不发但**本地那条录音照留**，靠 `finishTurn` 排在 `consumeNotionNoteTurnIfNeeded` **之前**保证（发出 / 存成笔记 / 取消三个去向都过它）；而「没听到话」走 `discardTurn()`（文件删掉），那不是取消。 |
| `NotionNoteDetector.swift` | ~241 | 「这一轮要不要存成一条 Notion 笔记」的**纯逻辑**（2026-09-27 从 `LongFormRecorderController` 一行不改地搬出来）：模糊匹配（滑动窗口 + 编辑距离 + 按关键词长度定档的容错）、命中计数、模型回复的三段切分、Markdown → Notion 块、行内样式。整个类型 `nonisolated`、不碰网络与 UI，所以能脱离整个 App 单独编译跑（15 条断言在真源码上全过，含用户给的那四句真实转写）。 |
| `NotionNoteSession.swift` | ~406 | 那件事的**状态机与执行**：`@MainActor ObservableObject` 单例（形状照 `AgentActivityBoard.shared`），持有 `showsNotionNoteButtons` / 参考材料 / 三态（取消 / 保存中 / 已保存）与那把 2 秒一次、之后每 3 秒的检测表，`saveNote` 走「模型整理 → `NotionNoteClient` 按形状写进那一页」。**它现在只被主 Agent 的语音路径驱动**（录音那条一段都不剩）。三种去向见 `consumeTurnDecision()`，而**取消语义是两条路唯一一处不同**，类型注释里写死了那条理由。日志是**注入的 `log`**（原来是录音页的 `publishDiagnostic`）。 |
| `NotionNoteButtonRow.swift` | ~90 | 刘海左侧那三颗按钮的"画"（从 `NotchRecordingOverlay.notionNoteButtons` 原样搬来）。⚠️ 它**不吃点击**（`.allowsHitTesting(false)`）：面板是点击穿透的，点击归 `handleGlobalClick` 里那三个 slot —— 少了这一行，面板展开时同一个动作会被触发两次。 |
| `FigureBoardController.swift` | ~195 | `[SVG_BOARD:元素名：任务]` 的屏幕白板：把画图助手的 SVG 画在一块白色圆角小板上，板子放在锚点元素（AX 解析出的真实 Quartz 坐标系 frame）旁边——先放右边，放不下翻到左边，再夹进屏幕内。窗口配方照抄 `ScreenAnnotationManager`：一块透明点击穿透 `OverlayWindow`、自动淡出（20 秒，比绿圈久，图要读）、generation 计数防旧淡出任务误杀新板。纯视觉：跟绿圈一样在每次新截图、打断、新按键前清掉，模型永远不会看到自己画的图。 |

## Build & Run

**Build and launch from the terminal, not from the Xcode GUI** — the full sequence is at the top of this file, under [改完代码必须自己编译、自己重启](#改完代码必须自己编译自己重启直接把能用的成品交给用户最高优先级). What goes wrong if you skip the relaunch step is written up there too.

```bash
# Build
cd /Users/mjm/Documents/SuperAgent/Wanna
xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug build

# Known non-blocking warnings: Swift 6 concurrency warnings,
# deprecated onChange warning in OverlayWindow.swift. Do NOT attempt to fix these.
```

Opening the project in Xcode (`open Wanna.xcodeproj`) is still fine for reading code or inspecting build settings — it is just not how a change gets shipped to the user.

**Terminal `xcodebuild` is safe only while the target is certificate-signed** — see [Code signing](#code-signing). Under ad-hoc signing it resets TCC (Screen Recording / Accessibility / Microphone), because that signature's identity is the binary hash, so a rebuild looks like an entirely new app. The target is certificate-signed today, so `xcodebuild … build` works and is a faster way to get a compile error than opening Xcode. If the target is ever switched back to ad-hoc, go back to building from the Xcode GUI.

### Code signing

The app target is **certificate-signed**: `CODE_SIGN_STYLE = Automatic`, `CODE_SIGN_IDENTITY = "Apple Development"`, `DEVELOPMENT_TEAM = 8WS2Z3JL4F`, against an Apple ID added in Xcode → Settings → Accounts. This is the configuration that stopped macOS re-asking for Screen Recording / Accessibility / Microphone after every rebuild, and it is what makes terminal `xcodebuild` safe here.

The stability comes from the designated requirement being **certificate**-based rather than hash-based:

```
designated => identifier "com.nash-aigc.wanna" and anchor apple generic
              and certificate leaf[subject.CN] = "Apple Development: … (WR9S5P4Y38)"
```

An ad-hoc signature's requirement is instead `cdhash H"…"` — bound to the binary — so every rebuild is a brand-new app to TCC and all three permissions reset. That was the cause of the repeated permission prompts.

The initial build shipped the app target pinned to `DEVELOPMENT_TEAM` 钉在一个别人的 team ID 上, someone else's team. On any other machine that fails before compiling with:

```
error: No signing certificate "Mac Development" found: No "Mac Development"
signing certificate matching team ID "..." with a private key was found.
```

Do not "fix" that by setting a team ID that isn't installed — with no certificate in the keychain, automatic signing fails for any team. **Ad-hoc** (`CODE_SIGN_STYLE = Manual`, `CODE_SIGN_IDENTITY = "-"`, `DEVELOPMENT_TEAM = ""`) is the fallback for a machine with no Apple ID at all: it compiles, because the app is not sandboxed and every entitlement it declares (`network.client`, `device.camera`, `device.audio-input`, the ScreenCaptureKit mach-lookup exception) needs no provisioning profile — but it costs stable TCC permissions, and it is the only reason terminal builds would be off-limits.

## Secrets and First-Run Setup

`Wanna/BailianSecrets.plist` is gitignored and holds two keys:

```xml
<key>BailianAPIKey</key>
<string>sk-…</string>
<key>BailianWorkspaceBaseURL</key>
<string>https://ws-….maas.aliyuncs.com</string>
```

Because it must not be committed, a fresh clone has no secrets and the app will fail every network call. Install a copy outside the repo so it survives a clean checkout:

```bash
mkdir -p ~/Library/Application\ Support/Wanna
cp Wanna/BailianSecrets.plist ~/Library/Application\ Support/Wanna/BailianSecrets.plist
chmod 600 ~/Library/Application\ Support/Wanna/BailianSecrets.plist
```

`AppBundleConfiguration` falls back to that path automatically, so it works whether or not Xcode copies the in-repo plist into the bundle.

That plist is now a **first-run seed only**. The first time the app starts with no `ModelConfiguration.json` present, these two values become the URL and API key of an 「阿里云百炼」 card, and all three roles are pointed at it. From then on the settings window owns the configuration and the plist is never read again — so an existing user who upgrades needs to change nothing, and a user who edits the plist afterwards will see no effect until they delete the JSON file.

The recommended way to configure the app is the notch sheet's 设置 (hover or click the notch pill, then 设置 in the sidebar). Both write the same stores: It writes `~/Library/Application Support/Wanna/ModelConfiguration.json` and `~/Library/Application Support/Wanna/AppSettings.json`, both with `0600` permissions, and both take effect immediately — no restart, no rebuild.

## Code Style & Conventions

### Variable and Method Naming

IMPORTANT: Follow these naming rules strictly. Clarity is the top priority.

- Be as clear and specific with variable and method names as possible
- **Optimize for clarity over concision.** A developer with zero context on the codebase should immediately understand what a variable or method does just from reading its name
- Use longer names when it improves clarity. Do NOT use single-character variable names
- Example: use `originalQuestionLastAnsweredDate` instead of `originalAnswered`
- When passing props or arguments to functions, keep the same names as the original variable. Do not shorten or abbreviate parameter names. If you have `currentCardData`, pass it as `currentCardData`, not `card` or `cardData`

### Code Clarity

- **Clear is better than clever.** Do not write functionality in fewer lines if it makes the code harder to understand
- Write more lines of code if additional lines improve readability and comprehension
- Make things so clear that someone with zero context would completely understand the variable names, method names, what things do, and why they exist
- When a variable or method name alone cannot fully explain something, add a comment explaining what is happening and why

### Swift/SwiftUI Conventions

- Use SwiftUI for all UI unless a feature is only supported in AppKit (e.g., `NSPanel` for floating windows)
- All UI state updates must be on `@MainActor`
- Use async/await for all asynchronous operations
- Comments should explain "why" not just "what", especially for non-obvious AppKit bridging
- AppKit `NSPanel`/`NSWindow` bridged into SwiftUI via `NSHostingView`
- All buttons must show a pointer cursor on hover
- For any interactive element, explicitly think through its hover behavior (cursor, visual feedback, and whether hover should communicate clickability)

### Do NOT

- Do not add features, refactor code, or make "improvements" beyond what was asked
- Do not add docstrings, comments, or type annotations to code you did not change
- Do not try to fix the known non-blocking warnings (Swift 6 concurrency, deprecated onChange)
- Do not rename the project directory or scheme again without doing all of it: the target, the scheme, the source folder, the `.xcodeproj`, the bundle identifier, `WorkspaceDirectory.rootPath`, and the keepalive job's path in `~/Library/LaunchAgents/` all point at each other. The 2026-09-26 rename to `Wanna` moved every one of them in a single pass; a partial one leaves a build that compiles but writes to a folder nothing reads. Note that changing the bundle identifier resets Screen Recording / Accessibility / Microphone, because TCC keys on it.
- Do not run terminal `xcodebuild` while the target is ad-hoc signed — it resets TCC permissions. It is safe while the target is certificate-signed (see [Code signing](#code-signing)); check before assuming.

## Git Workflow

- **Single branch: `main`, nothing else.** The user collapsed the old
  feature-branch flow on 2026-09-23 (the auxiliary `~/Desktop/wanna-main`
  worktree, `feature/agent-sessions` and the stray `websocket-fixes` are all
  gone) — commit straight to `main` and push it. No feature branches, no
  merge dance.
- Commit messages: imperative mood, concise, explain the "why" not the "what"
- Do not force-push to main

## 开发经验

**The retrospective has ONE home: `开发经验/`.** Per-subsystem lessons, whole-problem write-ups and incident reports all live in that one directory — one document per category, in Chinese, aimed at whoever touches this code next rather than at users. (The parallel `解决方案/` and `方案/` directories were merged into it on 2026-09-26; the files were only moved and not edited, so the root carries two sets of numbers — that is why there are two `01-`, three `05-`.)

It is the place to look before changing a subsystem: `02-光标与覆盖层.md` for the cursor and overlay, `03-设置与配置.md` for how to add a setting (and the offscreen render probe used to check a settings page without relaunching the app), `04-模型接入.md` for provider routing, `09-实测数据.md` for every measured number with its date and payload, `10-踩过的坑.md` for the bugs and their root causes, `15-录音采集与设备自愈.md` for the recording/device class. `开发经验/README.md` is the index, and it carries the rule that anything fixed gets written down.

Add to it rather than duplicating this file: this file states what the app *is*, 开发经验 states what was *learned* building it. **And the writing is not optional or on request — see the rule near the top of this file.**

Under `04-Agent体系/` (with the parallel `Agent施工/` tree) sits the DESIGN work for the Agent subsystem, organised **by executing body rather than by feature** — four dispatch classes (pure-visual / figure / main loop / Claude fallback), with only two of them真正 agents. It also records the per-path file authorization model (read and write as separate grants), the language adaptation (Chinese app names fail to resolve because the resolver compares against `FileManager.displayName`, which returns English here — measured, with the fix), concurrency's physical ceiling (one cursor, one keyboard focus), and the figure design (why the WebView/GSAP route was rejected, why the geometry compiler must emit the figure data rather than the app parsing SVG). **Nothing under it is built yet.**

## Self-Update Instructions

<!-- AI agents: follow these instructions to keep this file accurate. -->

When you make changes to this project that affect the information in this file, update this file to reflect those changes. Specifically:

1. **New files**: Add new source files to the "Key Files" table with their purpose and approximate line count
2. **Deleted files**: Remove entries for files that no longer exist
3. **Architecture changes**: Update the architecture section if you introduce new patterns, frameworks, or significant structural changes
4. **Build changes**: Update build commands if the build process changes
5. **New conventions**: If the user establishes a new coding convention during a session, add it to the appropriate conventions section
6. **Line count drift**: If a file's line count changes significantly (>50 lines), update the approximate count in the Key Files table

Do NOT update this file for minor edits, bug fixes, or changes that don't affect the documented architecture or conventions.
