//
//  BuddyTranscriptionProvider.swift
//  Wanna
//
//  Shared protocol surface for voice transcription backends.
//

import AVFoundation
import Foundation

protocol BuddyStreamingTranscriptionSession: AnyObject {
    var finalTranscriptFallbackDelaySeconds: TimeInterval { get }
    func appendAudioBuffer(_ audioBuffer: AVAudioPCMBuffer)
    func requestFinalTranscript()
    /// 这一句交付完了，**保住会话**准备下一句。
    ///
    /// 默认空实现：只有实时流式的那条路（百炼）需要它 —— 它的会话可以连着用，
    /// 而另外两个 provider（上传式 / Apple 本地）本来就是一句话一个会话。
    func beginNextUtterance()
    func cancel()
}

extension BuddyStreamingTranscriptionSession {
    func beginNextUtterance() {}
}

protocol BuddyTranscriptionProvider {
    var displayName: String { get }
    var requiresSpeechRecognitionPermission: Bool { get }
    var isConfigured: Bool { get }
    var unavailableExplanation: String? { get }

    func startStreamingSession(
        keyterms: [String],
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) async throws -> any BuddyStreamingTranscriptionSession
}

enum BuddyTranscriptionProviderFactory {

    /// `transcriptionModelIDOverride`：语音聊天的**角色独立配置**。对话页不传，
    /// 走「听」页的全局选择；传了就以它为准（工厂按模型名分流，见下面那三行）。
    static func makeDefaultProvider(
        transcriptionModelIDOverride: String? = nil
    ) -> any BuddyTranscriptionProvider {
        let provider = resolveProvider(override: transcriptionModelIDOverride)
        print("🎙️ Transcription: using \(provider.displayName)")
        return provider
    }

    /// 选哪个识别后端，只由这一处决定。
    ///
    /// 三条规矩，顺序不能换：
    ///
    /// 1. **调用方点名了模型 → 百炼。** 语音聊天的三段式预设会把识别模型
    ///    （`qwen-audio-3.1-realtime-plus` 那类百炼模型）作为 override 传进来，
    ///    那个名字本身就是百炼的，换后端等于让角色编辑器里选的那一项失效。
    ///    实测（2026-09-27）四条三段式预设**全部**带非空 override，所以这条规矩
    ///    精确地圈出了「语音聊天那条路」。
    /// 2. **没点名 → 看用户在「听」页选的识别服务**（`VoiceTranscriptionService`，
    ///    默认豆包）。主 Agent 的按说即发、它的持续追问窗口、卡片通话都走这条。
    /// 3. **选中的那个没配好 → 退到另一个；两个都没配 → Apple 本地识别。**
    ///    静默换后端是最坏的结果，所以每一步都打一行日志。
    private static func resolveProvider(override: String?) -> any BuddyTranscriptionProvider {
        if let override, !override.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return bailianProviderForConfiguredModel(override: override)
        }

        let desiredService = AppSettingsStore.snapshot().voiceTranscriptionService
        let volcengine = VolcengineTranscriptionProvider()
        let bailian = bailianProviderForConfiguredModel(override: nil)

        switch desiredService {
        case .volcengine:
            if volcengine.isConfigured { return volcengine }
            if bailian.isConfigured {
                print("⚠️ Transcription: 选的是豆包，但豆包的 API Key 还没填 —— 先用 \(bailian.displayName)")
                return bailian
            }
            print("⚠️ Transcription: 豆包与百炼都没配好，退到 Apple Speech")
            return AppleSpeechTranscriptionProvider()
        case .bailian:
            if bailian.isConfigured { return bailian }
            print("⚠️ Transcription: 选的是百炼，但百炼的识别角色没配好，退到 Apple Speech")
            return AppleSpeechTranscriptionProvider()
        }
    }

    /// 百炼有**三条**识别路，由**模型名**决定走哪条：
    ///
    ///  · `qwen-audio-3.x-realtime-*`（全双工语音那个**语音模型**）→ 拿它当纯识别器：
    ///    它识别又快又准，而且可以不生成回答（实测：commit 后 0.27 秒出转写、
    ///    一个 `response.*` 事件都没有）。
    ///  · 其它带 `realtime` 的（`qwen3-asr-flash-realtime`）→ 专用的实时识别模型。
    ///  · 其余（`qwen-audio-3.1-asr-flash`）→ 非实时 HTTP，整句一次认。
    ///
    /// 分流放在这里而不是让用户在设置里选「协议」，因为模型名本身就说明了协议 ——
    /// 多一个开关就多一个能和模型名矛盾的状态。设置页那一栏选的是**模型**，路由
    /// 从这里推出来。
    private static func bailianProviderForConfiguredModel(override: String?) -> any BuddyTranscriptionProvider {
        let configuredModelID = ModelConfigurationStore.snapshot()
            .status(of: .transcription).resolvedRole?.modelID ?? ""
        // 角色覆盖优先；没有覆盖才看全局配置。
        let modelID = override ?? configuredModelID

        // 语音模型当识别器：名字形如 `qwen-audio-3.0-realtime-flash`。
        // 判据是 `qwen-audio-` + `-realtime`，因为这一族里还有 `qwen-audio-3.1-realtime-plus`。
        if modelID.hasPrefix("qwen-audio-") && modelID.contains("realtime") {
            let speechProvider = BailianRealtimeSpeechTranscriptionProvider()
            speechProvider.modelIDOverride = override
            return speechProvider
        }
        if modelID.contains("realtime") {
            let realtimeProvider = BailianRealtimeTranscriptionProvider()
            realtimeProvider.modelIDOverride = override
            return realtimeProvider
        }
        let nonRealtimeProvider = BailianNonRealtimeTranscriptionProvider()
        nonRealtimeProvider.modelIDOverride = override
        return nonRealtimeProvider
    }
}
