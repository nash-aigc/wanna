//
//  AgentTurnRecorder.swift
//  Wanna
//
//  **主 Agent 的每一条指令都留一条录音**（接线图第 4 条，2026-09-27）。
//
//  用户的原话是这件事的全部要求：
//
//  · 「把用户的每一条指令都保存为录音，也就是说在录音这个设置页面里面包含的不只是录音
//    这个快捷触发的用户的提示词和说的话的内容，包括每一条平时的每一条指令也都去以录音
//    的形式保存下来，包括这个原文啊、转写啊、重新撰写啊这些功能所有的功能」；
//  · 他拍板的一条：「**主 Agent 每一轮都要保留音频**」—— 所以这一轮也落 `.wav`，
//    设置 → 录音 的历史里那三颗按钮（播放 / 重新转写 / 在访达中显示）**全部可用**。
//
//  ## 它和长录音那条路的关系：**接线，不合并**
//
//  录音快捷键那一条（`LongFormRecorderController`）**一个字都没动**。用户对那个功能的
//  要求是「独立接线，跟当前整个面板里任何功能都没有关系」，所以两边不共用控制器；
//  共用的是三样**已经跑通**的东西：
//
//  · `RecordingAudioWriter` —— 边录边写、停止时回填 44 字节 WAV 头；
//  · `LongFormTranscriptWriter` —— `.txt`（给人看）+ `.jsonl`（逐段带毫秒）；
//  · `RecordingLibraryStore` —— 每场一个 `<id>.json` + 历史索引 + 变更通知。
//
//  于是历史列表、重新转写、复制全文、在访达中显示**一行代码都不用为新来源改** ——
//  它们只认这几个文件名。
//
//  ## 音频从哪来：**寄生在主 Agent 已经在跑的那个输入 tap 上**
//
//  长录音有自己的 `AVAudioEngine`；这一条一个字节都不多采 —— `BuddyDictationManager`
//  本来就在往识别器送音频（按住说话那条、连续追问那条），这里只是在同一个 tap 回调里
//  多调一次 `AgentTurnAudioSink.append`。**音频管线、VAD、连续监听、打断一行没改。**
//
//  ## 一条录音的边界 = 一轮指令
//
//      armTurn()                     用户按下说话键 / 连续追问里开口
//        → 第一块音频到达          真的开始录了（这一刻才建文件）
//        → finishTurn(transcript:) 这一轮结束了（发了 / 存成笔记 / 被取消，三种都算）
//
//  **为什么"第一块音频到达才建文件"**：`armTurn` 与"真的开始录"之间隔着权限检查、
//  开 ASR 会话、装 tap 几步，任何一步都可能中断（按住说话模式下快速松手就会取消整个
//  启动任务）。一 arm 就建文件，这些中断会在历史里留下一串 0 秒的空录音。
//

import AVFoundation
import Foundation

// MARK: - 音频那一半（活在采集线程上）

