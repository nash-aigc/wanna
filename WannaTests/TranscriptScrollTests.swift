//
//  TranscriptScrollTests.swift
//  WannaTests
//
//  字幕滚动三层里**能脱离 UI 验的那两层**（2026-09-28，用户给的方案自己也是这么要求的：
//  「先把 TextFeed + syncTo + commonPrefixLength 的迁移逻辑写单元测试……这层对了，
//   上面两层出问题都是参数问题，不是结构问题」）。
//
//  为什么值得钉住：这些性质**平时看不出来**，只有出问题时才以"忽快忽慢 / 卡死"的形式
//  出现在屏幕上，而那时用户只能描述感受、给不出判据。下面每一条都对应一个已经发生过的
//  真实故障，注释里写明了是哪一条。
//

import AppKit
import Testing
@testable import Wanna

private let width: CGFloat = 14.883268   // 本仓实测：一个汉字的 advance

struct TranscriptScrollStateTests {

    /// **跨字边界时位置必须连续** —— 这正是"等速"的实现处，也是上一版"逐字跳"的病根。
    ///
    /// 逐字跳的表现：每过一个字边界位置跳 14.88pt（用户早年的原话是「半个字半个字地蹦」）。
    @Test func positionIsContinuousAcrossCharacterBoundaries() {
        var state = TranscriptScrollState()
        let widths = [width, width, width]
        var last = state.consumedPoints(characterWidths: widths)
        // 每次走 1pt，跨过两个字边界
        for _ in 0..<40 {
            state.advance(byPoints: 1, characterWidths: widths)
            let now = state.consumedPoints(characterWidths: widths)
            #expect(abs((now - last) - 1) < 0.0001)   // 每一小步都恰好 1pt，边界处不跳
            last = now
        }
    }

    /// **文本被 ASR 改写时，索引钳回公共前缀** —— 钳完必须合法（不能指向不存在的位置）。
    ///
    /// 识别结果是增量流：同一句会被反复重发，末尾的字可能被改掉。
    @Test func rewritingTheTailClampsBackToTheCommonPrefix() {
        var state = TranscriptScrollState()
        let widths = Array(repeating: width, count: 10)
        state.advance(byPoints: width * 6.5, characterWidths: widths)
        #expect(state.consumedCharacters == 6)

        // 前 4 个字没变，后面被改写 → 钳回 4
        state.clampToCommonPrefix(4)
        #expect(state.consumedCharacters == 4)
        #expect(state.phaseWithinCharacter == 0)
    }

    /// 公共前缀更长时**什么都不做**（进度天然有效，不许倒退）。
    ///
    /// ⚠️ **这里钉的是"位置"，不是"字符索引"** —— 这是写这条断言时实测出来的：
    /// `advance(width * 3)` 之后索引是 **2**、相位 **0.9999999999999998**，因为浮点下
    /// 三次相减之后 `remaining` 比那个字宽小了 1e-15。**位置是对的**（2w + 0.9999999w ≈ 3w），
    /// 只是"索引 + 相位"在字符边界处本来就有一对多的表示。所以断言钉位置才钉得住，
    /// 钉索引会红 —— 而红的是断言，不是代码。（判据用探针跑真源码量过，不是猜的。）
    @Test func aLongerCommonPrefixLeavesProgressAlone() {
        var state = TranscriptScrollState()
        let widths = Array(repeating: width, count: 10)
        state.advance(byPoints: width * 3, characterWidths: widths)
        let before = state.consumedPoints(characterWidths: widths)
        state.clampToCommonPrefix(8)
        #expect(abs(state.consumedPoints(characterWidths: widths) - before) < 0.0001)
        #expect(abs(before - width * 3) < 0.0001)   // 走了三个字宽
    }

    /// **`sync` 是幂等的**，而且能把位置换算回索引 —— 渲染层靠它对齐，两侧因此不累积误差。
    @Test func syncingToARenderedPositionIsIdempotent() {
        let widths = Array(repeating: width, count: 10)
        var state = TranscriptScrollState()
        state.sync(toConsumedPoints: width * 4.25, characterWidths: widths)
        let first = state
        state.sync(toConsumedPoints: state.consumedPoints(characterWidths: widths),
                   characterWidths: widths)
        #expect(state == first)
    }

    /// **文字比可视宽度短时右对齐**（本仓既有的「右边缘永远钉在右端」），
    /// 长时滚到 `x = 0` 为止 —— 这是同一条件式的两个端点，改一个会伤到另一个。
    @Test func shortTextIsRightAlignedAndLongTextScrollsToZero() {
        var state = TranscriptScrollState()
        let short = Array(repeating: width, count: 10)     // 148.8pt
        #expect(abs(state.contentOffsetX(viewWidth: 359, characterWidths: short) - (359 - 148.8)) < 0.1)

        let long = Array(repeating: width, count: 100)     // 1488pt
        state.jumpToEnd(characterWidths: long)
        #expect(state.contentOffsetX(viewWidth: 359, characterWidths: long) >= 0)
        #expect(state.pendingPoints(viewWidth: 359, characterWidths: long) == 0)
    }

