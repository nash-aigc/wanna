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

    static func == (lhs: DirectionBoardTurnDecision, rhs: DirectionBoardTurnDecision) -> Bool {
        lhs.typedInput == rhs.typedInput
            && lhs.confirmedDirections.map(\.keyword) == rhs.confirmedDirections.map(\.keyword)
            && lhs.understanding.map(\.label) == rhs.understanding.map(\.label)
            && lhs.understanding.map(\.value) == rhs.understanding.map(\.value)
    }
}

@MainActor
final class DirectionBoardSession: ObservableObject {

    static let shared = DirectionBoardSession()
    private init() {}

    /// **把答案预览写到右下角那张卡片上**（由 `CompanionManager` 注入，与 `voiceIdleProvider` /
    /// `sharedVoicePlaybackEngineProvider` 同一个先例：跨子系统只走注入的闭包，不让对方去猜）。
    /// 传 `nil` = 清掉那张卡片（发送、取消、新一轮都从这里清）。
    var answerPreviewWriter: ((String?) -> Void)?

    // MARK: - 界面读的状态

    @Published private(set) var isListening = false
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

    // MARK: - 内部状态

    private var latestTranscript = ""
    private var lastRequestedTranscript = ""
    /// 最近一次 Jev 判断给出的概率（方向 id → P(是)）。
    private var jevProbabilities: [String: Double] = [:]
    /// **最近三轮**模型的理解原文（最近的那一轮在最前）—— 用户要的连续性：
    /// 「你要在发送给下一轮模型的时候要保留前三轮……让它重点参考最近一轮」。
    private var recentReadings: [String] = []
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
        let lines = [
            "帮我把这段记下来",
            // **用户真实报上来的那一句**（2026-09-27）。它刻意**不含「参考屏幕」这四个字** ——
            // 原来正是因为要等那四个字才截图，所以这句问法下模型根本看不到屏幕，
            // 右下角回的是"我还没看到题目的内容"。自检就用这句钉住修复。
            "屏幕上的第 2 题该选哪个",
            // 第三句**不是问题** → 这一轮模型不会再写「答案」那一行。
            // 用来看住那个 bug：没有答案的那一轮**不许**把上一轮已经显示出来的答案抹掉。
            "顺便把这个结果记到我的笔记里面去",
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
            understanding: understandingLines.filter { !$0.value.isEmpty })
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
        understandingLines = DirectionBoardPrompt.understandingLabels.map { ($0, "") }
        previewAnswer = nil
        answerPreviewWriter?(nil)
        contentRevision = 0
        recentReadings = []
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
        refreshDisplayedItems()
    }

    func endListening() {
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        isListening = false
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
            understanding: understandingLines.filter { !$0.value.isEmpty })

        previousRoundItems = displayedItems
        typedInput = ""
        paragraph = ""
        displayedItems = []
        previewAnswer = nil
        answerPreviewWriter?(nil)
        // 收尾（见上）：停表、不再听、在飞的请求作废。
        endListening()
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
        let generation = roundGeneration
        isRequesting = true

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
            let screenshots = await self.captureScreenForBoard()
            let state = "用户到目前为止说的话：\n\(transcript.prefix(500))"

            // ① **Jev 判方向**（便宜、给概率）；② **大模型写那段理解**（小提示词）。
            // 两条并行发，谁先回来谁先上屏。
            async let probabilitiesTask = self.judgeWithJevIfConfigured(state: state, directions: directions)
            async let paragraphTask = self.writeParagraphWithModel(transcript: transcript,
                                                                   directions: directions,
                                                                   screenshots: screenshots)
            let probabilities = await probabilitiesTask
            let paragraphText = await paragraphTask

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
                // **最近三轮**（最近的在最前）—— 下一轮请求带着它，让模型保持连续。
                self.recentReadings.insert(String(paragraphText.prefix(Self.maximumReadingCharacters)), at: 0)
                if self.recentReadings.count > Self.rememberedReadingCount {
                    self.recentReadings.removeLast(self.recentReadings.count - Self.rememberedReadingCount)
                }

                // **答案** → 右下角那张卡片（与最终结果同一张、同一套渲染）。
                //
                // ⚠️ **只在真的取到答案时才写** —— 原来这一行是"没有答案就写 nil"，于是同一句话里
                // 的第 N+1 轮（3 秒后，模型这次没写「答案」那一行）会把第 N 轮已经显示出来的答案
                // 抹掉：用户看到的是"闪一下就没了"，报的就是「我问他问题的时候他也没有回复我」。
                // 清空只发生在**一轮结束**（发送 / ESC / 新一轮），不发生在"这一轮没写"上。
                if let answer = DirectionBoardPrompt.parseAnswer(paragraphText) {
                    self.previewAnswer = answer
                    self.answerPreviewWriter?(answer)
                    print("🧭 方向看板：答案预览 = \(answer.prefix(60))")
                }

                // **用户对上一轮那些方向的评论，由模型在**这一轮**读懂**（两拍语义，用户 2026-09-27：
                // 「他的理解是由大语言模型在第二轮……你必须要知道用户表达的是对上一轮 JEV 模型
                // 它的结果的一个选择」）。编号按**上一轮那一列**回填。
                let verdicts = DirectionBoardMatching.parseSelectionVerdict(
                    paragraphText, previousRound: self.previousRoundItems)
                if !verdicts.isEmpty { self.applySelectionVerdict(verdicts) }
                // 自检时把"上一轮那一列"打出来 —— 判定是按它回填的，日志里要能核对。
                if Self.selfCheckMode != nil, !self.previousRoundItems.isEmpty {
                    print("🎛️ 方向看板自检：上一轮那一列 = "
                          + self.previousRoundItems.map { "\($0.number).\($0.keyword)" }
                            .joined(separator: " ｜ "))
                }
            }
            self.refreshDisplayedItems()
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
    private func writeParagraphWithModel(transcript: String,
                                         directions: [(id: String, keyword: String, detail: String)],
                                         screenshots: [(data: Data, label: String)]) async -> String? {
        // 每一轮都带图 → 提示词里那段"这一次带了屏幕截图，请看图再回答"成了**常规要求**，
        // 不再是"带了图才追加的一段"。
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(directions: directions)
        let userPrompt = DirectionBoardPrompt.understandingUserPrompt(
            transcript: transcript,
            previousRoundItems: previousRoundItems,
            recentReadings: recentReadings)
        do {
            let (text, _) = try await visionChatAPI.analyzeImageStreaming(
                images: screenshots,
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                roleOverride: CompanionManager.visionRoleOverride(
                    forCardID: ConversationSessionsStore.activeSession().id.uuidString),
                onTextChunk: { _ in })
            // ⚠️ **不截断**：解析（五行 + 任务结果）必须从完整原文里切 —— 显示那一步才限长。
            return DirectionBoardPrompt.cleanRawResponse(text)
        } catch {
            print("🧭 方向看板：这次理解请求失败（保留上一次）—— \(error.localizedDescription)")
            return nil
        }
    }

    /// **截一张当下的屏幕**（每一轮请求前调一次，见调用点的理由）。
    ///
    /// 用的是设置里「看与截图」那一页的参数（清晰度 / 压缩质量 / 多显示器策略），
    /// 与主 Agent 那条路**同一份设置** —— 两处各读一次必然会漂。
    /// 失败就返回空数组（这一轮不带图，照常出理解），不抛给调用方。
    private func captureScreenForBoard() async -> [(data: Data, label: String)] {
        let settings = AppSettingsStore.snapshot()
        do {
            let captures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG(
                maximumDimension: settings.screenshotMaxDimension == 0 ? nil : settings.screenshotMaxDimension,
                compressionQuality: settings.screenshotCompressionQuality,
                capturesAllDisplays: settings.capturesAllDisplays)
            guard isListening else { return [] }
            return captures.map { (data: $0.imageData, label: $0.label) }
        } catch {
            print("🧭 方向看板：这一轮没截到屏（不带图继续）—— \(error.localizedDescription)")
            return []
        }
    }

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
