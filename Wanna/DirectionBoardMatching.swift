//
//  DirectionBoardMatching.swift
//  Wanna
//
//  **「这一轮该显示哪几条方向」的全部判定**（2026-09-27 第三版：清单 + JEV）。
//
//  三种来源合到一起（用户的设计）：
//  1. **本地关键词命中** —— 免费、瞬时（识别文本里出现了某个方向的关键词就点亮它）；
//  2. **Jev 决策模型给的 P(是)**（`JevDecisionClient`）—— 用户点名要的"概率估计，
//     把高概率的内容显示出来"，而且它便宜到可以每 3 秒问一次；
//  3. **模型口述出来的新方向** —— 用户说过、清单里没有的，追加进清单（见 `TaskDirectionStore`）。
//
//  纯逻辑、不碰网络与 UI —— 一个探针就能把每条规则验到底。
//

import Foundation

/// 看板上**一格**：一条方向 + 它在屏幕上的编号。
nonisolated struct DirectionBoardDisplayItem: Equatable {
    /// 对应 `TaskDirection.id`（稳定，改关键词也不会丢选择状态）。
    let directionID: String
    /// 这一格显示的文字（关键词）。
    let keyword: String
    /// 屏幕上的编号，**从 1 开始、连续**（用户说「第三个方向」指的就是它）。
    let number: Int
    /// 它是怎么被选中的（只用于日志与断言）。
    let reason: Reason

    enum Reason: String, Equatable {
        /// 本地关键词命中（免费的那条路）。
        case localKeyword
        /// Jev 判断的概率过了阈值。
        case jevProbability
    }
}

nonisolated enum DirectionBoardMatching {

    /// **本地匹配**：识别文本里出现某个方向的关键词就命中（免费，优先）。
    ///
    /// 规则与第一版一致：比较前只留字母与数字（标点空格去掉）；先精确子串，再对 **4 字及以上**的
    /// 关键词做模糊匹配（容错按长度定档：≥6 字给 2、4~5 字给 1）。**3 字及以下只认精确** ——
    /// 短关键词给容错会误命中（第一版实测：「帮我**点一下**」命中了「**存一下**」）。
    nonisolated static func locallyMatchedKeywords(transcriptText: String,
                                                    directions: [TaskDirection]) -> Set<String> {
        let normalizedTranscript = normalize(transcriptText)
        guard !normalizedTranscript.isEmpty else { return [] }
        var matched: Set<String> = []
        for direction in directions {
            // 关键词本身 + 它带的同义说法（「指给我看」也可能被说成「在哪」）。
            let needles = ([direction.keyword] + (direction.matchKeywords ?? []))
                .map(normalize)
                .filter { !$0.isEmpty }
            for needle in needles {
                if normalizedTranscript.contains(needle) {
                    matched.insert(direction.id)
                    break
                }
                guard needle.count >= 4 else { continue }
                let tolerance = needle.count >= 6 ? 2 : 1
                if NotionNoteDetector.fuzzyContains(needle, in: normalizedTranscript, tolerance: tolerance) {
                    matched.insert(direction.id)
                    break
                }
            }
        }
        return matched
    }

    /// **算出这一轮显示哪几格**：本地命中优先，其次 Jev 概率过阈值的（按概率从高到低）。
    ///
    /// - Parameter probabilityThreshold: Jev 那条路的门槛（默认 0.5 —— `noul` 只给一个数，
    ///   0.5 就是"比瞎猜更像"；用户可以在设置里调）。
    /// - Parameter maximumItemCount: 最多显示几格（用户：「最多不要超过 5 列」，屏幕上一行 5 个）。
    nonisolated static func displayedItems(transcriptText: String,
                                           directions: [TaskDirection],
                                           jevProbabilities: [String: Double],
                                           probabilityThreshold: Double = 0.5,
                                           forcedDirectionIDs: Set<String> = [],
                                           maximumItemCount: Int = 10,
                                           pinnedOrder: [String] = []) -> [DirectionBoardDisplayItem] {
        let locallyMatched = locallyMatchedKeywords(transcriptText: transcriptText, directions: directions)

        var candidates: [(direction: TaskDirection, reason: DirectionBoardDisplayItem.Reason, score: Double)] = []
        for direction in directions {
            if locallyMatched.contains(direction.id) {
                candidates.append((direction, .localKeyword, jevProbabilities[direction.id] ?? 0))
                continue
            }
            // 他刚口述出来的新方向：还没有概率，但要显示（用户：「识别到这样的词语，也要让 AI 把它
            // 作为任务方向卡片显示在上面」）。
            if forcedDirectionIDs.contains(direction.id) {
                candidates.append((direction, .localKeyword, 1.0))
                continue
            }
            if let probability = jevProbabilities[direction.id], probability >= probabilityThreshold {
                candidates.append((direction, .jevProbability, probability))
            }
        }
        // 本地命中的排前面（用户已经说到了，那是确定的），其余按概率从高到低。
        candidates.sort { lhs, rhs in
            if (lhs.reason == .localKeyword) != (rhs.reason == .localKeyword) {
                return lhs.reason == .localKeyword
            }
            return lhs.score > rhs.score
        }
        var items = candidates.prefix(maximumItemCount).map { candidate in
            DirectionBoardDisplayItem(directionID: candidate.direction.id,
                                      keyword: candidate.direction.keyword,
                                      number: 0,
                                      reason: candidate.reason)
        }

        // **钉住的那些排到最前、编号不改**（用户：「如果用户选择某一个方向，就应该把这个方向定住，
        // 位置固定，数字固定……除非用户说取消这个方向」）。
        let pinned = pinnedOrder.compactMap { directionID in
            items.first(where: { $0.directionID == directionID })
        }
        let rest = items.filter { !pinnedOrder.contains($0.directionID) }
        items = (pinned + rest).enumerated().map { offset, item in
            DirectionBoardDisplayItem(directionID: item.directionID,
                                      keyword: item.keyword,
                                      number: offset + 1,
                                      reason: item.reason)
        }
        return items
    }

    /// 只留字母与数字（中文是 letter，标点与空格在这一步去掉）。
    nonisolated static func normalize(_ text: String) -> String {
        text.filter { $0.isLetter || $0.isNumber }
    }
}

