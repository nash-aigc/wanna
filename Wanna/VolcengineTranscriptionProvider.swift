//
//  VolcengineTranscriptionProvider.swift
//  Wanna
//
//  主 Agent 那条路的识别：火山引擎豆包流式语音识别。
//
//  它**没有新的协议代码** —— 豆包的 WebSocket 客户端与它的四条硬约束早就跑通了
//  （`VolcengineRealtimeASRClient`，长录音那一条路用的，注释里逐条写着
//  `result_type` 必须是 `"single"`、末包一发即断、压缩用 none、跨重连判重按文本）。
//  这个文件只做一件事：把那个客户端包成一个符合 `BuddyTranscriptionProvider`
//  协议的 provider，与百炼那个并列。
//
//  **音频管线、VAD、连续监听、打断逻辑一行都没动。** 换的只是「这些音频送给谁」：
//  `BuddyDictationManager` 拿到的还是同一个协议对象，调的还是那五个方法。
//
//  配置从「录音」页那一套豆包字段来（`recordingServiceAPIKey` / 档位 / 识别语言 /
//  热词）。理由：同一台机器上只有一个火山账号，同一个 API Key 让用户填两遍没有意义，
//  而且那一套是**与豆包一起实测过**的值（语言写 `zh-CN`、热词进 `corpus.hotwords`）。
//  代价是「听」页的「识别语言」只作用于百炼 —— 那一行的说明里写清楚了。
//

import AVFoundation
import Foundation

struct VolcengineTranscriptionProviderError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

final class VolcengineTranscriptionProvider: BuddyTranscriptionProvider {
    let displayName = "豆包流式识别（火山引擎）"

    /// 火山引擎这套不走 Apple 的语音识别权限 —— 和百炼那条一样。
    let requiresSpeechRecognitionPermission = false

    var isConfigured: Bool {
        !Self.configuredAPIKey().isEmpty
    }

    var unavailableExplanation: String? {
        guard !isConfigured else { return nil }
        return "豆包的识别还没配好：设置 → 录音 → 「识别服务（豆包流式语音识别）」里填上 API Key（以及档位）。"
    }

