//
//  DirectionBoardTests.swift
//  WannaTests
//
//  「任务方向看板」的纯逻辑断言（2026-09-27）。
//
//  这一套**与 `/tmp` 里那个独立探针逐条相同**：纯逻辑不依赖 App，所以两边跑的是同一批结论。
//  留在仓库里的意义是**回归**：以后谁改了匹配档位或解析规则，这里会红。
//
//  为什么这些断言值钱：这一段的失败方式全是**静默**的 —— 误命中会点亮错的方向（并且压掉
//  AI 本该给的那个），解析跑偏会把标签变成正文的一部分。探针第一次跑就抓到两个：
//  「点一下」误命中「存一下」（3 字关键词给了容错），以及 8 字上限把「保存到 Notion」
//  截成「保存到 Noti」。
//

import Foundation
import Testing
@testable import Wanna

@MainActor
struct DirectionBoardTests {

    private var configuration: DirectionBoardConfiguration {
        DirectionBoardConfiguration.validated(.default)
    }

    // MARK: - 布局与默认值

    @Test func defaultConfigurationIsThreeRowsOfTwo() throws {
        let configuration = self.configuration
        #expect(configuration.rows.count == 3)
        #expect(configuration.rows.allSatisfy { $0.buttons.count == 2 })
        #expect(configuration.rows.map(\.title) == ["笔记类", "显示类", "执行类"])
        #expect(configuration.rows[0].buttons.map(\.presetText) == ["保存到 Notion", "存成一条录音"])
        #expect(configuration.rows[1].buttons.map(\.presetText) == ["指给我看", "圈出来"])
        #expect(configuration.rows[2].buttons.map(\.presetText) == ["操作电脑", "派个 Agent 去做"])
        #expect(Set(configuration.rows.flatMap { $0.buttons.map(\.id) }).count == 6)
    }

    // MARK: - 本地匹配（"预设关键词作为首选"那一半）

    private func matchedRow(_ text: String) -> Int? {
        DirectionBoardConfiguration.match(in: text, configuration: configuration)?.rowIndex
    }

    @Test func presetKeywordsPickTheRightRow() throws {
        #expect(matchedRow("帮我把这条保存到 notion 里") == 0)
        #expect(matchedRow("这一段帮我记下来") == 0)
        #expect(matchedRow("这个按钮在哪儿") == 1)
        #expect(matchedRow("把它圈出来") == 1)
        #expect(matchedRow("帮我点一下那个发送按钮") == 2)
        #expect(matchedRow("派个 agent 去做这件事") == 2)
        #expect(matchedRow("今天天气怎么样") == nil)
    }

