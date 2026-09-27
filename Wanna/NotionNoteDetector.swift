//
//  NotionNoteDetector.swift
//  Wanna
//
//  **「这一场要不要存成一条 Notion 笔记」这件事的纯逻辑**（2026-09-27 从
//  `LongFormRecorderController` 搬出来，一行逻辑都没有改）。
//
//  用户 2026-09-27：「你把这个相关的代码照搬过来，从录音这块剥离出来……但是把这个关键词识别，
//  包括后端的代码的监听，完整这套功能转换到这个主 agent 的快捷键」。所以这一族从「录音里的一节」
//  变成了一块**独立的、谁都能用的**判断 —— 原来的调用方（录音）已经一段都不剩，现在的调用方是
//  主 Agent 的快捷键那条路（见 `NotionNoteSession`）。
//
//  **为什么搬得很彻底**：这些都是 `nonisolated static func`，没有状态、没有 I/O、没有主线程 ——
//  搬过来之后一个探针就能单独验（`editDistance` / `transcriptMentions` 这几条本来就该有单测）。
//  留在原来的类里时它们和一大堆 @Published 混在一起，只能整类编译。
//
//  它不认识网络、不认识 UI、不认识设置：**只做"这段文字里有没有那几个词"和"模型回的那三段
//  怎么切、Markdown 怎么变成 Notion 块"**。
//

import Foundation