/// 一轮录音里**音频那半边**：把麦克风的 tap 缓冲转成 16kHz 单声道 PCM16、边写边落盘。
///
/// 三个状态，全部由主 Agent 那一侧驱动：
///
///     idle       没有一轮在进行（绝大多数时间）
///     armed      「接下来这段麦克风音频属于这一轮」已经声明，但还没采到音频
///     recording  正在写盘
///
/// **它必须是 `nonisolated`**：`append` 是从 `AVAudioEngine` 的渲染线程调上来的
/// （和每个 provider 的 `appendAudioBuffer` 同一个线程）。所以状态用 `NSLock` 守着、
/// 落盘排在一条串行队列上 —— 与 `RecordingLibraryStore` / `RecordingAudioWriter`
/// 同一种形状，采集线程上只做「转 PCM16」，不碰文件系统。
nonisolated final class AgentTurnAudioSink {

    static let shared = AgentTurnAudioSink()
    private init() {}

    /// 采样率 / 声道 / 位深**与录音那条路完全一致**（`LongFormAudioCapture` 的三个
    /// 常量），所以历史里那颗「重新转写」可以直接把这个 `.wav` 喂回同一个识别器 ——
    /// 那条路的输入就是这种格式的 `.wav`。
    static let sampleRate = LongFormAudioCapture.targetSampleRate
    static let channelCount = LongFormAudioCapture.targetChannelCount
    static let bitsPerSample = LongFormAudioCapture.targetBitsPerSample

    private enum State {
        case idle
        case armed(fileURL: URL)
        case recording(writer: RecordingAudioWriter)
    }

    private let lock = NSLock()
    private var state: State = .idle
    /// **只在这条串行队列上碰**（转换与落盘都在那里）。`close()` / `abandon()` 在主线程上
    /// 把它连同 `state` 一起清掉，但清之前会 `writeQueue.sync` 把排着的那几块排干 ——
    /// 顺序反了的话，正在转换的那一块会对着一个已经放掉的 writer 写。
    private var converter: BuddyPCM16AudioConverter?
    /// 落盘、**以及重采样**，都排在这条串行队列上。`close()` 会 `sync` 一次，保证最后一个
    /// 字节已经写完才开始回填 WAV 头。
    ///
    /// ⚠️ **重采样 2026-09-27 从采集线程搬到这里**：实测（tap 内分段计时，每 100 块）
    /// 采集线程上 `观察者` 这一段平均 **6785µs / 峰值 13874µs** 一块，而一块音频本身只有
    /// 21.3ms —— 加上识别那一段的 9088µs，采集线程被占到 **~78%**，用户听到的就是
    /// 「正常说话时会卡一下」。转换本身跑在哪条线程上不影响结果，所以把它挪到队列上，
    /// 采集线程只剩一次 `memcpy`（36KB ≈ 数微秒）。
    private let writeQueue = DispatchQueue(label: "wanna.agent-turn.audio")

    /// 这一轮开始录了 —— 但还没建文件（第一块音频到达时才建）。幂等。
    func arm(fileURL: URL) {
        lock.lock(); defer { lock.unlock() }
        state = .armed(fileURL: fileURL)
        converter = nil
    }

    /// **采集线程**。没有一轮在进行时立刻返回，所以这个观察者可以一直挂着。
    ///
    /// **这里只做两件事**：看状态、把这一块音频拷一份出来。转采样、建文件、写盘全在
    /// `writeQueue` 上 —— 采集线程是实时线程，任何毫秒级的工作都会顶住它。
    func append(_ audioBuffer: AVAudioPCMBuffer) {
        lock.lock()
        var isIdle = false
        if case .idle = state { isIdle = true }
        lock.unlock()
        guard !isIdle else { return }

        // 引擎会把同一块缓冲复用，所以必须拷一份再交给别的线程。
        // 这一步是纯 `memcpy`（1024 帧 × 声道数 × 4 字节 ≈ 36KB）。
        guard let copiedBuffer = Self.makeIndependentCopy(of: audioBuffer) else { return }
        writeQueue.async { [weak self] in
            self?.convertAndWrite(copiedBuffer)
        }
    }

    /// **串行队列上**：需要的话建文件，然后把这一块转成 16kHz 单声道 PCM16 写进去。
    private func convertAndWrite(_ audioBuffer: AVAudioPCMBuffer) {
        lock.lock()
        if case .armed(let fileURL) = state {
            // 第一块音频 = 这一轮真的开始录了。建文件只发生这一次。
            do {
                let writer = try RecordingAudioWriter(
                    fileURL: fileURL,
                    sampleRate: Self.sampleRate,
                    channelCount: Self.channelCount,
                    bitsPerSample: Self.bitsPerSample)
                converter = BuddyPCM16AudioConverter(targetSampleRate: Double(Self.sampleRate))
                state = .recording(writer: writer)
            } catch {
                NSLog("[AgentTurn] 建录音文件失败（这一轮没有音频）：\(error)")
                state = .idle
                lock.unlock()
                return
            }
        }
        guard case .recording(let writer) = state, let converter else {
            lock.unlock()
            return
        }
        lock.unlock()

        // 这一段在队列上，所以 `close()` 的 `writeQueue.sync` 一定排在它后面 —— 不会对着
        // 一个已经 finalize 过的 writer 写。
        guard let pcm16Data = converter.convertToPCM16Data(from: audioBuffer),
              !pcm16Data.isEmpty else { return }
        try? writer.append(pcm16Data)
    }

    /// 把引擎的缓冲拷成一份可以跨线程带走的副本 —— 引擎会复用它那一块。
    ///
    /// 格式原样保留（交错 / 非交错都走这里），所以下游那个转换器看到的东西与从前一致。
    private static func makeIndependentCopy(of audioBuffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let copiedBuffer = AVAudioPCMBuffer(pcmFormat: audioBuffer.format,
                                                  frameCapacity: audioBuffer.frameLength) else {
            return nil
        }
        copiedBuffer.frameLength = audioBuffer.frameLength
        let sourceBuffers = UnsafeMutableAudioBufferListPointer(audioBuffer.mutableAudioBufferList)
        let destinationBuffers = UnsafeMutableAudioBufferListPointer(copiedBuffer.mutableAudioBufferList)
        for (sourceBuffer, destinationBuffer) in zip(sourceBuffers, destinationBuffers) {
            guard let sourceData = sourceBuffer.mData,
                  let destinationData = destinationBuffer.mData else { continue }
            memcpy(destinationData, sourceData, Int(min(sourceBuffer.mDataByteSize,
                                                        destinationBuffer.mDataByteSize)))
        }
        return copiedBuffer
    }

    /// 收尾。返回这一轮**实际录到的秒数**；`nil` = 一块音频都没采到（文件没建）。
    func close() -> Double? {
        lock.lock()
        let currentState = state
        state = .idle
        converter = nil
        lock.unlock()

        guard case .recording(let writer) = currentState else { return nil }
        // 把排着的写入排干，再回填头 —— 顺序反了的话头里的长度会比实际短。
        writeQueue.sync { try? writer.finalize() }
        return writer.recordedDurationSeconds
    }

    /// 丢掉这一轮（没听到话的按说即发）。文件已经建了就删掉 —— 它不是一条记录。
    func abandon() {
        lock.lock()
        let currentState = state
        state = .idle
        converter = nil
        lock.unlock()

        guard case .recording(let writer) = currentState else { return }
        writeQueue.sync { try? writer.finalize() }
        try? FileManager.default.removeItem(at: writer.fileURL)
    }
}

