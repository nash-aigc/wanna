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

    /// 出厂配置：六个短语是用户点名的那一套（见 `开发经验/19-任务方向看板.md`）。
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
                                 keywords: ["点一下", "点击", "按一下", "打开", "操作", "打字", "输入"]),
            DirectionBoardButton(id: "act.agent",
                                 presetText: "派个 Agent 去做",
                                 keywords: ["派个", "派给", "让 agent", "帮我做", "去做"]),
        ]),
    ])

    /// 布局常量：**3 行 × 2 列**。写在这里是因为"几行几列"同时被视图、配置校验与设置页读。
    static let rowCount = 3
    static let buttonsPerRow = 2
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
        var rows: [DirectionBoardRow] = []
        for rowIndex in 0..<rowCount {
            let fallbackRow = Self.default.rows[rowIndex]
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
        guard rowIndex < rows.count, columnIndex < rows[rowIndex].buttons.count else { return nil }
        let presetText = rows[rowIndex].buttons[columnIndex].presetText
        if let localMatch, localMatch.rowIndex == rowIndex { return presetText }
        guard columnIndex == 0 else { return presetText }
        let trimmed = modelLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? presetText : trimmed
    }
}
