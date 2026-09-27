//
//  DirectionBoardSettings.swift
//  Wanna
//
//  **「任务方向看板」的数据与本地匹配**（2026-09-27）。
//
//  看板是主 Agent 说话时出现在鼠标右上角的一块板（与右下角那张「结果卡片」对照）：
//  六个方向按钮 + 一段「AI 怎么理解这次任务」的说明 + 一个补充输入框。
//
//  用户的规则（原话）：「用户预设的三个方向，每个方向可以预设固定的关键词。如果当前用户任务
//  属于某个方向但**没有匹配到对应关键词**，就让 AI 自动生成，注意字数一定要少。用户预设的
//  关键词作为**首选**，优先考虑显示在对应的行和位置；没有匹配到时，AI 自动生成。」
//
//  所以这一个文件只做两件事：**存那六个短语与关键词**、**在转写里做本地匹配**。
//  匹配是"首选"那一半（不花请求、位置固定），AI 生成的标签是"兜底"那一半（见 `DirectionBoardPrompt`）。
//
//  整个类型 `nonisolated`、不碰网络与 UI —— 一个探针就能把它验到底（照 `NotionNoteDetector`
//  的先例：那一族的纯逻辑也是这样被单独验的）。
//

import Foundation

/// 看板上的**一个方向按钮**：固定短语 + 用来本地匹配的关键词。
///
/// - Important: `id` 是**跨改名稳定**的身份（键进 `DirectionBoardSession` 的按钮状态字典、
///   进设置页的 ForEach）。用户改了短语文字，他之前点过的确认不该因此丢掉。
nonisolated struct DirectionBoardButton: Codable, Identifiable, Equatable {
    var id: String
    /// 固定短语（用户定的，≤8 字）。AI 生成的那一版覆盖的是"显示文字"，不改这里。
    var presetText: String
    /// 预设关键词。命中就把这个按钮点亮、用 `presetText`；一个都没命中才轮到 AI。
    var keywords: [String]
}

/// 看板上的**一行**（= 一个类别）：固定两个按钮。
nonisolated struct DirectionBoardRow: Codable, Equatable {
    /// 类别名（笔记类 / 显示类 / 执行类）—— 显示在看板的行首，也写进给模型的提示词。
    var title: String
    var buttons: [DirectionBoardButton]
}