// MARK: - 一轮那一半（活在主线程上）

/// **一条指令 = 一条录音。** 元数据、转写、历史索引这三件事归它。
///
/// 单例，理由与 `AgentActivityBoard.shared` / `NotionNoteSession.shared` 一样：真相本来
/// 就只有一份（此刻这一轮是谁），而写它的和读它的分处两个对象（采集线程那一半没法持有
/// 一个 `@MainActor` 对象）。
///
/// ## ⚠️ 取消语义：**两条路唯一一处不同，别再改成一样**
///
/// · **长录音那条**点「取消」= 按普通录音走（照常存一场录音，只是不写 Notion）；
/// · **主 Agent 这条**点「取消」= **这一轮什么都不发**（不截图、不问模型、不写 Notion），
///   但**本地那条录音照留**（`handleFinalTranscript` / `submitFollowUpQuestion` 里那一次
///   `finishTurn` 排在 Notion 那道岔**之前**，就是为了这一点）。
///
/// 两处都要留下东西，这是同一条原则；而"照常退回去"在主 Agent 这条路上是**拿用户已经
/// 否掉的东西去问模型**，所以退不得。用户 2026-09-27 连着两句原话：「主 Agent 上点取消 =
/// 不发出去，只保留本地一条录音」「这一条是两条路唯一一处取消语义不同，代码注释里要写明，
/// 免得以后被误改成一样」。
@MainActor
final class AgentTurnRecorder {

    static let shared = AgentTurnRecorder()
    private init() {}

    /// 此刻开着的那一轮。`nil` = 没有一轮在进行。
    private var currentSession: RecordingSession?
    private var folderURL: URL = RecordingLibraryStore.defaultFolderURL
    /// 这一轮音频要落到哪儿 —— `armTurn` 时算好交给 sink。
    private var audioFileURL: URL?

    /// 有没有一轮正在进行（收尾已经跑过或还没开始都是 false）。
    var isTurnOpen: Bool { currentSession != nil }

    /// 这一轮录音的 id。给日志用；没有一轮时是 nil。
    var currentSessionID: String? { currentSession?.id }

    // MARK: - 一轮的开始

    /// **一条新指令开始了**：按住说话键按下去了，或者连续追问的窗口里用户开口了。
    ///
    /// 这一刻只声明"接下来的麦克风音频属于这一轮"，**不建文件** —— 真的开始录是
    /// 第一块音频到达时的事（见 `AgentTurnAudioSink.append` 与文件头那一段）。
    func armTurn() {
        // 上一轮如果还开着（用户连按、或者某条路没走到收尾），先把它收干净。
        // **宁可多留一条录音，也不把用户说过的话丢掉** —— 这一条比"历史里别出现空条目"
        // 重要得多。
        finishOpenTurnIfNeeded(transcript: "")

        let settings = AppSettingsStore.snapshot()
        folderURL = RecordingLibraryStore.resolvedFolderURL(
            fromSettingsPath: settings.recordingSaveFolderPath)

        let session = RecordingSession(
            id: LongFormRecorderController.makeSessionID(),
            startedAt: Date(),
            endedAt: nil,
            recordedSeconds: 0,
            characterCount: 0,
            segmentCount: 0,
            endedCleanly: false,
            // 这一条不是长录音那条路，没有连接轮换这回事。
            connectionRotationCount: 0,
            // 真正用的是哪个档位 —— 识别走的是主 Agent 那条路（豆包/百炼），
            // 而这一格记的是"录音页配的那一档"，与长录音保持同一份口径。
            resourceID: settings.recordingEffectiveResourceID,
            sampleRate: AgentTurnAudioSink.sampleRate,
            channelCount: AgentTurnAudioSink.channelCount,
            bitsPerSample: AgentTurnAudioSink.bitsPerSample,
            lastErrorMessage: nil)

        currentSession = session
        let fileURL = session.audioFileURL(inFolder: folderURL)
        audioFileURL = fileURL
        AgentTurnAudioSink.shared.arm(fileURL: fileURL)
    }

