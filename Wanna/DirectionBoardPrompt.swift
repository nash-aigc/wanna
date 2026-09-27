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

    /// **卡片上固定显示的四行，顺序也是固定的**（用户 2026-09-27 定）。
    ///
    /// 用户的原话：「把顺序调一下。结果肯定显示在这个位置上不变，然后下边这四行：第一行是
    /// **目标或问题**，就写「目标问题」；第二行是**类型**；第三行是**内容参考**，或者叫**参考**，
    /// 也就是左边这个标题，**它就是两个字**；最后一行是**细节**。」
    ///
    /// ⚠️ **为什么要固定**（同一句里说的）：「他回复结果的时候**总是跳、总是蹦**……因为他回复的
    /// 内容有时候有软件目标细节，有时候没有，就是突然间有、突然间没有……这几行固定在这，
    /// 而不是突然间有、突然间没有，这对体验影响太差了。」所以这四行**永远画出来**，
    /// 模型没给内容的那一行显示占位符，而不是整行消失 —— 卡片的每一段高度于是恒定。
    static let understandingLabels = ["目标问题", "类型", "参考", "细节"]

    /// 每一行认哪些标签（**第一个是正式名字**，其余是模型爱写的同义说法，一并认）。
    ///
    /// 认老名字是刻意的：模型不一定会照新格式写（实测它经常把 `软件` / `文件` 写在「参考」的位置），
    /// 只认正式名会让那一行的内容掉进正文里 —— 屏幕上就是"这行空了、内容跑到别处"。
    static let understandingLabelAliases: [(label: String, aliases: [String])] = [
        ("目标问题", ["目标问题", "目标", "问题"]),
        ("类型", ["任务类型", "类型"]),
        ("参考", ["内容参考", "参考", "软件", "文件"]),
        ("细节", ["细节", "注意", "备注"]),
    ]

    /// 模型用来表示"这一行没有内容"的写法 —— 一律当成空（占位符由视图画）。
    private static let emptyValueMarkers: Set<String> = ["—", "-", "–", "无", "没有", "暂无", "n/a", "na", "无。"]

    /// **只截断、自己不成行**的标签（它有自己的显示位置）。
    private static let boundaryLabels = ["任务结果"]

    /// 写"AI 怎么理解"用的系统提示词 —— **只给方向清单，不给主 Agent 提示词**。
    ///
    /// 它**不执行任何事**：只输出固定四行，说明"这段话看起来要做哪一类事"。
    static func understandingSystemPrompt(directions: [(id: String, keyword: String, detail: String)],
                                          asksForLabel: Bool = false) -> String {
        var lines: [String] = []
        for direction in directions {
            lines.append("- \(direction.keyword)：\(direction.detail)")
        }
        return """
        你是一个任务方向识别器。用户正在对着一台 Mac 说话，你的任务是两件事：
        **① 用固定的四行说清你理解他这次要做什么；② 如果能立刻算出结果，就把结果直接给出来。**

        可能的方向（你可以从中挑，也可以都不挑）：
        \(lines.joined(separator: "\n"))

        **下面这四行必须每一行都写**（真的没有内容就写一个「—」，**不要整行省略** ——
        这几行在界面上是固定的位置，少写一行会让整块跳动）：

        目标问题：<这次要达成什么 / 用户在问什么，一句话>
        类型：<3~7 个字，这次是什么类型的任务，例如「做题」「整理文件」>
        参考：<这次要看或要动的东西：哪个软件、哪个文件、哪个页面、哪个网站；没有就写「—」>
        细节：<任何需要知道的前提、约束、你注意到的东西；可以多句，也可以写「—」>

        任务结果：<如果你**已经能从屏幕/文字直接算出答案**（例如题目选哪个选项、哪几个人最像），
                  就把结果直接写在这一行；算不出来就整行不写>

        规则：
        1. **只写理解与结果**，不要执行任何事、不要给操作步骤、不要写代码；
        2. 「目标问题」一句话说不完就写「细节」那一行，**不要写成长篇**；
        3. 用中文写（他说英文就用英文）；
        4. 不要加任何别的标题、引号、Markdown 或代码块。
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
    ///
    /// ⚠️ **不能只认行首**：实测模型会把标签写在**同一行**上（
    /// `……并把结论记下来。 类型：做题`）—— 按行首判就永远抽不出来（第一版就是这样，
    /// 临时类型一直是空的）。所以全串搜 `类型：` / `任务类型：`，取**最后一个**（后面那个才是标签）。
    static func parseLabelLine(_ raw: String) -> String? {
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        for prefix in ["任务类型:", "类型:"] {
            guard let range = normalized.range(of: prefix, options: .backwards) else { continue }
            var value = String(normalized[range.upperBound...])
            // 取到行尾或句号为止（标签后面常常还有别的字）。
            for terminator in ["\n", "。", "，", "；", ";"] {
                if let end = value.range(of: terminator) { value = String(value[..<end.lowerBound]) }
            }
            value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            while let first = value.first, "#*`\"「」 ".contains(first) { value.removeFirst() }
            while let last = value.last, "#*`\"「」 ".contains(last) { value.removeLast() }
            value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty, value.count <= 12 else { continue }
            return value
        }
        return nil
    }

    /// 把标签那一截从**显示用的那段话**里去掉（它能读懂题目，但「类型：做题」不该出现在看板上）。
    static func paragraphWithoutLabelLine(_ raw: String) -> String {
        var text = raw
        for prefix in ["任务类型：", "类型：", "任务类型:", "类型:"] {
            if let range = text.range(of: prefix, options: .backwards) {
                text = String(text[..<range.lowerBound])
            }
        }
        return text
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

    /// 结构化理解的**那四行** —— **永远返回四行、顺序固定**（没内容的行值是空串）。
    ///
    /// 用户 2026-09-27：「AI 对任务的理解是有格式的……换行显示，可以显示为多行」，加上后来的
    /// 「这几行固定在这，而不是突然间有、突然间没有」。所以这里的契约是**行的集合恒定**，
    /// 谁有没有内容由值决定 —— 视图据此画占位符，卡片的高度于是不再跳。
    static func parseUnderstandingLines(_ raw: String) -> [(label: String, value: String)] {
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        var found: [String: String] = [:]

        for rawLine in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            for position in labelPositions(in: line) where !position.label.isEmpty {
                let valueStart = line.index(position.start, offsetBy: position.aliasLength + 1)
                let valueEnd = position.valueEnd
                guard valueStart <= valueEnd else { continue }
                let value = normalizedValue(String(line[valueStart..<valueEnd]))
                guard !value.isEmpty, found[position.label] == nil else { continue }
                found[position.label] = value
            }
        }
        // 按用户定的顺序返回，**缺的那些留空串**（不是省略）。
        return understandingLabels.map { ($0, found[$0] ?? "") }
    }

    /// 一行里所有标签的位置，已经去过重叠。
    ///
    /// **「任务结果」也在这里，但它是个"边界标签"**（`label` 为空）：它只负责把前一个值截断，
    /// 自己不出现在四行里 —— 它有自己的那一行（绿框）。少了它，「细节」会把整句
    /// 「…推断。 任务结果：选 A」吞进去，同一句话在看板上出现两遍。
    ///
    /// 「去重叠」也是必须的：`目标问题:` 里同时含 `目标:` 与 `问题:` 两个别名的起点，
    /// 不处理的话那一行会被切出三段、值全是空的（第一版就是这样，那一行的内容整段消失）。
    private static func labelPositions(in line: String)
        -> [(label: String, aliasLength: Int, start: String.Index, valueEnd: String.Index)] {
        var raw: [(label: String, aliasLength: Int, start: String.Index)] = []
        for (label, aliases) in understandingLabelAliases {
            for alias in aliases {
                var searchStart = line.startIndex
                while let range = line.range(of: alias + ":", range: searchStart..<line.endIndex) {
                    raw.append((label, alias.count, range.lowerBound))
                    searchStart = range.upperBound
                }
            }
        }
        for boundary in boundaryLabels {
            var searchStart = line.startIndex
            while let range = line.range(of: boundary + ":", range: searchStart..<line.endIndex) {
                raw.append(("", boundary.count, range.lowerBound))
                searchStart = range.upperBound
            }
        }
        // 位置相同或**落在前一个标签里面**的，只留最长的那个别名。
        var accepted: [(label: String, aliasLength: Int, start: String.Index)] = []
        for position in raw.sorted(by: { lhs, rhs in
            lhs.start == rhs.start ? lhs.aliasLength > rhs.aliasLength : lhs.start < rhs.start
        }) {
            if let last = accepted.last,
               position.start < line.index(last.start, offsetBy: last.aliasLength) { continue }
            accepted.append(position)
        }
        // 每一段的值 = 从标签后面到**下一个标签之前**（同一行里模型常把几行挤在一起）。
        return accepted.enumerated().map { index, position in
            let valueEnd = index + 1 < accepted.count ? accepted[index + 1].start : line.endIndex
            return (position.label, position.aliasLength, position.start, valueEnd)
        }
    }

    /// 「—」「无」这类占位一律当成空（占位符由视图统一画，模型写的不算内容）。
    private static func normalizedValue(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return emptyValueMarkers.contains(trimmed.lowercased()) ? "" : trimmed
    }

    /// 结构化那几行**之外**的正文（模型在标签前后还写了别的话时，留在「细节」里展示）。
    ///
    /// 挖的范围是「标签 → 该行行尾」：一行的内容本来就归那个标签，剩下的才是正文。
    static func leftoverParagraphText(_ raw: String) -> String {
        let text = raw
        var ranges: [Range<String.Index>] = []
        for (_, aliases) in understandingLabelAliases {
            for alias in aliases {
                for colon in ["：", ":"] {
                    guard let range = text.range(of: alias + colon) else { continue }
                    let lineEnd = text[range.upperBound...].firstIndex(of: "\n") ?? text.endIndex
                    ranges.append(range.lowerBound..<lineEnd)
                }
            }
        }
        // **「任务结果」那一段整段挖掉**（它是四段里的第二段，已经有自己的绿框了）。
        for prefix in ["任务结果：", "任务结果:"] {
            guard let range = text.range(of: prefix) else { continue }
            let lineEnd = text[range.upperBound...].firstIndex(of: "\n") ?? text.endIndex
            ranges.append(range.lowerBound..<lineEnd)
        }
        // **按"保留没被覆盖的字"来拼，而不是删区间**：别名之间会互相嵌套
        //（`内容参考:` 里面就含 `参考:`），删区间时后一个会把前一个的终点带跑，
        // 拿着过期的上界去 `removeSubrange` 会**直接崩**（2026-09-27 真的把测试进程崩掉了）。
        var kept = ""
        var cursor = text.startIndex
        for range in ranges.sorted(by: { $0.lowerBound < $1.lowerBound }) {
            guard range.lowerBound >= cursor else { continue }   // 被前一段包住 → 跳过
            kept += text[cursor..<range.lowerBound]
            cursor = range.upperBound
        }
        kept += text[cursor...]
        return kept.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// **任务结果**那一行（模型能直接算出来才有）。
    ///
    /// 用户 2026-09-27：「如果用户的问题很明确，让他去判断哪一个选项，他不仅理解，不仅有任务方向，
    /// 还要补充一个**任务结果**……如果他马上就能通过 AI 算出任务结果，就直接把任务结果发给用户。」
    static func parseTaskResult(_ raw: String) -> String? {
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        guard let range = normalized.range(of: "任务结果:", options: .backwards) else { return nil }
        // **结果可能续到下一行**（实测模型写成「任务结果：选」+ 换行 +「A」）—— 所以取到
        // 空行、或下一个"标签行"为止，最多两行。
        var collected: [String] = []
        for rawLine in String(normalized[range.upperBound...]).split(separator: "\n",
                                                                    omittingEmptySubsequences: false) {
            let line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { break }
            let knownLabels = ["软件:", "文件:", "目标:", "类型:", "细节:", "任务结果:"]
            if !collected.isEmpty, knownLabels.contains(where: { line.hasPrefix($0) }) { break }
            collected.append(line)
            if collected.count >= 2 { break }
        }
        var value = collected.joined(separator: " ")
        value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = value.first, "#*`\"「」 ".contains(first) { value.removeFirst() }
        while let last = value.last, "#*`\"".contains(last) { value.removeLast() }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty, cleaned.count <= 60 else { return nil }
        return cleaned
    }

    /// 模型回的那段**原文**：只做必要的收拾，**不截断**。
    ///
    /// ⚠️ 这里原来是直接把 `cleanParagraph`（**200 字上限**）用在原文上，而那段"上限"是给
    /// **显示**用的 —— 于是解析（`parseUnderstandingLines` / `parseTaskResult`）拿到的是一段
    /// **已经被砍掉尾巴**的文本：五行加起来很容易超过 200 字，屏幕上就是「细节」那行写到一半
    /// 突然断在「题目在屏幕右」（2026-09-27 实测截图，用户要的是完整的多行理解）。
    /// 所以截断只能发生在**显示那一步**（`self.paragraph`），原文一律留着 —— 四个上限
    /// （五个标签 + 任务结果）都得从完整文本里切。
    static func cleanRawResponse(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = text.first, "#*`\"' ".contains(first) { text.removeFirst() }
        while let last = text.last, "#*`\"'".contains(last) { text.removeLast() }
        // 只防病态长度（模型偶尔会绕圈子写上一大篇），不是显示上限。
        if text.count > maximumRawResponseCharacters {
            text = String(text.prefix(maximumRawResponseCharacters))
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 原文的兜底上限（远大于任何正常的五行理解）。
    static let maximumRawResponseCharacters = 4000

    /// 把模型回的那段收拾干净（去空白、去引号、限长）—— **只用于显示**。
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