/// 看板的完整配置：**固定 3 行 × 2 列**。
///
/// 用户 2026-09-27 定的布局：「按钮区最终按 3 行 2 列（6 个方向）做」，此前口述的 3×3 作废。
nonisolated struct DirectionBoardConfiguration: Codable, Equatable {
    var rows: [DirectionBoardRow]

    /// 出厂配置：短语是用户点名的那一套（见 `开发经验/19-任务方向看板.md`）。
    ///
    /// **最多 5 行**（用户 2026-09-27：「这个上面的表格可以最多显示为 5 行，也就是五类任务：
    /// 文字类的、图文类的、执行类的、显示类的、笔记类的」）。前三类是他最早定的那三个方向，
    /// 后两类是这次补的。
    static let `default` = DirectionBoardConfiguration(rows: [
        DirectionBoardRow(title: "笔记类", buttons: [
            DirectionBoardButton(id: "note.notion",
                                 presetText: "保存到 Notion",
                                 keywords: ["notion", "笔记", "记下来", "记一条", "存到笔记", "存一下"]),
            DirectionBoardButton(id: "note.recording",
                                 presetText: "存成一条录音",
                                 keywords: ["录音", "记录下来", "存成录音", "录下来", "录一条"]),
        ]),
        DirectionBoardRow(title: "显示类", buttons: [
            DirectionBoardButton(id: "show.point",
                                 presetText: "指给我看",
                                 keywords: ["指给", "指一下", "哪里", "在哪", "标出来"]),
            DirectionBoardButton(id: "show.circle",
                                 presetText: "圈出来",
                                 keywords: ["圈出", "圈一下", "圈起来", "框出来"]),
        ]),
        DirectionBoardRow(title: "执行类", buttons: [
            DirectionBoardButton(id: "act.computer",
                                 presetText: "操作电脑",
                                 keywords: ["点一下", "点击", "按一下", "打开", "操作", "打字", "输入",
                                            "帮我点", "帮我按", "滚动", "往下拉", "切到", "切换到"]),
            DirectionBoardButton(id: "act.agent",
                                 presetText: "派个 Agent 去做",
                                 keywords: ["派个", "派给", "让 agent", "帮我做", "去做", "后台",
                                            "跑一遍", "查一下资料", "整理成"]),
        ]),
        DirectionBoardRow(title: "文字类", buttons: [
            DirectionBoardButton(id: "text.write",
                                 presetText: "写成文字",
                                 keywords: ["写成文字", "打字出来", "整理成文字", "写成一段", "文案",
                                            "润色", "改写", "翻译", "总结成", "列个提纲"]),
            DirectionBoardButton(id: "text.chat",
                                 presetText: "只跟我聊",
                                 keywords: ["跟我聊", "聊一聊", "讨论", "问问你", "你怎么看",
                                            "帮我分析", "出个主意", "解释一下"]),
        ]),
        DirectionBoardRow(title: "图文类", buttons: [
            DirectionBoardButton(id: "vision.look",
                                 presetText: "看图说话",
                                 keywords: ["看图", "这张图", "图里", "截图里", "屏幕上是", "画的是什么",
                                            "识别一下图", "图上有"]),
            DirectionBoardButton(id: "vision.make",
                                 presetText: "画一张图",
                                 keywords: ["画一张", "画个图", "生成图", "插图", "海报", "配图",
                                            "流程图", "思维导图"]),
        ]),
    ])

    /// 布局常量：**最多 5 行 × 每行 2 列**。写在这里是因为"几行几列"同时被视图、配置校验与设置页读。
    ///
    /// 列数固定 2：用户最早那条硬要求是「宽度与右下角结果看板完全一致」（340pt），
    /// 3~4 列会把按钮挤成小方块（他后来说"5 行 3 列或 4 列都可以"，但宽度那条更硬，先按 2 列）。
    static let maximumRowCount = 5
    static let buttonsPerRow = 2
    /// 出厂是 5 类（用户点名的那五类），但**用户可以在设置里删到 1 类**。
    static var defaultRowCount: Int { `default`.rows.count }
}

// MARK: - 本地匹配（"首选"那一半）

extension DirectionBoardConfiguration {

    /// 一次命中的落点。
    nonisolated struct Match: Equatable {
        let rowIndex: Int
        let buttonIndex: Int
        let button: DirectionBoardButton
    }

    /// **转写里命中了哪个按钮** —— 行优先、同行按列，先到者胜。
    nonisolated static func match(in transcriptText: String,
                                  configuration: DirectionBoardConfiguration) -> Match? {
        let normalizedTranscript = normalizedForMatching(transcriptText)
        guard !normalizedTranscript.isEmpty else { return nil }

        for (rowIndex, row) in configuration.rows.enumerated() {
            for (buttonIndex, button) in row.buttons.enumerated() where
                buttonMatches(button, in: normalizedTranscript) {
                return Match(rowIndex: rowIndex, buttonIndex: buttonIndex, button: button)
            }
        }
        return nil
    }

    /// 这一轮**每一行**命中的按钮（一行最多一个 —— 先到者胜）。
    ///
    /// 看板要的正是这个粒度：**行**是"方向类别"，一行只该点亮一格；命中的那一行就定了，
    /// 模型不许再覆盖它（见 `DirectionBoardPrompt.requestUserMessage` 只列未命中的行）。
    nonisolated static func rowMatches(in transcriptText: String,
                                       configuration: DirectionBoardConfiguration) -> [Int: Match] {
        let normalizedTranscript = normalizedForMatching(transcriptText)
        guard !normalizedTranscript.isEmpty else { return [:] }

        var matches: [Int: Match] = [:]
        for (rowIndex, row) in configuration.rows.enumerated() {
            for (buttonIndex, button) in row.buttons.enumerated() where
                buttonMatches(button, in: normalizedTranscript) {
                matches[rowIndex] = Match(rowIndex: rowIndex, buttonIndex: buttonIndex, button: button)
                break
            }
        }
        return matches
    }

