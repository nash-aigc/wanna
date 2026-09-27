//
//  DirectionBoardSession.swift
//  Wanna
//
//  **「任务方向看板」的状态机**（2026-09-27，第二版）。
//
//  第一版把六个方向一次全摆出来 —— 用户当场否掉：
//  > 如果我没有说话的时候，它不应该显示这个弹窗、这个卡片……要根据**用户的内容**来去选择到底
//  > 显示哪一个卡片、到底显示哪一个关键词……而不是直接就显示，你这样的话就体验太差了。
//
//  所以第二版：**只显示他说到的那些方向**（本地关键词或 AI 判断），每一格带连续编号，
//  编号还能被**口述**选中（「第三个方向」）。规则全在 `DirectionBoardConfiguration.displayedItems`。
//
//  形状照 `NotionNoteSession`（同一个仓库里另一件"说话期间在后台跑的事"）：`@MainActor ObservableObject`
//  单例，四个口子 —— `beginListening()` / `noteLiveTranscript()` / `endListening()` / `consumeTurnDecision()`。
//
//  ⚠️ **它是纯观察者**：不碰 `currentResponseTask`、不碰 `voiceState`、不碰历史、不碰 TTS、不截图。
//  唯一的输出是"提交时那几行要加在提示词前面的话"，由调用方在拼提示词那一步取走。
//

import Combine
import Foundation

/// 一格被用户点过（或说中）之后的状态。
nonisolated enum DirectionBoardSelectionState: String {
    /// 没选（默认）—— 不写进提示词。
    case pending
    /// 选了（点文字或口述「第 N 个方向」）= 确认。
    case confirmed
    /// 点右边的叉 = 否认。
    case denied
}

@MainActor
final class DirectionBoardSession: ObservableObject {

    static let shared = DirectionBoardSession()
    private init() {}

    // MARK: - 界面读的状态

    /// 正在"说话期间"（相位允许 + 说出了字）。
    @Published private(set) var isListening = false
    /// AI 对这次任务的理解（一段话）。空串 = 还没有结果（那一段留白，不写占位话）。
    @Published private(set) var paragraph = ""
    /// **现在显示哪几格**（只含他说到的方向，带连续编号）。
    @Published private(set) var displayedItems: [DirectionBoardDisplayItem] = []
    /// 每一类的选择状态（键 = 行下标）。
    @Published private(set) var selectionStates: [Int: DirectionBoardSelectionState] = [:]
    /// **选下去那一刻那一格显示的文字** —— 用户确认的是他看到的字，不是之后再变的字。
    @Published private(set) var confirmedTexts: [Int: String] = [:]
    /// **AI 那段总结的选择状态**（用户 2026-09-27：「在系统总结这块，也要增加一个选中或者确认、
    /// 否认的按钮，即添加一个 X 叉按钮」）。
    @Published private(set) var summaryState: DirectionBoardSelectionState = .pending
    /// 选下去那一刻那段总结的原文（冻住 —— 他确认的是他看到的字）。
    @Published private(set) var summaryConfirmedText: String?
    /// **静音到点但被按住没发** —— 看板据此呼吸一下，告诉他"还没发出去"。
    ///
    /// 用户：「就让看板边框闪一下、高亮一下或呼吸灯一下，让用户知道任务没有完成、没有发送过去，
    /// 而不是直接发送任务。」由 `DirectionBoardPanelController` 在按住那一下置上，1.2 秒后自己落。
    @Published private(set) var isHeldFromAutomaticSend = false

    /// 输入框（用户手打的补充说明）。
    @Published var typedInput = ""
    /// 有一次请求正在飞（看板上显示一个很轻的"在想"）。
    @Published private(set) var isRequesting = false
    /// **看板被用户取消了**（本次循环 / 十分钟 / 今日）—— 取消了就不显示、也不发请求。
    @Published private(set) var isCancelled = false

    // MARK: - 内部状态