    // MARK: - 一轮的结束

    /// **这一轮结束了** —— 发出去了、存成一条 Notion 笔记、或者被用户取消，三种都算。
    ///
    /// 返回写进去的那条记录；`nil` = 这一轮一块音频都没采到（那就不留记录 —— 没采到音频
    /// 说明这一轮根本没开始录，比如按住说话模式下快速松手取消掉了启动）。
    @discardableResult
    func finishTurn(transcript: String) -> RecordingSession? {
        guard var session = currentSession else { return nil }
        let recordedSeconds = AgentTurnAudioSink.shared.close()
        currentSession = nil
        audioFileURL = nil

        guard let recordedSeconds else {
            print("🎙️ 主 Agent 这一轮没有采到音频，不留录音（\(session.id)）")
            return nil
        }

        session.endedAt = Date()
        session.endedCleanly = true
        session.recordedSeconds = recordedSeconds

        // 转写那两份文件由 `LongFormTranscriptWriter` 落 —— 设置页读的正是
        // `<id>.txt`（源文本）与 `<id>.jsonl`。这一轮的转写是**一整句**（识别器
        // 交付的最终结果），所以一条 definite 段就是它的全部。
        // 三个数（字数 / 段数 / 时长）与长录音那条路同一套口径。
        do {
            try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
            let transcriptWriter = try LongFormTranscriptWriter(folder: folderURL, sessionID: session.id)
            transcriptWriter.commit(segment: VolcengineASRSegment(
                text: transcript,
                isDefinite: true,
                startMilliseconds: 0,
                endMilliseconds: Int((recordedSeconds * 1000).rounded())))
            transcriptWriter.finalize()
            session.characterCount = transcriptWriter.committedCharacterCount
            session.segmentCount = transcriptWriter.committedSegmentCount
        } catch {
            NSLog("[AgentTurn] 写转写失败：\(error)")
            // 音频留住了就够了 —— 字数退化成按字符串长度算，历史里那一行照样看得懂。
            session.characterCount = transcript.count
            session.segmentCount = transcript.isEmpty ? 0 : 1
        }

        writeMetadata(session)
        RecordingLibraryStore.shared.upsert(session)
        print("🎙️ 主 Agent 这一轮已存成一条录音：\(session.id) · "
              + "\(String(format: "%.1f", session.recordedSeconds)) 秒 · \(session.characterCount) 字")
        return session
    }

    /// **这一轮不算数**：没听到任何话（按了键但一个字都没说）。
    ///
    /// 与"取消"不是一回事，别合并 —— 取消是用户对**已经听清的一句话**说不发，那一条
    /// 要留；这里是**根本没有一句话**，留一个 0 秒 0 字的文件只会是历史里的噪音。
    func discardTurn() {
        guard currentSession != nil else { return }
        let sessionID = currentSession?.id ?? "?"
        currentSession = nil
        audioFileURL = nil
        AgentTurnAudioSink.shared.abandon()
        print("🎙️ 主 Agent 这一轮没有听到话，不留录音（\(sessionID)）")
    }

    /// 退出 App 时把开着的那一轮收干净：不收的话文件头还停在那 44 字节的占位值上
    /// （`data` 长度写的是 0），而那个 `.wav` 是打不开的。
    func finishOpenTurnForTermination() {
        finishOpenTurnIfNeeded(transcript: "")
    }

    // MARK: - 内部

    private func finishOpenTurnIfNeeded(transcript: String) {
        guard currentSession != nil else { return }
        print("🎙️ 主 Agent 上一轮没有走到收尾，这里补一次（转写可能为空）")
        finishTurn(transcript: transcript)
    }

    /// 元数据落盘。与 `LongFormRecorderController.writeMetadata` 同一套格式（原子写 +
    /// 补 `0600`）—— 用户手改设置里的目录之后，两种来源的记录仍要能被同一个
    /// `rescanFromDisk` 一起读回来。
    private func writeMetadata(_ session: RecordingSession) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(session) else { return }
        let url = session.metadataFileURL(inFolder: folderURL)
        do {
            try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        } catch {
            NSLog("[AgentTurn] 写元数据失败：\(error)")
        }
    }
}