    /// 一个按钮的任意一个关键词命中了吗。
    ///
    /// 规则（每一条都有断言）：
    /// - 先做**精确子串**（比较前两边的标点与空格都已经去掉）；
    /// - 不中再做模糊匹配，容错按关键词长度定档：**≥6 字给 2，4~5 字给 1，3 字及以下不给**
    ///   （与 `NotionNoteDetector` 同一套档位，理由写在那边）。
    ///
    /// ⚠️ **3 字及以下只认精确，这一条是探针逼出来的**：最初给 3 字关键词留了容错 1，
    /// 于是「帮我**点一下**那个发送按钮」命中了笔记类的关键词「**存一下**」
    ///（两个字只差一笔）—— 屏幕上点亮的是「保存到 Notion」，而用户要的是「操作电脑」。
    /// 更要紧的是：本地的误命中会**压掉**那个方向本该由模型给的标签（本地优先），
    /// 所以它不是"多点亮一格"，是"把 AI 的判断也一起顶掉"。
    /// 「圈出」撞「朋友圈」也是同一类。宁可少命中（交给模型），不许误命中。
    nonisolated static func buttonMatches(_ button: DirectionBoardButton,
                                          in normalizedTranscript: String) -> Bool {
        for keyword in button.keywords {
            let needle = normalizedForMatching(keyword)
            guard !needle.isEmpty else { continue }
            if normalizedTranscript.contains(needle) { return true }
            guard needle.count >= 4 else { continue }
            let tolerance = needle.count >= 6 ? 2 : 1
            if NotionNoteDetector.fuzzyContains(needle, in: normalizedTranscript, tolerance: tolerance) {
                return true
            }
        }
        return false
    }

    /// 只留字母与数字（与 `NotionNoteDetector` 内部那一步同一个形状）。
    nonisolated static func normalizedForMatching(_ text: String) -> String {
        text.filter { $0.isLetter || $0.isNumber }
    }
}

// MARK: - 校验（手改过 JSON 之后仍然能用）

extension DirectionBoardConfiguration {

    /// 把任何一份配置**修成能画的样子**：3 行、每行 2 个按钮、id 唯一且非空、短语非空。
    ///
    /// 为什么需要它：`AppSettings.json` 是用户可以手改的（而且导入设置会把别人的文件读进来）。
    /// 少了这个，一行只有 1 个按钮就会让看板画少一格、id 重复会让两个按钮共享同一个状态。
    ///
    /// **刻意不动关键词**：把关键词清空是用户的正当选择（"这一行我不要本地匹配，让 AI 判断"），
    /// 强制写回默认值等于把他的话改掉。
    nonisolated static func validated(_ raw: DirectionBoardConfiguration) -> DirectionBoardConfiguration {
        // 行数：**1…5 都合法**（用户在设置里加/删），超出上限的截掉；一行都没有时回落到出厂那份。
        let requestedRowCount = min(max(raw.rows.count, 1), maximumRowCount)
        var rows: [DirectionBoardRow] = []
        for rowIndex in 0..<requestedRowCount {
            // 超出行数上限时截掉（上面已经限制了），补默认值时按出厂那份取模 ——
            // 用户把行数调小又调大时，新出现的行仍然是出厂那一套。
            let fallbackRow = Self.default.rows[rowIndex % Self.default.rows.count]
            guard rowIndex < raw.rows.count else {
                rows.append(fallbackRow)
                continue
            }
            let candidateRow = raw.rows[rowIndex]
            let title = candidateRow.title.trimmingCharacters(in: .whitespacesAndNewlines)
            var buttons: [DirectionBoardButton] = []
            for buttonIndex in 0..<buttonsPerRow {
                let fallbackButton = fallbackRow.buttons[buttonIndex]
                guard buttonIndex < candidateRow.buttons.count else {
                    buttons.append(fallbackButton)
                    continue
                }
                let candidateButton = candidateRow.buttons[buttonIndex]
                let presetText = candidateButton.presetText.trimmingCharacters(in: .whitespacesAndNewlines)
                let identifier = candidateButton.id.trimmingCharacters(in: .whitespacesAndNewlines)
                buttons.append(DirectionBoardButton(
                    id: identifier.isEmpty ? fallbackButton.id : identifier,
                    presetText: presetText.isEmpty ? fallbackButton.presetText : presetText,
                    keywords: candidateButton.keywords))
            }
            rows.append(DirectionBoardRow(title: title.isEmpty ? fallbackRow.title : title,
                                          buttons: buttons))
        }
        return DirectionBoardConfiguration(rows: rows)
    }