    @Test func presetKeywordsPickTheRightButtonInsideTheRow() throws {
        #expect(DirectionBoardConfiguration.match(in: "帮我点一下那个按钮",
                                                  configuration: configuration)?.button.id == "act.computer")
        #expect(DirectionBoardConfiguration.match(in: "帮我圈一下这里",
                                                  configuration: configuration)?.button.id == "show.circle")
    }

    /// **短关键词只认精确** —— 这一条是探针逼出来的，别再放宽。
    ///
    /// 3 字关键词给容错 1 时，「帮我**点一下**那个发送按钮」会命中笔记类的「**存一下**」：
    /// 屏幕上点亮「保存到 Notion」，而本地命中还会**压掉**显示类/执行类本该由模型给的标签。
    @Test func shortKeywordsDoNotFuzzyMatch() throws {
        #expect(matchedRow("我今天发了个朋友圈") == nil)
        #expect(matchedRow("帮我把这个存一下") == 0)
        let rowMatches = DirectionBoardConfiguration.rowMatches(
            in: "先记下来，然后帮我点一下，再圈出来", configuration: configuration)
        #expect(rowMatches.keys.sorted() == [0, 1, 2])
        #expect(rowMatches[0]?.button.id == "note.notion")
    }

    // MARK: - 校验（手改过 JSON 之后仍然能画）

    @Test func validationRepairsAHandEditedConfiguration() throws {
        let broken = DirectionBoardConfiguration(rows: [
            DirectionBoardRow(title: "  ", buttons: []),
            DirectionBoardRow(title: "只有一行",
                              buttons: [DirectionBoardButton(id: "", presetText: "", keywords: ["甲"])]),
        ])
        let repaired = DirectionBoardConfiguration.validated(broken)
        #expect(repaired.rows.count == 3)
        #expect(repaired.rows.allSatisfy { $0.buttons.count == 2 })
        #expect(repaired.rows[0].title == "笔记类")
        #expect(repaired.rows[1].buttons[0].presetText == "指给我看")
        #expect(repaired.rows[1].buttons[0].id == "show.point")
        #expect(repaired.rows[2].buttons[1].id == "act.agent")
        // **用户写的关键词原样保留**：清空关键词是"这一行我要自己判断"的正当表达，不许改写回去。
        #expect(repaired.rows[1].buttons[0].keywords == ["甲"])
    }

    // MARK: - 解析

    @Test func parsesTheCanonicalReply() throws {
        let reading = DirectionBoardPrompt.parseResponse("""
        <<<看板
        说明：用户想让我把屏幕上的那段文字存进 Notion。
        方向1：保存到 Notion
        方向2：无
        方向3：无
        看板>>>
        """)
        #expect(reading.paragraph == "用户想让我把屏幕上的那段文字存进 Notion。")
        #expect(reading.rowLabels[0] == "保存到 Notion")
        #expect(reading.rowLabels[1] == nil)
        #expect(reading.rowLabels[2] == nil)
    }

    /// **模型原样回一个预设短语时不许被截断**：8 字上限会把「保存到 Notion」变成「保存到 Noti」。
    @Test func keepsPresetPhrasesIntact() throws {
        #expect(DirectionBoardPrompt.parseResponse("说明：x\n方向1：保存到 Notion").rowLabels[0] == "保存到 Notion")
        #expect(DirectionBoardPrompt.parseResponse("说明：x\n方向3：派个 Agent 去做").rowLabels[2] == "派个 Agent 去做")
    }

    @Test func toleratesFullWidthColonsAndDecorations() throws {
        #expect(DirectionBoardPrompt.parseResponse("<<<看板\n说明：他要把这段存下来\n方向2：圈出来\n看板>>>")
            .rowLabels[1] == "圈出来")
        #expect(DirectionBoardPrompt.parseResponse("<<<看板\n说明：测试\n方向1：`保存到 Notion`\n看板>>>")
            .rowLabels[0] == "保存到 Notion")
        let boldKey = DirectionBoardPrompt.parseResponse("<<<看板\n**说明**：把这段存进笔记\n- 方向3：操作电脑\n看板>>>")
        #expect(boldKey.paragraph == "把这段存进笔记")
        #expect(boldKey.rowLabels[2] == "操作电脑")
    }

    /// 认不出来的行一律并进说明 —— 多写的、少写的都不丢；整个不成形时保留上一次（调用方的事）。
    @Test func neverLosesUnrecognisedLines() throws {
        let duplicated = DirectionBoardPrompt.parseResponse("说明：第一版\n说明：第二版\n方向1：保存到 Notion\n方向1：操作电脑")
        #expect(duplicated.paragraph.hasPrefix("第一版"))
        #expect(duplicated.paragraph.contains("第二版"))
        #expect(duplicated.rowLabels[0] == "保存到 Notion")

        let truncated = DirectionBoardPrompt.parseResponse("说明：他要把这个文件\n方向2：指给")
        #expect(truncated.paragraph == "他要把这个文件")

        let nonsense = DirectionBoardPrompt.parseResponse("我不太明白你的意思。")
        #expect(nonsense.paragraph == "我不太明白你的意思。")
        #expect(nonsense.rowLabels.isEmpty)

        // 哨兵**之外**的话是模型的前言/后语，不进说明。
        let withPreamble = DirectionBoardPrompt.parseResponse(
            "好的，我来分析一下。\n<<<看板\n说明：用户想存一条笔记\n方向1：保存到 Notion\n看板>>>\n以上。")
        #expect(withPreamble.paragraph == "用户想存一条笔记")
        #expect(withPreamble.rowLabels[0] == "保存到 Notion")
    }

    @Test func truncatesOverlongLabels() throws {
        let reading = DirectionBoardPrompt.parseResponse("说明：x\n方向1：这是一个特别特别长的方向标签超过十二个字了真的超了")
        #expect(reading.rowLabels[0]?.count == 12)
    }

    // MARK: - 请求消息

    @Test func requestMessageOnlyAsksForUnmatchedRows() throws {
        let message = DirectionBoardPrompt.requestUserMessage(
            transcriptText: "帮我把这段存进 notion",
            unmatchedRowIndices: [1, 2],
            configuration: configuration)
        #expect(message.contains("帮我把这段存进 notion"))
        #expect(message.contains("方向2") && message.contains("方向3"))
        #expect(message.contains("保存到 Notion"))

        let allMatched = DirectionBoardPrompt.requestUserMessage(
            transcriptText: "x", unmatchedRowIndices: [], configuration: configuration)
        #expect(allMatched.contains("只需要写「说明」"))
    }

    // MARK: - 注入的标签

    @Test func decorationOnlyCarriesWhatTheUserConfirmed() throws {
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: [], typedInput: "") == nil)
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: ["   "], typedInput: "\n ") == nil)
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: ["保存到 Notion"], typedInput: "")
            == "用户真实意图的任务方向是：保存到 Notion")
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: ["保存到 Notion", "指给我看"],
                                                typedInput: "顺便截图")
            == """
            用户真实意图的任务方向是：保存到 Notion
            用户真实意图的任务方向是：指给我看
            用户的补充说明是：顺便截图
            """)
    }

    // MARK: - 屏幕上写什么 = 发出去的是什么

    /// 预设命中时**以预设为准**（用户原话：「以用户提前预设的为准」）；没命中才让 AI 的短语占第一格。
    @Test func displayTextPrefersPresetThenTheModelLabel() throws {
        let localMatch = DirectionBoardConfiguration.match(in: "帮我圈一下这里", configuration: configuration)
        // 命中的那一行：整行都是预设，AI 写什么都不算。
        #expect(configuration.displayText(rowIndex: 1, columnIndex: 0, localMatch: localMatch, modelLabel: "操作电脑") == "指给我看")
        #expect(configuration.displayText(rowIndex: 1, columnIndex: 1, localMatch: localMatch, modelLabel: "操作电脑") == "圈出来")
        // 没命中的那一行：第一格显示 AI 的短语，第二格仍然是预设。
        #expect(configuration.displayText(rowIndex: 2, columnIndex: 0, localMatch: localMatch, modelLabel: "整理这段文字") == "整理这段文字")
        #expect(configuration.displayText(rowIndex: 2, columnIndex: 1, localMatch: localMatch, modelLabel: "整理这段文字") == "派个 Agent 去做")
        // 没命中、AI 也说「无」：回落预设。
        #expect(configuration.displayText(rowIndex: 2, columnIndex: 0, localMatch: localMatch, modelLabel: "  ") == "操作电脑")
    }
}
