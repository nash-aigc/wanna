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
    /// 用户明确说过的那几格带着这个状态（✓ / ✗）；其余是 `.pending`。
    ///
    /// 用户 2026-09-27：「一定要去在卡片上显示，**无论是对还是不对都要显示**」——
    /// 所以"对"和"不对"都是**固定**，都要留在板上。
    var state: State = .pending
    /// 它是怎么被选中的（只用于日志与断言）。
    let reason: Reason

    enum State: String, Equatable, Sendable {
        case pending
        case confirmed
        case denied
    }

    enum Reason: String, Equatable {
        /// 本地关键词命中（免费的那条路）。
        case localKeyword
        /// Jev 判断的概率过了阈值。
        case jevProbability
        /// **用户明确说过的那一格**（✓ 或 ✗），无条件显示、编号稳定。
        case pinnedByUser
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

    /// **算出这一轮显示哪几格**：**固定项永远在最前**，其次 Jev 概率过阈值的（按概率从高到低）。
    ///
    /// 用户 2026-09-27 定的规则：
    /// · 「只要用户明确的说哪一个方向对，哪一个方向不对，就要把这个最终确定的……一定要去在卡片上
    ///   显示，**无论是对还是不对都要显示**」→ 固定项**两种状态都排在最前**、**编号稳定**
    ///   （他说的「这个方向一就一直在这里卡片显示出来」）；
    /// · 「其他没有说过的、没有做过选择的、都可以**自由的替换、自由的轮换**」→ Jev 那部分可换；
    /// · 「最多不要超过 5 列」→ 超过上限时**先砍 Jev 那部分**，固定项不砍。
    ///
    /// - Parameter probabilityThreshold: Jev 那条路的门槛（默认 0.5 —— `noul` 只给一个数，
    ///   0.5 就是"比瞎猜更像"；用户可以在设置里调）。
    /// - Parameter maximumItemCount: 最多显示几格（屏幕上一行 5 个）。
    /// - Parameter pinnedStates: 用户明确说过的那几格（**顺序就是固定的顺序**）。
    nonisolated static func displayedItems(transcriptText: String,
                                           directions: [TaskDirection],
                                           jevProbabilities: [String: Double],
                                           probabilityThreshold: Double = 0.5,
                                           pinnedStates: [(directionID: String, state: TaskDirectionStore.PinState)] = [],
                                           maximumItemCount: Int = 10) -> [DirectionBoardDisplayItem] {
        let locallyMatched = locallyMatchedKeywords(transcriptText: transcriptText, directions: directions)
        let pinnedIDs = Set(pinnedStates.map(\.directionID))

        // ① 固定项：**无条件显示、顺序不动、不参与概率**（用户已经定了，没什么可判断的）。
        var items: [DirectionBoardDisplayItem] = pinnedStates.compactMap { pin in
            guard let direction = directions.first(where: { $0.id == pin.directionID }) else { return nil }
            return DirectionBoardDisplayItem(directionID: direction.id,
                                             keyword: direction.keyword,
                                             number: 0,
                                             state: pin.state == .confirmed ? .confirmed : .denied,
                                             reason: .pinnedByUser)
        }

        // ② 其余按本地命中 / Jev 概率，补在后面（这一部分可以自由轮换）。
        var candidates: [(direction: TaskDirection, reason: DirectionBoardDisplayItem.Reason, score: Double)] = []
        for direction in directions where !pinnedIDs.contains(direction.id) {
            if locallyMatched.contains(direction.id) {
                candidates.append((direction, .localKeyword, jevProbabilities[direction.id] ?? 0))
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
        let room = max(maximumItemCount - items.count, 0)
        items += candidates.prefix(room).map { candidate in
            DirectionBoardDisplayItem(directionID: candidate.direction.id,
                                      keyword: candidate.direction.keyword,
                                      number: 0,
                                      state: .pending,
                                      reason: candidate.reason)
        }

        // 编号：从 1 开始、连续 —— **固定项在前**，所以它们的编号在用户说过之后不再变。
        return items.enumerated().map { offset, item in
            DirectionBoardDisplayItem(directionID: item.directionID,
                                      keyword: item.keyword,
                                      number: offset + 1,
                                      state: item.state,
                                      reason: item.reason)
        }
    }

    /// 只留字母与数字（中文是 letter，标点与空格在这一步去掉）。
    nonisolated static func normalize(_ text: String) -> String {
        text.filter { $0.isLetter || $0.isNumber }
    }
}

// MARK: - 口述的选择判定（**由大模型在下一轮给出，这里只解析它的话**）

extension DirectionBoardMatching {

    /// 模型回的那一行「选择：」怎么读 —— **编号指的是"上一轮显示的那一列"**。
    ///
    /// 用户 2026-09-27 说清了这条两拍语义：「用户表达的是对**上一轮** JEV 模型它的结果的一个选择。
    /// 那么也就是说，他要再再下一轮才能够去把真正的用户的结果显示出来，因为大语言模型要思考、要理解，
    /// 然后生成结果之后，才能去通过代码的方式提取出来，到底是哪一个有固定，哪一个要取消」。
    ///
    /// 所以这里**按上一轮的编号映射回方向 id**，而不是当前屏幕上的编号 —— 两次之间那列可能已经
    /// 重排过（JEV 每 3 秒重新判断一次），用当前编号会张冠李戴。
    ///
    /// 认的写法（宽松，模型怎么写都尽量读懂）：
    /// `选择：1 对，2 不对` / `选择：方向一正确、方向三不正确` / `选择：1✓ 2✗`；
    /// 也认「取消」当作"取消固定"（`选择：取消 2`）。
    nonisolated static func parseSelectionVerdict(_ line: String,
                                                  previousRound: [DirectionBoardDisplayItem])
        -> [(directionID: String, state: TaskDirectionStore.PinState?)] {
        guard !previousRound.isEmpty else { return [] }
        let normalized = line.replacingOccurrences(of: "：", with: ":")
        // 只取「选择:」后面那一段（模型可能把整段话都回在这一行里）。
        guard let range = normalized.range(of: "选择:", options: .backwards) else { return [] }
        var body = String(normalized[range.upperBound...])
        if let newline = body.firstIndex(of: "\n") { body = String(body[..<newline]) }

        let negativeWords = ["不对", "不正确", "不是", "错的", "错误", "✗", "x", "X", "否定"]
        let removeWords = ["取消", "删掉", "去掉", "不要了", "不用了"]
        let positiveWords = ["对", "正确", "是的", "没错", "✓", "√", "确认"]

        // 把这一行切成"每一格一段"：**以编号为锚**，一段 = 上一个编号之后 → 下一个编号之前。
        //
        // ⚠️ 不能按空格/逗号切：`1 对，3 不对` 会被切成「1」「对」「3」「不对」四段，每段都缺一半
        //（编号与判定词被拆开了）；反过来 `取消 2` 的判定词又在编号**前面**，只从编号往后取也会漏。
        // 所以取的是"两个编号之间那一段"。
        let tokens = numberTokens(in: body)
        var verdicts: [(String, TaskDirectionStore.PinState?)] = []
        var previousEnd = body.startIndex
        for (index, token) in tokens.enumerated() {
            let clauseEnd = index + 1 < tokens.count ? tokens[index + 1].start : body.endIndex
            let piece = String(body[previousEnd..<clauseEnd])
            previousEnd = clauseEnd
            guard let item = previousRound.first(where: { $0.number == token.number }) else { continue }
            // 判定词按"取消 → 否定 → 肯定"的顺序找（「不要了」里既有"不要"也有"要"，先认取消）。
            if removeWords.contains(where: piece.contains) {
                verdicts.append((item.directionID, nil))
            } else if negativeWords.contains(where: piece.contains) {
                verdicts.append((item.directionID, .denied))
            } else if positiveWords.contains(where: piece.contains) {
                verdicts.append((item.directionID, .confirmed))
            }
        }
        return verdicts
    }

    /// 一段话里所有**编号**（阿拉伯或中文数字）及它们的位置。
    private nonisolated static func numberTokens(in text: String)
        -> [(number: Int, start: String.Index)] {
        var tokens: [(number: Int, start: String.Index)] = []
        var index = text.startIndex
        while index < text.endIndex {
            let character = text[index]
            if character.isNumber {
                let end = text[index...].firstIndex { !$0.isNumber } ?? text.endIndex
                if let number = Int(text[index..<end]) { tokens.append((number, index)) }
                index = end
            } else if "一二三四五六七八九十".contains(character) {
                let end = text[index...].firstIndex { !"一二三四五六七八九十".contains($0) } ?? text.endIndex
                if let number = chineseNumeral(String(text[index..<end])) { tokens.append((number, index)) }
                index = end
            } else {
                index = text.index(after: index)
            }
        }
        return tokens
    }

    /// **用户口述要取消整个看板吗** —— 只认那两个精准短语。
    ///
    /// 用户：「判断里面有没有准确的「**取消任务看板**」或「**取消任务方向**」这几个字。
    /// 「取消任务」这四个字必须是关联的，后面接「看板」或「方向」，必须是精准的词。」
    ///
    /// ⚠️ 这是**总闸门**，所以留在本地判定（立刻生效）；**单个**方向的确认/取消走大模型那一拍
    ///（见 `parseSelectionVerdict`）。
    nonisolated static func spokenCancelBoardRequested(in transcriptText: String) -> Bool {
        let normalized = normalize(transcriptText)
        guard !normalized.isEmpty else { return false }
        return normalized.contains("取消任务看板") || normalized.contains("取消任务方向")
    }

    // ⚠️ 这里原来有一个 `screenReferenceRequested`（用户说了「参考屏幕/根据图片」才截屏）。
    // **2026-09-27 删掉了**：用户实测发现「屏幕上的第 2 题该选哪个」这种问法里没有那四个字，
    // 于是**根本没有截图、模型真的看不到屏幕**，右下角回一句"我还没看到题目内容"
    //（他说：「他为什么会显示没有看到屏幕呢？**他应该直接看到屏幕啊**」）。
    // 现在改成**每一轮请求都带一张当下的屏幕**（`DirectionBoardSession.captureScreenForBoard`），
    // 那个口令式的开关就没有存在的必要了。

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

}
