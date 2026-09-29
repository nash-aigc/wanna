//
//  NotchListeningTranscript.swift
//  Wanna
//
//  主 Agent 说话时，刘海**下面那一行**滚动字幕 —— 它同时是**实时窗口中间那一列**的内容。
//
//  ⚠️ **2026-09-29 大改**：这个文件原来还装着"点开之后那个转写编辑窗"（
//  `NotchListeningTranscriptView` + `NotchListeningTranscriptPanelController`）。
//  那两块**整块搬走了** —— 现在点刘海左侧那颗「Listening」打开的是**实时窗口**
//（`RealtimeWindow.swift`：矛盾 / 疑问 ｜ 转写·参考·Harness ｜ 总结 ｜ 回复结果），
//  而那个转写编辑窗只是它的**中列**。所以这个文件现在只剩**模型**（那份文本 + 那份草稿）。
//
//  用户对这条链的原始要求（2026-09-27）一句没变，改的只是"点开之后是什么"：
//  「在当前的主 agent 快捷键触发之后……下面要显示一个类似于录音这个……显示一横文字，
//   然后**从右到左滑动**，然后非常平滑的这样一个移动」。
//
//  **它不碰状态机。** 显示与否只看 `NotchPanelModel.notchBandSitsAboveTranscriptLine`
//  这一个条件 —— 打断、说完等待、自动发送、相位一路都还是主 Agent 原来那套。
//
//  ⭐ **2026-09-29 用户强调的一条**：「**字幕 = 提示词**，这个你必须理解，所以：
//  **按下快捷键之后，字幕必须清空**，因为它是提示词」—— 见 `beginRound()`。
//

import AppKit
import Combine
import SwiftUI

/// 这一轮说话的字幕文本，以及那一列转写的编辑草稿。
///
/// 形状照 `LongFormRecorderController` 的转写那一半（`livePartialText` / `transcriptDraftText`
/// / `transcriptDisplayText`）：**草稿一旦存在，识别结果就不再覆盖它** —— 否则用户改到一半，
/// 下一句实时转写进来会把他的字冲掉。
///
/// 写它的是 `CompanionManager`（说话期间的每一句实时转写），读它的是刘海那行字幕与实时窗口中列；
/// 用户改过的正文由 `CompanionManager` 在这一句**提交前**取走（`consumeEditedTranscript`）。
///
/// 单例，理由与 `AgentActivityBoard.shared` / `NotionNoteSession.shared` 一样：真相本来就
/// 只有一份（这一轮说的那句话），而写它的和读它的分处两个对象。
@MainActor
final class NotchListeningTranscriptModel: ObservableObject {

    static let shared = NotchListeningTranscriptModel()
    private init() {}

    /// 这一轮说话到目前为止识别出来的文字。
    ///
    /// **只增不减**是那条字幕的硬要求（位移是 `可用宽度 − 文字宽度`，文字一变短就往右跳，
    /// 见 `SmoothRevealedTranscriptText`）—— 识别器吐的是这一句的累积结果，所以它天然只增。
    @Published private(set) var liveText: String = ""

    /// 用户在实时窗口那一列里改过的正文。`nil` = 没改过，编辑框跟着识别结果显示。
    @Published private(set) var editorDraftText: String?

    /// 编辑框现在应该显示什么。
    var editorText: String { editorDraftText ?? liveText }

    /// `CompanionManager` 每收到一句实时转写就喂进来。
    func setLiveText(_ text: String) {
        liveText = text
    }

    /// 用户在编辑框里打字。
    func applyEditedText(_ text: String) {
        editorDraftText = text
    }

    /// 把用户改过的正文**取走**（一轮只顶替一次）。
    ///
    /// 返回 `nil` = 他没改过，照识别结果走。返回空串 = 他**清空了** —— 那也是他的意思
    ///（"这句别发"），所以照传：主 Agent 那条路的空转写本来就有一条早退（什么都不发、
    /// 也不问模型），行为和"他没说话"完全一样。
    func consumeEditedTranscript() -> String? {
        guard let draft = editorDraftText else { return nil }
        editorDraftText = nil
        return draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 新的一轮说话开始 —— 文字与编辑状态全部归零。
    ///
    /// ⭐ **用户 2026-09-29 把这条写成了硬要求**：「字幕 = 提示词 …… **按下快捷键之后，
    /// 字幕必须清空**，因为它是提示词」。
    ///
    /// 所以它现在由 `CompanionManager` 在**每一次按下说话键**时调用（不再是"那块面板出现时"）——
    /// 窗口可以一直开着，而每一轮按下都得是一句全新的话；留着上一轮的字 = 让模型以为
    /// 那是这一轮的新指令 ✗。
    func beginRound() {
        liveText = ""
        editorDraftText = nil
    }
}
