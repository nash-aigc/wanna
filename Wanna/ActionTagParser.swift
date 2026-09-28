//
//  ActionTagParser.swift
//  Wanna
//
//  Parses the "action tags" a model is allowed to put at the end of its reply —
//  [POINT:…], [CLICK:…], [SCROLL:…], [TYPE:…], [SELECT:…], [PRESS:…], [OPEN:…],
//  [WAIT:…], [AX_TREE].
//
//  Pointing lives in this file too, but it is deliberately kept out of the
//  returned `actions` list. Pointing only moves the blue cursor; everything in
//  `actions` changes the user's actual machine. Keeping the two apart means the
//  code that executes actions can never accidentally run a point, and the
//  setting that turns pointing off cannot turn acting off along with it.
//
//  This is the single place either tag family is parsed. `CompanionManager`'s
//  older point-only parser is now a thin adapter over `parse(from:)` rather than
//  a second regex, because two regexes for one tag would eventually disagree.
//

import CoreGraphics
import Foundation

/// A coordinate the model reported, together with the optional element name and
/// the screen it belongs to.
///
/// `normalizedCoordinate` is on the model's **0–1000 grid**, not in screenshot
/// pixels and not in screen points. The name says so on purpose: a normalized
/// value and a plausible pixel value look identical, so mixing them up fails
/// silently rather than crashing — the cursor simply lands somewhere else. See
/// `CompanionManager.screenshotPixelCoordinate(fromNormalizedPoint:...)` for the
/// documented conversion and why it exists.
nonisolated struct ModelReportedCoordinate: Sendable {
    let normalizedCoordinate: CGPoint
    let elementLabel: String?
    /// Which screen the coordinate refers to, 1-based as the model numbers them,
    /// or nil to mean "whichever screen the mouse is on".
    let screenNumber: Int?
}

nonisolated enum ScrollDirection: String, Sendable {
    case up
    case down
}

/// A green mark the model wants drawn over the user's screen with a
/// `[SHAPE:…]` tag — a ring around the thing it means, an arrow showing where
/// something goes, a curve tracing a flow. Purely visual: unlike
/// `CompanionAction`, none of these touch the machine, which is why they ride
/// in `ActionParseResult` beside `pointingRequest` rather than in `actions`.
nonisolated enum AnnotationShapeKind: String, Sendable {
    /// A ring around something: the first point is its centre, the second a
    /// point just past its edge — the distance between the two is the radius.
    case circle
    /// From the first point to the second, with an arrowhead at the second.
    case arrow
    /// A plain segment between two points.
    case line
    /// A smooth curve through three or more points.
    case curve
    /// A closed outline through three or more points.
    case polygon

    /// How many points each kind needs to be drawable. Fewer is a malformed
    /// tag rather than a draw request — a ring around nothing has no meaning.
    var minimumPointCount: Int {
        switch self {
        case .circle, .arrow, .line:
            return 2
        case .curve, .polygon:
            return 3
        }
    }
}

nonisolated struct AnnotationShapeRequest: Sendable {
    let kind: AnnotationShapeKind
    /// The shape's points on the model's **0–1000 normalized grid**, in the
    /// order the model wrote them. Same grid as `[POINT:…]`, same conversion
    /// machinery — never screenshot pixels, which is what a raw value looks
    /// like and fails silently as.
    let points: [CGPoint]
    /// Short text the drawing is about ("export", "付款流程"), drawn in a small
    /// capsule beside the shape, or nil. Also the **anchor**: enclosing shapes
    /// look an element up by it in the AX tree. The two jobs are separable —
    /// `label` stays the element's own on-screen words while `displayLabel`
    /// carries whatever caption the user asked for (`锚定词|显示文字`).
    let label: String?
    /// The caption to actually draw, when the tag wrote `anchor|display` and
    /// the user asked for a label different from the element's own name. nil
    /// means draw `label` unchanged.
    let displayLabel: String?
    /// Which screen the shape belongs to, 1-based as the model numbers them,
    /// or nil to mean "whichever screen the mouse is on" — same rule as
    /// `[POINT:…]`.
    let screenNumber: Int?
}

