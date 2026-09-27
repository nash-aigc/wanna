//
//  NotionNoteSession.swift
//  Wanna
//
//  **「这一轮要不要存成一条 Notion 笔记」的状态机**（2026-09-27 从
//  `LongFormRecorderController` 搬出来）。
//
//  用户 2026-09-27：「你把这个相关的代码照搬过来，从录音这块剥离出来。就让录音的工程……录完音，
//  然后润色就完事了，把它功能简单一点。但是把这个关键词识别，包括后端的代码的监听，完整这套功能
//  转换到这个主 agent 的快捷键」。
//
//  ## 它现在挂在谁身上
//
//  **主 Agent 的快捷键那条路**：按住 ⌃⌥ 说话（或回答之后的连续追问）**说话期间**跑这里的检测，
//  命中关键词就在刘海左侧长出那几颗按钮。录音那条路**一段都不剩** —— 录音只剩
//  「录 → 转写 → 润色 → 落盘 → 剪贴板」。
//
//  ## 三种去向（`consumeTurnDecision()`）
//
//  | 情况 | 这一轮怎么走 |
//  |---|---|
//  | 没命中关键词 | `.none` —— 照旧走对话管线（截图 → 模型） |
//  | 命中、用户没点取消 | `.saveNote` —— 存成一条 Notion 笔记，**不进对话管线** |
//  | 命中、用户点了取消 | `.cancelled` —— 什么都不发（不截图、不问模型、不写 Notion） |
//
//  ⚠️ **取消的语义，两条路是唯一一处不同，别再改成一样。**
//
//  · **录音那条**点「取消」= 这一场**按普通录音处理**（照常存一场录音，只是不写 Notion）——
//    那条路的"默认行为"（粘贴 / 进剪贴板）本身就是用户要的结果，取消只是拿掉附加的那一层。
//  · **主 Agent 这条**点「取消」= **这一轮不进对话管线**（不截图、不问模型），也**不写 Notion**。
//    这里没有"照常"可退 —— 退回去就是拿用户已经否掉的东西去问模型、去写一页笔记，
//    而这两件事都有用户看不见的代价（一次请求、一页云端记录）。所以取消在这里是**终止**。
//  · 两条路**都要留下东西**（同一条原则）：录音那条留下录音；主 agent 这条留下本地那条录音
//    ——「每一轮都保留音频」是接线图的第 4 条，**还没接**（主 Agent 那条现在不落 `.wav`），
//    所以今天这条只做到"不发出去"，音频那半等第 4 条落地。见 `开发经验/17-*.md`。
//
//  ## 搬过来时改了什么
//
//  只有两处，都是为了脱离录音子系统：
//
//  1. 日志从 `publishDiagnostic`（写录音页的诊断列表 + 一个日志文件）改成**注入的 `log`** ——
//     那两样输出都属于录音页，主 Agent 没有它们。
//  2. 转写来源从"读控制器自己的 `transcriptPlainText + livePartialText`"改成**喂进来的**
//     （`noteLiveTranscript`）—— 主 Agent 的实时转写在 `CompanionManager` 手里。
//
//  检测循环的节奏、模糊匹配、参考材料的取法、三颗按钮的三态，**一行都没有动**。
//

import AppKit
import Combine
import Foundation

/// 一轮说话的三种去向 —— 见类型注释里那张表。
enum NotionNoteTurnDecision {
    /// 没命中关键词：照旧走对话管线。
    case none
    /// 命中、且用户没点取消：存成一条笔记，不进对话管线。
    case saveNote
    /// 命中、但用户点了取消：什么都不发。
    case cancelled
}

@MainActor
final class NotionNoteSession: ObservableObject {

    /// 单例，形状照 `AgentActivityBoard.shared`：真相只有一份，而它本来就在这个类的状态里。
    static let shared = NotionNoteSession()