    /// **这一格现在显示什么文字** —— 视图、AX 断言与"要写进提示词的标签"读的都是它。
    ///
    /// 规则（用户 2026-09-27 定，逐字）：
    /// > 如果用户预设的内容没有匹配到，就让 AI 生成；如果用户关键词已经匹配，就显示用户匹配的内容。
    /// > 因为用户可能会说「保存到 Notion 什么什么页面」，AI 可能识别不了，所以**以用户提前预设的为准**；
    /// > 如果没有预设，就让 AI 生成。
    ///
    /// 展开成三条：
    /// 1. 这一行**本地命中了** → 整行都用预设短语（命中的那一格高亮）—— 预设优先，AI 不许覆盖；
    /// 2. 没命中 → **第一格**显示 AI 生成的短语（≤12 字），**第二格**仍然是预设（他随时可以点它）；
    /// 3. 没命中、AI 也说「无」 → 两格都是预设，谁都不高亮。
    nonisolated func displayText(rowIndex: Int,
                                 columnIndex: Int,
                                 localMatch: Match?,
                                 modelLabel: String?) -> String? {
        guard rowIndex >= 0, rowIndex < rows.count, columnIndex < rows[rowIndex].buttons.count else { return nil }
        let presetText = rows[rowIndex].buttons[columnIndex].presetText
        if let localMatch, localMatch.rowIndex == rowIndex { return presetText }
        guard columnIndex == 0 else { return presetText }
        let trimmed = modelLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? presetText : trimmed
    }
}

// MARK: - 看板上真正显示的那几格（2026-09-27 第二版）

/// 看板上**一格**：只有"用户说的内容对上了"的类别才会出现（本地关键词或 AI 判断），
/// 每一格带一个**连续编号** —— 用户可以照着编号说「第三个方向」。
nonisolated struct DirectionBoardDisplayItem: Equatable {
    /// 它属于哪一类（`DirectionBoardConfiguration.rows` 的下标）。
    let rowIndex: Int
    /// 类别名（笔记类 / 显示类 / …）。
    let rowTitle: String
    /// 这一格显示的文字（预设短语，或 AI 写的短语）。
    let text: String
    /// 屏幕上的编号，**从 1 开始、连续**（用户说的「第三个方向」指的就是它）。
    let number: Int
}

extension DirectionBoardConfiguration {

    /// **按用户说到的内容决定显示哪几格**（用户 2026-09-27 第二版的核心要求）。
    ///
    /// 原话：「如果我没有说话的时候，它不应该显示这个弹窗、这个卡片；而且我没有说话的时候，
    /// 它对应的卡片应该不显示……要根据用户的内容来去选择到底显示哪一个卡片，到底显示哪一个关键词……
    /// 而不是直接就显示，你这样的话就体验太差了。」
    ///
    /// 规则（每一条都有断言）：
    /// 1. 这一行**本地关键词命中** → 显示命中的那个短语（两个按钮哪个命中就显示哪个）；
    /// 2. 没命中、但 **AI 给了短语** → 显示 AI 的短语；
    /// 3. 两者都没有 → **这一行整行不出现**；
    /// 4. 编号在最后统一分配：**从上到下、连续 1…N**。
    nonisolated static func displayedItems(transcriptText: String,
                                           modelRowLabels: [Int: String],
                                           configuration: DirectionBoardConfiguration) -> [DirectionBoardDisplayItem] {
        let matches = rowMatches(in: transcriptText, configuration: configuration)
        var items: [DirectionBoardDisplayItem] = []
        for (rowIndex, row) in configuration.rows.enumerated() {
            let text: String?
            if let match = matches[rowIndex] {
                text = match.button.presetText
            } else {
                let label = modelRowLabels[rowIndex]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                text = label.isEmpty ? nil : label
            }
            guard let text, !text.isEmpty else { continue }
            items.append(DirectionBoardDisplayItem(rowIndex: rowIndex,
                                                   rowTitle: row.title,
                                                   text: text,
                                                   number: items.count + 1))
        }
        return items
    }
}