/// Something the companion can do to the user's machine.
nonisolated enum CompanionAction: Sendable {
    case click(at: ModelReportedCoordinate)
    case rightClick(at: ModelReportedCoordinate)
    case doubleClick(at: ModelReportedCoordinate)
    case scroll(at: ModelReportedCoordinate, direction: ScrollDirection, amountInSteps: Int)
    case typeText(String)
    case pressKey(keyName: String, modifierNames: [String])
    /// Select a stretch of text in the focused text area **by content**: from the
    /// first occurrence of `startMarker` to the end of `endMarker` (or just the
    /// `startMarker` occurrence when there is no end). Resolved against the text
    /// area's real value through Accessibility, so it needs no coordinates at all —
    /// which is the point: a model anchoring a range deletion on a clicked
    /// position deletes one line too much whenever the click lands one line off.
    case selectText(startMarker: String, endMarker: String?)
    case openApplication(named: String)
    /// Do nothing for `seconds` — the pause the agent loop needs when the screen
    /// is visibly mid-change (a page loading, a window animating in) and acting
    /// on the next step now would act on a screen that has not settled yet.
    /// Without it the model's only way to "wait" is to report the job finished.
    case wait(seconds: Int)
    /// Ask for a fresh read of the frontmost app's accessibility tree. The result
    /// arrives on the *next* turn, which is what makes a multi-step action
    /// possible: look at the interface, then act on what is really there.
    case readAccessibilityTree
    /// Hand a task to the fourth exit — the desktop file agent, a Python
    /// subprocess whose whole world is `~/Desktop` (view / read / write /
    /// edit files there). The task text is the only free part: the executor
    /// is one fixed script, so this stays a "model picks from a menu" action,
    /// never arbitrary command generation. Its result rides back as a data
    /// block on the next turn, which is what lets the model answer questions
    /// about the files ("这个文件夹里有什么") through the agent too.
    case runDesktopFileAgent(task: String)
    /// Hand a task to the fifth exit — the figure agent, a Python subprocess
    /// that turns a figure description into a precise geometry SVG via the
    /// local geometry-dsl compiler (the model writes a `.geom` description,
    /// the compiler computes every coordinate). One fixed script, task text
    /// the only free part; the rendered figure lands in `Wanna图形/`
    /// and opens in front of the user. Same shape as `runDesktopFileAgent`.
    case runFigureAgent(task: String)

    // MARK: 从 `mcp-server-macos-use` 移植过来的三个原子动作（2026-09-28）

    // 用户 2026-09-28 拍板：「把它所有的特点和优势全都移植过来」。
    // 这三样是它**有而 Wanna 没有**的，全部来自同一个底层 SDK
    // （`MacosUseSDK/AccessibilityActions.swift` 里三个**全局函数**）。
    //
    // 它们不能互相替代，各有各的场合：
    //
    // - **`setValue`**：直接往控件里写值，**绕过键盘**。合成键盘事件在 Catalyst
    //   应用、沙箱输入框、安全输入框里会被吞掉 —— 那时只有这一条路。
    // - **`pressAccessibility`**：发 `kAXPressAction`，**由目标 App 自己执行**。
    //   合成鼠标点击对 Catalyst 右栏按钮、沙箱应用经常无效（本仓 D39 记过：
    //   本进程合成的事件落不到前台 App）。这是那条路的替代品。
    // - **`setSelected`**：设置选中。列表行、表格行、侧栏项**普通点击选不中**
    //   （点下去只得到焦点），只有设 `kAXSelectedAttribute` 才算选中。

    /// 往 `at` 处的控件里写一个值（走 `kAXValueAttribute`，不经键盘）。
    case setValue(String, at: ModelReportedCoordinate)

    /// 对 `at` 处的控件发一次 `kAXPressAction`（目标 App 自己执行这个动作）。
    case pressAccessibility(at: ModelReportedCoordinate)

    /// 设置 `at` 处那一行的选中状态。
    case setSelected(at: ModelReportedCoordinate, selected: Bool)
}