    /// 日志出口。
    ///
    /// 原来是 `LongFormRecorderController.publishDiagnostic`（写进录音页的诊断列表 + 一个日志
    /// 文件）—— 那两样都属于录音子系统，主 Agent 这边没有它们，所以改成**注入**：谁用谁接，
    /// 不接就打到控制台。`CompanionManager` 想接自己的输出时直接换掉这个闭包。
    var log: (String) -> Void = { print("📝 NotionNote: \($0)") }

    // MARK: - 按钮的可见性与三态

    /// 检测到关键词了吗 —— 刘海左侧那几颗按钮据此出现。
    @Published private(set) var showsNotionNoteButtons = false
    /// 用户点了「取消笔记」（或那个唯一按钮）。**取消之后这一轮就什么都不发**。
    @Published private(set) var notionNoteCancelled = false
    /// 已经写进 Notion 了 —— 那个位置换成「已保存笔记 ✓」，点它打开页面。
    @Published private(set) var notionNoteSaved = false
    /// **正在保存**（第三态）：那个位置显示「保存中…」。
    @Published private(set) var isSavingNotionNote = false
    /// 那颗按钮上要显示的错误（保存失败时说出来，不静默）。
    @Published private(set) var notionNoteFailure: String?

    /// 这一轮**曾经**命中过总开关（按钮出现过）。
    ///
    /// 与 `showsNotionNoteButtons` 分开是必须的：用户一点取消，那个属性就被置回 false
    ///（按钮要收掉），可**这一轮发生过什么**这件事不能跟着忘 —— 判"取消 vs 照旧"用的就是它。
    private(set) var noteWasDetectedThisTurn = false

    // MARK: - 参考材料

    /// 参考材料：说了「参考剪贴板 / 复制内容」这类词就把剪贴板拿来当材料。
    @Published private(set) var notionWantsClipboard = false
    /// 参考材料：说到「参考屏幕」时**当场**截下来的图（说几次截几张）。
    @Published private(set) var notionReferenceScreenshots: [Data] = []
    /// 用户按需取消掉的参考（按钮点了就置真，随后不再采集）。
    @Published private(set) var notionClipboardCancelled = false
    @Published private(set) var notionScreenCancelled = false

    /// 该不该在刘海左侧显示第二 / 第三颗按钮。
    var showsClipboardButton: Bool {
        showsNotionNoteButtons && notionWantsClipboard && !notionClipboardCancelled && !notionNoteSaved
    }
    var showsScreenButton: Bool {
        showsNotionNoteButtons && !notionReferenceScreenshots.isEmpty
            && !notionScreenCancelled && !notionNoteSaved
    }

    /// 该不该在刘海左侧显示**第一颗**（总开关那颗）—— 那是 `showsNotionNoteButtons` 本身。
    var showsPrimaryButton: Bool { showsNotionNoteButtons }

    /// 保存成功之后等这么久再把「已保存笔记 ✓」收掉（用户要「在原取消按钮位置显示 5 秒」）。
    static let notionNoteSavedLingerSeconds: Double = 5

    // MARK: - 一轮的开始与结束

    private var notionKeywordTimer: Timer?
    private var savedLingerTask: Task<Void, Never>?
    /// 检测节奏：开始后 **2 秒**第一次，之后**每 3 秒**一次（用户第 4 条）。
    private static let notionKeywordFirstCheckSeconds: Double = 2
    private static let notionKeywordCheckIntervalSeconds: Double = 3

    /// 说话期间喂进来的**实时**转写。
    ///
    /// 只增不减：识别器每次回的都是**整句累积**（`BuddyScreenKeywordDetector` 那条注释里写着
    /// 同一件事），所以平时的赋值就等于累积；留这个判断是为了"某一次中间结果短了一截"时，
    /// 已经出现过的关键词不会跟着消失 —— 录音那条的 `transcriptPlainText + livePartialText`
    /// 同样是只增不减的。
    private var liveTranscriptText = ""