    /// **排队量**是调度层的控制输入：滚到底就必须是 0（否则调度层会一直加速）。
    @Test func pendingReachesZeroOnceCaughtUp() {
        var state = TranscriptScrollState()
        let widths = Array(repeating: width, count: 40)    // 595pt，可视 359
        state.advance(byPoints: 595, characterWidths: widths)
        #expect(state.pendingPoints(viewWidth: 359, characterWidths: widths) == 0)
    }

    /// **窗口左滑时索引跟着左移，屏幕不动**（录音几小时，字符串不能无限长）。
    ///
    /// 同样钉"索引正好减掉丢掉的字数"，而不是钉某个绝对值 —— 理由见上一条（差一个字的
    /// 表示歧义）。这一条真正要保证的是：**丢多少、索引就减多少**，否则屏幕会跳。
    @Test func slidingTheWindowKeepsTheIndexConsistent() {
        var state = TranscriptScrollState()
        let widths = Array(repeating: width, count: 100)
        state.advance(byPoints: width * 50, characterWidths: widths)
        let before = state.consumedCharacters
        state.shiftLeft(by: 40)
        #expect(state.consumedCharacters == before - 40)
    }

    /// 逐字宽度的量法：纯中文等宽、总宽等于各字之和（CoreText 版，与旧的 NSString 量法同源）。
    @Test func characterWidthsMatchTheMeasuredAdvance() {
        let font = NSFont.systemFont(ofSize: 15, weight: .medium)
        let widths = TranscriptTextMeasurement.characterWidths(of: "北京上海", font: font)
        #expect(widths.count == 4)
        for w in widths { #expect(abs(w - width) < 0.6) }   // 实测 14.883268，允许 0.6 的字体差
    }

    /// 公共前缀的计算（`Character` 为单位，不是 UTF-16 码元）。
    @Test func commonPrefixCountsCharacters() {
        #expect(TranscriptTextMeasurement.commonPrefixLength("今天天气", "今天天汽") == 3)
        #expect(TranscriptTextMeasurement.commonPrefixLength("abc", "abc") == 3)
        #expect(TranscriptTextMeasurement.commonPrefixLength("", "abc") == 0)
    }
}

struct TranscriptScrollSchedulerTests {

    /// **限幅**：速度一秒最多变化 50%，所以一帧之内不可能从基速跳到两倍 ——
    /// 那正是用户报的"忽快忽慢"。
    @Test func speedNeverJumpsMoreThanTheSlewLimit() {
        var scheduler = TranscriptScrollScheduler()
        let first = scheduler.currentSpeed
        // 排队 10 个屏宽（远超伺服范围），速度也只好一点点往上走
        _ = scheduler.tick(pendingPoints: 359 * 10, viewWidth: 359, elapsedSeconds: 0.1)
        let second = scheduler.currentSpeed
        #expect(second <= first * 1.05 + 0.001)
    }

    /// 排队越多、速度越高，但**有上界**（伺服项不是无限的）。
    @Test func aBiggerBacklogScrollsFasterButBounded() {
        var a = TranscriptScrollScheduler()
        var b = TranscriptScrollScheduler()
        // 先在限幅下走几拍，让速度爬上去
        for _ in 0..<20 {
            _ = a.tick(pendingPoints: 359 * 0.5, viewWidth: 359, elapsedSeconds: 0.1)
            _ = b.tick(pendingPoints: 359 * 1.5, viewWidth: 359, elapsedSeconds: 0.1)
        }
        #expect(b.currentSpeed > a.currentSpeed)
        #expect(b.currentSpeed <= TranscriptScrollScheduler().baseSpeed * 2.01)
    }

    /// **排队超过两屏就跳尾** —— 这是"延迟有硬上界"的保证。
    @Test func aHugeBacklogJumpsToTheEnd() {
        var scheduler = TranscriptScrollScheduler()
        let decision = scheduler.tick(pendingPoints: 359 * 3, viewWidth: 359, elapsedSeconds: 0.1)
        #expect(decision == .jumpToEnd)
    }

    /// **追上就停**（不是"以极慢的速度继续走"）。
    @Test func noBacklogMeansIdle() {
        var scheduler = TranscriptScrollScheduler()
        #expect(scheduler.tick(pendingPoints: 0, viewWidth: 359, elapsedSeconds: 0.1) == .idle)
    }

    /// 本窗内滚过的距离不超过排队量 —— 否则动画会冲过终点再回弹，那也是一眼能看出来的抖动。
    @Test func aSingleTickNeverOvershootsTheBacklog() {
        var scheduler = TranscriptScrollScheduler()
        let backlog: CGFloat = 40
        let decision = scheduler.tick(pendingPoints: backlog, viewWidth: 359, elapsedSeconds: 1.0)
        if case .scroll(_, let points) = decision {
            #expect(points <= backlog)
        } else {
            Issue.record("应当继续滚，而不是 \(decision)")
        }
    }
}
