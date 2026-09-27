//
//  DirectionBoardSession.swift
//  Wanna
//
//  **「任务方向看板」的状态机**（2026-09-27 第三版：清单文件 + Jev 决策模型）。
//
//  这一版把前两版的做法换掉了：
//  · 方向不再是"代码里写死的 3 类 × 2 个按钮"，而是**一个文件里的清单**（`TaskDirectionStore`）：
//    出厂那份从主 Agent 提示词里提炼、用户口述的会追加、每天中午复盘再追加一批；
//  · 判断不再靠"把主 Agent 那 5000 字提示词每 3 秒发一遍"，而是
//    **Jev 决策模型**（`JevDecisionClient`）—— 几十字的 state + 每条方向一道 `noul` 题，
//    一次调用 $0.00003，给的是**概率**（用户：「做一个类似于概率估计的东西，把高概率的内容显示出来」）；
//  · AI 那段"理解"仍然由大模型写，但**只发"方向清单 + 用户的话"**（用户：「没有必要发送那么多
//    提示词，这样即便是高频调用也不会花费很多 token」）。
//
//  ⚠️ **它是纯观察者**：不碰 `currentResponseTask` / `voiceState` / 历史 / TTS / 截图。
//

import Combine
import Foundation

/// **提交时要带走的东西**（一轮结束时算一份，交给 `CompanionManager` 拼进提示词）。
///
/// 用户 2026-09-27 定的内容：用户**明确确认过**的方向（关键词 + 描述）、他在输入框里打的字、
/// 以及大模型对他的理解那四行 ——「这部分**全部都作为一个参考**」。
nonisolated struct DirectionBoardTurnDecision: Equatable {
    /// 「关键词：描述」——**只含用户明确确认过的**（否定的、按概率显示的都不发）。
    var confirmedDirections: [(keyword: String, detail: String)] = []
    var typedInput: String = ""
    /// 大模型这一轮写的理解（四行里非空的那几行）。
    var understanding: [(label: String, value: String)] = []
    /// **到目前为止那张需求图**（累积的）。
    ///
    /// 用户 2026-09-27 深夜点名要它跟着提交走进提示词：「实时模式最终的这个结果就是要发给
    /// agent 的……**你要让 AI 知道**：如果最后一次回复的内容跟之前没关系，就按最后一次
    /// 当做一个真正的需求来执行；如果有关系，就让 AI **整体来执行**……**这个直接写入提示词**」。
    var accumulatedMindMap: String = ""

    static func == (lhs: DirectionBoardTurnDecision, rhs: DirectionBoardTurnDecision) -> Bool {
        lhs.typedInput == rhs.typedInput
            && lhs.confirmedDirections.map(\.keyword) == rhs.confirmedDirections.map(\.keyword)
            && lhs.understanding.map(\.label) == rhs.understanding.map(\.label)
            && lhs.understanding.map(\.value) == rhs.understanding.map(\.value)
            && lhs.accumulatedMindMap == rhs.accumulatedMindMap
    }
}

@MainActor
final class DirectionBoardSession: ObservableObject {

    static let shared = DirectionBoardSession()
    private init() {}

    /// **「复制」按钮要复制的东西**（右下角那张卡片此刻显示的文字）。
    ///
    /// 由 `CompanionManager` 注入的闭包提供 —— 卡片的内容归它管，看板不该去猜。
    /// `false` 时那个按钮置灰（没东西可复制）。
    var hasCopyableReplyProvider: (() -> Bool)?
    /// 「复制」：把右下角那段回复放进剪贴板。
    var copyReplyAction: (() -> Void)?
    /// 「复制并退出」：复制之后**退出这一轮**（与按 ESC 同效）。
    var copyReplyAndExitAction: (() -> Void)?
    /// **回车 = 执行**（把这一轮交给主 Agent，与按下快捷键同效）。也是那个「执行」按钮。
    var sendTurnAction: (() -> Void)?
    /// **「退出」按钮**：不执行、直接取消这一轮（与按 ESC 同效）。
    var exitTurnAction: (() -> Void)?
    /// **光标不在输入框时的 `Cmd+Enter` = 粘贴**（把右下角那段回复粘到光标处，然后退出这一轮）。
    var pasteReplyAtCursorAndExitAction: (() -> Void)?

    /// 视图读这个决定那个按钮是亮的还是灰的。
    var hasCopyableReply: Bool { hasCopyableReplyProvider?() ?? false }

    /// **把那张累积的图清掉、重新开始整理** —— 只有用户按 ESC（他说的"退出键"）时才调。
    ///
    /// 这是这张图**唯一**的重置入口：按下快捷键、2 秒一轮、连续追问……**都不清**，
    /// 因为它要回答的是"**用户到现在为止到底在做什么**"（用户 2026-09-27：
    /// 「把之前所有的问题都当作需求整理出来，然后看用户到底在做什么」）。
    func resetAccumulatedMindMap() {
        accumulatedMindMap = ""
        spokenTranscript = []
    }

    /// 把上一轮的**矛盾**带上（写进提示词的 `<previous_questions>` 段）。
    ///
    /// 这两个字 2026-09-27 深夜随卡片一起改名（「把**疑问**调整为**矛盾**」）—— 段名
    /// `<previous_questions>` 保持不变：它是**协议**（提示词那一节按这个名字读它），
    /// 而卡片上显示的是「矛盾」。
    func pendingQuestionsPromptBlock() -> String? {
        let trimmed = pendingQuestions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != "—" else { return nil }
        return """
        <previous_questions>
        你上一轮列出的这些**矛盾**还没消除（用户可能刚刚补了一句来解掉其中某一条）：
        \(trimmed)

        请判断：他刚补的内容解决了其中哪一条？**解决了的那条不要再写**；没解决的照抄过来。
        </previous_questions>
        """
    }

    /// 右下角那张卡片刚显示过的那段（`CompanionManager` 在写预览/真答案时喂进来）。
    func noteCornerAnswerShown(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if recentCornerAnswers.first?.text == trimmed { return }
        recentCornerAnswers.insert((trimmed, Date()), at: 0)
        if recentCornerAnswers.count > Self.rememberedCornerAnswerCount {
            recentCornerAnswers.removeLast(recentCornerAnswers.count - Self.rememberedCornerAnswerCount)
        }
    }

    /// 这些"上一轮的回答"拼成提示词的一段（没有就返回 nil）。
    ///
    /// 并**标出"卡片出现之后他说了什么"**——用户自己给的判据（时间 A → 时间 B）：
    /// 「建议通过代码方式截取第一次回复内容的文本，以及第一次回复显示到卡片的时间，作为时间 A；
    /// 再测量时间 A 到时间 B……提取这段时间用户说的话，作为提示词重点标记」。
    func previousCornerAnswersPromptBlock() -> String? {
        guard !recentCornerAnswers.isEmpty else { return nil }
        var lines: [String] = []
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        for (index, answer) in recentCornerAnswers.enumerated() {
            // 用户 2026-09-27 深夜点名要的标法：「**一定要标清楚前一轮、两轮、三轮、四轮、五轮**
            // 分别是什么，一定要告诉 AI 上一轮的内容是什么，让它判断跟上一个内容有没有关系」。
            let label = "最近\(TurnReferenceMaterials.chineseNumber(index + 1))轮"
            lines.append("【\(label)｜\(formatter.string(from: answer.shownAt))】\(answer.text)")
        }
        let spokenAfter: String
        if let latest = recentCornerAnswers.first {
            let after = latestTranscriptAfter(latest.shownAt)
            spokenAfter = after.isEmpty
                ? "（他还没说什么新的）"
                : "他在这条回复**之后**说的是：「\(after)」 —— **这一段最可能就是对上面那条回复的追问或修改**，请优先按它来。"
        } else {
            spokenAfter = ""
        }
        return """
        <previous_answers>
        你刚才在右下角那张卡片上回过这几条（最近的在前）：
        \(lines.joined(separator: "\n"))
        \(spokenAfter)
        如果他这一轮的话像是对上面某一条的补充（「用英文再说一遍」「展开讲讲」这种），
        就**接着那条回答**，不要重新理解成一个全新的问题。
        </previous_answers>
        """
    }

