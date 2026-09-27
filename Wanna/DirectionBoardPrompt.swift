//
//  DirectionBoardPrompt.swift
//  Wanna
//
//  **「任务方向看板」那一次请求的提示词，与回来的东西怎么解析**（2026-09-27）。
//
//  用户对这一段的要求（原话）：「提示词：与主 Agent 提示词完全相同，以保证 100% 模拟主 Agent
//  的思考方式；额外追加一条提示词，规定如何将理解结果转换为标签形式展示」，以及
//  「输入：录音文件识别出的文本 + 预设关键词」。
//
//  ### 为什么解析写得这么啰嗦
//
//  这一段的失败方式是**静默**的：模型多写一句、少写一行、把冒号写成全角、把整段包进代码块 ——
//  任何一处都可能让"标签"变成正文的一部分或者反过来，而屏幕上只是"字不太对"，没人会立刻发现。
//  所以规则只有一条主线：**认不出来的行一律并进正文**，永远不丢、永远不猜。
//  （同一条原则在 `NotionNoteClient` 那边写着：「切不开时**不猜**：整段原文当成排版块」。）
//
//  纯文本、不碰网络与 UI —— 一个探针就能把每种畸形输入验到底。
//

import Foundation

nonisolated enum DirectionBoardPrompt {

    /// 解析结果：一段说明 + 每一行的标签（行下标 → 标签）。
    struct Reading: Equatable {
        var paragraph: String
        var rowLabels: [Int: String]
    }

    /// 说明最多留这么多字（看板那一块的宽度是固定的，长了会顶掉按钮区）。
    static let maximumParagraphCharacters = 200
    /// 标签最多这么多字 —— 用户明确要求：「注意字数一定要少」。
    ///
    /// ⚠️ **不能取 8**（探针抓到过）：他给的预设短语里「保存到 Notion」是 10 个字、
    /// 「派个 Agent 去做」是 11 个 —— 模型很可能原样回一个预设短语，8 字上限会把
    /// 「保存到 Notion」截成「保存到 Noti」，而那是**静默的**（屏幕上只是少了一个字母）。
    /// 12 覆盖得了全部预设，又仍然够短。
    static let maximumLabelCharacters = 12

    /// 追加在**主 Agent 系统提示词**后面的那一节。
    ///
    /// ⚠️ 它只在**看板那一次请求**里追加（`CompanionManager.directionBoardSystemPrompt`），
    /// **真正回答用户的那一轮不带它** —— 否则模型会以为每次都要写一块看板。
    static let roleInstruction = """
    ## 这一次的额外要求：任务方向看板

    用户按着说话键、正在说他的需求。屏幕右上角有一块「任务方向看板」，要显示**你怎么理解他这次要做的事**。
    请**顺便**把这份理解写出来 —— 它不影响你怎么回答用户，只决定看板上显示什么。

    严格按下面的格式回答，**不要写别的任何东西**，不要用代码块（方向行按下面给你的类别数给，
    最多五行）：

    <<<看板
    说明：<一两句话，说清你以为他要你做什么，不超过 200 字>
    方向1：<第一类的最短标签，不超过 12 个字；这一类不适用就写「无」>
    方向2：<…>
    看板>>>

    四条规矩：
    1. **标签要短**（12 字以内），优先用下面给你的预设短语里的说法；
    2. **哪一类不适用就写「无」**，不要硬凑 —— 看板上**只会显示你写了标签的那几类**，
       写「无」的那一类根本不出现；
    3. 说明里**不要复述**用户原话，写"你理解他要做什么"；
    4. 如果用户**用嘴选了一个方向**（「第二个方向」「关于显示方向的」这种），那个方向也要给标签，
       而且要和用户选的那一类一致（看板那边会按他说的自动选中，两边不能打架）。
    """

    /// 看板那一次请求的用户消息。
    ///
    /// - Parameters:
    ///   - transcriptText: 用户说到现在为止的识别文本。
    ///   - unmatchedRowIndices: **本地关键词没有命中**的行（只有这些行需要模型给标签）。
    ///     命中的行由本地匹配决定，模型写什么都不会被采用 —— 那正是用户说的「预设关键词作为首选」。
    static func requestUserMessage(transcriptText: String,
                                   unmatchedRowIndices: [Int],
                                   configuration: DirectionBoardConfiguration,
                                   previousReading: String? = nil) -> String {
        var sections: [String] = []

        sections.append("""
        用户到目前为止说的话：
        <transcript>
        \(transcriptText)
        </transcript>
        """)

        // **上一次的判断结论**（用户 2026-09-27：「咱们的提示词是 3 秒发动一次，而且每一次都是
        // 全新的内容，所以要包含上一次的方向，最好是这样的：上一次的判断结论，AI 判断出来的结论」）。
        // 整段回给他、不省字段：省了字段就得再写一套提取规则，而这是模型自己的话，它读得懂。
        if let previousReading, !previousReading.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            sections.append("""
            这是你上一次（几秒前）对同一件事的判断，供你保持连续：
            <previous_reading>
            \(previousReading)
            </previous_reading>

            如果用户这几秒里没有说新的方向，就沿用上面的判断；说了新的，以新的为准。
            """)
        }

        // 把六个预设短语告诉模型，是为了让它的用词与看板上的固定短语保持一致（用户要的
        // 「优先考虑显示在对应的行和位置」）。
        var vocabularyLines: [String] = []
        for (rowIndex, row) in configuration.rows.enumerated() {
            let phrases = row.buttons.map(\.presetText).joined(separator: " ｜ ")
            vocabularyLines.append("方向\(rowIndex + 1)（\(row.title)）：\(phrases)")
        }
        sections.append("""
        看板上的六个方向（用词请尽量与它们一致）：
        \(vocabularyLines.joined(separator: "\n"))
        """)

        if unmatchedRowIndices.isEmpty {
            sections.append("这几类本地都已经对上了，**只需要写「说明」那一行**，方向行一律写「无」。")
        } else {
            let list = unmatchedRowIndices.map { "方向\($0 + 1)" }.joined(separator: "、")
            sections.append("""
            本地关键词只对上了其余几行；**需要你判断的只有 \(list)**（其余方向行写「无」）。
            """)
        }
        return sections.joined(separator: "\n\n")
    }

    /// 把模型回的原文解析成「一段说明 + 每行一个标签」。
    ///
    /// 规则（每一条都有断言）：
    /// 1. 有 `<<<看板` / `看板>>>` 就只取中间那一段，没有就把整段当正文；
    /// 2. 每一行去掉行首的 `#`/`*`/`-`/反引号与空格，把全角冒号换成半角；
    /// 3. 只认 `说明:` 与 `方向1:`…`方向3:` 开头的行；值取**第一个冒号之后**的全部；
    /// 4. 同一个键出现两次时**先到的算**（模型把某一行重说一遍，不能覆盖它先说的那句）；
    /// 5. 值为「无 / none / - / 空」= 这一行没有标签；
    /// 6. **其余每一行都并进说明** —— 多写的、少写的、被截断的，都不会被丢掉或被当成标签；
    /// 7. 一条都没解析出来（`raw` 完全不成形）时返回**空说明**，调用方保留上一次的说明。
    static func parseResponse(_ raw: String) -> Reading {
        let body = sentinelBody(of: raw)
        var paragraphLines: [String] = []
        var rowLabels: [Int: String] = [:]
        var paragraph = ""

        for rawLine in body.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = normalizedLine(String(rawLine))
            guard !line.isEmpty else { continue }

            guard let (key, value) = field(of: line) else {
                paragraphLines.append(line)
                continue
            }
            switch key {
            case "说明":
                if paragraph.isEmpty { paragraph = value }
                else { paragraphLines.append(value) }
            case "方向1", "方向2", "方向3", "方向4", "方向5":
                guard let rowIndex = Int(key.dropFirst(2)).map({ $0 - 1 }),
                      (0..<DirectionBoardConfiguration.maximumRowCount).contains(rowIndex),
                      rowLabels[rowIndex] == nil else { continue }
                if let label = label(from: value) { rowLabels[rowIndex] = label }
            default:
                paragraphLines.append(line)
            }
        }

        var assembled = ([paragraph] + paragraphLines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        if assembled.count > maximumParagraphCharacters {
            assembled = String(assembled.prefix(maximumParagraphCharacters))
        }
        return Reading(paragraph: assembled, rowLabels: rowLabels)
    }

    /// 提交时**加在用户提示词前面**的那几行；没有东西可加时返回 `nil`。
    ///
    /// 形状（用户定的）：「将记录内容作为标签追加到用户提示词的前一行，格式为
    /// 「用户真实意图的任务方向是：XXX」，下方再接用户原始提示词」。
    ///
    /// - Note: 只写**点过确认**的那几条；点否认的不追加，没点过的不追加（用户：「用户未点击 →
    ///   忽略，不追加任何内容」）。顺序固定：行优先、同行按列，最后是输入框里那句补充。
    static func decoration(confirmedDirectionTexts: [String], typedInput: String) -> String? {
        var lines: [String] = []
        for text in confirmedDirectionTexts {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            lines.append("用户真实意图的任务方向是：\(trimmed)")
        }
        let trimmedInput = typedInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedInput.isEmpty {
            lines.append("用户的补充说明是：\(trimmedInput)")
        }
        guard !lines.isEmpty else { return nil }
        return lines.joined(separator: "\n")
    }

    // MARK: - 内部

    /// 有哨兵就取哨兵之间，没有就当整段。
    ///
    /// 哨兵**之外**的文字（模型爱写「好的，我来分析一下」）是前言，不并进说明 ——
    /// 「认不出来的行并进正文」那条规矩管的是**块内**的行。块外是另一件事：
    /// 它是"模型在说话"，不是"你看板该显示的内容"。
    private static func sentinelBody(of raw: String) -> String {
        let openingMarker = "<<<看板"
        let closingMarker = "看板>>>"
        guard let openingRange = raw.range(of: openingMarker) else { return raw }
        let afterOpening = raw[openingRange.upperBound...]
        guard let closingRange = afterOpening.range(of: closingMarker) else { return String(afterOpening) }
        return String(afterOpening[..<closingRange.lowerBound])
    }

    /// 去掉行首装饰、统一冒号。
    private static func normalizedLine(_ rawLine: String) -> String {
        var line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = line.first, "#*-—•`> \t".contains(first) {
            line.removeFirst()
            line = line.trimmingCharacters(in: .whitespaces)
        }
        line = line.replacingOccurrences(of: "：", with: ":")
        // 行尾的反引号与星号也去掉（模型爱把值包在 `` 或 ** 里）。
        while let last = line.last, "`*".contains(last) {
            line.removeLast()
            line = line.trimmingCharacters(in: .whitespaces)
        }
        return line
    }

    /// 这一行是不是一个字段；是就返回（键, 值）。
    ///
    /// 键在比较前要把 `*` 与反引号也去掉 —— 模型很爱写 `**说明**：…` 或 `说明**：…`，
    /// 那一行的**行首**没有星号可剥（剥的是行尾那一步），于是键会变成 `说明**`、
    /// 整行落进正文（探针抓到过）。所以"合法键"要按**去掉装饰后**的样子判。
    private static func field(of line: String) -> (key: String, value: String)? {
        guard let colonIndex = line.firstIndex(of: ":") else { return nil }
        let rawKey = String(line[line.startIndex..<colonIndex])
        let key = rawKey.filter { !"*` 　".contains($0) }
        let value = String(line[line.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)
        let knownKeys = ["说明", "方向1", "方向2", "方向3", "方向4", "方向5"]
        guard knownKeys.contains(key) else { return nil }
        return (key, value)
    }

    /// 值能不能当一个标签。
    private static func label(from value: String) -> String? {
        var text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = text.first, "`*\"'「」".contains(first) { text.removeFirst() }
        while let last = text.last, "`*\"'「」".contains(last) { text.removeLast() }
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let negativeValues = ["无", "没有", "none", "-", "—", "n/a", "不适用"]
        guard !text.isEmpty, !negativeValues.contains(text.lowercased()) else { return nil }
        if text.count > maximumLabelCharacters {
            text = String(text.prefix(maximumLabelCharacters))
        }
        return text
    }
}
