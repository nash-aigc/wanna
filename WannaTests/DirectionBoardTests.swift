//
//  DirectionBoardTests.swift
//  WannaTests
//
//  「任务方向看板」的纯逻辑断言（2026-09-27，第三版：清单文件 + Jev）。
//
//  这一套与 `/tmp` 里那个独立探针逐条相同。留在仓库里的意义是**回归**：以后谁改了匹配规则、
//  口述解析、节奏闸门或复盘解析，这里会红。
//
//  这些断言的失败方式全是**静默**的 —— 误命中会点亮错的方向（还会压掉该由概率给的），
//  口述解析错会把用户随口一句话当成一个新方向存进文件。所以边界都钉死。
//

import Foundation
import Testing
@testable import Wanna

@MainActor
struct DirectionBoardTests {

    private var directions: [TaskDirection] { TaskDirectionStore.builtinDirections }

    // MARK: - 本地关键词匹配（免费那条路）

    private func locallyMatched(_ text: String) -> Set<String> {
        DirectionBoardMatching.locallyMatchedKeywords(transcriptText: text, directions: directions)
    }

    @Test func keywordsLightTheRightDirection() throws {
        #expect(locallyMatched("帮我把这条保存到 notion 里").contains("note.notion"))
        #expect(locallyMatched("把刚才那段存成一条录音").contains("note.recording"))
        #expect(locallyMatched("这个按钮在哪儿").contains("show.point"))
        #expect(locallyMatched("把它圈出来").contains("show.circle"))
        #expect(locallyMatched("帮我点一下那个发送按钮").contains("act.computer"))
        #expect(locallyMatched("派个 agent 去做这件事").contains("act.agent"))
        #expect(locallyMatched("今天天气怎么样").isEmpty)
    }

    /// **短关键词只认精确** —— 放宽过一次，当场误命中（「帮我点一下」撞上「存一下」）。
    @Test func shortKeywordsDoNotFuzzyMatch() throws {
        #expect(!locallyMatched("我今天发了个朋友圈").contains("show.circle"))
        #expect(locallyMatched("帮我把这个存一下").contains("note.notion"))
    }

    // MARK: - 显示哪几格（本地优先 + Jev 概率）

    @Test func displayedItemsPreferLocalThenProbability() throws {
        let items = DirectionBoardMatching.displayedItems(
            transcriptText: "帮我把这段存到 notion 里",
            directions: directions,
            jevProbabilities: ["show.point": 0.9, "act.computer": 0.7, "vision.make": 0.1],
            probabilityThreshold: 0.5)
        // 本地命中的排最前，其余按概率从高到低；低于阈值的不出现。
        #expect(items.first?.directionID == "note.notion")
        #expect(items.map(\.directionID).contains("show.point"))
        #expect(items.map(\.directionID).contains("act.computer"))
        #expect(!items.map(\.directionID).contains("vision.make"))
        #expect(items.map(\.number) == Array(1...items.count))
    }

    /// **钉住的排最前、编号不变**（用户：「如果用户选择某一个方向，就应该把这个方向定住」）。
    @Test func pinnedDirectionsKeepTheirNumber() throws {
        let items = DirectionBoardMatching.displayedItems(
            transcriptText: "帮我把这段存到 notion 里",
            directions: directions,
            jevProbabilities: ["show.point": 0.9, "act.computer": 0.7],
            probabilityThreshold: 0.5,
            pinnedOrder: ["act.computer"])
        #expect(items.first?.directionID == "act.computer")
        #expect(items.first?.number == 1)
    }

    /// 他刚口述出来的新方向：没有概率也要显示。
    @Test func forcedDirectionsAreShownWithoutProbability() throws {
        let items = DirectionBoardMatching.displayedItems(
            transcriptText: "随便说点什么",
            directions: directions,
            jevProbabilities: [:],
            forcedDirectionIDs: ["vision.make"])
        #expect(items.map(\.directionID) == ["vision.make"])
    }

    // MARK: - 口述

    @Test func spokenNumbersSelectAndCancel() throws {
        #expect(DirectionBoardMatching.spokenSelectionNumber(in: "选择第二个方向", displayedItemCount: 5) == 2)
        #expect(DirectionBoardMatching.spokenSelectionNumber(in: "第三个方向吧", displayedItemCount: 5) == 3)
        #expect(DirectionBoardMatching.spokenSelectionNumber(in: "就方向4", displayedItemCount: 5) == 4)
        #expect(DirectionBoardMatching.spokenSelectionNumber(in: "第十一个方向", displayedItemCount: 12) == 11)
        #expect(DirectionBoardMatching.spokenSelectionNumber(in: "第六个方向", displayedItemCount: 5) == nil)

        // 取消（用户点名必须要有的）
        #expect(DirectionBoardMatching.spokenCancelSelectionNumber(in: "取消第一个方向", displayedItemCount: 5) == 1)
        #expect(DirectionBoardMatching.spokenCancelSelectionNumber(in: "第二个方向取消", displayedItemCount: 5) == 2)
        #expect(DirectionBoardMatching.spokenCancelSelectionNumber(in: "去掉第三个方向", displayedItemCount: 5) == 3)
        #expect(DirectionBoardMatching.spokenCancelSelectionNumber(in: "第一个方向正确", displayedItemCount: 5) == nil)
    }

