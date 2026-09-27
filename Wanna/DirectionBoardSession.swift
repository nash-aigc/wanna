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

/// 一格被用户点过（或说中/取消）之后的状态。
nonisolated enum DirectionBoardSelectionState: String {
    case pending
    case confirmed
    case denied
}

@MainActor
final class DirectionBoardSession: ObservableObject {

    static let shared = DirectionBoardSession()
    private init() {}

    // MARK: - 界面读的状态

    @Published private(set) var isListening = false
    @Published private(set) var paragraph = ""
    @Published private(set) var displayedItems: [DirectionBoardDisplayItem] = []
    @Published private(set) var selectionStates: [String: DirectionBoardSelectionState] = [:]
    @Published private(set) var confirmedTexts: [String: String] = [:]
    @Published private(set) var summaryState: DirectionBoardSelectionState = .pending
    @Published private(set) var summaryConfirmedText: String?
    @Published private(set) var isRequesting = false
    @Published private(set) var isCancelled = false
    @Published private(set) var isHeldFromAutomaticSend = false
    @Published var typedInput = ""

    // MARK: - 内部状态

    private var latestTranscript = ""
    private var lastRequestedTranscript = ""
    /// 最近一次 Jev 判断给出的概率（方向 id → P(是)）。
    private var jevProbabilities: [String: Double] = [:]
    /// 这一轮**强制显示**的方向（用户刚口述出来的新方向 —— 它还没有 Jev 概率）。
    private var forcedDirectionIDs: Set<String> = []
    /// 这一轮因为"参考屏幕"截下来的图（发送给模型时带上）。
    private var referenceScreenshots: [(data: Data, label: String)] = []
    /// 这一次"参考屏幕"的提到是不是已经截过了（边缘触发）。
    private var didCaptureForThisMention = false
    /// 上一次模型回的那段原文（每次请求都是全新的内容，所以要带上它保持连续）。
    private var previousReading = ""
    /// 被选中的先后顺序 —— 钉住（位置 + 编号）靠它。
    private var confirmedOrder: [String] = []
    private var cadenceTimer: Timer?
    private var requestTask: Task<Void, Never>?
    private var roundGeneration = 0
    private var currentCycleID: String?
    private var cancelledForThisCycle = false
    private var cancelledUntil: Date?
    private static let cancelledUntilDefaultsKey = "wannaDirectionBoardCancelledUntil"
    private static let tenMinutes: TimeInterval = 10 * 60
    private static let maximumPreviousReadingCharacters = 600
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
            "帮我把这段记下来，再指给我看是哪个",
            "帮我把这段记下来，再指给我看是哪个，然后照着它写一段新的",
            "帮我把这段记下来，再指给我看是哪个，照着它写一段新的，选第二个方向",
        ]
        for (index, line) in lines.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 1.4) { [weak self] in
                NotchListeningTranscriptModel.shared.setLiveText(line)
                self?.noteLiveTranscript(line)
                let shown = self?.displayedItems.map { "\($0.number).\($0.keyword)" } ?? []
                print("🎛️ 方向看板自检：第 \(index + 1) 句 → 显示 \(shown.joined(separator: " ｜ "))")
            }
        }
    }

    func logTurnDecisionForSelfCheck() {
        guard Self.selfCheckMode != nil else { return }
        let decision = consumeTurnDecision()
        print("🎛️ 方向看板自检：提交时会加在提示词前面的是 —— "
              + (DirectionBoardPrompt.decoration(confirmedDirectionTexts: decision.directionTexts,
                                                 typedInput: decision.typedInput) ?? "（什么都没点，不加）"))
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
        if let cycleID, cycleID != currentCycleID {
            cancelledForThisCycle = false
            // **新的一大轮**：上一轮口述出来的临时类型清掉。
            TaskDirectionStore.shared.clearTemporaryDirections()
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
        previousReading = ""
        jevProbabilities = [:]
        forcedDirectionIDs = []
        referenceScreenshots = []
        didCaptureForThisMention = false
        selectionStates = [:]
        confirmedTexts = [:]
        confirmedOrder = []
        summaryState = .pending
        summaryConfirmedText = nil
        displayedItems = []
        typedInput = ""
        isListening = true
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
        // **说了「参考屏幕 / 根据图片」这类组合词 → 当场截一张屏**（用户：
        // 「每一次转写识别到就截一次屏」）。边缘触发：同一次提到只截一张（与
        // `BuddyScreenKeywordDetector` 同一个做法 —— 识别器会给整句累积文本，不去重就会连截）。
        let mentionsScreenReference = DirectionBoardMatching.screenReferenceRequested(in: transcriptText)
        if mentionsScreenReference, !didCaptureForThisMention {
            didCaptureForThisMention = true
            Task { @MainActor [weak self] in await self?.captureReferenceScreenshot() }
        } else if !mentionsScreenReference {
            didCaptureForThisMention = false
        }

        // **他口述了一个清单里没有的新方向** → 追加进**临时**那份文件（这就是第二种来源）。
        // 追加之后这一轮**强制显示它**（新方向还没有 Jev 概率，不强制就看不见）。
        if let newDirection = DirectionBoardMatching.spokenNewDirection(in: transcriptText),
           !TaskDirectionStore.shared.contains(keyword: newDirection) {
            let added = TaskDirectionStore.shared.append(keyword: newDirection,
                                                         detail: newDirection,
                                                         source: .user)
            if added {
                let identifier = TaskDirectionStore.shared.allDirections()
                    .first { DirectionBoardMatching.normalize($0.keyword)
                        == DirectionBoardMatching.normalize(newDirection) }?.id
                if let identifier { forcedDirectionIDs.insert(identifier) }
            }
        }
        refreshDisplayedItems()
        applySpokenSelectionIfAny(in: transcriptText)
    }

    func endListening() {
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        isListening = false
    }

    /// 提交时取走：确认过的方向（按屏幕编号顺序）+ 输入框那句。取走即清。
    func consumeTurnDecision() -> (directionTexts: [String], typedInput: String) {
        var directionTexts: [String] = []
        for item in displayedItems {
            guard selectionStates[item.directionID] == .confirmed else { continue }
            let text = (confirmedTexts[item.directionID] ?? item.keyword)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            directionTexts.append(text)
        }
        if summaryState == .confirmed,
           let confirmedSummary = summaryConfirmedText?.trimmingCharacters(in: .whitespacesAndNewlines),
           !confirmedSummary.isEmpty {
            directionTexts.append("用户确认的任务理解是：\(confirmedSummary)")
        }
        let typed = typedInput
        selectionStates = [:]
        confirmedTexts = [:]
        confirmedOrder = []
        summaryState = .pending
        summaryConfirmedText = nil
        typedInput = ""
        paragraph = ""
        displayedItems = []
        return (directionTexts, typed)
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

    // MARK: - 用户点格子 / 口述

    func toggleConfirm(directionID: String, displayedText: String) {
        if selectionStates[directionID] == .confirmed {
            selectionStates[directionID] = .pending
            confirmedTexts[directionID] = nil
            confirmedOrder.removeAll { $0 == directionID }
            refreshDisplayedItems()
            return
        }
        selectionStates[directionID] = .confirmed
        confirmedTexts[directionID] = displayedText
        if !confirmedOrder.contains(directionID) { confirmedOrder.append(directionID) }
        refreshDisplayedItems()
        print("🎛️ 方向看板：选中「\(displayedText)」（已钉住，编号不再变）")
    }

    func toggleDeny(directionID: String) {
        if selectionStates[directionID] == .denied {
            selectionStates[directionID] = .pending
            return
        }
        selectionStates[directionID] = .denied
        confirmedTexts[directionID] = nil
    }

    func toggleSummaryConfirm() {
        if summaryState == .confirmed {
            summaryState = .pending
            summaryConfirmedText = nil
            return
        }
        summaryState = .confirmed
        summaryConfirmedText = paragraph
    }

    func toggleSummaryDeny() {
        if summaryState == .denied {
            summaryState = .pending
            return
        }
        summaryState = .denied
        summaryConfirmedText = nil
    }

    func flagHeldAutomaticSend() {
        isHeldFromAutomaticSend = true
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1.2))
            self?.isHeldFromAutomaticSend = false
        }
    }

    private func applySpokenSelectionIfAny(in transcriptText: String) {
        if let number = DirectionBoardMatching.spokenCancelSelectionNumber(
            in: transcriptText, displayedItemCount: displayedItems.count),
           let item = displayedItems.first(where: { $0.number == number }) {
            if selectionStates[item.directionID] != .pending {
                selectionStates[item.directionID] = .pending
                confirmedTexts[item.directionID] = nil
                confirmedOrder.removeAll { $0 == item.directionID }
                refreshDisplayedItems()
                print("🎛️ 方向看板：口述「取消第 \(number) 个方向」→ 取消选中「\(item.keyword)」")
            }
            return
        }
        if let number = DirectionBoardMatching.spokenSelectionNumber(
            in: transcriptText, displayedItemCount: displayedItems.count),
           let item = displayedItems.first(where: { $0.number == number }) {
            selectByVoice(directionID: item.directionID, text: item.keyword,
                          how: "口述「第 \(number) 个方向」")
            return
        }
        // 语义那一种（「关于显示方向的」）：要求关键词**紧跟方向词** —— 否则「把这段文字存到 notion」
        // 里的"文字"会把"写成文字"也选上。
        let normalized = DirectionBoardMatching.normalize(transcriptText)
        let markers = ["方向", "类", "方面", "那一类", "这类"]
        for item in displayedItems {
            let needle = DirectionBoardMatching.normalize(item.keyword)
            guard needle.count >= 2 else { continue }
            if markers.contains(where: { normalized.contains(needle + $0) }) {
                selectByVoice(directionID: item.directionID, text: item.keyword,
                              how: "口述「\(item.keyword)」")
                return
            }
        }
    }

    private func selectByVoice(directionID: String, text: String, how: String) {
        guard selectionStates[directionID] != .confirmed else { return }
        selectionStates[directionID] = .confirmed
        confirmedTexts[directionID] = text
        if !confirmedOrder.contains(directionID) { confirmedOrder.append(directionID) }
        refreshDisplayedItems()
        print("🎛️ 方向看板：\(how) → 自动选中「\(text)」（已钉住）")
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
        let screenshots = referenceScreenshots
        let hasScreenReference = !screenshots.isEmpty

        requestTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isRequesting = false }
            let directions = TaskDirectionStore.shared.keywordsAndDetails()
            let state = "用户到目前为止说的话：\n\(transcript.prefix(500))"

            // ① **Jev 判方向**（便宜、给概率）；② **大模型写那段理解**（小提示词）。
            // 两条并行发，谁先回来谁先上屏。
            async let probabilitiesTask = self.judgeWithJevIfConfigured(state: state, directions: directions)
            async let paragraphTask = self.writeParagraphWithModel(transcript: transcript,
                                                                   directions: directions,
                                                                   screenshots: screenshots,
                                                                   asksForLabel: hasScreenReference)
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
                self.paragraph = paragraphText
                self.previousReading = String(paragraphText.prefix(Self.maximumPreviousReadingCharacters))
                // **带屏幕参考时，模型给的"这次是什么类型"也变成一个可点的类型**（进临时文件）。
                // 用户那个数学题的例子：「这道题应该选 A，那结果就是固定的」—— 那个答案本身就是选项。
                if let label = DirectionBoardPrompt.parseLabelLine(paragraphText),
                   !TaskDirectionStore.shared.contains(keyword: label) {
                    if TaskDirectionStore.shared.append(keyword: label,
                                                        detail: "根据屏幕内容判断出来的结果：\(label)",
                                                        source: .user) {
                        let identifier = TaskDirectionStore.shared.allDirections()
                            .first { DirectionBoardMatching.normalize($0.keyword)
                                == DirectionBoardMatching.normalize(label) }?.id
                        if let identifier { self.forcedDirectionIDs.insert(identifier) }
                    }
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
                                         screenshots: [(data: Data, label: String)],
                                         asksForLabel: Bool) async -> String? {
        let systemPrompt = DirectionBoardPrompt.understandingSystemPrompt(directions: directions,
                                                                          asksForLabel: asksForLabel)
        let userPrompt = DirectionBoardPrompt.understandingUserPrompt(transcript: transcript,
                                                                      previousReading: previousReading)
        do {
            let (text, _) = try await visionChatAPI.analyzeImageStreaming(
                images: screenshots,
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                roleOverride: CompanionManager.visionRoleOverride(
                    forCardID: ConversationSessionsStore.activeSession().id.uuidString),
                onTextChunk: { _ in })
            return DirectionBoardPrompt.cleanParagraph(text)
        } catch {
            print("🧭 方向看板：这次理解请求失败（保留上一次）—— \(error.localizedDescription)")
            return nil
        }
    }

    /// 当场截一张屏（用户说「参考屏幕」那一刻的画面）。
    private func captureReferenceScreenshot() async {
        let settings = AppSettingsStore.snapshot()
        do {
            let captures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG(
                maximumDimension: settings.screenshotMaxDimension == 0 ? nil : settings.screenshotMaxDimension,
                compressionQuality: settings.screenshotCompressionQuality,
                capturesAllDisplays: settings.capturesAllDisplays)
            guard isListening else { return }
            referenceScreenshots = captures.map { (data: $0.imageData, label: $0.label) }
            print("🧭 方向看板：说到「参考屏幕/图片」—— 当场截了 \(captures.count) 张，这次判断会带上")
        } catch {
            print("🧭 方向看板：截屏失败（这次就不带图）—— \(error.localizedDescription)")
        }
    }

    /// **一大轮结束**：清掉临时那份类型文件（用户：「临时文件在每一轮对话结束时清掉。
    /// 是每一大轮……中间可能有打断，这算一个轮，不算两轮」）。
    func endBigRound() {
        TaskDirectionStore.shared.clearTemporaryDirections()
        forcedDirectionIDs.removeAll()
    }

    private func refreshDisplayedItems() {
        let settings = AppSettingsStore.snapshot()
        displayedItems = DirectionBoardMatching.displayedItems(
            transcriptText: latestTranscript,
            directions: TaskDirectionStore.shared.allDirections(),
            jevProbabilities: jevProbabilities,
            probabilityThreshold: settings.directionBoardProbabilityThreshold,
            forcedDirectionIDs: forcedDirectionIDs,
            pinnedOrder: confirmedOrder)
    }
}