// MARK: - 口述选方向 / 口述取消（数字 → 第几格）

extension DirectionBoardMatching {

    /// **用户用嘴选了第几格**（「选择第二个方向」「第三个方向」「方向4」「参考第二个方向」）。
    ///
    /// 中文数字与阿拉伯数字都认；**越界的编号直接忽略**（他说"第六个"而屏幕上只有三格时，
    /// 猜一个等于替他做决定）。
    nonisolated static func spokenSelectionNumber(in transcriptText: String,
                                                  displayedItemCount: Int) -> Int? {
        guard displayedItemCount > 0 else { return nil }
        let normalized = normalize(transcriptText)
        guard !normalized.isEmpty else { return nil }

        let arabicPatterns = ["第(\\d+)个方向", "方向(\\d+)", "选第(\\d+)个", "参考第(\\d+)个", "第(\\d+)个"]
        if let number = firstNumber(in: normalized, patterns: arabicPatterns, maximum: displayedItemCount) {
            return number
        }
        let chinesePatterns = ["第([一二三四五六七八九十]+)个方向", "方向([一二三四五六七八九十]+)",
                               "选第([一二三四五六七八九十]+)个", "第([一二三四五六七八九十]+)个"]
        for pattern in chinesePatterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(normalized.startIndex..., in: normalized)
            for hit in regex.matches(in: normalized, range: range) {
                guard let numberRange = Range(hit.range(at: 1), in: normalized),
                      let number = chineseNumeral(String(normalized[numberRange])),
                      (1...displayedItemCount).contains(number) else { continue }
                return number
            }
        }
        return nil
    }

    /// **用户用嘴取消了第几格**（「取消第一个方向」「第二个方向取消」「去掉第三个方向」）。
    ///
    /// 与"选中"共用同一套数字识别，只多一个**取消词**门槛（用户 2026-09-27：「说第一个方向正确
    /// 的时候它能识别……但是说**取消第一个方向**，我发现它无法取消，这个是必须要有的」）。
    nonisolated static func spokenCancelSelectionNumber(in transcriptText: String,
                                                        displayedItemCount: Int) -> Int? {
        let normalized = normalize(transcriptText)
        guard !normalized.isEmpty else { return nil }
        let cancelWords = ["取消", "去掉", "删掉", "不要", "不对", "不算"]
        guard cancelWords.contains(where: { normalized.contains($0) }) else { return nil }
        return spokenSelectionNumber(in: transcriptText, displayedItemCount: displayedItemCount)
    }

    /// **用户口述要取消整个看板吗** —— 只认那两个精准短语。
    ///
    /// 用户：「判断里面有没有准确的「**取消任务看板**」或「**取消任务方向**」这几个字。
    /// 「取消任务」这四个字必须是关联的，后面接「看板」或「方向」，必须是精准的词。」
    nonisolated static func spokenCancelBoardRequested(in transcriptText: String) -> Bool {
        let normalized = normalize(transcriptText)
        guard !normalized.isEmpty else { return false }
        return normalized.contains("取消任务看板") || normalized.contains("取消任务方向")
    }

    /// **用户口述了一个清单里没有的新方向吗**（「任务方向是 X」「关于 X 方向」「这次是 X 类任务」）。
    ///
    /// 用户 2026-09-27：「第二种来源是用户**口述**任务方向或某一类型任务时，识别到这样的词语，
    /// 也要让 AI 把它作为任务方向卡片显示在上面。」
    ///
    /// 只在**明确说了"方向"两个字**的时候才认（否则随手一句话都会被当成新方向存进文件里）。
    /// 返回抽出来的那一段（已去掉标点与语气词，2~12 字）。
    nonisolated static func spokenNewDirection(in transcriptText: String) -> String? {
        let patterns = [
            "任务方向是([^，。！？,.!?]{2,12})",
            "方向是([^，。！？,.!?]{2,12})",
            "关于([^，。！？,.!?]{2,12})方向",
            "这次是([^，。！？,.!?]{2,12})类任务",
        ]
        let text = transcriptText
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(text.startIndex..., in: text)
            guard let hit = regex.firstMatch(in: text, range: range),
                  let captured = Range(hit.range(at: 1), in: text) else { continue }
            var candidate = String(text[captured]).trimmingCharacters(in: .whitespacesAndNewlines)
            candidate = candidate.replacingOccurrences(of: "这个", with: "")
            candidate = candidate.replacingOccurrences(of: "那个", with: "")
            candidate = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            guard candidate.count >= 2, candidate.count <= 12 else { continue }
            return candidate
        }
        return nil
    }

    /// 中文数字 → 整数（只认 1…99；认不出来返回 nil）。
    nonisolated static func chineseNumeral(_ text: String) -> Int? {
        let digits: [Character: Int] = ["一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
                                        "六": 6, "七": 7, "八": 8, "九": 9]
        if text == "十" { return 10 }
        var total = 0
        var pendingDigit: Int?
        for character in text {
            if character == "十" {
                total += (pendingDigit ?? 1) * 10
                pendingDigit = nil
            } else if let digit = digits[character] {
                pendingDigit = digit
            } else {
                return nil
            }
        }
        total += pendingDigit ?? 0
        return total > 0 ? total : nil
    }

    private static func firstNumber(in text: String,
                                    patterns: [String],
                                    maximum: Int) -> Int? {
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(text.startIndex..., in: text)
            for hit in regex.matches(in: text, range: range) {
                guard let numberRange = Range(hit.range(at: 1), in: text),
                      let number = Int(text[numberRange]),
                      (1...maximum).contains(number) else { continue }
                return number
            }
        }
        return nil
    }
}
