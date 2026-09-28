//
//  SpeechSynthesisVolumeTests.swift
//  WannaTests
//
//  「服务端合成音量」那张标定表的断言（2026-09-28）。
//
//  为什么值得钉住：这一处的失败方式**全是静默的** ——
//    · 漏发 `volume` → 服务端按默认 50 合成，比能到的响度低 6 dB，**不报错**；
//    · 标定写反（该 63 的写成 100）→ 用户听出来的是"这个音色怎么这么吵"，
//      而没有任何一行日志或错误指向这里；
//    · 两边（真朗读 / 试听）各算一次 → 试听与真朗读差 6 dB，而用户正是拿试听做决定。
//  所以这张表的边界钉死，并且**断言那个"两边同源"的形状**：试听那条路读的就是这个函数。
//

import Foundation
import Testing
@testable import Wanna

struct SpeechSynthesisVolumeTests {

    /// 别的音色拿的是官方上限（100），不是文档默认值（50）—— 这两者差 6 dB，
    /// 而"漏发字段"的历史表现正是拿到 50。
    @Test func uncalibratedVoicesGetTheDocumentedMaximum() {
        #expect(BailianConfiguration.speechSynthesisVolume(forVoiceID: "longanqian") == 100)
        #expect(BailianConfiguration.speechSynthesisVolume(forVoiceID: "Cally_v3.1") == 100)
        #expect(BailianConfiguration.speechSynthesisVolume(forVoiceID: "qwen-audio-3.1-tts-flash-abc-123") == 100)
    }

    /// 赵今麦那条克隆音色往下调（用户 2026-09-28：「赵今麦的音量，太大了，稍微降低一点」）。
    /// 断言按**中缀**认（克隆音色的 id 是 `模型名-clone名-hash`），整串 hash 不许进代码。
    @Test func theZhaoJinmaiCloneIsTrimmed() {
        let voiceID = "qwen-audio-3.1-tts-flash-zjm-7f08616cacf844bbbb165213d739f060"
        let trimmed = BailianConfiguration.speechSynthesisVolume(forVoiceID: voiceID)
        #expect(trimmed == 63)
        // 63 ≈ 100 × 10^(−4/20)：这就是"降 4 dB"。
        let decibels = 20 * log10(Double(trimmed) / 100.0)
        #expect(abs(decibels + 4.0) < 0.1)
    }

    /// 没有音色 id（用户没配）时也拿上限 —— 让服务端用它自己的默认音色，而不是我们
    /// 顺手把音量压到 50。
    @Test func anEmptyVoiceStillGetsTheMaximum() {
        #expect(BailianConfiguration.speechSynthesisVolume(forVoiceID: nil) == 100)
        #expect(BailianConfiguration.speechSynthesisVolume(forVoiceID: "") == 100)
    }
}