    /// 「取消本次」—— 只在这一次大循环里有效。
    private var cancelledForThisCycle = false
    private var latestTranscript = ""
    private var lastRequestedTranscript = ""
    private var modelRowLabels: [Int: String] = [:]
    private var localMatches: [Int: DirectionBoardConfiguration.Match] = [:]
    /// **上一次模型回的原文** —— 每次请求都是一份全新的内容，所以要把它带上（用户点名要求）。
    private var previousReading: String = ""
    private var cadenceTimer: Timer?
    private var requestTask: Task<Void, Never>?
    private var roundGeneration = 0
    private let visionChatAPI = BailianVisionChatAPI()
    /// 这一次大循环的 id（由调用方传进来）—— 「取消本次」就是"这个 id 之内不再显示"。
    private var currentCycleID: String?
    /// 「取消十分钟 / 取消今日」取消到什么时候（`nil` = 没有定时取消）。
    private var cancelledUntil: Date?
    private static let cancelledUntilDefaultsKey = "wannaDirectionBoardCancelledUntil"
    private static let tenMinutes: TimeInterval = 10 * 60

    /// 每 3 秒看一次（用户定的节奏）。
    static let cadenceSeconds: TimeInterval = 3
    /// 上一次的结论带过去时最多留这么多字（防止越滚越长）。
    private static let maximumPreviousReadingCharacters = 600

    private var configuration: DirectionBoardConfiguration {
        DirectionBoardConfiguration.validated(AppSettingsStore.snapshot().directionBoard)
    }

    private var isEnabled: Bool {
        AppSettingsStore.snapshot().directionBoardEnabled
    }

    // MARK: - 自检开关（没有麦克风时唯一能把看板拉起来的办法）

    /// `WANNA_DIRECTION_BOARD_SELFCHECK=1` 时：把看板拉起来、喂几句**假转写**，
    /// 但**不发任何请求**（`WANNA_DIRECTION_BOARD_SELFCHECK=live` 才发一次真的）。
    ///
    /// 理由同第一版：这台机器没有可用的语音输入（音箱到麦克风的耦合 212–447/32768，门槛 0.25），
    /// 而看板只在"说话期间"出现 —— 没有它我只能靠读代码说"它应该是对的"。
    /// 先例是 `WANNA_DESKTOP_AGENT`（同样是环境变量、同样不是用户可见的设置）。
    static var selfCheckMode: String? {
        ProcessInfo.processInfo.environment["WANNA_DIRECTION_BOARD_SELFCHECK"]
    }

    private var suppressesRequestsForSelfCheck: Bool {
        Self.selfCheckMode != nil && Self.selfCheckMode != "live"
    }

