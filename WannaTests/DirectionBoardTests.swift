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

import AppKit
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

    /// **实时那两张卡：他一停下来就刷，跟说了几个字完全无关**（用户 2026-09-28）。
    ///
    /// 原来是「新增 ≥10 字（标点不算）」、梳理那条更是 ≥20 —— 所以他说一句短的，
    /// **两张卡一次都不刷**，屏幕上停在上一轮（他报的「没有反应」就是这个）。
    /// 现在唯一的"内容"条件是「比上一次请求多了**至少一个内容字**」——
    /// 那不是字数限制，只是"这一轮确实有新东西可说"。
    @Test func theCadenceGateOnlyNeedsSomethingNew() throws {
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
        // **一个字也算数**（「跟说话字数完全无关」）。
        #expect(shouldRequest("嗯", last: ""))
        #expect(shouldRequest("好", last: ""))
        #expect(shouldRequest("北京在哪", last: ""))
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
        // ⚠️ 末尾现在**永远**跟着那段"怎么看最后一轮"（见 `lastTurnRelationRule`），
        // 所以这几条断言改成"以……开头"。
        #expect(DirectionBoardPrompt.decoration(
            decision([("保存到 Notion", "把内容整理成一条 Notion 笔记写进用户指定的那一页")], [], ""))?
            .hasPrefix("用户真实意图的任务方向是：保存到 Notion（把内容整理成一条 Notion 笔记写进用户指定的那一页）") == true)
        // 描述和关键词一样时不必重复括起来。
        #expect(DirectionBoardPrompt.decoration(decision([("写周报", "写周报")], [], ""))?
            .hasPrefix("用户真实意图的任务方向是：写周报") == true)

        // **大模型的理解**无条件跟着走（用户：「这部分全部都作为一个参考」）；顺序固定：
        // 方向 → 理解 → 用户输入。
        #expect(DirectionBoardPrompt.decoration(
            decision([("看图说话", "看屏幕描述内容")],
                     [("目标问题", "判断这道题选哪个"), ("类型", "做题")],
                     "顺便截图"))?
            .hasPrefix("""
            用户真实意图的任务方向是：看图说话（看屏幕描述内容）
            模型对这次任务的理解是：目标问题：判断这道题选哪个；类型：做题
            用户的补充说明是：顺便截图
            """) == true)
    }

    // MARK: - 参考材料三类（屏幕 / 剪贴板 / 访达选中）

    /// **关键词命中就采集**（用户 2026-09-27：说几次「屏幕」就截几次）。
    @Test func referenceKeywordsAreRecognised() throws {
        let screen = TurnReferenceCollector.splitKeywords(AppSettings.defaultNotionScreenKeywords)
        let clipboard = TurnReferenceCollector.splitKeywords(AppSettings.defaultNotionClipboardKeywords)
        let selected = TurnReferenceCollector.splitKeywords(AppSettings.defaultSelectedItemKeywords)
        #expect(screen.contains("参考屏幕"))
        #expect(clipboard.contains("参考剪贴板"))
        #expect(selected.contains("选中文件"))

        func mentions(_ keywords: [String], _ text: String) -> Int {
            NotionNoteDetector.transcriptMentionCount(keywords, in: text,
                                                      edgeCharacterCount: NotionNoteDetector.edgeCharacterCount)
        }
        // ⚠️ 这里断言的是**采集器真正依赖的那条契约**，不是绝对值：
        // `transcriptMentionCount` 同时看开头 100 字与结尾 100 字，短句两段重叠，
        // 所以**一次提到会算出 2**。采集器因此按"计数变大就加一组"来采集
        //（每次事件加一组，而不是按增量加 —— 按增量在短句上会一次加两组，
        //  那条老路 `NotionNoteSession` 就是这么写的）。
        let once = mentions(screen, "参考屏幕上的这道题")
        #expect(once > 0)
        // 同一句被重放（识别器给的是累积文本）→ 计数不变 → **不会再截**。
        #expect(mentions(screen, "参考屏幕上的这道题") == once)
        // 又说了一次 → 计数变大 → 再加一组。
        #expect(mentions(screen, "参考屏幕上的这道题，再参考屏幕一次") > once)

        #expect(mentions(clipboard, "根据剪贴板里的内容总结一下") > 0)
        #expect(mentions(clipboard, "帮我看看这个文件") == 0)
        #expect(mentions(selected, "把这个文件夹里的东西列出来") > 0)
        #expect(mentions(selected, "帮我把这段记下来") == 0)
    }

    /// **标签只反映"真的拿到了"**（用户：「只有执行成功、成功获取到，才能显示，
    /// 而不是根据用户的关键词」）—— 这一条在代码里是结构上成立的：标签读 `materials`，
    /// 而材料只在取到时才写。
    @Test func referenceTagsOnlyShowWhatWasActuallyCollected() throws {
        var materials = TurnReferenceMaterials()
        #expect(materials.tags.isEmpty)
        #expect(materials.isEmpty)

        // 光有"关键词"是没有用的 —— 那不在这个类型里。写上材料才算数。
        materials.clipboard = .text("一段剪贴板文本", sourceName: nil)
        #expect(materials.tags == ["剪贴板"])

        materials.clipboard = nil
        materials.selectedPaths = ["/tmp/一个文件.txt", "/tmp/一个文件夹"]
        // 文件与文件夹**分开两类**（用户点名要这两类）。
        #expect(materials.tags == ["文件"])
    }

    /// 文件 / 文件夹按**磁盘上的真实类型**分（不看名字里有没有扩展名）。
    @Test func referencePathsSplitByRealKind() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent("wanna-ref-test-\(UUID().uuidString)")
        try manager.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? manager.removeItem(at: root) }

        let folder = root.appendingPathComponent("一个文件夹")
        try manager.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("一个文件.txt")
        try "内容".write(to: file, atomically: true, encoding: .utf8)

        let (files, folders) = TurnReferenceMaterials.splitPathsByKind([file.path, folder.path])
        #expect(files == [file.path])
        #expect(folders == [folder.path])
    }

    /// **文件和文件夹只给路径、不给内容**（用户：「参考文件夹时，里面的内容可能特别大，
    /// 可能超过上下文限制，所以最好让 agents 来执行」）。
    @Test func referencePromptBlockSendsPathsNotContents() throws {
        var materials = TurnReferenceMaterials()
        materials.selectedPaths = ["/Users/someone/Desktop/一个文件夹"]
        materials.clipboard = .paths(["/Users/someone/Desktop/别的东西.bin"])
        let block = TurnReferenceCollector.promptBlock(for: materials)
        #expect(block?.contains("<reference_materials>") == true)
        #expect(block?.contains("/Users/someone/Desktop/一个文件夹") == true)
        #expect(block?.contains("只给了绝对路径，没有给里面的内容") == true)

        // 剪贴板是**文本**时才把正文带上。
        var withText = TurnReferenceMaterials()
        withText.clipboard = .text("这是剪贴板里的正文", sourceName: "笔记.md")
        let textBlock = TurnReferenceCollector.promptBlock(for: withText)
        #expect(textBlock?.contains("这是剪贴板里的正文") == true)
        #expect(textBlock?.contains("笔记.md") == true)

        // 一份材料都没有 → 整块不出现（提示词与没有这个功能时一字不差）。
        #expect(TurnReferenceCollector.promptBlock(for: TurnReferenceMaterials()) == nil)
    }

    /// 认得的那几种文字文件（与 `textFromFile` 的 switch 是同一份真相 ——
    /// 剪贴板那条路靠它决定"抽正文"还是"只给路径"）。
    @Test func textReadableFileKindsMatchTheExtractor() throws {
        #expect(NotionNoteReferenceGatherer.isTextReadableFile(at: URL(fileURLWithPath: "/tmp/a.md")))
        #expect(NotionNoteReferenceGatherer.isTextReadableFile(at: URL(fileURLWithPath: "/tmp/a.PDF")))
        #expect(!NotionNoteReferenceGatherer.isTextReadableFile(at: URL(fileURLWithPath: "/tmp/a.app")))
        #expect(!NotionNoteReferenceGatherer.isTextReadableFile(at: URL(fileURLWithPath: "/tmp/一个文件夹")))
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
    /// +「这几行固定在这，而不是突然间有、突然间没有」。所以解析**永远返回那几行**，
    /// 缺的行值是空串（视图画占位符），行的数量不随模型怎么写而变。
    ///
    /// ⚠️ 2026-09-28：`understandingLabels` 只剩 **脑图 + 矛盾** 两行（「拼写错误」整行删掉）。
    @Test func understandingRowsAreAlwaysTheSameSet() throws {
        // 2026-09-27 深夜：左侧只剩「矛盾」——「需求」并进了右侧那张脑图
        //（用户：「左侧边现在就让它显示**参考、矛盾**……就只显示这几个」）。
        #expect(DirectionBoardPrompt.understandingLabels == ["细节", "矛盾"])
        // 什么都不给 → 四行都在，全是空值。
        let empty = DirectionBoardPrompt.parseUnderstandingLines("")
        #expect(empty.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(empty.allSatisfy { $0.value.isEmpty })
        // 只给一行 → 另外两行仍然在（占位符由视图画）。
        let partial = DirectionBoardPrompt.parseUnderstandingLines("细节：├─ 整理下载目录")
        #expect(partial.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(partial.first { $0.label == "细节" }?.value == "├─ 整理下载目录")
        #expect(partial.filter { $0.value.isEmpty }.count == 1)
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

    /// **「细节」要能多行**（用户 2026-09-27：「细节保留，但是要简要说明，**不同类型的任务，
    /// 换行显示说明**」）—— 标签下面接着的几行都算它的内容，直到下一个标签行或空行为止。
    @Test func detailsCollectTheirContinuationLines() throws {
        let raw = """
        目标：把这段整理成一条笔记
        细节：涉及 Notion 的一个页面
        用户希望保留原来的标题
        时间上不急
        类型：做题
        """
        let lines = DirectionBoardPrompt.parseUnderstandingLines(raw)
        let details = lines.first { $0.label == "细节" }?.value ?? ""
        #expect(details == "涉及 Notion 的一个页面\n用户希望保留原来的标题\n时间上不急")
        // 被删掉的「类型」仍然当**边界** —— 它的内容不许并进「细节」里。
        #expect(!details.contains("做题"))
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
        // 「软件 / 文件 / 类型」这些已被删掉的行现在只当**边界**：它们自己不出现，
        // 内容也不许漏进「细节」（否则模型一时改不过来，屏幕上就多一段莫名其妙的尾巴）。
        // 「目标」2026-09-27 起也进了边界那一类（它并进了脑图，不再单列一行）——
        // 关键是**它的内容不许漏进「细节」**（模型一时改不过来才是常态）。
        let detailsValue = lines.first { $0.label == "细节" }?.value ?? ""
        #expect(detailsValue == "只动下载目录", "细节的实际值：[\(detailsValue)]")
        #expect(!detailsValue.contains("整理桌面"), "细节里混进了「目标」那一行：[\(detailsValue)]")
    }

    /// 四行写在**同一行**里（模型常这么干）也要切得开。
    @Test func understandingRowsSplitInsideOneLine() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines("矛盾:两个数字对不上 细节:题图在左侧")
        #expect(lines.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(lines.first { $0.label == "细节" }?.value == "题图在左侧")
        #expect(lines.first { $0.label == "矛盾" }?.value == "两个数字对不上")
        // 模型把被删掉的行也写在同一行里时，它们只当边界、不成行。
        let withDropped = DirectionBoardPrompt.parseUnderstandingLines(
            "目标:整理 类型:整理文件 参考:桌面 细节:题图在左侧")
        #expect(withDropped.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(withDropped.first { $0.label == "细节" }?.value == "题图在左侧")
    }

    /// **标签互相嵌套**：`目标问题:` 里含 `目标:`、`问题:`；`任务类型:` 里含 `类型:`。
    /// 不处理重叠就会切出几段空值，那一行的内容整段消失。
    @Test func nestedLabelDoesNotBreakTheValue() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines("细节：整理桌面上的文件")
        #expect(lines.first { $0.label == "细节" }?.value == "整理桌面上的文件")
        // 「任务类型」已经被删掉了（用户 2026-09-27），但它仍然当**边界**：
        // 它自己不出现，内容也不许漏进「细节」。
        let typeLines = DirectionBoardPrompt.parseUnderstandingLines("任务类型：做题\n细节：只动下载目录")
        #expect(typeLines.map(\.label) == DirectionBoardPrompt.understandingLabels)
        #expect(typeLines.first { $0.label == "细节" }?.value == "只动下载目录")
    }

    /// 模型用「—」表示"这一行没有内容"时，我们当**空**处理（占位符由视图统一画）。
    @Test func dashMeansEmptyNotContent() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines("目标：整理文件\n细节：—")
        #expect(lines.first { $0.label == "细节" }?.value == "")
    }

    /// 答案续到下一行（实测模型写成「答案：选」+ 换行 +「A」）。
    @Test func answerSpansTwoLinesAndStaysOptional() throws {
        #expect(DirectionBoardPrompt.parseAnswer("目标:做题\n答案：选\nA") == "选 A")
        // **没有这一行就没有答案** —— 右下角于是保持空（用户选的：「识别到「问题」才显示」）。
        #expect(DirectionBoardPrompt.parseAnswer("目标:做题\n细节:题在左边") == nil)
        // 模型用「—」表示"没有" → 也当空。
        #expect(DirectionBoardPrompt.parseAnswer("答案：—") == nil)
        // **答案与理解互不影响**：理解那四行照常解析出来。
        let raw = "细节：整理文件\n答案：北京在中国的北部。"
        #expect(DirectionBoardPrompt.parseAnswer(raw) == "北京在中国的北部。")
        #expect(DirectionBoardPrompt.parseUnderstandingLines(raw).first { $0.label == "细节" }?.value == "整理文件")
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

    /// **值里出现的「疑问」二字不许被当成第二个标签**（2026-09-27 在真机上量到的截断）。
    ///
    /// 原始回复来自 `主Agent诊断.log` 的一条真实往返 —— 屏幕上量到的是
    /// 「疑问  一、关于「记到哪里」的」，后半句凭空消失；同一轮里不含这两个字的「目标」
    /// 折行完全正常，这正是指认它的证据。
    @Test func labelWordInsideAValueIsNotASecondLabel() throws {
        let raw = """
        目标：把他选中/剪贴板里关于浮动卡片的两条调整意见总结下来，顺带说明「2 存成一条录音」该不该选。
        疑问：一、关于「记到哪里」的疑问：是要写进 Notion 某一页，还是只当本轮答复、或存成本地录音
        类型：总结记录
        """
        let lines = DirectionBoardPrompt.parseUnderstandingLines(raw)
        let question = try #require(lines.first { $0.label == "矛盾" }?.value)
        // ⚠️ 2026-09-28：解析处**不再给这一行套形状** —— 它原样出来（只把全角冒号统一成半角），
        // 形状交给画的那一侧（`questionTexts` → `?：` + 一句话）。
        #expect(question == "一、关于「记到哪里」的疑问:是要写进 Notion 某一页，还是只当本轮答复、或存成本地录音")
        // 画的时候序号与包装都摘掉，只剩那句问题。
        #expect(DirectionBoardView.questionTexts(from: question)
                == ["是要写进 Notion 某一页，还是只当本轮答复、或存成本地录音"])
        #expect(lines.first { $0.label == "矛盾" }?.value.isEmpty == false)
        // **一行里挤两个标签仍然要认**（模型常这么写）—— 别把上面那条修过头。
        // ⚠️ 「—」是空值标记，解析出来就是**空串**（见 `dashMeansEmptyNotContent`），
        // 第一版这里写「—」又红了一次 —— 两次红都是断言写错，实现是对的。
        let packed = DirectionBoardPrompt.parseUnderstandingLines("矛盾：两个数字对不上 细节：打个比方")
        #expect(packed.first { $0.label == "矛盾" }?.value == "两个数字对不上")
        #expect(packed.first { $0.label == "细节" }?.value == "打个比方")
    }

    /// **提示词里三件用户 2026-09-27 当场定的事，一句都不许被后来改回去**：
    /// ① 目标**只看用户自己的话**（屏幕是参考，不是目标）；
    /// ② 疑问**只写逻辑矛盾**，不许问澄清类的问题（「什么地方的北京」那种墨迹）；
    /// ③ **以当前这一句为准**（问题可以是跳跃的），并且用户的原话在请求里要被**标成重点**。
    @Test func thePromptKeepsTheUsersWordsAsTheGoal() throws {
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "整理文件", detail: "把下载目录收拾一下")],
            looksAtTheScreen: true)
        // ① 脑图要带上他的原话、别过度简化（用户 2026-09-27 深夜那条）。
        #expect(systemPrompt.contains("不许压成抽象的几个字"))
        #expect(systemPrompt.contains("我没说过这个"))
        // ② 疑问：只关注逻辑矛盾，且明写不许问澄清类的问题。
        #expect(systemPrompt.contains("只写逻辑矛盾"))
        #expect(systemPrompt.contains("不要问澄清类的问题"))
        #expect(systemPrompt.contains("用户的问题正常回答就好"))
        #expect(systemPrompt.contains("什么地方的北京"))
        // ③ 以当前这一句为准 + 两种场景。
        #expect(systemPrompt.contains("以当前这一句为准"))
        #expect(systemPrompt.contains("新开一个分支"))

        // **用户消息里只有那一句问题**（2026-09-27 深夜改成机械分离：背景全在系统提示词里）——
        // 模型对"这一轮要答什么"的判断读的就是用户消息，所以那里不能塞参考。
        let userPrompt = DirectionBoardPrompt.understandingUserPrompt(newQuestion: "帮我把下载目录整理一下")
        #expect(userPrompt == "帮我把下载目录整理一下")
    }

    /// 用户 2026-09-28 的尺寸（7 字形）：**横杠 360 × 224、竖条 340、方向格子 2 行、
    /// 问题 3 行、参考标签 2 行**。这些数字是卡片"高度不晃"的全部依据，写死在这里。
    ///
    /// ⚠️ **左右两半都等于右下角那张回复卡的宽度**（2026-09-28 两次说的：先是「竖向这个宽度
    /// 其实跟右下角卡片的宽度应该设置为一样的」，随后是「**左侧的宽度刚好等于右下角这个卡片的
    /// 宽度**，让分隔线落在这个位置上」）—— 三个数现在是同一个来源，改一个不会只改到一半。
    @Test func theReservedRowsMatchTheUsersSizes() throws {
        // 用户 2026-09-28：「矛盾……**固定 10 行**」「参考……显示在**一行**上」「3 个选项显示在一行」。
        #expect(DirectionBoardView.questionRowLines == 10)
        #expect(DirectionBoardView.referenceTagRowLines == 1)
        #expect(DirectionBoardView.optionSlots == 3)
        // **左半宽 = 回复卡宽 + 20 的余量**（用户 2026-09-28：分隔线删掉之后，
        // 两张卡之间要留出距离 —— 「右侧内容也能不跟右下角卡片挨着」）。
        #expect(DirectionBoardView.barWidth
                == NotchSupport.answerCardMaximumWidth + NotchSupport.directionBoardBarCardClearance)
        #expect(DirectionBoardView.barHeight == 251)
        #expect(DirectionBoardView.mapWidth == 340)
        #expect(DirectionBoardView.mapWidth == NotchSupport.answerCardMaximumWidth)
    }

    /// **「静音多久自动发送」= 1.5 秒，而且与字数无关**（用户 2026-09-28）。
    ///
    /// 他的原话：「我正常的要求是说完话 **1.5 秒之内**没有说话，自动发送……
    /// 【**跟说话字数完全无关**】」。所以这一条同时钉两件事：
    /// ① 新默认值是 1.5；
    /// ② **存的正好是上一版默认值（2.0）＝ 他从没改过 → 一次性换成 1.5**（仓规：改默认值必须配迁移）；
    ///    **他真改过的值（比如 3.0）不许动**。
    @Test func silenceAutoSendIsOneAndAHalfSecondsAndIgnoresWordCount() throws {
        #expect(AppSettings().continuousListeningSilenceSendSeconds == 1.5)
        #expect(AppSettings().continuousListeningSilenceSendSeconds == 1.5)
        // 存的正好是旧默认值 2.0 → 迁移成 1.5；他自己设过的值（3.0）保持不动。
        let legacy = try JSONDecoder().decode(
            AppSettings.self, from: Data(#"{"continuousListeningSilenceSendSeconds": 2.0}"#.utf8))
        #expect(legacy.continuousListeningSilenceSendSeconds == 1.5)
        let chosen = try JSONDecoder().decode(
            AppSettings.self, from: Data(#"{"continuousListeningSilenceSendSeconds": 3.0}"#.utf8))
        #expect(chosen.continuousListeningSilenceSendSeconds == 3.0)
        // **跟字数完全无关**：主 Agent 那条窗口的门槛是 1（只挡"一个字都没有"）。
        #expect(CompanionManager.mainAgentListeningMinimumTranscriptCharacters == 1)
        let bar = CompanionManager.mainAgentListeningMinimumTranscriptCharacters
        #expect(BuddyDictationManager.continuousListeningContentCharacterCount(in: "嗯。") >= bar)
        #expect(BuddyDictationManager.continuousListeningContentCharacterCount(in: "好") >= bar)
        #expect(BuddyDictationManager.continuousListeningContentCharacterCount(in: "   ") < bar)
    }

    /// **一大轮结束 = 卡片回到"从来没有过"**（用户 2026-09-28 报的那个致命问题）。
    ///
    /// 他的原话：「如果上一次任务已经退出，比如按 ESC 退出了，第二次按住快捷键启动后，
    /// 右上角和右下角的卡片显示的仍然是**之前的历史记录**……只要大循环结束，显示的内容
    /// 都应该是全新的，**相当于没有历史**」。所以 `endBigRound()` 现在**不只是**清
    /// `previousRoundItems`：它把在途请求停掉、把累积的上下文与屏幕上那几行一起清空。
    @Test func endingABigRoundWipesTheBoardBackToNothing() throws {
        let session = DirectionBoardSession.shared
        // 摆上一份"跑过一大轮"的样子：模型给过内容、他也说过话。
        session.applyUnderstandingForTesting(mindMap: "关于行程\n├─ 明天去北京", question: "明天去北京还是天津")
        session.noteLiveTranscript("明天去北京")   // 这一句会落进 spokenTranscript / 方向匹配
        #expect(session.understandingLines.first { $0.label == "细节" }?.value.isEmpty == false)

        session.endBigRound(reason: "单测")

        // 图与矛盾都回到占位符（视图画「—」），说过的话与前几轮问答一起没了。
        #expect(session.understandingLines.allSatisfy { $0.value.isEmpty })
        #expect(session.accumulatedMindMap.isEmpty)
        #expect(session.spokenTranscript.isEmpty)
        #expect(session.displayedItems.isEmpty)
        // 行数仍然恒定（布局不跳）。
        #expect(session.understandingLines.map(\.label) == DirectionBoardPrompt.understandingLabels)
    }

    /// **7 字形的几何**：横杠在鼠标上方、竖条一直往下。
    ///
    /// 用户 2026-09-28：「高度……可以测量一下当前电脑屏幕的高度，然后占据它的 **70%**，
    /// 最多占据 70%」+「竖条……显示在右下角卡片的右侧，中间有一点距离」。
    @Test func theSevenShapeSitsAboveAndRightOfTheAnswerCard() throws {
        let screen = try #require(NSScreen.main ?? NSScreen.screens.first)
        // 竖向：顶边钉在「鼠标 + 横杠高 + 30」上。
        #expect(NotchSupport.directionBoardExpandedTopOffset
                == NotchSupport.directionBoardBarHeight + NotchSupport.directionBoardBarClearance)
        let anchor = CGPoint(x: 900, y: 500)
        let size = CGSize(width: NotchSupport.directionBoardBarWidth + NotchSupport.directionBoardMapWidth,
                          height: NotchSupport.directionBoardBarHeight)
        let frame = NotchSupport.directionBoardPanelFrame(anchor: anchor, size: size,
                                                          topEdgeOffsetAboveAnchor:
                                                            NotchSupport.directionBoardExpandedTopOffset)
        // 横杠的下沿正好在鼠标上方 30pt（AppKit：+y 向上），于是它**整个在鼠标上方**。
        let barBottom = frame.maxY - NotchSupport.directionBoardBarHeight
        #expect(abs(barBottom - (anchor.y + NotchSupport.directionBoardBarClearance)) < 0.5)
        // **分隔线正落在回复卡的右边缘上**（用户 2026-09-28：「左侧的宽度刚好等于右下角这个卡片的
        // 宽度，让分隔线落在这个位置上」）：横杠宽 = 回复卡宽，所以竖条的左边缘 =
        // 回复卡**最宽时**的右边缘 —— 卡窄一点的时候自然让出一条缝，卡最宽时严丝合缝。
        let mapLeft = frame.minX + NotchSupport.directionBoardBarWidth
        let answerCardRightEdge = anchor.x + 12 + NotchSupport.answerCardMaximumWidth
        // **留出那 20pt**（不是"等于"、更不是"贴着"）。
        #expect(abs(mapLeft - answerCardRightEdge - NotchSupport.directionBoardBarCardClearance) < 0.5)
        // 横向：顶边那个偏移不动 x，只动 y。
        #expect(abs(frame.minX - (anchor.x + 12)) < 0.5)
        // **贴到屏幕边也不许夹**（用户 2026-09-28：「右上角那个卡片……撞到边缘之后就不移动了，
        // 我希望它是一个**能够到屏幕外边**的」）—— 右下角那张回复卡从来不夹（它就是 鼠标 + 偏移），
        // 所以看板这边也必须只做算术，否则鼠标到边之后**只有一张卡还在动**，相对位置就散了。
        for edgeAnchor in [CGPoint(x: 5, y: 5),
                           CGPoint(x: screen.frame.maxX - 5, y: screen.frame.maxY - 5),
                           CGPoint(x: screen.frame.maxX - 5, y: 5)] {
            let edgeFrame = NotchSupport.directionBoardPanelFrame(
                anchor: edgeAnchor, size: size,
                topEdgeOffsetAboveAnchor: NotchSupport.directionBoardExpandedTopOffset)
            #expect(abs(edgeFrame.minX - (edgeAnchor.x + 12)) < 0.5)
            #expect(abs(edgeFrame.maxY - (edgeAnchor.y + NotchSupport.directionBoardExpandedTopOffset)) < 0.5)
        }

        // 高度上限 = 菜单栏以下那块高度的 70%（与右下角回复卡同一条规矩）。
        let expectedCap = (screen.frame.height - NotchSupport.menuBarHeight(on: screen)) * 0.7
        #expect(abs(NotchSupport.directionBoardMapMaximumHeight(on: screen) - expectedCap) < 0.5)
    }

    /// **「参考文件 / 参考文件夹」现在从剪贴板取，判据只有一条：是不是绝对路径**
    /// （用户 2026-09-27：「检测一下剪贴板的内容是不是一个路径、**是不是一个绝对路径**就可以了，
    /// 不需要去看选中文件。我发现这个东西很难实现」）。
    @Test func clipboardPathsMustBeAbsolute() throws {
        // 绝对路径：认。
        #expect(TurnReferenceMaterials.absolutePaths(inText: "/Users/mjm/Desktop/a.pdf")
                == ["/Users/mjm/Desktop/a.pdf"])
        #expect(TurnReferenceMaterials.absolutePaths(inText: "/tmp\n/Users/mjm")
                == ["/tmp", "/Users/mjm"])
        // `~` 开头要展开成绝对路径（它是绝对路径的另一种写法，不是相对路径）。
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        #expect(TurnReferenceMaterials.absolutePaths(inText: "~/Desktop") == [home + "/Desktop"])
        // **相对路径不认** —— 主 Agent 拿到 `Downloads/a.pdf` 哪也去不了。
        #expect(TurnReferenceMaterials.absolutePaths(inText: "Downloads/a.pdf").isEmpty)
        #expect(TurnReferenceMaterials.absolutePaths(inText: "./a.pdf").isEmpty)
        // 普通句子当然不认（这是"复制了一段话"的情形，它不是文件）。
        #expect(TurnReferenceMaterials.absolutePaths(inText: "帮我把这段话整理一下").isEmpty)
        #expect(TurnReferenceMaterials.absolutePaths(inText: "").isEmpty)
    }

    /// **模型爱把整行包在 `**…**` 里**（提示词写了「不要 Markdown」它照样写）——
    /// 这行字是直接画给用户看的，不剥掉就是屏幕上两个裸星号。
    ///
    /// ⚠️ 2026-09-28 起「矛盾」每一行的形状是 **`?：` + 一句话**（用户：「只需要在每一行的开头
    /// 写一个问号，就一个问号，然后冒号右边是那些内容」）—— 于是**解析处不再套形状**，
    /// 由 `questionTexts` / `questionLineText` 在画的这一侧把行首清理干净。
    @Test func markdownStarsAreStrippedFromTheRows() throws {
        let lines = DirectionBoardPrompt.parseUnderstandingLines(
            "矛盾：**一、关于「这段」的疑问:他说的和上一句对不上**")
        // 解析出来还是原文（只剥了 `**`）—— 形状不在这里定。
        #expect(lines.first { $0.label == "矛盾" }?.value == "一、关于「这段」的疑问:他说的和上一句对不上")
        // 画的时候：序号与「关于…的疑问：」那层包装都摘掉，只剩那句问题。
        #expect(DirectionBoardView.questionTexts(
            from: lines.first { $0.label == "矛盾" }?.value ?? "") == ["他说的和上一句对不上"])
        // 别的行不受影响。「目标」现在只当边界（那一行并进了脑图）—— 内容不许漏进别的行里。
        let goal = DirectionBoardPrompt.parseUnderstandingLines("目标：把这段记下来\n细节：├─ 素材")
        #expect(goal.first { $0.label == "细节" }?.value == "├─ 素材")
        // 单行的清理规则。
        #expect(DirectionBoardPrompt.questionLineText("一、关于 X 的疑问：  内容") == "内容")
        #expect(DirectionBoardPrompt.questionLineText("1. 记到哪一页还没定") == "记到哪一页还没定")
        #expect(DirectionBoardPrompt.questionLineText("?：已经带了问号") == "已经带了问号")
        #expect(DirectionBoardPrompt.questionLineText("没有序号的一句话") == "没有序号的一句话")
        #expect(DirectionBoardPrompt.questionLineText("—") == "")
        #expect(DirectionBoardPrompt.questionLineText("   ") == "")
    }

    /// **只看最近这一次**（用户 2026-09-27）：「如果最近的问题跟之前有关系，AI 就知道该怎么回复；
    /// 如果最近一次的问题跟之前没有关系，那就**只回复最近一次问题**」——
    /// 他给的那个例子（连着问北京）就是这条规则的判据。
    @Test func thePromptFocusesOnTheLatestQuestion() throws {
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "记笔记", detail: "把内容记到 Notion")],
            looksAtTheScreen: true)
        #expect(systemPrompt.contains("只看最近这一次"))
        // **没关系就一个字都别提之前**（用户点名的那条，还给了一个反例）。
        #expect(systemPrompt.contains("一个字都不要提参考内容"))
        #expect(systemPrompt.contains("不要提屏幕上的东西"))
        #expect(systemPrompt.contains("就事论事地答他刚问的那件事"))
        #expect(systemPrompt.contains("有关系的时候才参考，没关系是不参考"))
        #expect(systemPrompt.contains("中国在哪"))
        #expect(systemPrompt.contains("北京欢迎你"))
    }

    /// **「这一轮的新问题」永远不该是空的**（2026-09-27 真机上炸过的那条）：
    /// 当时算它的判据读了一个**从来没被赋值**的时间戳，于是恒为空串 ——
    /// 发给模型的是一段空问题，屏幕上表现为「我问他，他没回复」，而且**不报任何错**。
    /// 现在提示词那一节先是"重点只看这一段"，所以它空掉就等于这一轮没有内容可处理。
    @Test func theNewQuestionSectionIsNeverEmpty() throws {
        let prompt = DirectionBoardPrompt.understandingUserPrompt(newQuestion: "北京在哪")
        #expect(prompt == "北京在哪")
    }

    /// **两张卡片分工不同**（用户 2026-09-27 深夜）：右上角那张图**统筹全部** ——
    /// 之前问过的所有问题，连续的和跳跃的，都整理进去，看的是"用户到底在做什么"；
    /// 右下角那一条**只答当前这一轮**。所以"没关系就别提之前"那条只约束答案，不约束那张图。
    @Test func theMindMapAccumulatesEveryQuestion() throws {
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "查资料", detail: "查一下资料")],
            looksAtTheScreen: true)
        // 这一版：图的素材是**整份问题清单**，一次调用写出一张完整的图。
        #expect(systemPrompt.contains("每一件事都要在图里"))
        // **不限行数**（用户 2026-09-27 深夜：「我说的是提示词要求模型最多画 20 行的图，
        // **没有这个限制**。用户的内容可能是**两个小时**，那这个图就应该是两个小时的内容，
        // **用户所有的问题都应该在图里面显示**」）。
        #expect(systemPrompt.contains("不限行数"))
        #expect(!systemPrompt.contains("最多 20 行"))
        // **分类这一层是这一版新加的**（用户 2026-09-27：「右上角的脑图应该按照内容的类型来进行分类……
        // **实时地、主动地去分类**，而不是定性地强制让他去分什么类」）——
        // ⚠️ 它住在**第一次调用**（梳理那条，画图的就是它），不是第二次。
        let analysisPrompt = DirectionBoardPrompt.transcriptAnalysisSystemPrompt()
        #expect(analysisPrompt.contains("按大类分组画成一张树"))
        #expect(analysisPrompt.contains("分类行"))
        #expect(analysisPrompt.contains("问题行"))
        #expect(analysisPrompt.contains("不是从固定清单里挑"))
        #expect(analysisPrompt.contains("哪怕只有两件事也要分类"))
        #expect(analysisPrompt.contains("不许有\"没爹\"的问题"))
        #expect(analysisPrompt.contains("分类名里不要用冒号"))
        #expect(analysisPrompt.contains("只是例子，不是清单"))
        // 而「两张卡片分工不同」那条属于第二次调用（回答那条）。
        #expect(systemPrompt.contains("两张卡片分工不同"))

        // 请求里要带上**他问过的每一件事**（整份清单）——
        // 这是这一版的关键：**输入完整，输出才可能完整**（前两版只给"前五轮"，
        // 却要模型写出"所有问题"的图，它手里没有全部信息，只能靠记性，于是每次都丢）。
        // 那份**完整转写**现在只在第一次调用（梳理）的用户消息里 —— 它的素材就是它。
        let prompt = DirectionBoardPrompt.transcriptAnalysisUserPrompt(
            transcript: "行业 A 的第一件事\n行业 A 的第二件事\n行业 B 的第一个问题")
        #expect(prompt.contains("他到目前为止说过的全部内容"))
        #expect(prompt.contains("行业 A 的第一件事"))
        #expect(prompt.contains("行业 B 的第一个问题"))
    }

    /// **脑图不许把提示词抄成标题**（2026-09-27 截图里就是
    /// `<用户到目前为止问过的所有问题，整合成关系图:` 那一行），
    /// 而且**这一轮他刚问的那件事必须在图里**（他：「我明明问的是屏幕里是什么软件……
    /// 但右上角的脑图为什么没有把这个问题记录下来呢？」）。
    @Test func theMindMapDropsAnEchoedTitleAndKeepsTheQuestion() throws {
        let parsed = DirectionBoardPrompt.parseUnderstandingLines("""
        细节：<用户到目前为止问过的所有问题，整合成关系图:
        ├─ 屏幕里是什么软件
        │  └─ 他问的是「屏幕里是什么软件？版本是多少？」
        └─ 这轮任务有没有完成
        """)
        let map = try #require(parsed.first { $0.label == "细节" }?.value)
        #expect(!map.contains("整合成关系图"))
        #expect(map.hasPrefix("├─"))
        #expect(map.contains("屏幕里是什么软件"))

        // ⚠️ 判据**收窄了**（2026-09-27 深夜）：那张图的**第一行现在就是分类名**，
        // 而分类名正是"顶格、没有树枝符号"的行 —— 原来"以冒号结尾就删"会把一个写成
        // 「关于明星：」的分类名连它的层级一起吃掉。现在只有"以冒号结尾**而且**说了我提示词里
        // 那件事（整合/关系图/…）"才算回显。
        #expect(DirectionBoardPrompt.mindMapWithoutEchoedTitle("├─ 甲\n└─ 乙") == "├─ 甲\n└─ 乙")
        #expect(DirectionBoardPrompt.mindMapWithoutEchoedTitle("他说的是：") == "他说的是：")
        #expect(DirectionBoardPrompt.mindMapWithoutEchoedTitle("关于明星：\n├─ 甲") == "关于明星：\n├─ 甲")
        #expect(DirectionBoardPrompt.mindMapWithoutEchoedTitle("├─ 甲：乙") == "├─ 甲：乙")
    }

    /// **提交给 agent 的那段里必须有两样**（用户 2026-09-27 深夜点的名）：
    /// ① 到目前为止那张需求图（"实时模式最终的这个结果就是要发给 agent 的"）；
    /// ② **怎么看最后这一轮** —— 没关系就只执行最后一件，有关系就综合全盘考虑。
    @Test func theSubmittedPromptCarriesTheMapAndTheLastTurnRule() throws {
        let decision = DirectionBoardTurnDecision(
            confirmedDirections: [],
            typedInput: "",
            understanding: [("需求", "在桌面上建一个文件夹")],
            accumulatedMindMap: "├─ 北京上海的关系\n└─ 旅游景点")
        let decoration = try #require(DirectionBoardPrompt.decoration(decision))
        #expect(decoration.contains("北京上海的关系"))
        #expect(decoration.contains("只是背景"))
        #expect(decoration.contains("<how_to_read_the_last_turn>"))
        #expect(decoration.contains("只按最后这一件当真正的需求去执行"))
        #expect(decoration.contains("一起综合、全盘考虑"))
    }

    /// **「矛盾」和那张图不是二选一**（用户 2026-09-27：「他即便是矛盾的话，他也应该在右侧显示，
    /// **因为他是用户的一个问题啊**」），而且带上去的旧图**不是"已经完整"**——
    /// 标签一写成"到目前为止所有问题的汇总"，模型就以为不用再加东西了（实测就是这么丢的）。
    /// ⚠️ **图那一行要的是"一张完整的图"，素材是整份问题清单**（2026-09-27 深夜第三版）。
    /// 前两版都错在**给模型的信息不全**（只给"前五轮"、却要它写出"所有问题"的图），
    /// 它手里没有全部信息、只能靠"记住上一轮那张图"，于是每次都丢几块 ——
    /// 用户连着两轮报「右上角**总是**无法把用户所有的问题全都收集起来」。
    /// 现在把整份清单发过去：**输入完整，输出才可能完整**（他说的"一次调用就能解决"）。
    @Test func theMindMapIsBuiltFromEveryQuestion() throws {
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "查资料", detail: "查一下资料")],
            looksAtTheScreen: true)
        #expect(systemPrompt.contains("进了「矛盾」不等于不用进那张图"))
        #expect(systemPrompt.contains("每一件事都要在图里"))
        // **不限行数**（用户 2026-09-27 深夜：「我说的是提示词要求模型最多画 20 行的图，
        // **没有这个限制**。用户的内容可能是**两个小时**，那这个图就应该是两个小时的内容，
        // **用户所有的问题都应该在图里面显示**」）。
        #expect(systemPrompt.contains("不限行数"))
        #expect(!systemPrompt.contains("最多 20 行"))
        let prompt = DirectionBoardPrompt.transcriptAnalysisUserPrompt(
            transcript: "赵今麦的信息\n屏幕里是什么软件\n北京跟上海的关系是什么")
        #expect(prompt.contains("他到目前为止说过的全部内容"))
        #expect(prompt.contains("北京跟上海的关系是什么"))
    }

    /// **追问必须看得见上一条回复**（用户 2026-09-27 深夜报的）：
    /// 「我追问之前的问题，我发现他**无法知道我上一次回复了什么**，这是不可以的。
    /// **上一次回复的结果必须追加到全新的调用里面**。我说的是**右下角这部分**」。
    /// 他追问时说得常常很短（「重新换行列出」），**全部信息都在上一条回复里** ——
    /// 拆两次调用时我把这一段摘掉了，就是那次回归。
    @Test func theAnswerCallCarriesThePreviousAnswers() throws {
        let prompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "查资料", detail: "查一下资料")],
            context: """
            <previous_answers>
            你刚才在右下角那张卡片上回过这几条（最近的在前）：
            【最近一次】杨幂拍过的电影有《…》《…》
            </previous_answers>
            """,
            looksAtTheScreen: true)
        #expect(prompt.contains("previous_answers"))
        #expect(prompt.contains("杨幂拍过的电影"))
        // 背景那一段明说"这是参考、只回答最后那条用户消息里的东西"。
        #expect(prompt.contains("只让你回答**最后那条用户消息**里的事"))
        // 提示词里还要明说：追问就基于上一条改，**不许说"我看不到"**。
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "查资料", detail: "查一下资料")],
            looksAtTheScreen: true)
        #expect(systemPrompt.contains("改/追问"))
        #expect(systemPrompt.contains("绝对不要写"))
    }

    /// ⚠️ **两个真 bug 的钉子**（2026-09-27 深夜，用户："他为什么只是显示一部分呢？"）：
    /// ① 续行上限原来是 **4** —— 而提示词要模型画"最多 **20** 行"的图、矛盾也允许多条，
    ///   于是**超过 5 行的内容全被解析器丢掉**；
    /// ② 标签下面先空一行再写内容（画树枝图时很常见）原来会**把整块丢掉**（空行 = 结束信号）。
    @Test func longMapsAndListsAreNotTruncated() throws {
        // ① 12 行的图必须整块留下（原来只剩 5 行）。
        let mapLines = (1...120).map { "├─ 第 \($0) 件事" }.joined(separator: "\n")
        let parsed = DirectionBoardPrompt.parseUnderstandingLines("细节：\n" + mapLines)
        let map = try #require(parsed.first { $0.label == "细节" }?.value)
        // 120 行也要整块留下（两小时的内容就是这个量级）。
        #expect(map.split(separator: "\n").count == 120)
        // ② 标签下面空一行再写内容，也要收得到。
        let withBlank = DirectionBoardPrompt.parseUnderstandingLines("细节：\n\n├─ 甲\n└─ 乙")
        #expect(withBlank.first { $0.label == "细节" }?.value == "├─ 甲\n└─ 乙")
        // 矛盾那一行同样不许被截成 5 条。
        let many = (1...9).map { "一、关于第 \($0) 件事的矛盾：前后不一致" }.joined(separator: "\n")
        let q = DirectionBoardPrompt.parseUnderstandingLines("矛盾：\n" + many)
        #expect(q.first { $0.label == "矛盾" }?.value.split(separator: "\n").count == 9)
    }

    /// **请求里每一块都要有 tag**（用户 2026-09-27 深夜点名的做法：「用 tag……标签、书签这个
    /// 符号的形式来给它分开」）—— 模型据此**机械地**分清"哪段要答、哪段只是参考"。
    @Test func everyRequestBlockIsTagged() throws {
        // **用户消息里只有那一句问题**（机械分离），背景全在系统提示词的 context 里、各自带 tag。
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(
            directions: [(id: "d1", keyword: "查资料", detail: "查一下资料")],
            context: """
            <reference_materials>…</reference_materials>
            <previous_turns>…</previous_turns>
            <previous_answers>…</previous_answers>
            """,
            looksAtTheScreen: true)
        for tag in ["<reference_materials>", "<previous_turns>", "<previous_answers>"] {
            #expect(systemPrompt.contains(tag))
        }
        // 背景那一段的标题必须**明说它不是要回答的东西**。
        #expect(systemPrompt.contains("不是要你回答的东西"))
        let userPrompt = DirectionBoardPrompt.understandingUserPrompt(newQuestion: "北京跟上海的关系")
        #expect(userPrompt == "北京跟上海的关系")
    }

    /// **相关性门槛必须是"非常高"**（用户 2026-09-27 深夜）：
    /// 「我发现用户问**北京在哪**，它也显示**保存到 Notion**，这跟保存 Notion 有什么关系？
    /// **没有阈值的话，相当于相关性 0.1 也放进去，相关性 99 也放进去。一定要是非常高的相关性**」。
    @Test func onlyHighRelevanceDirectionsShow() throws {
        let directions = [
            TaskDirection(id: "d1", keyword: "保存到 Notion", detail: "",
                          matchKeywords: ["notion", "笔记"],
                          source: TaskDirection.Source.builtin.rawValue, addedAt: Date()),
            TaskDirection(id: "d2", keyword: "指给我看", detail: "",
                          matchKeywords: ["指给", "在哪"],
                          source: TaskDirection.Source.builtin.rawValue, addedAt: Date()),
        ]
        // 「北京在哪」：本地会**假命中**「指给我看」（泛问词「在哪」），而 Jev 说它不相关（0.2）。
        let items = DirectionBoardMatching.displayedItems(
            transcriptText: "北京在哪",
            directions: directions,
            jevProbabilities: ["d1": 0.15, "d2": 0.2])
        #expect(items.isEmpty)

        // 真相关时才出来（0.9 ≥ 0.8）。
        let relevant = DirectionBoardMatching.displayedItems(
            transcriptText: "把这个记到笔记本里",
            directions: directions,
            jevProbabilities: ["d1": 0.9, "d2": 0.1])
        #expect(relevant.map { $0.keyword } == ["保存到 Notion"])

        // 默认门槛就是 0.8：0.6 不再算"高相关"。
        #expect(DirectionBoardMatching.displayedItems(
            transcriptText: "随便说点什么",
            directions: directions,
            jevProbabilities: ["d1": 0.6]).isEmpty)
    }

    /// **图那一行不许被"没有图"的回复覆盖掉**（2026-09-27 深夜实测第 A1 轮）：
    /// 梳理那次偶尔会回来一份**没写「细节」**的回复（模型只写了矛盾/拼写错误），
    /// 而落地时是整块赋值 —— 已经画好的图被覆盖成空，屏幕上的表现就是"图突然没了"。
    /// 那张图是累积的，丢一次等于把用户半小时的问题全抹了。
    @Test func anEmptyReplyNeverWipesTheMapRow() throws {
        // 这一条是**解析层的契约**：写不出内容的行返回空串，由调用方决定要不要保留旧值。
        let withoutMap = DirectionBoardPrompt.parseUnderstandingLines("矛盾：—\n拼写错误：—")
        #expect(withoutMap.first { $0.label == "细节" }?.value.isEmpty == true)
        // 而调用方（`DirectionBoardSession`）的规矩是：**只有图这一行**保留旧值。
        // 这里钉住的是"解析能区分出这一行是空的" —— 保留逻辑在 session 里（见那段注释）。
        let withMap = DirectionBoardPrompt.parseUnderstandingLines("细节：├─ 甲\n矛盾：—")
        #expect(withMap.first { $0.label == "细节" }?.value == "├─ 甲")
    }

    /// **分类这一层是"顶格、不带树枝符号"的一行**（用户 2026-09-27：
    /// 「它应该有一个**大的分类在外面**，而不应该直接地去罗列出来」）——
    /// 判据就一条：**问题行有 `├─` / `└─`，分类行没有**。
    /// 所以它**纯靠提示词**就能实现：解析、渲染、卡片高度全都不用改。
    @Test func categoriesAreTheLinesWithoutABranchGlyph() throws {
        let parsed = DirectionBoardPrompt.parseUnderstandingLines("""
        细节：关于明星的信息
        ├─ 赵今麦今年多大
        └─ 杨幂和刘亦菲合作过什么
        关于代码的问题
        ├─ 前端那个按钮怎么改
        │  └─ 他说的是设置里那一排
        └─ 后端接口怎么设计
        矛盾：—
        """)
        let map = try #require(parsed.first { $0.label == "细节" }?.value)
        let lines = map.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
        // 分类行：没有树枝符号的两行。
        let categories = lines.filter { !$0.contains("├") && !$0.contains("└") && !$0.hasPrefix("│") }
        #expect(categories == ["关于明星的信息", "关于代码的问题"])
        // 问题行都在分类**之后**（每一件都挂在某一类下面）。
        #expect(lines.filter { $0.hasPrefix("├") || $0.hasPrefix("└") }.count == 4)
    }

    /// **看板上那两下回车**（用户 2026-09-27 深夜）：「关于（实时对话）**转到 agent 模式**
    /// （快捷键替换成 **option+enter**），和**粘贴**的快捷键（替换成 **com+enter**）」。
    /// 判据做成纯函数，两个入口共用 —— 这里钉住整张表。
    @Test func boardReturnKeysAreOptionToExecuteAndCommandToPaste() throws {
        // 默认：⌘⏎ 粘贴、⌥⏎ 执行。
        let defaultShortcut = BoardPasteShortcut.commandReturn
        #expect(defaultShortcut.action(isCommand: true, isOption: false) == .paste)
        #expect(defaultShortcut.action(isCommand: false, isOption: true) == .execute)
        // **裸回车放行，不吞** —— 它现在不属于这两件事里的任何一件。
        #expect(defaultShortcut.action(isCommand: false, isOption: false) == .passThrough)
        // 两个修饰键同时按着：说不清，放行（不猜）。
        #expect(defaultShortcut.action(isCommand: true, isOption: true) == .passThrough)

        // 反过来选也一样成立。
        let swapped = BoardPasteShortcut.optionReturn
        #expect(swapped.action(isCommand: false, isOption: true) == .paste)
        #expect(swapped.action(isCommand: true, isOption: false) == .execute)

        // ⚠️ 旧文件存的是 `"returnKey"`（旧枚举的值）—— 现在解不出来，必须**落到新默认**，
        // 而不是抛错（抛错会把整份 AppSettings.json 带走，规则 E1）。
        #expect(BoardPasteShortcut(rawValue: "returnKey") == nil)
        #expect(BoardPasteShortcut(rawValue: "commandReturn") == .commandReturn)
    }
}
