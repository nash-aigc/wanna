//
//  DirectionBoardSession.swift
//  Wanna
//
//  **「任务方向看板」的状态机**（2026-09-27）：说话期间每 3 秒问一次模型「你怎么理解这次任务」，
//  把回来说的写成看板上那段话 + 没被本地关键词命中的那几行的方向短语。
//
//  用户的规则（原话）：
//  · 「触发时机：用户按下主 Agent 快捷键、开始说话的那一秒即启动」；
//  · 「频率：每 3 秒发送一次请求」（他后来在这上面加了一条：**只有识别文本变了才发**）；
//  · 「模型：与主 Agent 使用同一模型」「提示词：与主 Agent 提示词完全相同」（见
//    `CompanionManager.directionBoardSystemPrompt`）；
//  · 「显示逻辑：按最后一次返回结果展示；用户说得越久，AI 对需求的理解越强」；
//  · 「用户点击确认或否认 → 记录该交互内容；用户未点击 → 忽略」。
//
//  形状照 `NotionNoteSession`（同一个仓库里另一件"说话期间在后台跑的事"）：`@MainActor ObservableObject`
//  单例、`beginListening()` / `noteLiveTranscript()` / `endListening()` / `consumeTurnDecision()`
//  四个口子，调用方（`CompanionManager`）只在既有的接线点上各加一行。
//
//  ⚠️ **它是纯观察者**：不碰 `currentResponseTask`、不碰 `voiceState`、不碰历史、不碰 TTS、不截图。
//  它唯一的输出是"提交时那几行要加在提示词前面的话"，由调用方在拼提示词那一步取走。
//

import Combine
import Foundation

/// 看板上的**一格**（第几行第几列）。用它做状态字典的键，而不是用文字 —— 文字会被 AI 改写
///（见 `DirectionBoardConfiguration.displayText`），格子的位置不会。
nonisolated struct DirectionBoardSlot: Hashable {
    let rowIndex: Int
    let columnIndex: Int
}

/// 一格被用户点过之后的状态。
nonisolated enum DirectionBoardSlotState: String {
    /// 没点过（默认）—— 不写进提示词。
    case pending
    /// 点过文字 = 确认（绿）。
    case confirmed
    /// 点过右边的叉 = 否认（红）。
    case denied
}

@MainActor
final class DirectionBoardSession: ObservableObject {

    static let shared = DirectionBoardSession()
    private init() {}

    // MARK: - 界面读的状态

    /// 正在"说话期间"（面板该显示）。由 `beginListening()` / `endListening()` 翻。
    @Published private(set) var isListening = false
    /// AI 对这次任务的理解（一段话）。空串 = 还没有结果（看板那一段留白，不写占位话）。
    @Published private(set) var paragraph = ""
    /// 每一行 AI 生成的短语（只在**本地没命中**的行上生效，见 `displayText`）。
    @Published private(set) var modelRowLabels: [Int: String] = [:]
    /// 这一轮本地命中的落点（每一行最多一个）。
    @Published private(set) var localMatches: [Int: DirectionBoardConfiguration.Match] = [:]
    /// 用户点过的格子。
    @Published private(set) var slotStates: [DirectionBoardSlot: DirectionBoardSlotState] = [:]
    /// **点下去那一刻那一格显示的文字** —— 用户确认的是他看到的字，不是之后再变的字。
    @Published private(set) var confirmedTexts: [DirectionBoardSlot: String] = [:]
    /// 输入框（用户手打的补充说明）。
    @Published var typedInput = ""
    /// 有一次请求正在飞（看板上显示一个很轻的"在想"）。
    @Published private(set) var isRequesting = false

    // MARK: - 内部状态

    /// 这一轮用户说到现在为止的识别文本。
    private var latestTranscript = ""
    /// 上一次**发出去**的那份文本 —— "文本没变就不发"这条闸门比的就是它。
    private var lastRequestedTranscript = ""
    private var cadenceTimer: Timer?
    private var requestTask: Task<Void, Never>?
    /// 代次：`beginListening()` / `endListening()` 各加一次，用来丢弃过期回复。
    private var roundGeneration = 0
    private let visionChatAPI = BailianVisionChatAPI()