    /// 开一轮检测。**每次说话都调它**（按下说话键 / 连续追问里每一句开口）。
    ///
    /// 状态一律先清零，**即使总闸关着也清** —— 关闸时留着一轮的命中，下一轮就会拿着过期状态
    /// 做判断（"上一轮说过保存笔记，这一轮点取消"，是很典型的错法）。
    func beginListening() {
        resetTurnState()
        notionKeywordTimer?.invalidate()
        notionKeywordTimer = nil
        guard AppSettingsStore.snapshot().notionNoteEnabled else { return }
        // 先 2 秒一次，之后每 3 秒 —— 用一个一次性的表接上重复的表，语义最直白。
        notionKeywordTimer = Timer.scheduledTimer(
            withTimeInterval: Self.notionKeywordFirstCheckSeconds, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.checkKeywords()
                self.notionKeywordTimer = Timer.scheduledTimer(
                    withTimeInterval: Self.notionKeywordCheckIntervalSeconds, repeats: true) { [weak self] _ in
                    Task { @MainActor in self?.checkKeywords() }
                }
            }
        }
    }

    /// 停表。**不清状态** —— 判这一轮去向时还要读它（与录音那条一样）。
    func endListening() {
        notionKeywordTimer?.invalidate()
        notionKeywordTimer = nil
    }

    /// 喂一句实时转写（说话期间每来一次中间结果就调一次）。
    func noteLiveTranscript(_ text: String) {
        if text.count >= liveTranscriptText.count { liveTranscriptText = text }
    }

    /// **这一轮结束了，它该怎么走。** 调用方在把转写送进任何管线**之前**调，并且跟着返回值走。
    ///
    /// 它是**消费型**的：调完状态就清干净了，所以后面来的打字提问（那时根本没有检测在跑）
    /// 不会捡到这一轮的残留。
    func consumeTurnDecision() -> NotionNoteTurnDecision {
        endListening()
        let decision: NotionNoteTurnDecision
        if noteWasDetectedThisTurn {
            decision = notionNoteCancelled ? .cancelled : .saveNote
        } else {
            decision = .none
        }
        resetTurnState()
        return decision
    }

    private func resetTurnState() {
        savedLingerTask?.cancel()
        savedLingerTask = nil
        showsNotionNoteButtons = false
        noteWasDetectedThisTurn = false
        notionNoteCancelled = false
        notionNoteSaved = false
        notionNoteFailure = nil
        isSavingNotionNote = false
        notionWantsClipboard = false
        notionClipboardCancelled = false
        notionScreenCancelled = false
        notionReferenceScreenshots = []
        notionScreenMentionsHandled = 0
        liveTranscriptText = ""
    }

    // MARK: - 三颗按钮的动作

    /// **「剪贴板」那颗**：这一轮不参考剪贴板了。
    ///
    /// 用户 2026-09-27：「点击这个按钮之后…就进入正常的 notion 笔记的保存，也就是说用户的
    /// 录音当做一个笔记，而不当做一个目标、不当做任务来处理」—— 所以取消的是**参考材料**，
    /// 这一轮照旧存成笔记。
    func cancelNotionClipboardReference() {
        notionClipboardCancelled = true
        log("用户点了「剪贴板」：这一轮不参考剪贴板")
    }

    /// **「屏幕」那颗**：这一轮不参考屏幕（已截的图也不再送）。
    func cancelNotionScreenReference() {
        notionScreenCancelled = true
        notionReferenceScreenshots = []
        log("用户点了「屏幕」：这一轮不参考屏幕内容")
    }

    /// 「取消」：这一轮**什么都不发**（不写 Notion、也不进对话管线）。
    ///
    /// **取消是彻底的**（用户 2026-09-27：「只要用户点击取消，就完全的取消，甚至取消后后台的
    /// 这个什么一秒钟检测一次这个代码…就直接取消掉」）：按钮收掉、检测表停掉、并且
    /// `notionNoteCancelled` 一旦为真就**再也不会让按钮回来**（哪怕用户最后又说了一次关键词）。
    /// `noteWasDetectedThisTurn` **刻意保留为真** —— 那正是 `consumeTurnDecision()` 判"取消"
    /// 的依据（它和 `showsNotionNoteButtons` 不是一回事）。
    func cancelNote() {
        notionNoteCancelled = true
        showsNotionNoteButtons = false
        endListening()
        log("用户取消了笔记：按钮收掉、检测停掉，这一轮不进对话管线（也不写 Notion）")
    }

    /// **点那颗按钮** —— 三种状态各自的意思。控制器（全局监听）接走点击之后调它，
    /// 因为面板是点击穿透的，SwiftUI 那层收不到。
    func handleNotionNoteButtonTap() {
        if notionNoteSaved {
            openNotionNotePage()
        } else if !isSavingNotionNote {
            cancelNote()
        }
    }

    /// 点「已保存笔记」= 打开那一页（用户第 7 条）。
    func openNotionNotePage() {
        let settings = AppSettingsStore.snapshot()
        let configured = settings.notionNoteOpenURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let target = configured.isEmpty
            ? NotionNoteClient.normalizedPageID(settings.notionNotePageID).map {
                "https://www.notion.so/" + $0.replacingOccurrences(of: "-", with: "")
              }
            : configured
        guard let target, let url = URL(string: target) else { return }
        NSWorkspace.shared.open(url)
    }

    // MARK: - 检测

    private func checkKeywords() {
        let settings = AppSettingsStore.snapshot()
        guard settings.notionNoteEnabled, !notionNoteCancelled, !notionNoteSaved else { return }
        let transcript = liveTranscriptText
        let window = NotionNoteDetector.edgeCharacterCount

        // ① 总开关：说了「保存笔记」这类词，这件事才存在。
        if !showsNotionNoteButtons {
            let noteKeywords = settings.notionNoteKeywords.split(separator: "\n").map(String.init)
            if NotionNoteDetector.transcriptMentions(noteKeywords, in: transcript,
                                                     edgeCharacterCount: window) {
                showsNotionNoteButtons = true
                noteWasDetectedThisTurn = true
                log("检测到 Notion 关键词，刘海左侧显示按钮")
            } else {
                return   // 总开关没开，后面两组都不看
            }
        }

        // ② 参考剪贴板：说了「复制内容 / 选中内容」这类词。
        if !notionWantsClipboard, !notionClipboardCancelled {
            let clipboardKeywords = settings.notionClipboardKeywords.split(separator: "\n").map(String.init)
            if NotionNoteDetector.transcriptMentions(clipboardKeywords, in: transcript,
                                                     edgeCharacterCount: window) {
                notionWantsClipboard = true
                log("检测到「参考剪贴板」，剪贴板内容将作为参考材料")
            }
        }

        // ③ 参考屏幕：**说到就当场截一张**（说几次截几张）。这里用的是**刚刚新出现的**
        //    那段文字 —— 每命中一次就多一张，所以只在文本变长时才可能再截。
        if !notionScreenCancelled {
            let screenKeywords = settings.notionScreenKeywords.split(separator: "\n").map(String.init)
            let mentionCount = NotionNoteDetector.transcriptMentionCount(screenKeywords, in: transcript,
                                                                        edgeCharacterCount: window)
            if mentionCount > notionScreenMentionsHandled {
                let newMentions = mentionCount - notionScreenMentionsHandled
                notionScreenMentionsHandled = mentionCount
                for _ in 0..<newMentions { captureNotionReferenceScreenshot() }
            }
        }
    }

    /// 已经处理过的「参考屏幕」提及次数（避免同一句话反复截图）。
    private var notionScreenMentionsHandled = 0

    private func captureNotionReferenceScreenshot() {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let captures = try? await CompanionScreenCaptureUtility.captureAllScreensAsJPEG() else {
                self.log("「参考屏幕」要截图，但这次截不到")
                return
            }
            // 只用主屏那一张：用户说的是"当前的屏幕"，而多屏会一下子塞好几张。
            guard let primary = captures.first?.imageData else { return }
            self.notionReferenceScreenshots.append(primary)
            self.log("「参考屏幕」：已截第 \(self.notionReferenceScreenshots.count) 张")
        }
    }

    // MARK: - 保存

    /// 把这一轮整理成一页笔记写进 Notion。
    ///
    /// 两步：**先让模型按用户那套提示词整理**（独立的一套服务商配置），再交给
    /// `NotionNoteClient` 按形状写进去。整理失败就**只存原文**——用户至少拿到录音，
    /// 而不是什么都没发生。
    func saveNote(rawText: String) async {
        let settings = AppSettingsStore.snapshot()
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            notionNoteFailure = "这一轮没有文字，没写成笔记"
            return
        }
        // **参考材料**：只有用户说了「复制内容 / 选中内容」或「参考屏幕」才去读 ——
        // 没说要读的时候连剪贴板都不碰（用户第 8 条那一族的分寸：不该参考的绝不参考）。
        var reference = NotionNoteReference()
        if !notionClipboardCancelled && notionWantsClipboard {
            reference = NotionNoteReferenceGatherer.readClipboard()
        }
        if !notionScreenCancelled {
            reference.screenScreenshots = notionReferenceScreenshots
        }
        log("Notion 参考材料：\(reference.logLine)")

        var summary = "录音笔记"
        var outline = trimmed
        var formatted: [NotionNoteClient.RichBlock] = []
        do {
            // **两条分支的提示词在这里分家**（见 `NotionNoteReference.buildPrompt`）：
            // 有材料时用户的话是"指令"，没有材料时用户的话是"要被整理的笔记本身"。
            let reply = try await RecordingPolishClient.organizeNotionNote(
                prompt: NotionNoteReferenceGatherer.buildPrompt(
                    transcript: trimmed,
                    reference: reference,
                    formattingPrompt: settings.notionNotePrompt),
                screenshotJPEG: reference.clipboardImageJPEG,
                referenceImages: reference.screenScreenshots,
                settings: settings)
            let parsed = NotionNoteDetector.parseNotionNoteReply(reply)
            summary = parsed.summary
            outline = parsed.outline
            formatted = NotionNoteDetector.richBlocks(fromMarkdown: parsed.formatted)
            log("Notion 整理完成：总结 \(summary.count) 字 · 大纲 \(outline.count) 字 · 排版块 \(formatted.count) 个")
        } catch {
            log("Notion 整理失败（只存原文）：\(error.localizedDescription)")
            outline = trimmed
        }

        let title = NotionNoteDetector.notionNoteTitle(for: Date())
        let request = NotionNoteClient.SaveRequest(
            title: title,
            summary: summary,
            outline: outline,
            formattedBlocks: formatted.isEmpty
                ? [.paragraph([.init(text: trimmed)])]
                : formatted,
            rawLines: trimmed.split(separator: "\n").map(String.init).isEmpty
                ? [trimmed] : trimmed.split(separator: "\n").map(String.init))
        do {
            let url = try await NotionNoteClient().save(request)
            notionNoteSaved = true
            notionNoteFailure = nil
            log("已保存到 Notion：\(url)")
            scheduleSavedLingerClear()
        } catch {
            notionNoteFailure = error.localizedDescription
            log("Notion 保存失败：\(error.localizedDescription)")
        }
    }

    /// 「已保存笔记 ✓」在原「取消」的位置显示 5 秒，然后整块收掉 —— 这一轮到此为止。
    ///
    /// 录音那条是调用方（收尾那一步）`await Task.sleep` 等完再收带子；现在两边都属于这里，
    /// 所以由这里自己收：调用方只 `await saveNote(...)`，不必知道那个 5 秒。
    private func scheduleSavedLingerClear() {
        savedLingerTask?.cancel()
        savedLingerTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.notionNoteSavedLingerSeconds))
            guard !Task.isCancelled, let self else { return }
            self.showsNotionNoteButtons = false
            self.notionNoteSaved = false
            self.notionNoteFailure = nil
        }
    }
}