nonisolated enum ActionTagParser {


    /// Maps the words a model may write for a modifier key into the event flag
    /// they mean, or `nil` for anything that is not a modifier.
    ///
    /// This table lives with the tag parser rather than with the code that
    /// presses the keys, because "which of `cmd+a`'s two halves is the key" is
    /// a question about the *tag* — the parser has to answer it, and the answer
    /// has to be the same vocabulary the executor can turn into flags. Two
    /// tables would eventually disagree, and a disagreement here surfaces as a
    /// shortcut that quietly does nothing.
    ///
    /// Several spellings each, because these come from a language model and not
    /// from a keyboard: `cmd`, `command` and `⌘` all mean the same thing, and
    /// refusing one of them would look like the feature is broken.
    nonisolated static func modifierFlag(named modifierName: String) -> CGEventFlags? {
        switch modifierName.lowercased() {
        case "cmd", "command", "meta", "super", "⌘":
            return .maskCommand
        case "shift", "⇧":
            return .maskShift
        case "opt", "option", "alt", "⌥":
            return .maskAlternate
        case "ctrl", "control", "^":
            return .maskControl
        case "fn", "function":
            return .maskSecondaryFn
        default:
            return nil
        }
    }

    /// Removes the claimed tag ranges and tidies the sentence left behind.
    ///
    /// Built by splicing the text *between* the ranges rather than by deleting
    /// them in place: deleting in place means mutating a string while holding
    /// indices into a different copy of it, which is the kind of thing that works
    /// until it doesn't.

    // MARK: - Streaming speech support (逐句快答)

    /// The tag keywords one combined pattern for the streaming speech path —
    /// a keyword added to the parser above must be added here too, or the
    /// streaming speech would read the tag aloud instead of removing it.
    private static let streamingTagKeywords =
        "POINT|CLICK|RIGHT_CLICK|DOUBLE_CLICK|SCROLL|TYPE|SELECT|PRESS|OPEN|WAIT|AX_TREE|SHAPE|AGENT_SPAWN|AGENT_SEND|PY_AGENT|SVG_AGENT|SVG_BOARD"

    /// A complete tag, however far the reply has streamed: `[TYPE:北京新闻]`.
    private static let streamingCompleteTagPattern =
        "\\[(?:\(streamingTagKeywords))[^\\]]*\\]"

    /// A tag that has started but not closed yet — the tail of text still
    /// streaming in: `[POINT:123,45` (keyword whole, arguments still arriving)
    /// or `[POIN` (the keyword itself only half-streamed). The second shape
    /// needs its own arm: `[POIN` matches no keyword yet, so a keyword-only
    /// pattern would let it through and the tag's first letters would be
    /// spoken aloud — and the next call would retract them, which breaks the
    /// prefix monotonicity the session's cumulative feed diffs on. The arm
    /// matches a trailing `[` followed by letters only, however many: a
    /// bracketed English word (`[documentation`) is held too, but holding is
    /// always safe — releasing the held text later only extends the output,
    /// while leaking it early and removing it later is the break.
    private static let streamingOpenTagPattern =
        "\\[(?:\(streamingTagKeywords))[^\\]]*$|\\[[A-Za-z_]*$"

    /// Strips action tags from reply text that may still be mid-tag, for the
    /// streaming speech path.
    ///
    /// Complete tags are removed; a trailing stretch that could still be the
    /// beginning of a tag is held back (`[POINT:123,45` has not closed yet —
    /// speaking it now would read the tag aloud, and finding out one character
    /// too late is what this hold-back prevents). Once the tag closes it is
    /// removed on a later call, so each call's result always extends the
    /// previous call's — the session diffs on that property.
    static func speakableTextFromStreamedReply(_ streamedReplyText: String) -> String {
        var speakableText = streamedReplyText

        // **两个正则提为静态缓存**（2026-09-25 性能修复）：这个函数在流式回答期间
        // **每个文字 delta 调用一次**（三段式喂朗读 + 更新卡片都要过它），原先每次
        // 都现场编译两个 `NSRegularExpression` —— 主线程上每 delta 两次正则编译，
        // 整轮 O(n²)。模式是常量，编译一次终身复用。
        if let completeTagRegex = Self.streamingCompleteTagRegex {
            let wholeTextRange = NSRange(streamedReplyText.startIndex..., in: streamedReplyText)
            speakableText = completeTagRegex.stringByReplacingMatches(
                in: streamedReplyText,
                options: [],
                range: wholeTextRange,
                withTemplate: ""
            )
        }

        if let openTagRegex = Self.streamingOpenTagRegex {
            let wholeTextRange = NSRange(speakableText.startIndex..., in: speakableText)
            if let openTagMatch = openTagRegex.firstMatch(in: speakableText, options: [], range: wholeTextRange),
               let openTagRange = Range(openTagMatch.range, in: speakableText) {
                speakableText = String(speakableText[..<openTagRange.lowerBound])
            }
        }

        return speakableText
    }

    /// 编译一次、终身复用的流式剥标签正则（见 `speakableTextFromStreamedReply`）。
    private static let streamingCompleteTagRegex = try? NSRegularExpression(
        pattern: streamingCompleteTagPattern,
        options: [.caseInsensitive]
    )
    private static let streamingOpenTagRegex = try? NSRegularExpression(
        pattern: streamingOpenTagPattern,
        options: [.caseInsensitive]
    )

    private static func capture(
        _ groupIndex: Int,
        of match: NSTextCheckingResult,
        in text: String
    ) -> String? {
        guard groupIndex < match.numberOfRanges,
              let groupRange = Range(match.range(at: groupIndex), in: text) else {
            return nil
        }
        return String(text[groupRange])
    }

    // MARK: - 指位标签（现存唯一的标签）

    /// `[POINT:x,y]` / `[POINT:x,y:label]` / `[POINT:x,y:label:screen2]` / `[POINT:none]`
    /// 四种形状。捕获组：1 = x，2 = y，3 = 标签，4 = 屏幕号（1 起数）。
    private static let pointingTagPattern =
        #"\[POINT:(?:none|(\d+)\s*,\s*(\d+)(?::([^\]:\s][^\]:]*?))?(?::screen(\d+))?)\]"#

    private static let pointingTagRegex = try? NSRegularExpression(
        pattern: pointingTagPattern,
        options: [.caseInsensitive]
    )

    /// 从回复里取出 `[POINT:…]`，并把标签从"要说的话"里去掉。
    ///
    /// **2026-09-29 起，这是唯一还在解析的标签。** 其余 19 个（`[CLICK:]`、`[TYPE:]`、
    /// `[SCROLL:]`、`[SKILL:]`、`[AGENT_SPAWN:]`、`[SVG_AGENT:]`、`[WAIT:]` …）连同
    /// 它们的正则、`ActionParseResult`、以及 CompanionManager 里那一整段
    /// 「解析 → 执行动作 → 继续下一步」的循环**一起删掉了**。
    ///
    /// 判据不是推测，是诊断日志：那些标签在整个 1.3MB 日志里**各出现 0 次**，
    /// 而 `parse` 那一行**一次都没有执行过**。原因是决策已经搬去 Python，
    /// 它动手走的是 MCP 工具，回复里不会再出现这些标签。
    ///
    /// **POINT 留下来只有一个原因：开机引导还在用它。** 新装首次运行那段
    /// 「光标飞过去指个东西」走的是旧的视觉模型（`onboardingDemoSystemPrompt`），
    /// 它真的会写 `[POINT:…]`。
    static func parsePointing(from responseText: String)
        -> (spokenText: String, pointing: ModelReportedCoordinate?) {
        guard let regex = pointingTagRegex else {
            return (responseText, nil)
        }

        let wholeTextRange = NSRange(responseText.startIndex..., in: responseText)

        // Only the first point wins: the cursor can only be in one place, so a
        // second coordinate would have nowhere to fly to.
        var pointing: ModelReportedCoordinate?
        for match in regex.matches(in: responseText, options: [], range: wholeTextRange) {
            guard pointing == nil,
                  let x = capture(1, of: match, in: responseText).flatMap(Double.init),
                  let y = capture(2, of: match, in: responseText).flatMap(Double.init) else {
                continue
            }
            pointing = ModelReportedCoordinate(
                normalizedCoordinate: CGPoint(x: x, y: y),
                elementLabel: capture(3, of: match, in: responseText)?
                    .trimmingCharacters(in: .whitespaces),
                screenNumber: capture(4, of: match, in: responseText).flatMap(Int.init)
            )
        }

        // A tag the model wrote is never spoken, coordinate or not (`[POINT:none]`
        // included — it is an answer, not a sentence).
        let spokenText = regex.stringByReplacingMatches(
            in: responseText,
            options: [],
            range: wholeTextRange,
            withTemplate: ""
        )

        return (spokenText.trimmingCharacters(in: .whitespacesAndNewlines), pointing)
    }

}