    @Test func spokenCancelBoardNeedsTheExactPhrase() throws {
        #expect(DirectionBoardMatching.spokenCancelBoardRequested(in: "取消任务看板"))
        #expect(DirectionBoardMatching.spokenCancelBoardRequested(in: "帮我取消任务方向"))
        #expect(!DirectionBoardMatching.spokenCancelBoardRequested(in: "取消任务"))
        #expect(!DirectionBoardMatching.spokenCancelBoardRequested(in: "把任务方向改一下"))
    }

    @Test func spokenNewDirectionIsExtracted() throws {
        #expect(DirectionBoardMatching.spokenNewDirection(in: "任务方向是整理照片") == "整理照片")
        #expect(DirectionBoardMatching.spokenNewDirection(in: "这个是关于剪辑视频方向的") == "剪辑视频")
        #expect(DirectionBoardMatching.spokenNewDirection(in: "今天天气怎么样") == nil)
    }

    // MARK: - 节奏闸门（每 3 秒 + 内容变了 + 新增 ≥10 字）

    @Test func theCadenceGateNeedsTenNewCharacters() throws {
        func added(_ transcript: String, since last: String) -> Int {
            DirectionBoardSession.addedCharacterCount(transcript: transcript, since: last)
        }
        func shouldRequest(_ transcript: String, last: String,
                           enabled: Bool = true, listening: Bool = true,
                           requesting: Bool = false, cancelled: Bool = false) -> Bool {
            DirectionBoardSession.shouldRequest(transcript: transcript, lastRequestedTranscript: last,
                                                isEnabled: enabled, isListening: listening,
                                                isRequesting: requesting, isCancelled: cancelled)
        }
        #expect(added("帮我把这段存到 notion 里", since: "") == 14)
        // **标点不算字数**（用户点名）。
        #expect(added("帮我把这段，存到 notion 里！", since: "帮我把这段存到 notion 里") == 0)
        #expect(added("嗯", since: "") == 1)

        #expect(shouldRequest("帮我把这段存到 notion 里", last: ""))
        #expect(!shouldRequest("帮我把这段存到 notion 里", last: "帮我把这段存到 notion 里"))
        #expect(!shouldRequest("帮我把这段存到 notion 里。", last: "帮我把这段存到 notion 里"))
        #expect(!shouldRequest("嗯", last: ""))
        #expect(!shouldRequest("帮我把这段存到 notion 里", last: "", enabled: false))
        #expect(!shouldRequest("帮我把这段存到 notion 里", last: "", listening: false))
        #expect(!shouldRequest("帮我把这段存到 notion 里", last: "", requesting: true))
        // **被取消（总闸门）→ 不发**。
        #expect(!shouldRequest("帮我把这段存到 notion 里", last: "", cancelled: true))
    }

    // MARK: - 提交时那几行

    @Test func decorationOnlyCarriesWhatTheUserConfirmed() throws {
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: [], typedInput: "") == nil)
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: ["   "], typedInput: "\n ") == nil)
        #expect(DirectionBoardPrompt.decoration(confirmedDirectionTexts: ["保存到 Notion"], typedInput: "")
            == "用户真实意图的任务方向是：保存到 Notion")
        #expect(DirectionBoardPrompt.decoration(
            confirmedDirectionTexts: ["保存到 Notion", "用户确认的任务理解是：他在整理文件"],
            typedInput: "顺便截图")
            == """
            用户真实意图的任务方向是：保存到 Notion
            用户确认的任务理解是：他在整理文件
            用户的补充说明是：顺便截图
            """)
    }

    // MARK: - 复盘（每天中午 12 点）

    @Test func reviewParsesTheModelsJSON() throws {
        let extracted = TaskDirectionReviewJob.parseExtractedDirections("""
        [{"keyword": "整理照片", "detail": "把相册里的照片按时间归类"},
         {"keyword": "写周报", "detail": "把这一周做的事整理成周报"}]
        """)
        #expect(extracted.map(\.keyword) == ["整理照片", "写周报"])
        #expect(TaskDirectionReviewJob.parseExtractedDirections("我看不出来").isEmpty)
    }

    @Test func nextNoonIsTheNextLocalNoon() throws {
        let calendar = Calendar.current
        // 上午 9 点 → 今天中午 12 点。
        let morning = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: Date())!
        #expect(calendar.component(.hour, from: TaskDirectionReviewJob.nextNoon(from: morning)) == 12)
        #expect(calendar.isDate(TaskDirectionReviewJob.nextNoon(from: morning), inSameDayAs: morning))
        // 下午 3 点 → 明天中午 12 点。
        let afternoon = calendar.date(bySettingHour: 15, minute: 0, second: 0, of: Date())!
        let nextNoon = TaskDirectionReviewJob.nextNoon(from: afternoon)
        #expect(calendar.component(.hour, from: nextNoon) == 12)
        #expect(!calendar.isDate(nextNoon, inSameDayAs: afternoon))
    }
}
