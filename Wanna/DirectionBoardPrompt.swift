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
        你是一个任务方向识别器。用户正在对着一台 Mac 说话，你的任务是两件事：
        **① 用固定的几行说清你理解他这次要做什么；② 如果能立刻算出结果，就把结果直接给出来。**

        可能的方向（你可以从中挑，也可以都不挑）：
        \(lines.joined(separator: "\n"))

        严格按这几行回答（没有内容的行就整行不写，**不要写"无"**）：

        软件：<涉及哪个应用/网站/工具；没有就不写这一行>
        文件：<涉及哪个文件/文件夹/页面；没有就不写这一行>
        目标：<这次要达成什么，一句话>
        类型：<3~7 个字，这次是什么类型的任务，例如「做题」「整理文件」>
        细节：<任何需要知道的前提、约束、你注意到的东西；可以多句>

        任务结果：<如果你**已经能从屏幕/文字直接算出答案**（例如题目选哪个选项、哪几个人最像），
                  就把结果直接写在这一行；算不出来就整行不写>

        规则：
        1. **只写理解与结果**，不要执行任何事、不要给操作步骤、不要写代码；
        2. 「目标」一句话说不完就写「细节」那几行，**不要写成长篇**；
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

    /// 结构化理解的**那几行**（软件/文件/目标/类型/细节）—— 按用户要的顺序、多行显示。
    ///
    /// 用户 2026-09-27：「AI 对任务的理解是有格式的，比如**软件是什么、文件是什么、目标是什么、
    /// 类型是什么、细节是什么**，换行显示，可以显示为多行。」
    static func parseUnderstandingLines(_ raw: String) -> [(label: String, value: String)] {
        let labels = ["软件", "文件", "目标", "类型", "细节"]
        // **「任务结果」也是一条边界**：它有一套自己的显示位置（四段里的第二段），不属于"理解"。
        // 少了这一步，「细节」会把「任务结果:选 A（…）」整段吞进去，于是同一句话在看板上出现两遍
        // —— 绿框里一次、「细节」那行末尾又一次（2026-09-27 实测截图，用户要的是四段分明）。
        // 注意「任务类型」也要算边界，否则「类型」会在它中间匹配上（`任务类型:做题` → 值里留个「任务」）。
        let boundaryLabels = labels + ["任务结果", "任务类型"]
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        // ⚠️ **不能只按换行切**：实测模型会把五行**写在同一行**里
        //（「软件:X 文件:Y 目标:Z 类型:做题 细节:…」）—— 只认行首的话，除了第一行全都留在正文里，
        // 屏幕上就是"一整段没排版"（第一次实测就是这样）。
        // 所以先按换行切，再在每一行里**按标签位置切**。
        var results: [(String, String)] = []
        for rawLine in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            // 找出这一行里所有 "标签:" 的位置（含那些只用来**截断**、自己不出现在结果里的边界标签）。
            var positions: [(label: String, start: String.Index)] = []
            for label in boundaryLabels {
                var searchStart = line.startIndex
                while let range = line.range(of: label + ":", range: searchStart..<line.endIndex) {
                    positions.append((label, range.lowerBound))
                    searchStart = range.upperBound
                }
            }
            positions.sort { $0.start < $1.start }
            for (index, position) in positions.enumerated() {
                // 边界标签只负责把前一个值截断，自己不产出理解行。
                guard labels.contains(position.label) else { continue }
                let valueStart = line.index(position.start, offsetBy: position.label.count + 1)
                // `max(valueStart, …)`：边界标签可能**嵌在**另一个标签里（`任务类型:` 里的 `类型:`），
                // 这时下一个位置会落在 valueStart 之前 —— 直接用会得到一个无效区间（崩溃）。
                let valueEnd = index + 1 < positions.count
                    ? max(positions[index + 1].start, valueStart)
                    : line.endIndex
                let value = String(line[valueStart..<valueEnd])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !value.isEmpty, !results.contains(where: { $0.0 == position.label }) else { continue }
                results.append((position.label, value))
            }
        }
        // 按固定顺序返回（模型写乱了也照用户的顺序显示）。
        return labels.compactMap { label in results.first { $0.0 == label } }
    }

    /// 结构化那几行**之外**的正文（模型在标签前后还写了别的话时，留在「细节」里展示）。
    static func leftoverParagraphText(_ raw: String,
                                      structuredLines: [(label: String, value: String)]) -> String {
        var text = raw
        for line in structuredLines {
            for colon in ["：", ":"] {
                if let range = text.range(of: line.label + colon) {
                    // 把「标签:值」整段去掉（值可能是它到行尾/下一个标签之前的那一段）。
                    let valueEnd = text.index(range.lowerBound, offsetBy: line.label.count + 1 + line.value.count)
                    text.removeSubrange(range.lowerBound..<min(valueEnd, text.endIndex))
                }
            }
        }
        // **「任务结果」那一段整段挖掉**（它是四段里的第二段，已经有自己的绿框了）。
        // 原来这里是 `replacingOccurrences(of: "任务结果", with: "")` —— 只把那四个字换成空串，
        // 正文里于是留下一个孤零零的「:选 A（…）」（2026-09-27 实测截图）。
        for prefix in ["任务结果：", "任务结果:", "任务类型：", "任务类型:"] {
            if let range = text.range(of: prefix) {
                let lineEnd = text[range.upperBound...].firstIndex(of: "\n") ?? text.endIndex
                text.removeSubrange(range.lowerBound..<lineEnd)
            }
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
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
