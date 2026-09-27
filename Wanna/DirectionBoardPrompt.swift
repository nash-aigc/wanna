//
//  DirectionBoardPrompt.swift
//  Wanna
//
//  **看板那段"AI 怎么理解"的提示词 + 提交时那几行**（2026-09-27 第三版）。
//
//  用户 2026-09-27 的判定很直接：
//  > 刚才说的是把整个主 agent 提示词全都发给 AI，来判断用户选择哪个方向，这对提示词消耗太大，
//  > 每三秒一次用不起，也没有必要……AI 理解的部分也要包含这个方向，所有方向，这个文件里的所有内容，
//  > **再加上用户的提示词**，让 AI 了解应该如何去理解用户的意图。也就是说**没有必要发送那么多提示词**，
//  > 这样即便是高频调用也不会花费很多 token。
//
//  所以这里只有两样东西：
//  1. **一段小提示词**（方向清单 + 用户的话 → 一两句理解）—— 约三百 token，不是五千；
//  2. 提交时加在用户提示词前面那几行的拼装（`decoration`）。
//
//  **方向判断本身不在这里** —— 那件事交给 Jev 决策模型（`JevDecisionClient`），用户点名要的。
//

import Foundation

nonisolated enum DirectionBoardPrompt {

    /// 说明最多留这么多字（看板那块地方面积固定，长了会顶掉其它内容）。
    static let maximumParagraphCharacters = 200

    /// 写"AI 怎么理解"用的系统提示词 —— **只给方向清单，不给主 Agent 提示词**。
    ///
    /// 它**不执行任何事**：只输出一两句话，说明"这段话看起来要做哪一类事"。
    static func understandingSystemPrompt(directions: [(id: String, keyword: String, detail: String)],
                                          asksForLabel: Bool = false) -> String {
        var lines: [String] = []
        for direction in directions {
            lines.append("- \(direction.keyword)：\(direction.detail)")
        }
        return """
        你是一个任务方向识别器。用户正在对着一台 Mac 说话，你的唯一任务是：**用一两句话说明你理解他这次想做什么**。

        可能的方向（你可以从中挑，也可以都不挑）：
        \(lines.joined(separator: "\n"))

        规则：
        1. **只写理解**，不要执行任何事、不要回答问题、不要给步骤、不要写代码；
        2. **一两句话，不超过 \(maximumParagraphCharacters) 字**，说清"他要做什么"，不要复述他的原话；
        3. 用中文写（他说英文就用英文）；
        4. 直接给那句话，不要加任何前缀、标题、引号或 Markdown。
        """ + (asksForLabel ? """

        \(labelLineInstruction)

        ⚠️ 这一次带了**屏幕截图**：请**看图**再回答，并在上面那句话里直接给出你的判断/答案
        （比如这道题你选哪个、这几个人是哪几个）。
        """ : "")
    }

    /// 带**屏幕参考**时额外要的一样东西：一个不超过 7 个字的"这次是什么类型的任务"。
    ///
    /// 用户 2026-09-27 的数学题那个例子：「屏幕上有一道数学题，有 A、B、C、D 四个选项，用户说
    /// 「参考屏幕内容，分析一下这道题可能选哪一个」……**这个结果对应的预设类型就一个**，
    /// 因为结果是固定的，比如这道题应该选 A，那结果就是固定的。」
    /// —— 所以那个答案本身要变成一个能点选的"类型"。
    static let labelLineInstruction = "类型：<不超过 7 个字，这次是什么类型的任务；例如「选 A」「挑三个人」>"

    /// 从带屏幕参考的那次回复里把类型标签抽出来（没有就返回 nil）。
    static func parseLabelLine(_ raw: String) -> String? {
        for rawLine in raw.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
            line = line.replacingOccurrences(of: "：", with: ":")
            let prefixes = ["类型:", "任务类型:"]
            for prefix in prefixes where line.hasPrefix(prefix) {
                var value = String(line.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
                while let first = value.first, "#*`\"「」 ".contains(first) { value.removeFirst() }
                while let last = value.last, "#*`\"「」 ".contains(last) { value.removeLast() }
                guard !value.isEmpty else { return nil }
                return value.count > 12 ? String(value.prefix(12)) : value
            }
        }
        return nil
    }

    /// 用户消息：**用户说的话 +（上一次的理解，供保持连续）**。
    static func understandingUserPrompt(transcript: String, previousReading: String) -> String {
        var sections: [String] = []
        sections.append("""
        用户到目前为止说的话：
        \(transcript)
        """)
        let previous = previousReading.trimmingCharacters(in: .whitespacesAndNewlines)
        if !previous.isEmpty {
            sections.append("""
            这是你上一次（几秒前）的理解，供你保持连续；如果他没说什么新的，就沿用：
            \(previous)
            """)
        }
        return sections.joined(separator: "\n\n")
    }

    /// 把模型回的那段收拾干净（去空白、去引号、限长）。
    static func cleanParagraph(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = text.first, "#*`\"'「」 ".contains(first) { text.removeFirst() }
        while let last = text.last, "#*`\"'「」 ".contains(last) { text.removeLast() }
        text = text.replacingOccurrences(of: "\n", with: " ")
        if text.count > maximumParagraphCharacters {
            text = String(text.prefix(maximumParagraphCharacters))
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 提交时**加在用户提示词前面**的那几行；没有东西可加时返回 `nil`。
    ///
    /// 用户定的形状：「将记录内容作为标签追加到用户提示词的前一行，格式为
    /// 「用户真实意图的任务方向是：XXX」，下方再接用户原始提示词」。
    /// **只写点过确认的**（没点的、点否认的都不写；输入框那片空白也整段不出现）。
    static func decoration(confirmedDirectionTexts: [String], typedInput: String) -> String? {
        var lines: [String] = []
        for text in confirmedDirectionTexts {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            // 已经带着前缀的那条（"用户确认的任务理解是：…"）原样用。
            if trimmed.hasPrefix("用户确认的任务理解是：") {
                lines.append(trimmed)
            } else {
                lines.append("用户真实意图的任务方向是：\(trimmed)")
            }
        }
        let trimmedInput = typedInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedInput.isEmpty {
            lines.append("用户的补充说明是：\(trimmedInput)")
        }
        guard !lines.isEmpty else { return nil }
        return lines.joined(separator: "\n")
    }
}