    /// **这一次该不该发请求** —— 闸门全部收在这一个纯函数里，好让探针把每一条都试一遍
    /// （会话本身带 `AppSettingsStore` / 网络 / 主 actor，脱离 App 编不起来；这五条判断不带任何状态）。
    ///
    /// 五条闸门：总开关开着、正在听、没有请求在飞、文本够长、**文本跟上次发出去的不一样**。
    /// 最后一条是用户 2026-09-27 定的（我问"每 3 秒一发还是文本变了才发"，他选了后者）：
    /// 他停顿时、思考时、重复时都不该花钱 —— 没变就再问一次也问不出新东西。
    nonisolated static func shouldRequest(transcript: String,
                                          lastRequestedTranscript: String,
                                          isEnabled: Bool,
                                          isListening: Bool,
                                          isRequesting: Bool) -> Bool {
        guard isEnabled, isListening, !isRequesting else { return false }
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= minimumTranscriptCharacters else { return false }
        return trimmed != lastRequestedTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 每 3 秒看一次（用户定的节奏）。
    static let cadenceSeconds: TimeInterval = 3
    /// 少于这么多字不值得问（与"语气词不成问题"同一条规矩）。
    static let minimumTranscriptCharacters = 4

    private var configuration: DirectionBoardConfiguration {
        DirectionBoardConfiguration.validated(AppSettingsStore.snapshot().directionBoard)
    }

    private var isEnabled: Bool {
        AppSettingsStore.snapshot().directionBoardEnabled
    }

    // MARK: - 生命周期（调用方各加一行的四个口子）

    /// 用户按下快捷键开始说话了（或连续追问窗口里又开口了）。
    ///
    /// **归零**：上一轮的说明、标签、点过的格子、输入框全部清掉 —— 那些属于上一句话。
    func beginListening() {
        guard isEnabled else { return }
        roundGeneration += 1
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false

        latestTranscript = ""
        lastRequestedTranscript = ""
        paragraph = ""
        modelRowLabels = [:]
        localMatches = [:]
        slotStates = [:]
        confirmedTexts = [:]
        typedInput = ""
        isListening = true

        startCadenceTimer()
    }

    /// 识别文本更新了（两处 interim 回调各喂一行）。
    ///
    /// 本地匹配在这里**立刻**做（不花请求）：用户要的是"预设关键词作为首选，优先显示在对应的行和位置"，
    /// 那件事不需要问模型。模型的标签随后到，只会填**没命中**的那几行。
    func noteLiveTranscript(_ transcriptText: String) {
        guard isListening else { return }
        latestTranscript = transcriptText
        localMatches = DirectionBoardConfiguration.rowMatches(in: transcriptText, configuration: configuration)
    }

    /// 这一轮结束了（提交 / 取消 / 窗口关闭）。**停表 + 丢掉在飞的请求**。
    ///
    /// 刻意**不改 `isListening` 之外的状态**：说明与点过的格子要留到"取走"那一刻
    ///（`consumeTurnDecision()`），否则提交路径上就会出现"刚取到一半就没了"。
    func endListening() {
        roundGeneration += 1
        cadenceTimer?.invalidate()
        cadenceTimer = nil
        requestTask?.cancel()
        requestTask = nil
        isRequesting = false
        isListening = false
    }

    /// **提交时取走**：把用户点过确认的方向短语按行优先、同行按列排好；输入框那句单独给。
    ///
    /// 取走即清（`slotStates` / `confirmedTexts` / `typedInput` / 说明全部归零）—— 与
    /// `NotionNoteSession.consumeTurnDecision` 同一条规矩：状态不许活过一轮。
    func consumeTurnDecision() -> (directionTexts: [String], typedInput: String) {
        let configuration = self.configuration
        var directionTexts: [String] = []
        for rowIndex in 0..<configuration.rows.count {
            for columnIndex in 0..<configuration.rows[rowIndex].buttons.count {
                let slot = DirectionBoardSlot(rowIndex: rowIndex, columnIndex: columnIndex)
                guard slotStates[slot] == .confirmed,
                      let text = confirmedTexts[slot]?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !text.isEmpty else { continue }
                directionTexts.append(text)
            }
        }
        let typed = typedInput
        slotStates = [:]
        confirmedTexts = [:]
        typedInput = ""
        paragraph = ""
        modelRowLabels = [:]
        return (directionTexts, typed)
    }

    // MARK: - 用户点格子

    /// 点文字 = 确认；再点一次 = 取消（回到没点过的样子）。
    func toggleConfirm(slot: DirectionBoardSlot, displayedText: String) {
        if slotStates[slot] == .confirmed {
            slotStates[slot] = .pending
            confirmedTexts[slot] = nil
            return
        }
        slotStates[slot] = .confirmed
        confirmedTexts[slot] = displayedText
    }

    /// 点右边的叉 = 否认；再点一次 = 取消。
    func toggleDeny(slot: DirectionBoardSlot) {
        if slotStates[slot] == .denied {
            slotStates[slot] = .pending
            return
        }
        slotStates[slot] = .denied
        confirmedTexts[slot] = nil
    }

    /// 这一格现在该显示什么（**视图与"发出去的标签"读的是同一个函数**）。
    ///
    /// 已决定的格子**冻住**：用户点过之后，AI 再改这一格的文字也不换 —— 否则他确认的那句话
    /// 会在屏幕上变成另一句，而他以为确认的是原来那句。
    func displayedText(for slot: DirectionBoardSlot) -> String {
        let configuration = self.configuration
        if let frozen = confirmedTexts[slot], slotStates[slot] == .confirmed { return frozen }
        return configuration.displayText(
            rowIndex: slot.rowIndex,
            columnIndex: slot.columnIndex,
            localMatch: localMatches[slot.rowIndex],
            modelLabel: modelRowLabels[slot.rowIndex]) ?? ""
    }

    /// 这一格是不是**被本地关键词点亮的**（视图给它画绿框 —— 用户要的"一眼看出 AI 已经对上了"）。
    func isLocallyMatched(_ slot: DirectionBoardSlot) -> Bool {
        localMatches[slot.rowIndex]?.buttonIndex == slot.columnIndex
    }

    // MARK: - 节奏与请求

    private func startCadenceTimer() {
        cadenceTimer?.invalidate()
        // 第一次也等 3 秒：用户刚开口那几个字不值得问（他说的"每 3 秒一次"就是这个节奏）。
        cadenceTimer = Timer.scheduledTimer(withTimeInterval: Self.cadenceSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.requestIfTheTranscriptChanged()
            }
        }
    }

