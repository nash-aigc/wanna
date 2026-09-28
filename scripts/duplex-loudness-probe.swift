// 全双工（实时模型自己发声）那一路的音频电平探针。
//
// WHY THIS EXISTS: `SpeechSynthesizer` 那条路有官方的 `input.volume`（默认 50），
// 而全双工这条**没有任何服务端音量参数** —— 音频电平就是模型吐出来的电平，
// 客户端唯一的杠杆是本地增益。要判断"语音/视频模式为什么偏小"，就必须先量到
// 这条路的真实电平，而不是照合成那条路的结论去推。
//
// 协议完全照 App 里已经跑通的那一套（`VoicePreviewService.RealtimePreviewTurn`）：
// 连接 → 等 `session.created` → `session.update`（`turn_detection: null`）→
// `conversation.item.create` 发一句纯文字 → `response.create` → 收 `response.audio.delta`。
// 顺序错了不会崩，只会安静地收不到音频，所以顺序本身就是重点。
//
// 输出：每个 (model, voice) 一个 `.pcm`（24 kHz 单声道 PCM16，裸数据），
// 由 Python 那边包 WAV 头并量峰值/RMS。
//
// 跑法：xcrun swift scripts/duplex-loudness-probe.swift <输出目录>

import Foundation

struct Target {
    let label: String
    let modelID: String
    let voiceID: String
}

let targets = [
    Target(label: "语音-全双工-3.0flash", modelID: "qwen-audio-3.0-realtime-flash", voiceID: "longanqian"),
    Target(label: "视频-全模态-3.8flash", modelID: "qwen3.8-omni-flash-realtime", voiceID: "Tina"),
]

let sentence = "你好，我是你的语音助手，很高兴认识你。今天我们来聊一聊声音大小这件事。"

let configurationPath = ("~/Library/Application Support/Wanna/ModelConfiguration.json" as NSString).expandingTildeInPath
guard let configurationData = FileManager.default.contents(atPath: configurationPath),
      let configuration = try? JSONSerialization.jsonObject(with: configurationData) as? [String: Any],
      let providers = configuration["providers"] as? [[String: Any]],
      let speechProviderID = configuration["speechProviderID"] as? String,
      let provider = providers.first(where: { $0["id"] as? String == speechProviderID }),
      let baseURL = provider["baseURL"] as? String,
      let apiKey = provider["apiKey"] as? String
else {
    FileHandle.standardError.write(Data("读不到 ModelConfiguration.json 里的「说」角色\n".utf8))
    exit(1)
}

let outputDirectory = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/wanna-duplex-probe"
try? FileManager.default.createDirectory(atPath: outputDirectory, withIntermediateDirectories: true)

final class TurnCollector: NSObject, URLSessionWebSocketDelegate {
    private let task: URLSessionWebSocketTask
    private let voiceID: String
    private var collectedPCM16 = Data()
    private var didSeeSessionCreated = false
    private var didSeeResponseDone = false
    private let completion = DispatchSemaphore(value: 0)

    init(task: URLSessionWebSocketTask, voiceID: String) {
        self.task = task
        self.voiceID = voiceID
    }

    func start() {
        receiveNext()
        completion.wait()
    }

    private func receiveNext() {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message { self.handle(text) }
                if !self.didSeeResponseDone { self.receiveNext() }
                else { self.completion.signal() }
            case .failure(let error):
                FileHandle.standardError.write(Data("接收失败：\(error.localizedDescription)\n".utf8))
                self.completion.signal()
            }
        }
    }

    private func send(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { _ in }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = event["type"] as? String else { return }

        switch type {
        case "session.created":
            didSeeSessionCreated = true
            // 官方顺序：session.created 之后才发 session.update，反过来配不上去。
            send([
                "type": "session.update",
                "session": [
                    "modalities": ["text", "audio"],
                    "voice": voiceID,
                    "audio": [
                        "input": ["format": ["type": "pcm", "sample_rate": 16_000]],
                        "output": ["format": ["type": "pcm", "sample_rate": 24_000]],
                    ],
                    "instructions": "照读用户给的句子即可。",
                    // 这条会话没有麦克风：留给服务端 VAD 就永远等不到"有人说话"。
                    "turn_detection": NSNull(),
                ],
            ])
        case "session.updated":
            send([
                "type": "conversation.item.create",
                "item": [
                    "type": "message",
                    "role": "user",
                    "content": [["type": "input_text", "text": sentence]],
                ],
            ])
            send(["type": "response.create"])
        case "response.audio.delta":
            if let delta = event["delta"] as? String, let pcm = Data(base64Encoded: delta) {
                collectedPCM16.append(pcm)
            }
        case "response.done":
            didSeeResponseDone = true
        case "error":
            FileHandle.standardError.write(Data("服务端错误：\(text)\n".utf8))
        default:
            break
        }
    }

    var audio: Data { collectedPCM16 }
}

for target in targets {
    print("=== \(target.label)  model=\(target.modelID)  voice=\(target.voiceID) ===")
    let websocketBaseURL = baseURL.replacingOccurrences(of: "https://", with: "wss://")
    guard let url = URL(string: "\(websocketBaseURL)/api-ws/v1/realtime?model=\(target.modelID)") else {
        print("  ⚠️ 地址拼不出来")
        continue
    }
    var request = URLRequest(url: url)
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue("realtime=v1", forHTTPHeaderField: "OpenAI-Beta")

    let session = URLSession(configuration: .default)
    let task = session.webSocketTask(with: request)
    task.resume()

    let collector = TurnCollector(task: task, voiceID: target.voiceID)
    collector.start()

    let outputPath = "\(outputDirectory)/\(target.label).pcm"
    try? collector.audio.write(to: URL(fileURLWithPath: outputPath))
    print("  收到 \(collector.audio.count) 字节 PCM16 → \(outputPath)")
    task.cancel(with: .normalClosure, reason: nil)
}