// MARK: - 口述选方向

extension DirectionBoardConfiguration {

    /// **用户用嘴选了一个方向吗** —— 返回屏幕上那个编号（1 起），没有就说 `nil`。
    ///
    /// 用户 2026-09-27：「也可以通过口述的方式……如果用户的语言里明确包含「任务方向是什么什么」
    /// 「选择第几个方向」「第二个方向、第三个方向、第四个方向」这种，它就**自动高亮**，
    /// 不需要通过点击也可以让它高亮，相当于这个方向也被选中了。」
    ///
    /// 这一层是**本地、确定性**的（不花请求、不靠模型猜）：认出「第 N 个」「方向 N」「选第 N」，
    /// 中文数字与阿拉伯数字都认。语义那一种（「关于显示方向的」）由行标题匹配兜底。
    nonisolated static func spokenSelectionNumber(in transcriptText: String,
                                                  displayedItemCount: Int) -> Int? {
        guard displayedItemCount > 0 else { return nil }
        let normalized = normalizedForMatching(transcriptText)
        guard !normalized.isEmpty else { return nil }

        // ① 「第N个方向」「方向N」「选第N」「第N个」
        let patterns = ["第(\\d+)个方向", "方向(\\d+)", "选第(\\d+)个", "参考第(\\d+)个", "第(\\d+)个"]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(normalized.startIndex..., in: normalized)
            for hit in regex.matches(in: normalized, range: range) {
                guard let numberRange = Range(hit.range(at: 1), in: normalized),
                      let number = Int(normalized[numberRange]),
                      (1...displayedItemCount).contains(number) else { continue }
                return number
            }
        }

        // ② 中文数字：「第三个方向」「方向三」「第五个」
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

    /// **用户用嘴说了某一类吗**（「关于显示方向的」「笔记类的」）→ 返回那一类的下标。
    ///
    /// ⚠️ **不能只匹配类别名本身**：用户说的是「关于**显示方向**的」，而类别名是「显示类」——
    /// 探针抓到过这一条（`显示类` 不是那句转写的子串）。所以要求类别名**紧跟着一个方向词**
    ///（方向 / 类 / 方面 / 那一类）才算数。
    ///
    /// 这条"必须带方向词"的规矩同时挡住了误报：光说「把这段**文字**存到 notion」里的「文字」
    /// 不该把「文字类」也选上 —— 它后面跟的是「存到」，不是方向词。
    nonisolated static func spokenRowSelection(in transcriptText: String,
                                               configuration: DirectionBoardConfiguration) -> Int? {
        let normalized = normalizedForMatching(transcriptText)
        guard !normalized.isEmpty else { return nil }
        let markers = ["方向", "类", "方面", "那一类", "这类", "这类任务"]
        for (rowIndex, row) in configuration.rows.enumerated() {
            // 类别名去掉尾部的「类」再匹配（「显示类」→「显示」）。
            var title = normalizedForMatching(row.title)
            if title.hasSuffix("类") { title.removeLast() }
            guard title.count >= 2 else { continue }
            for marker in markers where normalized.contains(title + marker) {
                return rowIndex
            }
        }
        return nil
    }

    /// 中文数字 → 整数（只认 1…99，够用；认不出来返回 nil）。
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