    /// **每 3 秒被叫一次**；只有"识别文本跟上次发出去的不一样"时才真的发请求。
    ///
    /// 这道闸门是用户 2026-09-27 定的（我问他"每 3 秒一发 vs 文本变了才发"，他选了后者）：
    /// 他停顿时、思考时、重复时都不该花钱 —— 而且**没变就再问一次也问不出新东西**。
    private func requestIfTheTranscriptChanged() {
        guard Self.shouldRequest(transcript: latestTranscript,
                                 lastRequestedTranscript: lastRequestedTranscript,
                                 isEnabled: isEnabled,
                                 isListening: isListening,
                                 isRequesting: isRequesting) else { return }
        let transcript = latestTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        lastRequestedTranscript = transcript

        let configuration = self.configuration
        let unmatchedRowIndices = (0..<configuration.rows.count).filter { localMatches[$0] == nil }
        let settings = AppSettingsStore.snapshot()
        let systemPrompt = CompanionManager.directionBoardSystemPrompt(for: settings)
        let userMessage = DirectionBoardPrompt.requestUserMessage(
            transcriptText: transcript,
            unmatchedRowIndices: unmatchedRowIndices,
            configuration: configuration)
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
                           unmatchedRowIndices: unmatchedRowIndices)
            } catch {
                // 失败就用上一次的结果（用户要的「按最后一次返回结果展示」）—— 屏幕上什么都不用变。
                print("🎛️ 方向看板：这次请求失败（保留上一次的理解）—— \(error.localizedDescription)")
            }
        }
    }

    private func apply(_ reading: DirectionBoardPrompt.Reading, unmatchedRowIndices: [Int]) {
        // 说明为空 = 这次没解析出东西 → 保留上一次那段话（绝不把正文清空）。
        if !reading.paragraph.isEmpty {
            paragraph = reading.paragraph
        }
        // 只收"问过的那几行"的标签；本地命中过的行，模型写什么都不采用。
        modelRowLabels = reading.rowLabels.filter { unmatchedRowIndices.contains($0.key) }
    }
}