    /// **每次请求现读**，与百炼那三个客户端同一条规矩：设置里改完立刻生效，
    /// 不需要重启、也不需要重建 provider。
    static func configuredAPIKey() -> String {
        AppSettingsStore.snapshot().recordingServiceAPIKey
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 一把长命的 `URLSession`，**归 provider 所有，所有连接共用**。
    ///
    /// 这是仓规 E3（`开发经验/10-踩过的坑.md`）：每句话新建一条 URLSession 再
    /// invalidate，会破坏 OS 的连接池，连续几次之后就开始报 `Socket is not connected`。
    /// 长录音那条路一次录音只换几十次连接、自己建没问题，所以那边不注入（行为一字不变）；
    /// 这条路**每句话一条连接**，必须共用。超时与自建那条一样设成无限 —— 会话之间
    /// 可能隔几十秒没有音频，默认的 60 秒请求超时会把挂着的 socket 拆掉。
    private let sharedWebSocketURLSession: URLSession = {
        let sessionConfiguration = URLSessionConfiguration.default
        sessionConfiguration.timeoutIntervalForRequest = .infinity
        sessionConfiguration.timeoutIntervalForResource = .infinity
        sessionConfiguration.waitsForConnectivity = true
        return URLSession(configuration: sessionConfiguration)
    }()

    func startStreamingSession(
        keyterms: [String],
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) async throws -> any BuddyStreamingTranscriptionSession {
        let settings = AppSettingsStore.snapshot()
        let apiKey = settings.recordingServiceAPIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !apiKey.isEmpty else {
            throw VolcengineTranscriptionProviderError(
                message: unavailableExplanation ?? "豆包的识别还没配好。"
            )
        }

        // 热词两处合一份：「录音」页的热词（逗号 / 换行分隔）加上调用方给的
        // keyterms —— 那里面已经有「听」页的热词与本次对话的上下文词
        // （`BuddyDictationManager.buildTranscriptionKeyterms`）。服务端只认一个
        // corpus 列表，所以只能合成一份。
        var hotwords = settings.recordingHotwords
            .components(separatedBy: CharacterSet(charactersIn: ",，\n"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        for keyterm in keyterms {
            let trimmedKeyterm = keyterm.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedKeyterm.isEmpty,
                  !hotwords.contains(where: { $0.caseInsensitiveCompare(trimmedKeyterm) == .orderedSame })
            else { continue }
            hotwords.append(trimmedKeyterm)
        }

        let configuration = VolcengineRealtimeASRClient.Configuration(
            apiKey: apiKey,
            resourceID: settings.recordingEffectiveResourceID,
            language: settings.recordingLanguage,
            // 上限 50 与录音那条路一致；超了服务端不一定报错，但没必要送。
            hotwords: Array(hotwords.prefix(50))
        )

        let streamingSession = VolcengineTranscriptionSession(
            configuration: configuration,
            sharedURLSession: sharedWebSocketURLSession,
            onTranscriptUpdate: onTranscriptUpdate,
            onFinalTranscriptReady: onFinalTranscriptReady,
            onError: onError
        )
        // 不等握手。音频在连接建好之前喂进来会被 URLSession 排队，握手一完成就发出去，
        // 所以「先返回、让引擎立刻开始采集」既不会丢字，也不让用户等一次往返
        // （豆包这边没有百炼那个 `session.updated` 可以等，第一条回包就是证据）。
        streamingSession.start()
        return streamingSession
    }
}

/// 一次「按住说话」，或一个持续监听窗口里的一句话。
///
/// ## 定稿为什么不发末包（2026-09-27 实测，与录音那条路不同）
///
/// 录音那条路的定稿靠 `finishAndAwaitFinalResult` —— 发一个末包，等服务端把最后
/// 一段判成 `definite`。**这条路不发末包**，两条实测理由：
///
/// 1. **末包在这条路上基本不回定稿。** 探针（同一段真实录音，两次）：
///    `请求定稿之后等了 2.04 秒` —— 整整等满兜底上限，一次定稿都没回来，最后交
///    出去的文字与当时手上的实时文字**一模一样**。录音那边的日志也印证了这不是
///    偶发：`定稿已到` 146 次、`超时兜底` 98 次，而短句（用户说完就松手、句子
///    后面没有静音）几乎必然走超时。
/// 2. **发末包 = 连接立刻报废。** 末包一发服务端就关连接（录音那条路实测），
///    而这条路每一句都要用连接。
///
/// 那「说完了」怎么判？**看文字什么时候不再变长**：松开按键之后开始盯
/// `bestAvailableTranscriptText()`，连续若干个 tick 没变过就交出去（见
/// `startTranscriptSettleWatch`）。这比等一个不会来的定稿快，也不会因为等不到
/// 而把用户的话拖到兜底上限。全空的情况不算数（可能一个字都还没回来），交给外层
/// 兜底收尾。
///
/// ## 线程
///
/// `appendAudioBuffer` 在 AVAudioEngine 的渲染线程上被调用（与百炼那个 provider
/// 一样），里面只做「转 PCM16 + 交给客户端的 socketQueue」。**其余全部在主线程**：
/// 客户端的回调本来就派发到主队列，`requestFinalTranscript` / `beginNextUtterance`
/// / `cancel` 也都是主线程调的（`BuddyDictationManager` 是 @MainActor）。
/// 所以文本累积那几行状态没有额外的锁 —— 与百炼那个 provider 的分工完全一致。
private final class VolcengineTranscriptionSession: NSObject, BuddyStreamingTranscriptionSession {

    private static let targetSampleRate = 16_000.0

    /// 「文字不再变长」的判定：每 0.1 秒看一眼，连续 4 次没变（= 0.4 秒安静）就交。
    ///
    /// 0.4 秒的来源：服务端对**正在说的那一段**大约每 300–400 毫秒推一次更新
    /// （客户端注释里记的就是这个数），所以比它长一档才不会把一次正常的更新间隔
    /// 当成「说完了」。等待只在松开按键之后发生，所以它加的是**收尾**的延迟，
    /// 不是识别的延迟。
    private static let transcriptSettleTickSeconds: TimeInterval = 0.1
    private static let transcriptSettleQuietTickCount = 4

    /// 兜底上限：到点就交手上有的一切（哪怕还是空的）。
    ///
    /// 必须**小于** `finalTranscriptFallbackDelaySeconds` —— 那一个是
    /// `BuddyDictationManager` 自己的外层兜底，用它自己的计时器收尾。两个计时器
    /// 擦肩而过时，「先到的那个」才有内容可用。
    private static let transcriptSettleHardDeadlineSeconds: TimeInterval = 1.6

    /// `BuddyDictationManager` 在外层按这个时长兜底（拿到最终转写、或到点收尾）。
    /// 比上面的 1.6 秒长一档，让这里的正常出口先走。
    var finalTranscriptFallbackDelaySeconds: TimeInterval { 2.6 }

    // MARK: - 依赖

    private let configuration: VolcengineRealtimeASRClient.Configuration
    /// 那一条长命的 URLSession（见 provider 里的说明：仓规 E3）。
    private let sharedURLSession: URLSession
    private let onTranscriptUpdate: (String) -> Void
    private let onFinalTranscriptReady: (String) -> Void
    private let onError: (Error) -> Void

    private let audioPCM16Converter = BuddyPCM16AudioConverter(targetSampleRate: targetSampleRate)

    // MARK: - 状态（主线程）

    private var client: VolcengineRealtimeASRClient?

    /// 已经定稿的段，按服务端给的**段起点毫秒**归档。
    ///
    /// 用起点当键而不是「追加到尾巴」，是因为服务端在句末会把同一段再发一次
    /// （录音那条路也踩过：`LongFormTranscriptWriter.commit` 的判重就是为它写的）。
    /// 按起点覆盖既能去重，也能容纳「同一段先给一版、定稿时改成另一版」。
    private var definiteSegmentTextByStart: [Int: String] = [:]
    private var definiteSegmentStartOrder: [Int] = []

    /// 正在说的那一段（还没定稿）。
    private var liveSegmentStartMilliseconds = -1
    private var liveSegmentText = ""

    /// 连接代次。每句话一条新连接，而服务端的时间轴是**每条连接从零重计**的
    /// （录音那条路为此专门每场把判重窗口清零）—— 所以「上一句的尾巴」只能按
    /// **代次**判，不能按时间戳判。旧连接迟到的那一帧带着旧代次，一挡就准。
    private var connectionGeneration = 0

    private var hasRequestedFinalTranscript = false
    private var hasDeliveredFinalTranscript = false
    private var isCancelled = false

    // 「文字不再变长」的观察状态
    private var transcriptSettleTimer: Timer?
    private var lastSettledTranscriptText = ""
    private var transcriptSettleQuietTickCount = 0
    private var transcriptSettleStartedAt: Date?

    init(
        configuration: VolcengineRealtimeASRClient.Configuration,
        sharedURLSession: URLSession,
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) {
        self.configuration = configuration
        self.sharedURLSession = sharedURLSession
        self.onTranscriptUpdate = onTranscriptUpdate
        self.onFinalTranscriptReady = onFinalTranscriptReady
        self.onError = onError
        super.init()
    }

    // MARK: - 连接

    func start() {
        connectFreshClient()
    }

    /// 建一条**新的**连接并接上回调。
    ///
    /// 每次都是新对象，因为服务端的时间轴是每条连接从零重计的，而客户端实例本身
    /// 也把「一条连接」当自己的生命周期（`cancel()` 之后 `hasFinished` 就再也
    /// 不回头）。新对象在主线程上建，回调也都在主线程上回来。
    private func connectFreshClient() {
        guard !isCancelled else { return }
        connectionGeneration += 1
        let myGeneration = connectionGeneration

        let newClient = VolcengineRealtimeASRClient(configuration: configuration,
                                                    urlSession: sharedURLSession)
        newClient.onSegment = { [weak self] segment in
            // 客户端已经把回调派发到主队列了。
            guard let self, self.connectionGeneration == myGeneration else { return }
            self.handleSegment(segment)
        }
        newClient.onStateChange = { [weak self] state in
            guard let self, self.connectionGeneration == myGeneration else { return }
            self.handleConnectionState(state)
        }
        newClient.onDiagnostic = { line in
            print("🎙️ 豆包识别：\(line)")
        }
        client = newClient
        newClient.connect()
    }

    // MARK: - 音频

    func appendAudioBuffer(_ audioBuffer: AVAudioPCMBuffer) {
        // 渲染线程上：先转成 16k 单声道 PCM16（转换器只在这里被碰），再把字节交给客户端。
        guard let pcm16AudioData = audioPCM16Converter.convertToPCM16Data(from: audioBuffer),
              !pcm16AudioData.isEmpty else {
            return
        }
        client?.enqueue(audio: pcm16AudioData)
    }

    // MARK: - 收尾

    func requestFinalTranscript() {
        guard !hasRequestedFinalTranscript, !isCancelled else { return }
        hasRequestedFinalTranscript = true
        // **不发末包** —— 见类注释：末包在这条路上不回定稿，而它一发出连接就没了。
        // 改为盯着「文字什么时候不再变长」，见 `startTranscriptSettleWatch`。
        startTranscriptSettleWatch()
    }

    /// 这一句交付完了，**会话继续用**：换一条新连接接着听下一句。
    ///
    /// **为什么重连而不是留着**（考虑过、没用）：留着能省一次握手（第二句的首字会
    /// 更快），但服务端那条连接的时间轴是连续的 —— 上一句「定稿晚到」的那一帧会
    /// 落进下一句的累积里，用户看到的下一句开头挂着上一句的尾巴。按时间戳做水位
    /// 能挡住它，却会**吃掉「按了发送之后继续说」的那半句**（同一条连接上那还是
    /// 同一段，起点更早）。两种错法都在悄悄改用户说的话，而重连是**干净**的：
    /// 新连接的时间轴从零重计，代次闸把旧连接的迟到帧挡在外面，代价只是一次握手
    /// —— 而这期间喂进来的音频是在 `URLSessionWebSocketTask` 里排队的，不会丢。
    func beginNextUtterance() {
        guard !isCancelled else { return }
        stopTranscriptSettleWatch()
        // 旧连接先收掉：它的迟到帧带着旧代次，会被 `connectFreshClient` 里那道
        // 代次闸挡住，这里只是把它的 socket 早点关掉。
        client?.cancel()
        client = nil

        definiteSegmentTextByStart.removeAll(keepingCapacity: true)
        definiteSegmentStartOrder.removeAll(keepingCapacity: true)
        liveSegmentStartMilliseconds = -1
        liveSegmentText = ""
        hasRequestedFinalTranscript = false
        hasDeliveredFinalTranscript = false
        connectFreshClient()
    }

    func cancel() {
        isCancelled = true
        stopTranscriptSettleWatch()
        client?.cancel()
        client = nil
    }

    /// 「说完了」的判据：文字不再变长。
    ///
    /// 松开按键那一刻服务端可能还在处理最后一两个字的音频，所以不能立刻交；但也不能
    /// 干等一个不会来的定稿（实测：等满 2 秒，一次都没回来）。折中是看**变化**：
    /// 每 0.1 秒看一眼累积文字，连续 4 次一模一样（0.4 秒）就交出去。
    ///
    /// 全空不算数：可能一个字都还没回来（尤其是一句话很短的时候），那就交给
    /// 硬上限或外层兜底 —— 空着交出去等于把用户的话扔掉。
    private func startTranscriptSettleWatch() {
        stopTranscriptSettleWatch()
        lastSettledTranscriptText = bestAvailableTranscriptText()
        transcriptSettleQuietTickCount = 0
        transcriptSettleStartedAt = Date()

        let timer = Timer.scheduledTimer(withTimeInterval: Self.transcriptSettleTickSeconds,
                                         repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            self.transcriptSettleTick()
        }
        transcriptSettleTimer = timer
    }

    private func transcriptSettleTick() {
        guard !isCancelled, !hasDeliveredFinalTranscript else {
            stopTranscriptSettleWatch()
            return
        }
        let currentText = bestAvailableTranscriptText()
        if currentText != lastSettledTranscriptText {
            lastSettledTranscriptText = currentText
            transcriptSettleQuietTickCount = 0
        } else if !currentText.isEmpty {
            transcriptSettleQuietTickCount += 1
        }
        let hasReachedHardDeadline = transcriptSettleStartedAt
            .map { Date().timeIntervalSince($0) >= Self.transcriptSettleHardDeadlineSeconds } ?? false
        // 两条出口：文字不再变长（且不是空的 —— 空的可能只是还没回来），或者到点。
        // 到点那条对空文字也走：一句话都没听见时，用户按下又松开，等 1.6 秒交给外层
        // 收尾，比让外层的 2.6 秒兜底多等一秒强。
        let isSettled = !currentText.isEmpty
            && transcriptSettleQuietTickCount >= Self.transcriptSettleQuietTickCount
        if isSettled || hasReachedHardDeadline {
            deliverFinalTranscript(currentText)
        }
    }

    private func stopTranscriptSettleWatch() {
        transcriptSettleTimer?.invalidate()
        transcriptSettleTimer = nil
        transcriptSettleQuietTickCount = 0
        transcriptSettleStartedAt = nil
    }

    // MARK: - 段与状态（主线程）

    private func handleSegment(_ segment: VolcengineASRSegment) {
        guard !hasDeliveredFinalTranscript, !isCancelled else { return }
        guard !segment.text.isEmpty else { return }

        if segment.isDefinite {
            if definiteSegmentTextByStart[segment.startMilliseconds] == nil {
                definiteSegmentStartOrder.append(segment.startMilliseconds)
            }
            definiteSegmentTextByStart[segment.startMilliseconds] = segment.text
            // 这一段已经进正文，正在说的那一格清空（它本来就是这一段的内容）。
            if segment.startMilliseconds == liveSegmentStartMilliseconds {
                liveSegmentStartMilliseconds = -1
                liveSegmentText = ""
            }
        } else {
            if segment.startMilliseconds != liveSegmentStartMilliseconds {
                liveSegmentStartMilliseconds = segment.startMilliseconds
            }
            liveSegmentText = segment.text
        }

        let transcriptSoFar = bestAvailableTranscriptText()
        guard !transcriptSoFar.isEmpty else { return }
        onTranscriptUpdate(transcriptSoFar)
    }

    private func handleConnectionState(_ state: VolcengineRealtimeASRClient.ConnectionState) {
        switch state {
        case .failed(let message):
            failSession(message: message)
        case .disconnected(let reason):
            // 正常收尾（末包定稿、我们主动 cancel）也会走到这里 —— 那不是故障。
            guard !hasRequestedFinalTranscript, !hasDeliveredFinalTranscript, !isCancelled else { return }
            failSession(message: reason)
        case .idle, .connecting, .connected:
            break
        }
    }

    /// 连接坏了：把已经认出来的字交出去，而不是把它丢掉。
    ///
    /// 与百炼那条路同一个分寸（`BailianRealtimeTranscriptionSession.failSession`）：
    /// 断线时屏幕上有半句字，比一个字都没有强得多。一个字都没有才报错。
    private func failSession(message: String) {
        guard !hasDeliveredFinalTranscript else { return }
        let partialTranscript = bestAvailableTranscriptText()
        if !partialTranscript.isEmpty {
            print("🎙️ 豆包识别：连接出问题（\(message)），把已经认出来的字交出去：「\(partialTranscript)」")
            deliverFinalTranscript(partialTranscript)
            return
        }
        guard !isCancelled else { return }
        client?.cancel()
        client = nil
        onError(VolcengineTranscriptionProviderError(message: message))
    }

    private func deliverFinalTranscript(_ transcriptText: String) {
        guard !hasDeliveredFinalTranscript else { return }
        hasDeliveredFinalTranscript = true
        stopTranscriptSettleWatch()
        onFinalTranscriptReady(transcriptText)
    }

    /// 手上的全部文字：已定稿的段按时间轴顺序，接上正在说的那一段。
    private func bestAvailableTranscriptText() -> String {
        let committedText = definiteSegmentStartOrder
            .sorted()
            .compactMap { definiteSegmentTextByStart[$0] }
            .joined()
        return committedText + liveSegmentText
    }
}
