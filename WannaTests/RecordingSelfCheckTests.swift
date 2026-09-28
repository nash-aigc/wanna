//
//  RecordingSelfCheckTests.swift
//  WannaTests
//
//  「每场录音自己判自己」那一行的断言（2026-09-28）。
//
//  为什么值得钉住：**它是"录音坏了"唯一的机器判据。**
//
//  用户问的是：「怎么样才能让 AI 知道他的修改已经让麦克风无法正常使用？如果他修改完之后
//  没有读到什么程序……那他就不知道。」答案就是这一行 —— App 每场录音结束自己判一次、
//  自己写进日志，`scripts/recording-health-check.sh` 与 `git pre-commit` 都读它。
//
//  所以判错方向的代价是**两个方向都致命**：
//    · 把坏的判成好 → 麦克风坏了没人知道，用户继续对着空气说话（2026-09-26 那次故障
//      就是这么埋了十次）；
//    · 把好的判成坏 → 提交被 hook 拦住，而这个仓库的流程以提交收尾。
//
//  判据本身取自 D45：**「采到了」和「送出去了」是两件可以同时一真一假的事**
//  —— 实测撞过 `🎤 音频：21 块/2.1s 峰值 0.127`（tap 在跳 ✓）**同时**
//  `服务端 8 秒零包、45000081 Timeout waiting next packet`（音频没进识别会话 ✗）。
//  只看第一条会判成"一切正常"，所以下面那条「有块但没有段」必须是失败。
//

import Foundation
import Testing
@testable import Wanna

struct RecordingSelfCheckTests {

    private func line(bufferCount: Int, segmentCount: Int, latency: Double? = 1.6,
                      watchdog: Int = 0, characters: Int = 100) -> String {
        LongFormRecorderController.recordingSelfCheckLine(
            bufferCount: bufferCount,
            segmentCount: segmentCount,
            firstSegmentLatencySeconds: latency,
            watchdogFirings: watchdog,
            characterCount: characters)
    }

    /// 一切正常 → ✅，而且数字都在里面（没有数字的"通过"等于没验）。
    @Test func healthyRecordingPasses() {
        let text = line(bufferCount: 2650, segmentCount: 42, watchdog: 0, characters: 419)
        #expect(text.hasPrefix("✅"))
        #expect(text.contains("采集 2650 块"))
        #expect(text.contains("服务端回 42 段"))
        #expect(text.contains("首字 1.6s"))
        #expect(text.contains("看门狗 0 次"))
    }

    /// **一块音频都没有** = 设备没在交付采样（2026-09-26 那类故障）。
    @Test func noAudioAtAllIsAFailure() {
        let text = line(bufferCount: 0, segmentCount: 0, latency: nil, characters: 0)
        #expect(text.hasPrefix("⚠️"))
        #expect(text.contains("一块音频都没收到"))
    }

    /// ⭐ **本条是这个文件存在的理由**：采到了，但服务端一段都没回 —— D45 那一类。
    ///
    /// 它在界面上**完全看不出来**（tap 在跳、进度条在动、文件也在写），
    /// 唯一的表现是"屏幕上不出字"。所以判据必须是失败，而且必须**说清不是麦克风的问题**
    ///（否则下一个人会去查麦克风，查一天也查不出东西来）。
    @Test func capturedButNeverDeliveredIsAFailure() {
        let text = line(bufferCount: 2650, segmentCount: 0, latency: nil, characters: 0)
        #expect(text.hasPrefix("⚠️"))
        #expect(text.contains("采集正常、但服务端一段都没回"))
        #expect(text.contains("不是麦克风的问题"))
    }

    /// 服务端回了段，但一个字都没有 —— 同样是坏的，且与上一条不是同一件事。
    @Test func segmentsWithoutAnyTextIsAFailure() {
        let text = line(bufferCount: 900, segmentCount: 7, latency: 2.0, characters: 0)
        #expect(text.hasPrefix("⚠️"))
        #expect(text.contains("一个字都没有"))
    }

    /// 通了但有异常（看门狗判死过 / 首字慢）→ **不算失败，但必须看得见**。
    ///
    /// 这一档是刻意分开的：把它并进"失败"会让 hook 变得爱拦人，并进去"通过"则等于
    /// 把"连接每 20 秒死一次"这种慢性病藏起来。
    @Test func watchdogAndSlowFirstWordAreReportedButNotFatal() {
        let text = line(bufferCount: 2650, segmentCount: 42, latency: 6.2,
                        watchdog: 3, characters: 400)
        #expect(text.hasPrefix("⚠️"))
        #expect(text.contains("看门狗判死 3 次"))
        #expect(text.contains("首字 6.2s 偏慢"))
        #expect(!text.contains("录音自检失败"))
    }

    /// 首字正常、看门狗为 0，就不该有多余的抱怨。
    @Test func noWarningsWhenEverythingIsClean() {
        let text = line(bufferCount: 100, segmentCount: 3, latency: 4.9, watchdog: 0, characters: 20)
        #expect(text.hasPrefix("✅"))
    }
}