    /// 按顺序喂几句假转写（每句都比上一句多一个方向，看板应当**一格一格长出来**）。
    func runSelfCheckSequence() {
        guard Self.selfCheckMode != nil else { return }
        beginListening(cycleID: "self-check-cycle")
        let lines = [
            "帮我把这段记下来",
            "帮我把这段记下来，再指给我看是哪个",
            "帮我把这段记下来，再指给我看是哪个，然后照着它写一段新的",
            "帮我把这段记下来，再指给我看是哪个，照着它写一段新的，选第二个方向",
        ]
        for (index, line) in lines.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 1.4) { [weak self] in
                // **两个都喂**：真机上按住说话那条回调本来就同时喂刘海那行字幕与看板
                //（见 `CompanionManager` 的两处 interim），而"说出字才显示"那道闸门看的是
                // 刘海那行的文本（`NotchListeningTranscriptModel.liveText`）—— 自检只喂看板
                // 自己的话，面板会立刻被那道闸门收掉（实测过一次）。
                NotchListeningTranscriptModel.shared.setLiveText(line)
                self?.noteLiveTranscript(line)
                print("🎛️ 方向看板自检：喂了第 \(index + 1) 句 —— \(line)")
                let shown = self?.displayedItems.map { "\($0.number).\($0.rowTitle)=\($0.text)" } ?? []
                print("🎛️ 方向看板自检：现在显示 \(shown.joined(separator: " ｜ "))")
                print("🎛️ 方向看板自检：选中的行 \(self?.selectionStates.mapValues(\.rawValue) ?? [:])")
            }
        }
    }

    /// 自检：把"提交时会拼出来的那几行"打出来（不花请求、不动管线）。
    func logTurnDecisionForSelfCheck() {
        guard Self.selfCheckMode != nil else { return }
        let decision = consumeTurnDecision()
        print("🎛️ 方向看板自检：提交时会加在提示词前面的是 —— "
              + (DirectionBoardPrompt.decoration(confirmedDirectionTexts: decision.directionTexts,
                                                 typedInput: decision.typedInput) ?? "（什么都没点，不加）"))
    }

    // MARK: - 生命周期（调用方各加一行的四个口子）

    /// 用户按下快捷键开始说话了（或连续追问窗口里又开口了）。
    func beginListening(cycleID: String?) {
        guard isEnabled else { return }
        // **一次全新的大循环 = 「取消本次」失效**（用户：「在整个这一个循环里面，无论用户进行了几轮，
        // 只要在某一轮点击了取消看板……看板就取消了」—— 反过来，新循环就该重新显示）。
        // 同一条循环里再开口（追问窗口）会带着同一个 id 进来，所以不会被清掉 ✓。
        if let cycleID, cycleID != currentCycleID {
            cancelledForThisCycle = false
        }
        currentCycleID = cycleID
        // **「取消十分钟 / 取消今日」在这里比一次时间戳就够了，不做轮询**
        //（用户：「这个检测机制一定要注意，不要让它轮询，因为没有必要轮询，轮询太费电脑成本。
        // 可以先比对一下上次取消是什么时间……每一个大的循环看一次就行了」）。
        refreshCancellationState()
        roundGeneration += 1
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false

        latestTranscript = ""
        lastRequestedTranscript = ""
        paragraph = ""
        previousReading = ""
        modelRowLabels = [:]
        localMatches = [:]
        selectionStates = [:]
        confirmedTexts = [:]
        summaryState = .pending
        summaryConfirmedText = nil
        isHeldFromAutomaticSend = false
        displayedItems = []
        typedInput = ""
        isListening = true

        startCadenceTimer()
    }

    /// 识别文本更新了（两处 interim 回调各喂一行）。
    ///
    /// 这里做三件**本地、不花请求**的事：关键词匹配、算出现在该显示哪几格、
    /// **认一认他是不是用嘴选了哪个方向**（用户：「如果用户的语言里明确包含「选择第几个方向」
    /// 「第二个方向」这种，它就自动高亮，不需要通过点击也可以」）。
    func noteLiveTranscript(_ transcriptText: String) {
        guard isListening else { return }
        latestTranscript = transcriptText
        // **口述取消**先判（用户：「判断里面有没有准确的「取消任务看板」或「取消任务方向」这几个字」）——
        // 命中之后这一轮就不再检测了，所以后面那两步也没必要走。
        if DirectionBoardConfiguration.spokenCancelRequested(in: transcriptText) {
            cancelForThisCycle()
            return
        }
        refreshDisplayedItems()
        applySpokenSelectionIfAny(in: transcriptText)
    }

    /// 这一轮结束了（提交 / 取消 / 窗口关闭）。**停表 + 丢掉在飞的请求**。
    func endListening() {
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        isListening = false
    }

    /// **提交时取走**：按屏幕上的编号顺序给出确认过的方向短语；输入框那句单独给。取走即清。
    func consumeTurnDecision() -> (directionTexts: [String], typedInput: String) {
        var directionTexts: [String] = []
        var summaryTexts: [String] = []
        for item in displayedItems {
            guard selectionStates[item.rowIndex] == .confirmed else { continue }
            let text = (confirmedTexts[item.rowIndex] ?? item.text)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            directionTexts.append(text)
        }
        // **AI 那段总结如果被确认过，也当一条标签发过去**（与方向那条同一个形状）。
        if summaryState == .confirmed,
           let confirmedSummary = summaryConfirmedText?.trimmingCharacters(in: .whitespacesAndNewlines),
           !confirmedSummary.isEmpty {
            summaryTexts.append("用户确认的任务理解是：\(confirmedSummary)")
        }
        let typed = typedInput
        selectionStates = [:]
        confirmedTexts = [:]
        summaryState = .pending
        summaryConfirmedText = nil
        typedInput = ""
        paragraph = ""
        modelRowLabels = [:]
        displayedItems = []
        return (directionTexts + summaryTexts, typed)
    }

    // MARK: - 总闸门：取消看板（用户 2026-09-27）

    /// **取消本次**（本次大循环）—— 面板收掉、定时检测停掉、请求不发、**录音照旧**。
    ///
    /// 用户：「取消后会怎么做？后台的定时检测机制就直接停掉，在当前这个循环里面停掉，
    /// 不需要再去检测用户的输入内容到底有多少个，也不需要发送给 AI。用户的提示词录音这部分继续，
    /// 只是看板这部分的功能取消掉了。」
    func cancelForThisCycle() {
        cancelledForThisCycle = true
        stopDetection()
        print("🎛️ 方向看板：用户取消了本次看板（这一轮循环内不再显示、也不再检测）")
    }

    /// **取消十分钟**（这一个循环或下一个循环都不显示）。
    func cancelForTenMinutes() {
        cancelledUntil = Date().addingTimeInterval(Self.tenMinutes)
        persistCancelledUntil()
        stopDetection()
        print("🎛️ 方向看板：用户取消了十分钟（到 \(cancelledUntil!) 为止）")
    }

    /// **取消今日** —— 到**明天凌晨 12 点**（本地的日历日边界，不是"24 小时之后"）。
    func cancelUntilNextMidnight() {
        let startOfToday = Calendar.current.startOfDay(for: Date())
        cancelledUntil = Calendar.current.date(byAdding: .day, value: 1, to: startOfToday)
        persistCancelledUntil()
        stopDetection()
        if let cancelledUntil {
            print("🎛️ 方向看板：用户取消了今日（到 \(cancelledUntil) 为止，即明天凌晨 0 点）")
        }
    }

    /// 手动恢复（设置页那颗按钮）—— 也用于自检。
    func resumeImmediately() {
        cancelledForThisCycle = false
        cancelledUntil = nil
        persistCancelledUntil()
        refreshCancellationState()
        print("🎛️ 方向看板：已恢复显示")
    }

    /// **这一轮不再检测、也不发请求**（面板的显隐由 `isCancelled` 决定）。
    private func stopDetection() {
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        refreshCancellationState()
    }

    /// 重新算一次"现在是不是被取消了"：一个布尔量 + 一次日期比较，**没有任何轮询**。
    private func refreshCancellationState() {
        // 落盘的"取消到什么时候"只在内存里没有时读一次（App 重启之后仍然有效）。
        if cancelledUntil == nil,
           let stored = UserDefaults.standard.object(forKey: Self.cancelledUntilDefaultsKey) as? Date {
            cancelledUntil = stored
        }
        if let cancelledUntil, cancelledUntil <= Date() {
            // 到点了 —— 自动恢复。
            self.cancelledUntil = nil
            persistCancelledUntil()
        }
        isCancelled = cancelledForThisCycle || (cancelledUntil.map { $0 > Date() } ?? false)
    }

    /// 「取消到什么时候」这一刻的事实（设置页显示用）。
    var cancelledUntilDate: Date? { cancelledUntil }

    private func persistCancelledUntil() {
        if let cancelledUntil {
            UserDefaults.standard.set(cancelledUntil, forKey: Self.cancelledUntilDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.cancelledUntilDefaultsKey)
        }
    }

    // MARK: - 用户点格子 / 口述选方向

    /// 点文字 = 选中（确认）；再点一次 = 取消。
    func toggleConfirm(rowIndex: Int, displayedText: String) {
        if selectionStates[rowIndex] == .confirmed {
            selectionStates[rowIndex] = .pending
            confirmedTexts[rowIndex] = nil
            return
        }
        selectionStates[rowIndex] = .confirmed
        confirmedTexts[rowIndex] = displayedText
        print("🎛️ 方向看板：选中「\(displayedText)」（第 \(rowIndex + 1) 类）")
    }

    /// AI 那段总结：点一下 = 确认（整段变绿）；再点一次 = 取消。
    func toggleSummaryConfirm() {
        if summaryState == .confirmed {
            summaryState = .pending
            summaryConfirmedText = nil
            return
        }
        summaryState = .confirmed
        summaryConfirmedText = paragraph
        print("🎛️ 方向看板：用户确认了 AI 的理解")
    }

    /// AI 那段总结右边的叉 = 否认（整段变红）；再点一次 = 取消。
    func toggleSummaryDeny() {
        if summaryState == .denied {
            summaryState = .pending
            return
        }
        summaryState = .denied
        summaryConfirmedText = nil
        print("🎛️ 方向看板：用户否认了 AI 的理解")
    }

    /// 被按住不发的那一下：呼吸 1.2 秒（看板边框亮一下）。
    func flagHeldAutomaticSend() {
        isHeldFromAutomaticSend = true
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1.2))
            self?.isHeldFromAutomaticSend = false
        }
    }

    /// 点右边的叉 = 否认；再点一次 = 取消。
    func toggleDeny(rowIndex: Int) {
        if selectionStates[rowIndex] == .denied {
            selectionStates[rowIndex] = .pending
            return
        }
        selectionStates[rowIndex] = .denied
        confirmedTexts[rowIndex] = nil
    }

    /// **口述选中**：把「第 N 个方向」翻成屏幕上第 N 格那一行的 `.confirmed`。
    ///
    /// 只认屏幕上**正显示着**的那几格（越界的编号直接忽略 —— 他说「第六个」而屏幕上只有三格时，
    /// 猜一个等于替他做决定）。
    private func applySpokenSelectionIfAny(in transcriptText: String) {
        if let number = DirectionBoardConfiguration.spokenSelectionNumber(
            in: transcriptText, displayedItemCount: displayedItems.count),
           let item = displayedItems.first(where: { $0.number == number }) {
            selectByVoice(rowIndex: item.rowIndex, text: item.text, how: "口述「第 \(number) 个方向」")
            return
        }
        guard let rowIndex = DirectionBoardConfiguration.spokenRowSelection(
            in: transcriptText, configuration: configuration),
              let item = displayedItems.first(where: { $0.rowIndex == rowIndex }) else { return }
        selectByVoice(rowIndex: rowIndex, text: item.text, how: "口述「\(item.rowTitle)」")
    }

    private func selectByVoice(rowIndex: Int, text: String, how: String) {
        // 用户点过的不覆盖（他自己点的算数）。
        guard selectionStates[rowIndex] != .confirmed else { return }
        selectionStates[rowIndex] = .confirmed
        confirmedTexts[rowIndex] = text
        print("🎛️ 方向看板：\(how) → 自动选中「\(text)」")
    }

    // MARK: - 节奏与请求

    /// **这一次该不该发请求** —— 闸门全部收在这一个纯函数里，好让探针把每一条都试一遍。
    ///
    /// 用户 2026-09-27 定的两条（第二条是这次新加的）：
    /// 1. 「检测这 3 秒之内用户的提示词是否跟上次相同，如果相同就不发送」；
    /// 2. 「如果 3 秒之内用户新增的内容**少于 10 个字**，也不发送，因为相当于这句话还没说完。
    ///    **标点符号不算字数**……比如用户只说「嗯」「啊」这类没有意义的词，发送也没有意义。」
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

    /// **新增了这么多字才值得问一次** —— 默认 10（用户点名要的），
    /// 实际值由设置页那个 5…20 的滑杆给（`AppSettings.directionBoardMinimumAddedCharacters`）。
    static let defaultMinimumAddedCharacters = 10

    /// 这次比上次**多说了几个字**（标点、空格、表情都不算 —— 用户：「标点符号不算字数」）。
    ///
    /// 识别器给的是**累积**文本，所以"新增"= 这次比上次多的那一段：
    /// - 上次那份是这次的前缀（最常见）→ 增量就是长度差；
    /// - 不是前缀（识别器改写了前面几个字，或者这是追问窗口里的**新一句**）→ 从最长公共前缀之后算起。
    nonisolated static func addedCharacterCount(transcript: String,
                                                since previousTranscript: String) -> Int {
        // 只留字母与数字：中文是 letter，标点与空格在这一步就被丢掉了（也就是"不算字数"）。
        let current = DirectionBoardConfiguration.normalizedForMatching(transcript)
        let previous = DirectionBoardConfiguration.normalizedForMatching(previousTranscript)
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
        // 第一次也等 3 秒：用户刚开口那几个字不值得问（他说的"每 3 秒一次"就是这个节奏）。
        cadenceTimer = Timer.scheduledTimer(withTimeInterval: Self.cadenceSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.requestIfTheTranscriptChanged()
            }
        }
    }

    private func requestIfTheTranscriptChanged() {
        // 自检时默认不发请求（除非 WANNA_DIRECTION_BOARD_SELFCHECK=live）—— 看界面不该花钱。
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

        let configuration = self.configuration
        let unmatchedRowIndices = (0..<configuration.rows.count).filter { localMatches[$0] == nil }
        let settings = AppSettingsStore.snapshot()
        let systemPrompt = CompanionManager.directionBoardSystemPrompt(for: settings)
        let userMessage = DirectionBoardPrompt.requestUserMessage(
            transcriptText: transcript,
            unmatchedRowIndices: unmatchedRowIndices,
            configuration: configuration,
            previousReading: previousReading.isEmpty ? nil : previousReading)
        // 与**当前活动卡片**那一轮真正发出去的模型保持一致（卡片配了别的 AI 就用那一张）。
        let roleOverride = CompanionManager.visionRoleOverride(
            forCardID: ConversationSessionsStore.activeSession().id.uuidString)

        let generation = roundGeneration
        isRequesting = true
        requestTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isRequesting = false }
            do {
                let (replyText, _) = try await self.visionChatAPI.analyzeImageStreaming(
                    images: [],
                    systemPrompt: systemPrompt,
                    userPrompt: userMessage,
                    roleOverride: roleOverride,
                    onTextChunk: { _ in })
                // **过期的回复直接丢**（这一轮已经结束，或者又开了一轮）。
                guard self.roundGeneration == generation, self.isListening else { return }
                self.apply(DirectionBoardPrompt.parseResponse(replyText),
                           rawReply: replyText,
                           unmatchedRowIndices: unmatchedRowIndices)
            } catch {
                // 失败就用上一次的结果（用户要的「按最后一次返回结果展示」）—— 屏幕上什么都不用变。
                print("🎛️ 方向看板：这次请求失败（保留上一次的理解）—— \(error.localizedDescription)")
            }
        }
    }

    private func apply(_ reading: DirectionBoardPrompt.Reading,
                       rawReply: String,
                       unmatchedRowIndices: [Int]) {
        // 说明为空 = 这次没解析出东西 → 保留上一次那段话（绝不把正文清空）。
        if !reading.paragraph.isEmpty {
            paragraph = reading.paragraph
        }
        // 只收"问过的那几类"的标签；本地命中过的行，模型写什么都不采用。
        modelRowLabels = reading.rowLabels.filter { unmatchedRowIndices.contains($0.key) }
        // **整段存下来**带给下一次请求（用户：「最简单的方法，你就把上一次完整的回复保存下来」）。
        previousReading = String(rawReply.prefix(Self.maximumPreviousReadingCharacters))
        if Self.selfCheckMode != nil {
            // 自检时才打：平时每 3 秒一条会把真正的日志淹掉。它回答的是"模型到底认不认那个格式"。
            print("🎛️ 方向看板自检：模型回了 —— 说明=\(reading.paragraph.prefix(60)) 标签=\(reading.rowLabels)")
        }
        refreshDisplayedItems()
    }

    private func refreshDisplayedItems() {
        let configuration = self.configuration
        localMatches = DirectionBoardConfiguration.rowMatches(in: latestTranscript, configuration: configuration)
        displayedItems = DirectionBoardConfiguration.displayedItems(
            transcriptText: latestTranscript,
            modelRowLabels: modelRowLabels,
            configuration: configuration)
    }
}