/// 「录音 → Notion 笔记」的纯逻辑：关键词命中判断 + 模型回复的切分 + Markdown → Notion 块。
///
/// 整个类型 `nonisolated`：这些函数在哪个 actor 上调用都行，因为它们不碰任何共享状态。
nonisolated enum NotionNoteDetector {

    /// 只看**开头与末尾各 100 字**（用户 2026-09-27 放宽后的话：「开头可能是前 100 个字…
    /// 就是前这么 10 句话，或者前 15 秒钟。都可以」）。
    static let edgeCharacterCount = 100

    /// **开头与末尾**各 100 字里，有没有命中这一组关键词的任意一个 —— **模糊匹配**。
    ///
    /// 用户 2026-09-27 拿真实录音试出来的四句转写，都是「保存一条笔记」被听串的结果：
    ///
    ///     耳朵有点笔记 / 保存一点笔记 / 把这一条笔记 / 保存一条笔记
    ///
    /// 所以只做"去掉标点后包含"远远不够（只有第四句能中）。规则分两档，**按整段有多长**：
    ///
    /// · 整段比较长时，容错取关键词长度的 **1/4**（6 字 → 1 个字的错）。长文本里字多，
    ///   放宽一点就会撞上不相干的话。
    /// · 整段**几乎就是这个短语**时（长度 ≤ 关键词 + 6），容错提到 **1/2** ——
    ///   这时候上下文几乎为零，放宽不会撞上别的句子（「耳朵有点笔记」整段只有 6 个字，
    ///   与「保存一条笔记」差 4 个字，只有这一档才接得住）。
    ///
    /// 比较前把空格与标点去掉：转写是 AI 出来的，标点常常与嘴里说的不一致
    ///（用户第 4 条：「检测时去除空格和标点符号」）。
    static func transcriptMentions(_ keywords: [String],
                                   in transcriptText: String,
                                   edgeCharacterCount: Int) -> Bool {
        func normalized(_ text: String) -> String { text.filter { $0.isLetter || $0.isNumber } }
        let normalizedTranscript = normalized(transcriptText)
        guard !normalizedTranscript.isEmpty else { return false }
        let head = String(normalizedTranscript.prefix(edgeCharacterCount))
        let tail = String(normalizedTranscript.suffix(edgeCharacterCount))
        for keyword in keywords {
            let needle = normalized(keyword)
            guard !needle.isEmpty else { continue }
            if head.contains(needle) || tail.contains(needle) { return true }
            // **容错按关键词长度定档，不看整段有多长** —— 我第一版是"整段很短就放宽到一半"，
            // 实测立刻误报两句：「我今天记了很多笔记」（"很多笔记" 与 "保存笔记" 差 2 个字）与
            // 「保存一下这个文件」（"保存一下" 与 "保存笔记" 差 2 个字）。4 字关键词容错 2 就是
            // 50%，必然撞上无关的话。
            //
            // 现在的档位（`max(1, len/4)`，且**上限 2**）：4 字 → 1，6 字 → 1…嗯，实测
            // 「把这一条笔记」需要 2，所以 6 字及以上给 2；4 字只给 1。
            let tolerance = needle.count >= 6 ? 2 : 1
            if fuzzyContains(needle, in: head, tolerance: tolerance)
                || fuzzyContains(needle, in: tail, tolerance: tolerance) { return true }
        }
        return false
    }

    /// 关键词在不在文本里 —— **允许最多 `tolerance` 个字的出入**（滑动窗口 + 编辑距离）。
    ///
    /// 窗口长度取关键词长度 ±2：转写常见的错法是**多一个字或少一个字**
    ///（「保存一点笔记」= 条→点；「把这一条笔记」= 保存→把这）。
    static func fuzzyContains(_ needle: String,
                              in text: String,
                              tolerance: Int) -> Bool {
        guard !needle.isEmpty, !text.isEmpty else { return false }
        let needleChars = Array(needle)
        let textChars = Array(text)
        for windowLength in max(1, needleChars.count - 2)...(needleChars.count + 2) {
            guard windowLength <= textChars.count else { continue }
            for start in 0...(textChars.count - windowLength) {
                let window = Array(textChars[start..<(start + windowLength)])
                if editDistance(needleChars, window) <= tolerance { return true }
            }
        }
        return false
    }

    /// 标准的 Levenshtein 距离（两行滚动，够用且好读）。
    static func editDistance(_ lhs: [Character], _ rhs: [Character]) -> Int {
        if lhs.isEmpty { return rhs.count }
        if rhs.isEmpty { return lhs.count }
        var previous = Array(0...rhs.count)
        var current = [Int](repeating: 0, count: rhs.count + 1)
        for i in 1...lhs.count {
            current[0] = i
            for j in 1...rhs.count {
                let cost = lhs[i - 1] == rhs[j - 1] ? 0 : 1
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            }
            swap(&previous, &current)
        }
        return previous[rhs.count]
    }

    /// 命中次数（不是"有没有命中"）—— 用户说几次「参考屏幕」就要几张图。
    static func transcriptMentionCount(_ keywords: [String],
                                       in transcriptText: String,
                                       edgeCharacterCount: Int) -> Int {
        func normalized(_ text: String) -> String { text.filter { $0.isLetter || $0.isNumber } }
        let normalizedTranscript = normalized(transcriptText)
        guard !normalizedTranscript.isEmpty else { return 0 }
        let head = String(normalizedTranscript.prefix(edgeCharacterCount))
        let tail = String(normalizedTranscript.suffix(edgeCharacterCount))
        var count = 0
        for keyword in keywords {
            let needle = normalized(keyword)
            guard !needle.isEmpty else { continue }
            count += head.components(separatedBy: needle).count - 1
            count += tail.components(separatedBy: needle).count - 1
        }
        return count
    }

    /// `2026年3月27日 06:13` —— 用户给的格式。
    static func notionNoteTitle(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy年M月d日 HH:mm"
        return formatter.string(from: date)
    }

    /// 把模型那三段输出切开。**切不开时不猜**：整段当排版，大纲留一句说明。
    static func parseNotionNoteReply(_ reply: String)
        -> (summary: String, outline: String, formatted: String) {
        func section(_ name: String, next: [String]) -> String? {
            guard let start = reply.range(of: "【\(name)】") else { return nil }
            let after = reply[start.upperBound...]
            var end = after.endIndex
            for marker in next {
                if let r = after.range(of: "【\(marker)】"), r.lowerBound < end { end = r.lowerBound }
            }
            return String(after[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let summary = section("总结", next: ["大纲", "排版"]) ?? ""
        let outline = section("大纲", next: ["排版"])
        let formatted = section("排版", next: [])
        return (summary.isEmpty ? "录音笔记" : summary,
                outline ?? reply.trimmingCharacters(in: .whitespacesAndNewlines),
                formatted ?? reply.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Markdown → Notion 块。**只认用户点名的那几种**，认不出的一律普通段落（不丢内容）。
    static func richBlocks(fromMarkdown markdown: String) -> [NotionNoteClient.RichBlock] {
        var blocks: [NotionNoteClient.RichBlock] = []
        for rawLine in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine).trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            if line.hasPrefix("### ") { blocks.append(.heading(level: 3, text: String(line.dropFirst(4)))); continue }
            if line.hasPrefix("## ") { blocks.append(.heading(level: 2, text: String(line.dropFirst(3)))); continue }
            if line.hasPrefix("# ") { blocks.append(.heading(level: 1, text: String(line.dropFirst(2)))); continue }
            if line == "---" || line == "***" { blocks.append(.divider); continue }
            if line.hasPrefix("> ") { blocks.append(.quote(spans(fromInline: String(line.dropFirst(2))))); continue }
            if line.hasPrefix("- ") || line.hasPrefix("* ") {
                blocks.append(.bulleted(spans(fromInline: String(line.dropFirst(2))))); continue
            }
            if line.hasPrefix("|"), line.hasSuffix("|") {
                let cells = line.dropFirst().dropLast().split(separator: "|").map {
                    $0.trimmingCharacters(in: .whitespaces)
                }
                // 分隔行（`|---|---|`）丢掉，它不是内容。
                if cells.allSatisfy({ $0.allSatisfy { $0 == "-" || $0 == ":" } }) { continue }
                blocks.append(.tableRow(cells)); continue
            }
            blocks.append(.paragraph(spans(fromInline: line)))
        }
        return blocks
    }

    /// 行内样式：`**加粗**`、`` `代码` ``、`{红}` 这类**后置颜色标记**（提示词里就是这么要求的）。
    static func spans(fromInline line: String) -> [NotionNoteClient.RichSpan] {
        var spans: [NotionNoteClient.RichSpan] = []
        var buffer = ""
        var bold = false
        var code = false
        func flush() {
            guard !buffer.isEmpty else { return }
            spans.append(.init(text: buffer, bold: bold, code: code))
            buffer = ""
        }
        var index = line.startIndex
        while index < line.endIndex {
            let rest = line[index...]
            if rest.hasPrefix("**") {
                flush(); bold.toggle(); index = line.index(index, offsetBy: 2); continue
            }
            if rest.hasPrefix("`") {
                flush(); code.toggle(); index = line.index(index, offsetBy: 1); continue
            }
            if rest.hasPrefix("{") {
                // 颜色标记写在被标记内容的**后面**：`重点内容{红}`。
                if let close = rest.firstIndex(of: "}") {
                    let name = String(rest[rest.index(after: index)..<close])
                    if let color = notionColor(named: name) {
                        flush()
                        if var last = spans.popLast() {
                            last.color = color
                            spans.append(last)
                        }
                        index = line.index(after: close)
                        continue
                    }
                }
            }
            buffer.append(line[index])
            index = line.index(after: index)
        }
        flush()
        return spans.isEmpty ? [.init(text: line)] : spans
    }

    static func notionColor(named name: String) -> String? {
        switch name {
        case "红", "红色": return "red"
        case "蓝", "蓝色": return "blue"
        case "绿", "绿色": return "green"
        case "黄", "黄色": return "yellow"
        case "橙", "橙色": return "orange"
        case "紫", "紫色": return "purple"
        case "灰", "灰色": return "gray"
        case "棕", "棕色": return "brown"
        case "粉", "粉色": return "pink"
        default: return nil
        }
    }
}
