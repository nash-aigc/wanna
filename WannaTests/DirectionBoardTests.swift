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

    /// **用户明确说过的方向永远排最前、编号稳定**，而且**"对"和"不对"都要留在板上**
    ///（用户 2026-09-27：「无论是对还是不对都要显示」+「这个方向一就一直在这里卡片显示出来」）。
    @Test func pinnedDirectionsLeadTheRowAndKeepTheirNumber() throws {
        let items = DirectionBoardMatching.displayedItems(
            transcriptText: "帮我把这段存到 notion 里",
            directions: directions,
            jevProbabilities: ["show.point": 0.9, "act.computer": 0.7],
            probabilityThreshold: 0.5,
            pinnedStates: [("act.computer", .denied), ("note.notion", .confirmed)])
        #expect(items.prefix(2).map(\.directionID) == ["act.computer", "note.notion"])
        #expect(items.prefix(2).map(\.state) == [.denied, .confirmed])
        #expect(items.prefix(2).map(\.number) == [1, 2])
        // 本地命中的"保存到 Notion"已经在固定项里了，不该再出现第二次。
        #expect(items.filter { $0.directionID == "note.notion" }.count == 1)
    }

    /// 列数满了**先砍 JEV 那部分**，固定项一个都不砍（用户：「最多不要超过 5 列」）。
    @Test func pinnedItemsSurviveTheColumnCap() throws {
        let pins: [(directionID: String, state: TaskDirectionStore.PinState)] = [
            ("note.notion", .confirmed), ("show.point", .confirmed), ("act.computer", .confirmed),
        ]
        let items = DirectionBoardMatching.displayedItems(
            transcriptText: "帮我画一张图",
            directions: directions,
            jevProbabilities: ["vision.make": 0.99, "text.write": 0.98, "text.chat": 0.97],
            probabilityThreshold: 0.5,
            pinnedStates: pins,
            maximumItemCount: 4)
        #expect(items.count == 4)
        #expect(items.map(\.directionID).contains("note.notion"))
        #expect(items.map(\.directionID).contains("show.point"))
        #expect(items.map(\.directionID).contains("act.computer"))
    }

    // MARK: - 口述的选择判定（**模型在下一轮给，编号按上一轮那一列**）

    /// 用户 2026-09-27 的两拍语义：他说「方向一对、方向三不对」，**大模型在下一轮**才读懂，
    /// 而且它说的编号指的是**上一轮显示的那一列**（这中间 JEV 可能已经重排过）。
    @Test func selectionVerdictMapsThroughThePreviousRoundsNumbering() throws {
        func item(_ id: String, _ keyword: String, _ number: Int) -> DirectionBoardDisplayItem {
            DirectionBoardDisplayItem(directionID: id, keyword: keyword, number: number,
                                      state: .pending, reason: .jevProbability)
        }
        // 上一轮板上是这三格（这一轮 JEV 已经把它们换掉了，所以只能靠这份快照）。
        let previousRound = [item("vision.look", "看图说话", 1),
                             item("text.write", "写成文章", 2),
                             item("act.computer", "操作电脑", 3)]

        let verdicts = DirectionBoardMatching.parseSelectionVerdict(
            "选择：1 对，3 不对", previousRound: previousRound)
        #expect(verdicts.count == 2)
        #expect(verdicts.first?.directionID == "vision.look")
        #expect(verdicts.first?.state == .confirmed)
        #expect(verdicts.last?.directionID == "act.computer")
        #expect(verdicts.last?.state == .denied)

        // 中文数字 + 「取消」= 取消固定（state 为 nil）。
        let cancel = DirectionBoardMatching.parseSelectionVerdict("选择：取消 2", previousRound: previousRound)
        #expect(cancel.first?.directionID == "text.write")
        #expect(cancel.first?.state == nil)

        // 用户没在评论方向 → 这一行不写 → 什么都不改。
        #expect(DirectionBoardMatching.parseSelectionVerdict("目标问题：整理文件", previousRound: previousRound).isEmpty)
        // 编号越界（上一轮只有三格，他说第四个）→ 忽略，不猜。
        #expect(DirectionBoardMatching.parseSelectionVerdict("选择：4 对", previousRound: previousRound).isEmpty)
    }

    @Test func spokenCancelBoardNeedsTheExactPhrase() throws {
        #expect(DirectionBoardMatching.spokenCancelBoardRequested(in: "取消任务看板"))
        #expect(DirectionBoardMatching.spokenCancelBoardRequested(in: "帮我取消任务方向"))
        #expect(!DirectionBoardMatching.spokenCancelBoardRequested(in: "取消任务"))
        #expect(!DirectionBoardMatching.spokenCancelBoardRequested(in: "把任务方向改一下"))
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

    @Test func decorationCarriesConfirmedDirectionsUnderstandingAndTypedInput() throws {
        func decision(_ confirmed: [(String, String)], _ understanding: [(String, String)], _ typed: String)
            -> DirectionBoardTurnDecision {
            DirectionBoardTurnDecision(confirmedDirections: confirmed.map { (keyword: $0.0, detail: $0.1) },
                                       typedInput: typed,
                                       understanding: understanding.map { (label: $0.0, value: $0.1) })
        }
        // 什么都没点、也没输入、理解也是空的 → 不加任何东西（提示词与从前一字不差）。
        #expect(DirectionBoardPrompt.decoration(decision([], [], "")) == nil)
        #expect(DirectionBoardPrompt.decoration(decision([], [], "   ")) == nil)

        // 只有用户**明确确认**的方向才发，而且**关键词和描述一起发**
        //（用户：「这个词跟描述的部分就会作为提示词的一部分来去发给 AI」）。
        #expect(DirectionBoardPrompt.decoration(
            decision([("保存到 Notion", "把内容整理成一条 Notion 笔记写进用户指定的那一页")], [], ""))
            == "用户真实意图的任务方向是：保存到 Notion（把内容整理成一条 Notion 笔记写进用户指定的那一页）")
        // 描述和关键词一样时不必重复括起来。
        #expect(DirectionBoardPrompt.decoration(decision([("写周报", "写周报")], [], ""))
            == "用户真实意图的任务方向是：写周报")

        // **大模型的理解**无条件跟着走（用户：「这部分全部都作为一个参考」）；顺序固定：
        // 方向 → 理解 → 用户输入。
        #expect(DirectionBoardPrompt.decoration(
            decision([("看图说话", "看屏幕描述内容")],
                     [("目标问题", "判断这道题选哪个"), ("类型", "做题")],
                     "顺便截图"))
            == """
            用户真实意图的任务方向是：看图说话（看屏幕描述内容）
            模型对这次任务的理解是：目标问题：判断这道题选哪个；类型：做题
            用户的补充说明是：顺便截图
            """)
    }

    // MARK: - 答案预览的寿命（用户报的"ESC 退出后卡片还跟着鼠标"）

    /// **只有"提交"那一轮留着预览，其余出口一律当场作废。**
    ///
    /// 2026-09-27 的致命 bug：他按住快捷键提问（右下角出现预览）→ 按 ESC 退出 →
    /// **卡片没退，一直跟着鼠标**。根因是那张卡的寿命靠"每个出口记得收一下"，
    /// 而 ESC 这条出口漏了（提交那条要留着交接、不能收，两者必须分开）。
    @Test @MainActor func onlyTheSubmittingTurnKeepsTheAnswerPreview() throws {
        let session = DirectionBoardSession.shared
        var writes: [String?] = []
        session.answerPreviewWriter = { writes.append($0) }

        // 一次"提交"：留着 —— 真答案 1~2 秒后要来交接（收早了就是"显示了两个回复"）。
        session.beginListening(cycleID: "unit-test-submit")
        #expect(session.isListening)
        // `beginListening` 自己会清一次（新一轮 = 上一轮那张预览作废），那一次不计入。
        writes.removeAll()
        _ = session.consumeTurnDecision()
        #expect(writes.isEmpty)          // 一个字都没写 = 预览没被清

        // 一次"放弃"（ESC / 窗口到期走的就是这个出口）：当场作废。
        session.beginListening(cycleID: "unit-test-abandon")
        session.endListening()
        #expect(writes.last == .some(nil))

        session.answerPreviewWriter = nil
    }

    // MARK: - 四段卡片里的解析（固定四行 + 任务结果）

    /// **行的集合恒定** —— 这是卡片"不再跳"的全部依据。
    ///
    /// 用户 2026-09-27：「他回复结果的时候总是跳、总是蹦……内容有时候有软件目标细节，有时候没有」
    /// +「这几行固定在这，而不是突然间有、突然间没有」。所以解析**永远返回那四行**，
    /// 缺的行值是空串（视图画占位符），行的数量不随模型怎么写而变。
    @Test func understandingRowsAreAlwaysTheSameFour() throws {
        #expect(DirectionBoardPrompt.understandingLabels == ["目标问题", "类型", "参考", "细节"])
        // 什么都不给 → 四行都在，全是空值。
        let empty = DirectionBoardPrompt.parseUnderstandingLines("")
        #expect(empty.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(empty.allSatisfy { $0.value.isEmpty })
        // 只给一行 → 另外三行仍然在。
        let partial = DirectionBoardPrompt.parseUnderstandingLines("类型：做题")
        #expect(partial.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(partial.first { $0.label == "类型" }?.value == "做题")
        #expect(partial.filter { $0.value.isEmpty }.count == 3)
    }

    /// **「答案」不能被「细节」吞掉** —— 理解和答案是**两节**，必须各归各的。
    ///
    /// 2026-09-27 实测截图：模型把 `任务结果：选 A（…）` 写在「细节」那行的**尾巴上**，
    /// 而解析器当时只把理解标签当边界，于是同一句话在看板上出现两遍。
    /// 现在「答案」是边界标签（只截断、不成理解行），而它自己由 `parseAnswer` 取走。
    @Test func answerIsNotSwallowedByDetails() throws {
        let raw = """
        目标问题：把选这道题答案的判断记下来
        类型：做题
        参考：预览（PDF 文件看图）
        细节：屏幕上是几何展开图折叠成正方体的题，按「相对面隔一格」推断。 答案：选 A（左侧那个带轮廓的图）
        """
        let lines = DirectionBoardPrompt.parseUnderstandingLines(raw)
        #expect(lines.map(\.label) == DirectionBoardPrompt.understandingLabels)
        let details = lines.first { $0.label == "细节" }?.value ?? ""
        #expect(!details.contains("答案："))
        #expect(details.hasSuffix("推断。"))
        #expect(DirectionBoardPrompt.parseAnswer(raw) == "选 A（左侧那个带轮廓的图）")
        // 正文里只剩下真正的"标签之外的话"，没有孤零零的「:选 A（…）」。
        let leftover = DirectionBoardPrompt.leftoverParagraphText(raw)
        #expect(!leftover.contains("选 A"))
    }

    /// **旧标签照样认**（模型不一定照新格式写：实测它常把「软件 / 文件 / 目标」写在原来的位置上）。
    /// 只认正式名会让那一行的内容掉进正文里 —— 屏幕上就是"这行空了、内容跑到别处"。
    @Test func legacyLabelsStillLandOnTheFixedRows() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines("""
        软件：预览
        文件：a.pdf
        目标：整理桌面
        类型：整理文件
        细节：只动下载目录
        """)
        #expect(lines.map(\.label) == DirectionBoardPrompt.understandingLabels)
        // 软件 + 文件 合到「参考」那一行（旧的两种都算"参考材料"）。
        #expect(lines.first { $0.label == "参考" }?.value == "预览")
        #expect(lines.first { $0.label == "目标问题" }?.value == "整理桌面")
        #expect(lines.first { $0.label == "类型" }?.value == "整理文件")
        #expect(lines.first { $0.label == "细节" }?.value == "只动下载目录")
    }

    /// 四行写在**同一行**里（模型常这么干）也要切得开。
    @Test func understandingRowsSplitInsideOneLine() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines(
            "目标问题:整理 类型:整理文件 参考:桌面 细节:题图在左侧")
        #expect(lines.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(lines.first { $0.label == "细节" }?.value == "题图在左侧")
        #expect(lines.first { $0.label == "目标问题" }?.value == "整理")
    }

    /// **「目标问题」自己嵌着两个别名**（`目标:` / `问题:` 都在它里面）：不处理重叠就会切出三段空值，
    /// 那一行的内容整段消失。
    @Test func nestedLabelDoesNotBreakTheValue() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines("目标问题：整理桌面上的文件")
        #expect(lines.first { $0.label == "目标问题" }?.value == "整理桌面上的文件")
        // 「任务类型」同理（里面嵌着「类型」）。
        let typeLines = DirectionBoardPrompt.parseUnderstandingLines("任务类型：做题")
        #expect(typeLines.first { $0.label == "类型" }?.value == "做题")
    }

    /// 模型用「—」表示"这一行没有内容"时，我们当**空**处理（占位符由视图统一画）。
    @Test func dashMeansEmptyNotContent() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines("目标问题：整理文件\n类型：整理\n参考：—\n细节：—")
        #expect(lines.first { $0.label == "参考" }?.value == "")
        #expect(lines.first { $0.label == "细节" }?.value == "")
    }

    /// 答案续到下一行（实测模型写成「答案：选」+ 换行 +「A」）。
    @Test func answerSpansTwoLinesAndStaysOptional() throws {
        #expect(DirectionBoardPrompt.parseAnswer("类型:做题\n答案：选\nA") == "选 A")
        // **没有这一行就没有答案** —— 右下角于是保持空（用户选的：「识别到「问题」才显示」）。
        #expect(DirectionBoardPrompt.parseAnswer("类型:做题\n细节:题在左边") == nil)
        // 模型用「—」表示"没有" → 也当空。
        #expect(DirectionBoardPrompt.parseAnswer("答案：—") == nil)
        // **答案与理解互不影响**：理解那四行照常解析出来。
        let raw = "目标问题：整理文件\n类型：整理\n答案：北京在中国的北部。"
        #expect(DirectionBoardPrompt.parseAnswer(raw) == "北京在中国的北部。")
        #expect(DirectionBoardPrompt.parseUnderstandingLines(raw).first { $0.label == "目标问题" }?.value == "整理文件")
    }

    /// **解析读的是原文，不是被截过的显示文本**。
    ///
    /// 2026-09-27 实测：`cleanParagraph` 的 200 字上限被用在了**原文**上，四行加起来轻松超过
    /// 200 字，于是「细节」那行在屏幕上写到一半就断了（断在「题目在屏幕右」）。
    @Test func longRepliesSurviveParsing() throws {
        let longDetails = String(repeating: "这是一段很长的细节说明。", count: 20)
        let raw = "目标问题:整理\n类型:做题\n参考:a.pdf\n细节:\(longDetails)"
        let cleaned = DirectionBoardPrompt.cleanRawResponse(raw)
        let lines = DirectionBoardPrompt.parseUnderstandingLines(cleaned)
        let details = lines.first { $0.label == "细节" }?.value ?? ""
        #expect(details.count > 200)
        #expect(details.hasSuffix("。"))
        // 显示那一步仍然限长（看板上那块地方就这么大）。
        #expect(DirectionBoardPrompt.cleanParagraph(cleaned).count
            <= DirectionBoardPrompt.maximumParagraphCharacters)
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