    /// 他把话说出来了 → 灯亮；**约 0.9 秒没有新字就熄灭**（他自己定的判据：「检测不到用户在说话，
    /// 就停止呼吸」）。
    ///
    /// ⚠️ 熄灭用**代次计数**：他连着说的时候每来一个字都会重新排一次熄灭，旧的那次不能把新的这一盏吹掉。
    private func noteUserSpeakingNow() {
        isUserSpeaking = true
        speakingGeneration += 1
        let generation = speakingGeneration
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(900))
            guard let self, self.speakingGeneration == generation else { return }
            self.isUserSpeaking = false
        }
    }

    private var speakingGeneration = 0

    /// **流式地往卡片上写**：每收到一段就把已经解析得出来的行刷上去。
    ///
    /// 三条分寸：
    /// 1. **节流到 8 次/秒** —— 每来一个分片就整块重排是白烧主线程（这个仓库在回答卡片上
    ///    已经为"每来一个字重排整串"付过一次代价）；
    /// 2. **只更新"半截文本里已经有内容"的行** —— 还没写到的行保持上一次的值，
    ///    否则每来一段，已经写好的行会先退回占位符再长回来（那就是闪）；
    /// 3. **答案同步流进右下角那张卡**（那张卡的字是流式的，动画由它自己的模糊焦点负责）。
    private func applyStreamingParagraph(_ partial: String) {
        // ⚠️ **不限流**（2026-09-27 深夜改，用户指了参照物：「你可以看一下 **Agent 模式下右下角的
        // 卡片**是怎么渲染的，**那个比较流畅**」）。
        //
        // 加过一版"节流到 8 次/秒"，理由是"每个分片都整块重排是白烧主线程"—— 但那个理由**错了**：
        // 主 Agent 那条路（`CompanionManager` 的 `onTextChunk`）**就是每个分片都写**
        //（`streamingAnswerText = displayText`，一次都不落），而它正是用户觉得流畅的那一条。
        // 模糊焦点那套动画是按"**字刚到的节奏**"设计的（尾巴 = 最近 5 个字、按时间淡出），
        // 8/秒的批量更新把节奏打乱成一顿一顿 —— 屏幕上就是卡。
        let parsed = DirectionBoardPrompt.parseUnderstandingLines(partial)
        var merged = understandingLines
        var didChange = false
        for (index, line) in parsed.enumerated() where !line.value.isEmpty {
            guard index < merged.count else { continue }
            if merged[index].value != line.value {
                merged[index].value = line.value
                didChange = true
            }
        }
        if didChange { understandingLines = merged }
        streamingUpdateCount += 1

        // 答案：**边出边写**（`parseAnswer` 对半截文本也成立 —— 它取的是「答案：」那一行到行尾）。
        if let answer = DirectionBoardPrompt.parseAnswer(partial),
           answer != streamingAnswerText {
            streamingAnswerText = answer
            answerPreviewWriter?(answer)
            // 告诉右下角那张卡片"现在这条是流式的"→ 它才会用模糊焦点那套渲染。
            boardPreviewStreamingWriter?(true)
        }
    }

    /// 这一轮流式渲染写了几次（只用来核对"它真的在流"）。
    private var streamingUpdateCount = 0
    /// 这一轮流式写到右下角的那段（用于去重）。
    private var streamingAnswerText = ""

    /// **告诉右下角那张卡片"这条是流式的"**（注入，见 `answerPreviewWriter` 的同一个先例）。
    var boardPreviewStreamingWriter: ((Bool) -> Void)?

    /// **前五轮**拼成提示词的一段（用户说的 + 你回的），最近的在前。
    ///
    /// 它取代了原来的两段（`recentReadings` 三轮理解 + `previousAnswers` 三条答案）——
    /// 那两段在提示词里各说各的，而用户要的是"**一轮 = 问 + 答**"这件事本身
    ///（「把之前用户说的话和 AI 回复的结果，取前五轮发给 AI 当作参考内容」）。
    func previousTurnsPromptBlock() -> String? {
        guard !recentTurns.isEmpty else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        let blocks = recentTurns.enumerated().map { index, turn -> String in
            let label = index == 0 ? "最近一次" : "倒数第\(TurnReferenceMaterials.chineseNumber(index + 1))次"
            return """
            【\(label)｜\(formatter.string(from: turn.at))】
            他说的：\(turn.question.isEmpty ? "（这一轮没听到新的）" : turn.question)
            你回的：\(turn.answer)
            """
        }
        return """
        <previous_turns>
        前面几轮你们说过什么（**最近的在前；这只是参考，不是这一轮要做的事**）：
        \(blocks.joined(separator: "\n\n"))

        拿它判断**唯一的一件事**：他这次说的，跟上面这些**有没有关系**。
        · **有关系** → 接着往下答（「细节」那张图沿着同一件事往下长）；
        · **没关系** → **只答这一次的问题**，不要提之前的任何内容，也不要把两件事揉在一起。
        它们全部只是参考。
        </previous_turns>
        """
    }

    /// 某条回复显示出来**之后**用户说的话（看板手里最新的那段转写就是）。
    private func latestTranscriptAfter(_ moment: Date) -> String {
        // 看板只有"当前这一句"的累积文本，所以能给的判据很直接：这条回复是**这一句之前**
        // 显示的，那这一句就是"之后说的话"；同一条回复在说话过程中还在刷，就不算"之后"。
        guard moment < latestTranscriptUpdateAt else { return "" }
        return latestTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// **把答案预览写到右下角那张卡片上**（由 `CompanionManager` 注入，与 `voiceIdleProvider` /
    /// `sharedVoicePlaybackEngineProvider` 同一个先例：跨子系统只走注入的闭包，不让对方去猜）。
    /// 传 `nil` = 清掉那张卡片（发送、取消、新一轮都从这里清）。
    var answerPreviewWriter: ((String?) -> Void)?

    // MARK: - 界面读的状态

    @Published private(set) var isListening = false
    /// **他此刻正在说话吗** —— 左下角那颗折叠钮的**呼吸灯**就是看它
    ///（用户 2026-09-27：「只要检测到用户在说话，就是呼吸的效果；如果检测不到用户在说话，
    /// 就停止呼吸。**目的是让用户知道当前左上角、右上角的卡片是不是能够真正接收到用户的提示词
    /// 和输入内容**」）。
    ///
    /// 判据是"最近这一小会儿有没有新字进来"，与那两道停顿闸门同源（都用转写到达时刻，不用引擎状态）。
    @Published private(set) var isUserSpeaking = false
    @Published private(set) var paragraph = ""
    /// **结构化理解的那四行**（目标问题 / 类型 / 参考 / 细节）—— 用户要的"换行显示，可以显示为多行"。
    ///
    /// ⚠️ **永远是四行**（值可能是空串）：用户 2026-09-27 的判定是「这几行固定在这，而不是突然间有、
    /// 突然间没有，这对体验影响太差了」—— 行的集合恒定，卡片的高度才恒定。
    @Published private(set) var understandingLines: [(label: String, value: String)] =
        DirectionBoardPrompt.understandingLabels.map { ($0, "") }
    /// **答案预览** —— 用户 2026-09-27：「鼠标右下角这部分显示的是对用户提示词回复的一个结果」。
    ///
    /// 它由 `answerPreviewWriter` 写给 `CompanionManager`（右下角那张卡片与最终结果**同一张**），
    /// 不在这里画。只在模型判断"这一轮包含一个能当场回答的问题"时才有值。
    @Published private(set) var previewAnswer: String?
    /// **内容更新了几次** —— 视图拿它触发那一下"淡入"动画（用户：「我希望让它有一种动画效果，
    /// 而不是突然间显示出来」）。每次模型回复落下来就 +1。
    @Published private(set) var contentRevision = 0
    @Published private(set) var displayedItems: [DirectionBoardDisplayItem] = []
    @Published private(set) var isRequesting = false
    @Published private(set) var isCancelled = false
    @Published private(set) var isHeldFromAutomaticSend = false
    @Published var typedInput = ""
    /// **卡片折叠了**（用户 2026-09-27：「卡片可折叠，折叠后变成一个小按钮」）——
    /// 折叠后整张卡片只剩输入框左边那条「折叠条」，面板跟着缩到它那么大，
    /// **边框变绿**（用户：「折叠后卡片边缘自动变成绿色，便于用户快速在桌面上看到其位置」）。
    @Published var isCollapsed = false

    // MARK: - 内部状态

    private var latestTranscript = ""
    /// 最近一次实时转写更新的时刻。**只有这一份**（2026-09-27 修）。
    ///
    /// ⚠️ 这里原来有**两个**同名字段的孪生兄弟（`latestTranscriptUpdateAt` 与
    /// `lastTranscriptUpdateAt`），而**后一个从来没被赋值过**、永远是 `distantPast` ——
    /// 于是所有读它的地方都静默拿到"没有新内容"：`latestTranscriptAfter(_:)` 恒返回空串。
    /// 它的杀伤力是这一轮才显出来的：那是「这一轮的新问题是哪一段」的判据，
    /// 空了就等于**发给模型的是一段空问题** —— 屏幕上的表现是需求写「—」、右下角没有答案、
    /// 方向格也排不出来（用户报的"我问他问题，他没有回复我"）。
    /// 教训与仓规同一条：**同一件事只留一份状态**，而"声明了却从没写过"的字段不会报错。
    private var latestTranscriptUpdateAt = Date.distantPast
    private var lastRequestedTranscript = ""
    /// 最近一次 Jev 判断给出的概率（方向 id → P(是)）。
    private var jevProbabilities: [String: Double] = [:]
    /// **右下角那张卡片回过的最近几条**（最近的在最前）—— 用户 2026-09-27 要的"多轮参考"：
    ///
    /// > 例如第一轮回复了一些内容，用户随后说话……要把第一轮回复结果发进去作为参考……
    /// > 例如用户问「北京在哪」，AI 回复一行字，用户说「你用英文来解释一下」，此时用户无需再说
    /// > 「北京在哪，然后用英文来解释」，**其实是对刚才卡片返回结果的追问**，所以一定要带上刚才的结果。
    ///
    /// 主 Agent 那条路本来有会话历史，但**看板这条线上那些"预览答案"从来没进过历史**（它们没被发送），
    /// 所以他要的这条链得单独带着。最多三轮（他：「甚至要带上前三轮的结果」）。
    /// **前五轮**：每一轮 = 他说的那句话 + 你回的那一段（用户 2026-09-27：「把之前用户说的话
    /// 和 AI 回复的结果，**取前五轮**发给 AI 当作参考内容，让 AI **重点关注最近这一次**」）。
    ///
    /// 它取代了原来分开的两份（`recentReadings` 三轮理解 + `recentCornerAnswers` 三条答案）——
    /// 那两份在提示词里是**两段各说各的**，而他要的是"一轮 = 问 + 答"这件事本身。
    private var recentTurns: [(question: String, answer: String, at: Date)] = []

    /// **到目前为止整理出来的那张需求图**（累积的）。
    ///
    /// 用户 2026-09-27 深夜把这张卡片的职责说死了：「屏幕卡片右上角的卡片，它显示的脑图是把用户
    /// 之前问过的**所有问题**，无论是**连续的还是间断的**，只要是在**实时模式下没有停止**，
    /// 都会**统一记录**……把这些需求梳理出来，**无论它们有没有关系**，都梳理出它们的逻辑关系」。
    /// 所以它不能每轮重画：**上一轮那张图要原样带下去，让模型在它上面并新内容** ——
    /// 这也是"一次实时会话里他到底在做什么"唯一的载体。
    private var accumulatedMindMap = ""
    /// 一段文字的**归一化键**：去掉树枝符号、空白与常见标点，只留字。
    ///
    /// 用来比"这一轮的问题是不是新的" —— 识别器给的是**累积**文本，同一句话在它还在说的
    /// 时候会被重放很多次（不去重的话，问题清单里同一件事会出现十几条）。
    nonisolated static func mindMapLineKey(_ line: String) -> String {
        line.filter { character in
            !"├│└─-— ：:（）()【】[]「」、,，。.".contains(character)
        }
    }

    /// **他到目前为止说过的全部内容**（按时间顺序，每个 2 秒轮接一段）。
    ///
    /// 用户 2026-09-27 深夜的要求就是"把它当一份文件发给 AI"：「用户实时模式下他的录音是**连续的**，
    /// 他一直是录音的，所以说你是有一个**完整的**……**都是所有用户问题的一个文件的**。
    /// 那么你**让 AI 根据这个文件来提炼出所有的问题**，然后整理出脑图不就行了吗？」
    /// —— 所以**提炼问题这件事交给 AI**，代码只负责把这份文本攒起来（他不止一次说过
    /// "能用一个调用解决的，别用复杂逻辑"）。
    ///
    /// ⚠️ 2026-09-27 深夜第三次改 —— 前两版都错在**给模型的信息不全**：
    /// 请求里只有"**前五轮**"，却要模型"把到目前为止**所有**问题整合成一张图" ——
    /// 它手里根本没有全部信息，只能靠"记住上一轮那张图"来补，于是每次都丢几块
    ///（用户连着两轮报「右上角**总是**无法把用户所有的问题全都收集起来」）。
    ///
    /// 用户的说法才是对的、也是最简单的（他的原话）：
    /// 「把之前解决的这个回复的内容，当作一个之前解决的对话，包括提示词，当作一个**参考内容**，
    /// 然后让他生成几个标签的文本……**其实就是一次大模型调用就能够解决所有的问题**」。
    /// 所以现在**把"他问过的每一件事"整份发过去**，模型从完整输入里写完整的一张图 ——
    /// 不需要它记住任何东西，也不需要 App 替它拼。
    private var spokenTranscript: [String] = []
    /// 保留几轮（用户点名 **5**）。
    static let rememberedTurnCount = 3
    /// 最多留多少段（防"说了一整天"把提示词撑爆；一段就是一轮说的话）。
    static let maximumSpokenSegments = 60

    private var recentCornerAnswers: [(text: String, shownAt: Date)] = []
    static let rememberedCornerAnswerCount = 3

    /// **还没解决的疑问**（用户 2026-09-27：「用户可能会关注某个疑问，并因此补充一些内容。
    /// 如果发现这个疑问已经消除，或不再有疑问，就把这个疑问删掉。这个疑问要带入到本次回复中显示出来，
    /// 也要带入到下一次对话里，并且要固定下来。**疑问就是疑问，不能总是更换**」）。
    ///
    /// 所以它**不随每一轮重写**：上一轮的疑问随请求带下去，模型只负责"删掉已解决的 + 加新的"。
    /// 那一行文本本身也一直显示在卡片上（`understandingLines` 里那一行的值就是它）。
    private var pendingQuestions = ""

    /// **最近三轮**模型的理解原文（最近的那一轮在最前）—— 用户要的连续性：
    /// 「你要在发送给下一轮模型的时候要保留前三轮……让它重点参考最近一轮」。
    /// **上一轮看板上显示的那一列**（编号 → 方向）—— 用户对方向的评论指的是它，
    /// 因为两次之间 JEV 会把那一列重排（见 `DirectionBoardMatching.parseSelectionVerdict`）。
    private var previousRoundItems: [DirectionBoardDisplayItem] = []
    private var cadenceTimer: Timer?
    private var requestTask: Task<Void, Never>?
    private var roundGeneration = 0
    private var currentCycleID: String?
    private var cancelledForThisCycle = false
    private var cancelledUntil: Date?
    private static let cancelledUntilDefaultsKey = "wannaDirectionBoardCancelledUntil"
    private static let tenMinutes: TimeInterval = 10 * 60
    /// 每轮理解原文留多少字（下一轮当上下文用）。
    /// 一轮记下来的回复最多留这么多字（提示词里只是参考，不必全文）。
    private static let maximumReadingCharacters = 600
    /// 带几轮给模型（用户：「你要在发送给下一轮模型的时候要保留前三轮」）。
    static let rememberedReadingCount = 3
    private let visionChatAPI = BailianVisionChatAPI()

    static let cadenceSeconds: TimeInterval = 3

    private var isEnabled: Bool { AppSettingsStore.snapshot().directionBoardEnabled }

    // MARK: - 自检（没有麦克风时唯一能把看板拉起来的办法）

    /// `WANNA_DIRECTION_BOARD_SELFCHECK=1` 拉板子喂假转写（不发请求）；
    /// `=live` 才真发一次；`=stream` 只按 12 字/秒喂刘海那行字幕（量卡顿用）。
    static var selfCheckMode: String? {
        ProcessInfo.processInfo.environment["WANNA_DIRECTION_BOARD_SELFCHECK"]
    }

    private var suppressesRequestsForSelfCheck: Bool {
        Self.selfCheckMode != nil && Self.selfCheckMode != "live"
    }

    func runSelfCheckSequence() {
        guard Self.selfCheckMode != nil, Self.selfCheckMode != "stream" else { return }
        beginListening(cycleID: "self-check-cycle")
        // ⚠️ 自检**要把它也带上**：参考材料采集器挂在 `CompanionManager` 那两个真实回调上
        //（按下快捷键 / 每一条实时转写），而自检是**直接**驱动看板的 —— 不显式调它，
        // 自检里就永远看不到参考材料（第一次跑就是这么扑空的：日志里一条 📎 都没有）。
        TurnReferenceCollector.shared.beginTurn()
        let lines = [
            "帮我把这段记下来",
            // **用户真实报上来的那一句**（2026-09-27）。它刻意**不含「参考屏幕」这四个字** ——
            // 原来正是因为要等那四个字才截图，所以这句问法下模型根本看不到屏幕，
            // 右下角回的是"我还没看到题目的内容"。自检就用这句钉住修复。
            "屏幕上的第 2 题该选哪个",
            // 第三句**不是问题** → 这一轮模型不会再写「答案」那一行。
            // 用来看住那个 bug：没有答案的那一轮**不许**把上一轮已经显示出来的答案抹掉。
            "顺便把这个结果记到我的笔记里面去",
            // 第四句：**参考材料第二类**（剪贴板）—— 自检时先在剪贴板里放一段文本，
            // 跑完就能看卡片上有没有长出那个「剪贴板」标签。
            "根据剪贴板里的内容总结一下",
            // 第五句：**说了参考但拿不到**（自检时前台多半不是访达）→ 看板右侧应出现「无法识别：选中文件」。
            "参考一下我选中的文件",
            // 第六句：**突然换一件事**（用户 2026-09-27 截图里那一问）——
            // 前面几轮全在讲别的东西，这一轮问一个跟它们没关系的问题。
            // 判据：**它必须出现在右侧那张图上**（哪怕它同时被判成「矛盾」）——
            // 用户的原话：「他即便是矛盾的话，他也应该在右侧显示，**因为他是用户的一个问题啊**」。
            "北京跟上海是什么关系",
            // 第六句：**一个信息不全但完全不矛盾的简单问题**（用户 2026-09-27：「我问他北京在哪，
            // 他就问什么地方的北京……这就太墨迹了」）→ 「疑问」那一行**应当是「—」**，
            // 模型只正常回答，不反问。这一句就是钉住那条要求的。
            "北京在哪",
        ]
        var accumulated = ""
        for (index, line) in lines.enumerated() {
            // **累积**：识别器给的是"到目前为止整句"的累积文本，不是每句替换上一句。
            // 自检如果按"替换"喂，第二句就把第一句的命中冲掉了（实测过一次：屏幕上只剩空板）。
            accumulated += line
            let partial = accumulated
            // 间隔 3.5 秒：**大于一轮的节奏（3 秒）** —— 这样每一句都真的落到一轮请求上，
            // 自检才能验到"上一轮写了答案、下一轮没写"这种跨轮行为（1.4 秒那版三句挤在一轮里）。
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 3.5) { [weak self] in
                NotchListeningTranscriptModel.shared.setLiveText(partial)
                self?.noteLiveTranscript(partial)
                TurnReferenceCollector.shared.noteLiveTranscript(partial)
                let shown = self?.displayedItems.map { "\($0.number).\($0.keyword)" } ?? []
                print("🎛️ 方向看板自检：第 \(index + 1) 句 → 显示 \(shown.joined(separator: " ｜ "))")
            }
        }
    }

    /// ⚠️ **只读，绝不取走** —— 取走即清，会把看板上的格子一起清掉（2026-09-27 被这个骗过一次：
    /// 屏幕上看着是"空板"，其实是自检自己把它清空了）。
    func logTurnDecisionForSelfCheck() {
        guard Self.selfCheckMode != nil else { return }
        let decision = currentTurnDecisionForSelfCheck()
        print("🎛️ 方向看板自检：显示 \(displayedItems.count) 格（"
              + displayedItems.map { "\($0.number).\($0.keyword)" + ($0.state == .pending ? "" : "(固定)") }
                .joined(separator: " ｜ ")
              + "）；提交时会加在提示词前面的是 —— "
              + (DirectionBoardPrompt.decoration(decision) ?? "（什么都没点，不加）"))
    }

    /// 自检用：像提交那样算一份，但**不取走**任何东西（取走会把板子清空）。
    private func currentTurnDecisionForSelfCheck() -> DirectionBoardTurnDecision {
        DirectionBoardTurnDecision(
            confirmedDirections: displayedItems
                .filter { $0.state == .confirmed }
                .map { (keyword: $0.keyword, detail: detailForDirectionID($0.directionID)) },
            typedInput: typedInput.trimmingCharacters(in: .whitespacesAndNewlines),
            understanding: understandingLines.filter { !$0.value.isEmpty },
            accumulatedMindMap: accumulatedMindMap)
    }

    private var streamSelfCheckTask: Task<Void, Never>?

    func runStreamingSelfCheckIfRequested() {
        guard Self.selfCheckMode == "stream" else { return }
        let sentence = "帮我把桌面上的这些文件整理归类然后存到 notion 里面去顺便查一下相关的新闻"
        var shownCount = 0
        var rounds = 0
        streamSelfCheckTask = Task { @MainActor in
            print("🎛️ 字幕流自检：开始喂字（12 字/秒，只喂字幕；循环直到进程被杀）")
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled else { return }
                shownCount += 1
                if shownCount > sentence.count {
                    shownCount = 1
                    rounds += 1
                    if rounds % 5 == 0 { print("🎛️ 字幕流自检：已循环 \(rounds) 轮") }
                }
                NotchListeningTranscriptModel.shared.setLiveText(String(sentence.prefix(shownCount)))
            }
        }
    }

    // MARK: - 生命周期

    func beginListening(cycleID: String?) {
        guard isEnabled else { return }
        // **一次全新的按下**：这一轮从头开始 —— 上一轮那一列的引用作废。
        // ⚠️ 只在**真的换了 cycle** 时清：连续追问窗口重新武装时也会走这里，而那种情况下
        // 用户说的还是同一件事（他刚评论过的那些方向还挂在板上），清了就没人认得出「第 2 个」了。
        if let cycleID, cycleID != currentCycleID {
            cancelledForThisCycle = false
            previousRoundItems = []
            // ⚠️ **这里原来会清空那张累积的图 —— 2026-09-27 深夜去掉了。**
            //
            // 起因是用户报「屏幕右上角显示的**不是用户所有的问题**……**有大量的问题，
            // 他没有显示出来**」。量下来机制本身是通的（每轮都带上去、也都并回来了：
            // 0 → 84 → 83 → 83 字），**问题出在边界上**：他那些问题是**分很多次按下**问的，
            // 而"一次按下 = 一张新图"意味着每按一次就把之前整理的全部清掉。
            //
            // 按他自己的原话定边界（「只要用户**没有按退出键、没有按 ESC**，这几个卡片
            // 都持续显示」）：**图一直累积**（重开的入口留了一个 `resetAccumulatedMindMap()`，
            //  但目前**没有任何路径自动调它** —— 见那个方法自己的注释）。
        }
        currentCycleID = cycleID
        refreshCancellationState()

        roundGeneration += 1
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false

        latestTranscript = ""
        lastRequestedTranscript = ""
        paragraph = ""
        // ⚠️ **别把卡片上那几行擦掉**（2026-09-27 深夜修，用户：「右上角的卡片，它这个树状图
        // **怎么突然间消失了呢**？之前还很好的，然后就突然间消失了」）。
        //
        // 这里原来把它重置成"全空占位符"，而**下一次梳理要一两秒（现在是两次调用）才回来** ——
        // 于是每按一次快捷键，那张图都会先**整个消失**、过一会儿再长回来。用户的感受就是
        // "突然没了"。而他早就定过这条规矩：「只要用户没有按退出键、没有按 ESC，
        // **这几个卡片都持续显示**」。
        //
        // 现在**一律保留上一次的内容**：新一轮的梳理回来时自然会把它们覆盖掉
        //（`understandingLines` 是整块赋值的，不存在"新旧混在一起"）。
        // 新一轮开始 = 上一轮的答案预览作废（这里是"真的换了一轮"，不是同一轮的提交）。
        previewAnswer = nil
        answerPreviewWriter?(nil)
        contentRevision = 0
        previousRoundItems = []
        jevProbabilities = [:]
        displayedItems = []
        typedInput = ""
        isListening = true
        refreshDisplayedItems()
        startCadenceTimer()
    }

    /// 识别文本更新：本地关键词立刻匹配（免费），Jev 的概率随后到。
    func noteLiveTranscript(_ transcriptText: String) {
        guard isListening else { return }
        if DirectionBoardMatching.spokenCancelBoardRequested(in: transcriptText) {
            cancelForThisCycle()
            return
        }
        latestTranscript = transcriptText
        latestTranscriptUpdateAt = Date()
        noteUserSpeakingNow()
        // ⚠️ 参考材料的采集**不在这里**：截图与那三类关键词归 `TurnReferenceCollector`
        //（2026-09-27 用户把参考材料扩成三类之后，它成了主 Agent 与看板**共用**的东西 ——
        //  主 Agent 那一轮的提示词、看板这一轮的请求、卡片上那排标签，读的都是它）。
        refreshDisplayedItems()
    }

    /// - Parameter keepPreview: **提交**那一轮要传 `true` —— 右下角那张答案卡片要一直挂着，
    ///   等真答案的第一个字来了再交接（用户报过"显示了两个回复"，见 `consumeTurnDecision`）。
    ///   其余所有出口（ESC 打断、监听窗口到期、空转写、取消……）都用默认值 `false`：
    ///   这一轮**没有答案要来接**，预览必须当场作废。
    ///
    ///   ⚠️ 这只是**第二道**。第一道在 `NotchWindowController.setActivityPhase`：
    ///   **相位的下一个值不是 `.listening` 就把预览清掉** —— 出口有一堆、将来还会多，
    ///   靠"每个出口记得调一下"迟早再漏一次（2026-09-27 就是这么漏掉 ESC 那条的）。
    func endListening(keepPreview: Bool = false) {
        if !keepPreview {
            previewAnswer = nil
            answerPreviewWriter?(nil)
        }
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        isListening = false
        isUserSpeaking = false
        speakingGeneration += 1
        boardPreviewStreamingWriter?(false)
        streamingAnswerText = ""     // 作废在途的那次"熄灭"（它已经没有对象了）
        // 这一轮结束了：把面板上那一列**快照**留给下一次（用户对方向的评论指的是它）。
        previousRoundItems = displayedItems
    }

    /// 提交时取走：用户**明确确认过**的方向 + 输入框那句 + 大模型的理解。取走即清。
    ///
    /// 用户 2026-09-27 定的两条：
    /// · 「**如果用户明确的说了哪一个选项**，哪个选项的时候才去发这个选项，**如果没说的话就不要发**……
    ///   你也不要去把什么猜测的比例概率什么……也不需要去发送到这个真正的执行任务的时刻提示词」
    ///   → 只有用户**确认**过的发；否定的、以及 JEV 按概率显示的一律不发。
    /// · 「这个词跟**描述**的部分就会作为提示词的一部分来去发给 AI」（描述在文件里）
    ///   → 发的是「关键词：描述」。
    ///
    /// ⚠️ 它**顺带收尾**（停表 + 收起预览 + 快照上一轮那一列）：`endListening()` 只在"按住说话"那条
    /// 路上被调，而确认模式轻点 / 连续追问 / 打字提问那三条**不经过它** —— 状态会漏到下一轮
    ///（2026-09-27 排查时发现的既有漏洞，收在这里一并堵上：它是**唯一**五条路都会走的地方）。
    func consumeTurnDecision() -> DirectionBoardTurnDecision {
        let confirmed = displayedItems
            .filter { userConfirmedDirectionIDs.contains($0.directionID) }
            .map { (keyword: $0.keyword, detail: detailForDirectionID($0.directionID)) }
        let decision = DirectionBoardTurnDecision(
            confirmedDirections: confirmed,
            typedInput: typedInput.trimmingCharacters(in: .whitespacesAndNewlines),
            understanding: understandingLines.filter { !$0.value.isEmpty },
            accumulatedMindMap: accumulatedMindMap)

        previousRoundItems = displayedItems
        typedInput = ""
        paragraph = ""
        displayedItems = []
        // ⚠️ **这里不收右下角的预览**（`previewAnswer` / `answerPreviewWriter` 都不动）：
        // 提交之后真答案要 1~2 秒才到，这一刻收掉的话卡片会先消失再冒出来 ——
        // 用户报的「显示了个回复，然后没过半秒钟它又显示了一个全新的回复」就是这个。
        // 交接在 `CompanionManager` 里：真答案的第一个字到达时（`clearAnswerPreview()`），
        // 或这一轮被打断时（`clearAnswerBubble()`）。
        // 收尾（见上）：停表、不再听、在飞的请求作废。
        // **keepPreview: true** —— 这一轮是"提交"，真答案马上就来，卡片要留着交接。
        endListening(keepPreview: true)
        return decision
    }

    /// 方向 id → 它在那份清单里的描述（发提示词时"关键词 + 描述"一起给）。
    private func detailForDirectionID(_ directionID: String) -> String {
        TaskDirectionStore.shared.allDirections().first { $0.id == directionID }?.detail ?? ""
    }

    /// 用户**明确确认过**的那几格（`Set` 便于查）。
    private var userConfirmedDirectionIDs: Set<String> {
        Set(TaskDirectionStore.shared.pinnedStates()
            .filter { $0.state == .confirmed }
            .map(\.directionID))
    }

    // MARK: - 总闸门：取消看板

    func cancelForThisCycle() {
        cancelledForThisCycle = true
        stopDetection()
        print("🎛️ 方向看板：用户取消了本次看板（这一轮循环内不再显示、也不再检测）")
    }

    func cancelForTenMinutes() {
        cancelledUntil = Date().addingTimeInterval(Self.tenMinutes)
        persistCancelledUntil()
        stopDetection()
        print("🎛️ 方向看板：用户取消了十分钟")
    }

    /// 到**明天凌晨 0 点**（本地日历日边界，不是"24 小时之后"）。
    func cancelUntilNextMidnight() {
        let startOfToday = Calendar.current.startOfDay(for: Date())
        cancelledUntil = Calendar.current.date(byAdding: .day, value: 1, to: startOfToday)
        persistCancelledUntil()
        stopDetection()
        print("🎛️ 方向看板：用户取消了今日（到明天凌晨 0 点）")
    }

    func resumeImmediately() {
        cancelledForThisCycle = false
        cancelledUntil = nil
        persistCancelledUntil()
        refreshCancellationState()
    }

    var cancelledUntilDate: Date? { cancelledUntil }

    private func stopDetection() {
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        refreshCancellationState()
    }

    /// **一个布尔 + 一次日期比较，没有任何轮询**（用户点名要求）。
    private func refreshCancellationState() {
        if cancelledUntil == nil,
           let stored = UserDefaults.standard.object(forKey: Self.cancelledUntilDefaultsKey) as? Date {
            cancelledUntil = stored
        }
        if let cancelledUntil, cancelledUntil <= Date() {
            self.cancelledUntil = nil
            persistCancelledUntil()
        }
        isCancelled = cancelledForThisCycle || (cancelledUntil.map { $0 > Date() } ?? false)
    }

    private func persistCancelledUntil() {
        if let cancelledUntil {
            UserDefaults.standard.set(cancelledUntil, forKey: Self.cancelledUntilDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.cancelledUntilDefaultsKey)
        }
    }

    // MARK: - 用户点格子（点 = 明确说了这一格对 / 不对）

    /// 点文字 = 「这个是我想做的」；再点一次 = 取消。
    ///
    /// 用户 2026-09-27：「这个表格里面这些选项它可以被点击的……可以被点击，或者是可以被否定，
    /// 对不对？这个要保留」。**点过就固定下来**（写进 `TaskDirectionPins.json`，跨轮次、跨对话都在），
    /// 它同时是"发送时要不要带这一条"的唯一依据。
    func toggleConfirm(directionID: String, displayedText: String) {
        let isConfirmed = TaskDirectionStore.shared.pinnedStates()
            .contains { $0.directionID == directionID && $0.state == .confirmed }
        TaskDirectionStore.shared.setPinned(directionID: directionID,
                                            state: isConfirmed ? nil : .confirmed)
        refreshDisplayedItems()
        if !isConfirmed { print("🎛️ 方向看板：选中「\(displayedText)」（已固定）") }
    }

    /// 点右边的叉 = 「这个不是我想做的」。**也是固定**（用户：「无论是对还是不对都要显示」）。
    func toggleDeny(directionID: String) {
        let isDenied = TaskDirectionStore.shared.pinnedStates()
            .contains { $0.directionID == directionID && $0.state == .denied }
        TaskDirectionStore.shared.setPinned(directionID: directionID,
                                            state: isDenied ? nil : .denied)
        refreshDisplayedItems()
    }

    /// **静音到点、但用户正在板上操作** → 标记一下，视图让边框呼吸一下
    ///（用户：「让看板边框闪一下、高亮一下或呼吸灯一下，让用户知道任务没有完成、没有发送过去」）。
    func flagHeldAutomaticSend() {
        isHeldFromAutomaticSend = true
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1.2))
            self?.isHeldFromAutomaticSend = false
        }
    }

    /// **大模型在上一轮读懂了用户的话**（`选择：1 对，3 不对`）→ 落到固定状态上。
    ///
    /// 编号是**上一轮那一列**的（见 `DirectionBoardMatching.parseSelectionVerdict`）。
    func applySelectionVerdict(_ verdicts: [(directionID: String, state: TaskDirectionStore.PinState?)]) {
        guard !verdicts.isEmpty else { return }
        for verdict in verdicts {
            TaskDirectionStore.shared.setPinned(directionID: verdict.directionID, state: verdict.state)
        }
        refreshDisplayedItems()
        let summary = verdicts.map { "\($0.directionID)=\($0.state?.rawValue ?? "取消")" }
        print("🎛️ 方向看板：模型读懂了用户对方向的选择 —— \(summary.joined(separator: " "))")
    }

    // MARK: - 节奏闸门（三条，纯函数）

    /// 每 3 秒看一次 + 内容变了 + **新增 ≥10 字（标点不算）**。
    nonisolated static func shouldRequest(transcript: String,
                                          lastRequestedTranscript: String,
                                          isEnabled: Bool,
                                          isListening: Bool,
                                          isRequesting: Bool,
                                          isCancelled: Bool = false,
                                          minimumAddedCharacters: Int = 10) -> Bool {
        guard isEnabled, isListening, !isRequesting, !isCancelled else { return false }
        return addedCharacterCount(transcript: transcript, since: lastRequestedTranscript)
            >= minimumAddedCharacters
    }

    static let defaultMinimumAddedCharacters = 10

    /// **他停下来了吗**（用户 2026-09-27：「只有用户 2 秒钟没有说话，才需要提取用户提示词发送给 AI，
    /// 而不是自动根据时间来确定」）。
    ///
    /// 判据是**"距上一次识别到新字有多久"**，不是某个引擎内部的静音计时器 —— 这一点是被一次事故
    /// 逼出来的：第一版读的是连续监听那条链的静音时刻，而**按住说话那条路根本没有那个值**
    ///（那个计时器只存在于连续监听的 VAD 循环里），于是「静音时长」恒为 0、闸门永远不过 ——
    /// 真机上表现为「我怎么说话，它都整个的卡片没有任何的反应」（他附了截图：三张屏幕截图都截到了，
    /// 四行理解却全是「—」，因为那一轮请求一次都没发出去）。
    /// 而转写的到达时刻**两条路都有**（它是识别回调，不是引擎状态），所以拿它当判据两边都成立。
    nonisolated static func hasPausedLongEnough(secondsSinceHeSpoke: TimeInterval,
                                                threshold: TimeInterval) -> Bool {
        secondsSinceHeSpoke >= threshold
    }

    /// 这次比上次多说了几个字（标点、空格都不算）。
    nonisolated static func addedCharacterCount(transcript: String,
                                                since previousTranscript: String) -> Int {
        let current = DirectionBoardMatching.normalize(transcript)
        let previous = DirectionBoardMatching.normalize(previousTranscript)
        guard !current.isEmpty else { return 0 }
        guard !previous.isEmpty else { return current.count }
        if current.hasPrefix(previous) { return current.count - previous.count }
        var commonPrefixCount = 0
        for (currentCharacter, previousCharacter) in zip(current, previous) {
            guard currentCharacter == previousCharacter else { break }
            commonPrefixCount += 1
        }
        return current.count - commonPrefixCount
    }

    private func startCadenceTimer() {
        cadenceTimer?.invalidate()
        cadenceTimer = Timer.scheduledTimer(withTimeInterval: Self.cadenceSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.requestIfTheTranscriptChanged() }
        }
    }

    // MARK: - 那一次请求（Jev 判方向 + 小提示词写理解）

    private func requestIfTheTranscriptChanged() {
        guard !suppressesRequestsForSelfCheck else { return }
        refreshCancellationState()
        // 三道闸门没过也要留一行（每 3 秒最多一行，且只在"有话说"时才可能重复）——
        // 「看板不动了」到底是闸门没过、还是请求没回来，只有这一行能分辨。
        defer { MainFlowDiagnostics.stage("看板：空闲（等下一拍）") }
        // **④ 他说完了没有**（用户 2026-09-27：「只有用户 2 秒钟没有说话，才需要提取用户提示词
        // 发送给 AI，而不是自动根据时间来确定……因为用户若连续说了一分钟，相当于概念没有表达清楚，
        // 就没有必要发送给 AI」）。
        //
        // 判据是"安静了多久"，不是"过了多久"：他连着说的时候**一次都不发**（那几分钟里
        // 屏幕上停的是他刚开口时的理解），停下来才刷新一次。
        //
        // **判据就是"停顿两秒"**（用户 2026-09-27 深夜把这条收口了：「应用到当前这个逻辑
        // 也是一样的：**检测用户说话，停顿两秒，自动发送给 AI，就这么简单**」）——
        // 用的就是他设置页里那个「静音多久自动发送」，不再是它的一半。
        let silenceThreshold = AppSettingsStore.snapshot().continuousListeningSilenceSendSeconds
        let secondsSinceHeSpoke = Date().timeIntervalSince(latestTranscriptUpdateAt)
        guard Self.hasPausedLongEnough(secondsSinceHeSpoke: secondsSinceHeSpoke,
                                       threshold: silenceThreshold) else {
            MainFlowDiagnostics.stage("看板：他还在说（距上一句 \(String(format: "%.1f", secondsSinceHeSpoke))s）")
            return
        }
        guard Self.shouldRequest(transcript: latestTranscript,
                                 lastRequestedTranscript: lastRequestedTranscript,
                                 isEnabled: isEnabled,
                                 isListening: isListening,
                                 isRequesting: isRequesting,
                                 isCancelled: isCancelled,
                                 minimumAddedCharacters: AppSettingsStore
                                     .snapshot().directionBoardMinimumAddedCharacters) else { return }
        let transcript = latestTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        lastRequestedTranscript = transcript
        // **这一轮的"新问题" = 上一轮回复落地之后他说的那段**（用户 2026-09-27：
        // 「代码上要能识别 AI 回复结果的那一秒……从 AI 回复停稳那一秒到用户第二次停顿，
        // 中间的内容要提取出来，**这个文本就是用户全新的问题**，重点关注这个」）。
        //
        // 拿不到"之后"那一段（第一轮、或者回复落地前他就一直在说）就退回整段 —— 那时整段本来就是新问题。
        // ⚠️ **兜底：算出来是空就用整段**（2026-09-27 修）。判据依赖时间戳，而时间戳这种东西
        // 一旦哪一环没写上（这一轮就是这么炸的），结果就是**把一段空问题发给模型** ——
        // 屏幕上表现成"问他他没反应"，而且不报任何错。既然"这一轮的新问题"永远不该是空的，
        // 这里就不允许它是空的。
        let transcribedAfterLastReply = recentTurns.isEmpty
            ? ""
            : latestTranscriptAfter(recentTurns[0].at).trimmingCharacters(in: .whitespacesAndNewlines)
        let newQuestion = transcribedAfterLastReply.isEmpty ? transcript : transcribedAfterLastReply
        // 把这一轮他说的那段接进"说过的全部内容"（同一段被重放多次时只记一次 ——
        // 识别器给的是累积文本，同一轮里这个函数会被调好几次）。
        let questionKey = Self.mindMapLineKey(newQuestion)
        if !questionKey.isEmpty, spokenTranscript.last.map(Self.mindMapLineKey) != questionKey {
            spokenTranscript.append(newQuestion)
            // 上限只是防"说了一整天"把提示词撑爆；正常一次会话到不了。
            if spokenTranscript.count > Self.maximumSpokenSegments {
                spokenTranscript.removeFirst(spokenTranscript.count - Self.maximumSpokenSegments)
            }
        }
        MainFlowDiagnostics.log("🧭 看板：第 \(roundGeneration) 轮发请求（转写 \(transcript.count) 字）")
        let generation = roundGeneration
        isRequesting = true
        streamingUpdateCount = 0
        // **这一轮带上去多少字的旧图** —— 用户报「右上角没有把所有问题都显示出来」时，
        // 这一行是唯一的判据：带上去是空的（被清了），还是带上去没被并进去（模型的问题）。
        MainFlowDiagnostics.log("🧭 看板：这一轮带上旧图 \(accumulatedMindMap.count) 字"
                                + "（\(accumulatedMindMap.split(separator: "\n").count) 行）")

        requestTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isRequesting = false }
            let directions = TaskDirectionStore.shared.keywordsAndDetails()
            // **每一轮都带一张当下的屏幕**（用户 2026-09-27：「他为什么会显示没有看到屏幕呢？
            // **他应该直接看到屏幕啊**」）。
            //
            // 原来只在用户说出「参考屏幕 / 根据图片」这类组合词时才带图 —— 而他说「屏幕上的第 2 题
            // 该选哪个」时没有那四个字，于是模型**真的看不到**，右下角就回一句"我还没看到题目内容"。
            // 这块板子的用途本来就是"看着屏幕理解你在说什么"，图不该由一句口令来解锁。
            // 截图本身就排除了 Wanna 自己的窗口（`SCContentFilter(display:excludingWindows:)`
            // 按 bundle id 过滤），所以两张卡片模型是看不见的 —— 不会看到自己的界面。
            // **这一轮的截图来自参考材料采集器**（按下快捷键自动一组 + 每说到一次「屏幕」词再加一组）。
            //
            // ⚠️ 这里**只带最近的那一组**：看板回答的是"他此刻在说什么/问什么"，
            // 最新的那一屏才是判据；把五组全塞进每 3 秒一次的请求里既贵又没有用
            //（主 Agent 那一轮才需要全部 —— 那才是"参考材料"）。
            let latestScreenGroup = TurnReferenceCollector.shared.materials.screenshots.last ?? []
            let screenshots = latestScreenGroup.map { (data: $0.imageData, label: $0.label) }
            let state = "用户这一轮说的话：\n\(newQuestion.prefix(500))"

            // **三条并行**（用户 2026-09-27 深夜定的形状）：
            // ① Jev 判方向（便宜、给概率）；
            // ② **第一次大模型调用**：只看那份完整转写、**没有任何上下文** → 细节 / 矛盾 / 歧义；
            // ③ **第二次大模型调用**：带上下文，**只回答最近这一问** → 答案 / 选择。
            //
            // 拆成两次的理由是他的原话：「因为刚才提示词是**既要让 AI 忽略之前的内容来回复最近的
            // 一个问题，又要让 AI 参考之前的内容来总结所有的问题**……**每一个 AI 调用，
            // 都是在回复一个方向的问题**」。
            async let probabilitiesTask = self.judgeWithJevIfConfigured(state: state, directions: directions)
            async let analysisTask = self.analyzeTranscriptWithModel()
            async let answerTask = self.answerWithModel(newQuestion: newQuestion,
                                                        directions: directions,
                                                        screenshots: screenshots)
            let probabilities = await probabilitiesTask
            let analysisText = await analysisTask
            let answerText = await answerTask
            let paragraphText = analysisText

            guard self.roundGeneration == generation, self.isListening else { return }
            if let probabilities {
                self.jevProbabilities = probabilities
                let top = probabilities.sorted { $0.value > $1.value }.prefix(3)
                    .map { "\($0.key)=\(String(format: "%.2f", $0.value))" }
                print("🧭 方向看板：Jev 判断 \(top.joined(separator: " "))")
            }
            if let paragraphText, !paragraphText.isEmpty {
                print("🧭 方向看板：理解 = \(paragraphText.prefix(80))")
                // 自检时把**模型回的原文**整段打出来 —— 判断"答案没出现"是模型没写、还是解析器没认出来，
                // 只能看原文（这个仓的规矩：先量，别猜）。
                if Self.selfCheckMode != nil {
                    print("🎛️ 方向看板自检：模型原文 >>>\n\(paragraphText)\n<<<")
                }
                // 显示用的那段话去掉「类型：X」那一截（模型读懂了题目，但那截是给看板用的）。
                let displayText = DirectionBoardPrompt.paragraphWithoutLabelLine(paragraphText)
                self.paragraph = DirectionBoardPrompt.cleanParagraph(
                    displayText.isEmpty ? paragraphText : displayText)
                // **永远是四行**（缺的留空串，由视图画占位符）—— 卡片每一段的高度于是恒定。
                self.understandingLines = DirectionBoardPrompt.parseUnderstandingLines(paragraphText)
                // 有结构化那几行时，正文只留"标签之外的话"（模型爱在标签前后再写一句）。
                self.paragraph = DirectionBoardPrompt.cleanParagraph(
                    DirectionBoardPrompt.leftoverParagraphText(paragraphText))
                // 一次回复落了地 —— 视图据此播那一下淡入（用户：「而不是突然间显示出来」）。
                self.contentRevision += 1

                // **答案** → 右下角那张卡片（与最终结果同一张、同一套渲染）。
                //
                // ⚠️ **只在真的取到答案时才写** —— 原来这一行是"没有答案就写 nil"，于是同一句话里
                // 的第 N+1 轮（3 秒后，模型这次没写「答案」那一行）会把第 N 轮已经显示出来的答案
                // 抹掉：用户看到的是"闪一下就没了"，报的就是「我问他问题的时候他也没有回复我」。
                // 清空只发生在**一轮结束**（发送 / ESC / 新一轮），不发生在"这一轮没写"上。
                // 整段回来了：流式那一轮结束（右下角那张卡片从"流式"切成"落定"）。
                MainFlowDiagnostics.log("🧭 看板：流式渲染完毕 —— 边收边画了 \(self.streamingUpdateCount) 次"
                                        + "（0 次＝分片被丢掉，只有整段上屏）")
                self.streamingUpdateCount = 0
                self.boardPreviewStreamingWriter?(false)
                self.streamingAnswerText = ""

                // **把这一轮那张图存成"到目前为止的汇总"**（下一轮在它上面继续并）。
                if let mindMap = self.understandingLines.first(where: { $0.label == "细节" })?.value,
                   !mindMap.isEmpty {
                    self.accumulatedMindMap = mindMap
                    MainFlowDiagnostics.log("🧭 看板：这一轮的图 \(mindMap.count) 字"
                                            + "（\(mindMap.split(separator: "\n").count) 行）"
                                            + "；发上去的是他说过的 \(self.spokenTranscript.count) 段")
                }

                // **疑问那一行是"常驻"的**：把这一轮的值记下来，下一轮带着它去问模型
                //（它只删已解决的、加新的，不许换一批重说）。
                if let questions = self.understandingLines.first(where: { $0.label == "疑问" })?.value,
                   !questions.isEmpty {
                    self.pendingQuestions = questions
                }

                // **用户对上一轮那些方向的评论，由模型在**这一轮**读懂**（两拍语义，用户 2026-09-27：
                // 「他的理解是由大语言模型在第二轮……你必须要知道用户表达的是对上一轮 JEV 模型
                // 它的结果的一个选择」）。编号按**上一轮那一列**回填。
                // **「选择」也来自第二次调用** —— 判"他对上一轮那些方向说了什么"必须有上下文，
                // 而第一次调用是**没有任何上下文**的（见 `answerWithModel`）。
                let verdicts = DirectionBoardMatching.parseSelectionVerdict(
                    answerText ?? "", previousRound: self.previousRoundItems)
                if !verdicts.isEmpty { self.applySelectionVerdict(verdicts) }
                // 自检时把"上一轮那一列"打出来 —— 判定是按它回填的，日志里要能核对。
                if Self.selfCheckMode != nil, !self.previousRoundItems.isEmpty {
                    print("🎛️ 方向看板自检：上一轮那一列 = "
                          + self.previousRoundItems.map { "\($0.number).\($0.keyword)" }
                            .joined(separator: " ｜ "))
                }
            }
            // **这一轮的记录与答案**（两件事都不依赖"梳理"成功 —— 见下面那段注释）。
            self.settleRound(newQuestion: newQuestion,
                             analysisText: analysisText,
                             answerText: answerText)
            self.refreshDisplayedItems()
        }
    }

    /// 一轮的两件收尾：**记下这一轮**（给下一轮当参考）+ **把答案写到右下角那张卡片**。
    ///
    /// ⚠️ 它们原来都写在"梳理（第一次调用）成功"那个 `if let` 里 —— 于是**梳理一旦失败或返回空，
    /// 答案会跟着被吞掉、连"上一轮回过什么"也一起不记**。而"上一轮回过什么"正是用户追问时
    /// **唯一的信息源**（他 2026-09-27 深夜报的「我追问之前的问题，我发现他无法知道我上一次
    /// 回复了什么，这是不可以的」）。所以这两件事**与梳理解耦**：各自成功就各自落地。
    private func settleRound(newQuestion: String, analysisText: String?, answerText: String?) {
        let answer = answerText.flatMap(DirectionBoardPrompt.parseAnswer)
        if let answer {
            previewAnswer = answer
            answerPreviewWriter?(answer)
            // **记下"我刚才回过这一条"** —— 下一轮他对着它追问（「重新换行列出」）时，
            // 请求里得带上它（`previousCornerAnswersPromptBlock`）。
            noteCornerAnswerShown(answer)
            print("🧭 方向看板：答案预览 = \(answer.prefix(60))")
        }
        // **记下这一轮**（他说的 + 你回的），最近的在前 —— 下一轮请求带着最近三轮当参考。
        // ⚠️ 记的是**这一轮问的那段**（`newQuestion`），不是整段累积转写 ——
        // 否则下一轮算出来的"新问题"会把这一轮的内容又算进去。
        let recordedAnswer = answer ?? analysisText ?? ""
        guard !recordedAnswer.isEmpty else { return }
        recentTurns.insert((question: newQuestion,
                            answer: String(recordedAnswer.prefix(Self.maximumReadingCharacters)),
                            at: Date()), at: 0)
        if recentTurns.count > Self.rememberedTurnCount {
            recentTurns.removeLast(recentTurns.count - Self.rememberedTurnCount)
        }
    }

    /// **第一次调用**：只看那份完整转写，没有任何上下文 —— 产出**细节 / 矛盾 / 歧义**三行。
    ///
    /// 拆开两次调用的理由（用户 2026-09-27 深夜）：「因为刚才提示词是**既要让 AI 忽略之前的内容
    /// 来回复最近的一个问题，又要让 AI 参考之前的内容来总结所有的问题**……那这样的话就不会产生
    /// 任何的干扰了。那这样的话，**每一个 AI 调用，都是在回复一个方向的问题**。」
    ///
    /// 所以这一条**不带截图、不带历史**：屏幕截图与"最近三轮"属于第二次调用的事。
    private func analyzeTranscriptWithModel() async -> String? {
        let transcript = spokenTranscript.joined(separator: "\n")
        guard !transcript.isEmpty else { return nil }
        do {
            let (text, _) = try await visionChatAPI.analyzeImageStreaming(
                images: [],
                systemPrompt: DirectionBoardPrompt.transcriptAnalysisSystemPrompt(),
                userPrompt: DirectionBoardPrompt.transcriptAnalysisUserPrompt(transcript: transcript),
                roleOverride: CompanionManager.visionRoleOverride(
                    forCardID: ConversationSessionsStore.activeSession().id.uuidString),
                // **边收边渲染**（用户：「像流式输出，然后加上渲染逻辑、加点动画啊」）——
                // 分片原来被丢掉，卡片要等整段回来才一次性上屏。
                onTextChunk: { [weak self] partial in
                    self?.applyStreamingParagraph(partial)
                })
            return DirectionBoardPrompt.cleanRawResponse(text)
        } catch {
            print("🧭 方向看板：第一次调用（梳理）失败 —— \(error.localizedDescription)")
            return nil
        }
    }

    /// 第二次调用的流式：**只往右下角那张卡片写**（那三行归第一次调用，别混）。
    private func applyStreamingAnswer(_ partial: String) {
        guard let answer = DirectionBoardPrompt.parseAnswer(partial), answer != streamingAnswerText else { return }
        streamingAnswerText = answer
        answerPreviewWriter?(answer)
        boardPreviewStreamingWriter?(true)
    }

    /// **第二次调用**：带着上下文，**只回答最近这一问** —— 产出**答案 / 选择**。
    ///
    /// 它拿到的是：屏幕截图（参考材料）+ 最近三轮问答（标好"最近一轮/二轮/三轮"）+
    /// 代码切出来的"他这一轮问的那一段"（标成重点）。判据只有一条：
    /// **跟参考内容有关系就结合着答，没关系就只答最近这一问**。
    private func answerWithModel(newQuestion: String,
                                 directions: [(id: String, keyword: String, detail: String)],
                                 screenshots: [(data: Data, label: String)]) async -> String? {
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(directions: directions)
        let userPrompt = DirectionBoardPrompt.understandingUserPrompt(
            newQuestion: newQuestion,
            previousRoundItems: previousRoundItems,
            previousTurnsText: previousTurnsPromptBlock(),
            // ⚠️ **「你刚才回过的那几条」必须带上**（用户 2026-09-27 深夜报的：
            // 「我追问之前的问题，我发现他**无法知道我上一次回复了什么**，这是不可以的。
            // **上一次回复的结果必须追加到全新的调用里面**。我说的是**右下角这部分**」）。
            // 拆两次调用的时候我把这一段从请求里摘掉了 —— 而它正是"追问/让它改写"唯一的信息源。
            previousAnswers: previousCornerAnswersPromptBlock(),
            referenceMaterials: TurnReferenceCollector.shared.promptBlock(),
            previousQuestions: nil)
        do {
            let (text, _) = try await visionChatAPI.analyzeImageStreaming(
                images: screenshots,
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                roleOverride: CompanionManager.visionRoleOverride(
                    forCardID: ConversationSessionsStore.activeSession().id.uuidString),
                // **答案边出边写进右下角那张卡片**（与主 Agent 那条路同一种手感）。
                onTextChunk: { [weak self] partial in
                    self?.applyStreamingAnswer(partial)
                })
            return DirectionBoardPrompt.cleanRawResponse(text)
        } catch {
            print("🧭 方向看板：第二次调用（回答）失败 —— \(error.localizedDescription)")
            return nil
        }
    }

    /// Jev 那一路。**没配 key 就整条跳过**（不影响本地关键词那条路）。
    private func judgeWithJevIfConfigured(state: String,
                                          directions: [(id: String, keyword: String, detail: String)])
        async -> [String: Double]? {
        guard JevDecisionClient.hasAPIKey else { return nil }
        do {
            let results = try await JevDecisionClient.shared.judge(transcriptState: state,
                                                                    directions: directions)
            return Dictionary(uniqueKeysWithValues: results.map { ($0.directionID, $0.probability) })
        } catch {
            print("🧭 方向看板：Jev 这次没答上来（保留上一次的概率）—— \(error.localizedDescription)")
            return nil
        }
    }

    /// 那段"AI 怎么理解"：**只用方向清单 + 用户的话**（不再发主 Agent 那 5000 字提示词）。
    /// **一大轮结束**：清掉临时那份类型文件（用户：「临时文件在每一轮对话结束时清掉。
    /// 是每一大轮……中间可能有打断，这算一个轮，不算两轮」）。
    /// 一大轮结束（追问窗口关闭）：清掉"这一轮的上下文"。
    ///
    /// ⚠️ **固定状态不动** —— 用户选的是「一直保留到他说取消」，所以 `TaskDirectionPins.json`
    /// 这里一个字都不写（这也是它没有临时文件的原因）。
    func endBigRound() {
        previousRoundItems = []
        jevProbabilities = [:]
    }

    private func refreshDisplayedItems() {
        let settings = AppSettingsStore.snapshot()
        displayedItems = DirectionBoardMatching.displayedItems(
            transcriptText: latestTranscript,
            directions: TaskDirectionStore.shared.allDirections(),
            jevProbabilities: jevProbabilities,
            probabilityThreshold: settings.directionBoardProbabilityThreshold,
            pinnedStates: TaskDirectionStore.shared.pinnedStates())
    }
}
