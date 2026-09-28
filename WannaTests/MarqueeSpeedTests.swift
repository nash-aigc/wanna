//
//  MarqueeSpeedTests.swift
//  WannaTests
//
//  「字幕那一行的移动速度有上限」—— 2026-09-28 用户报「忽快忽慢」时加的。
//
//  为什么值得钉住：这条判据**只在极端情况下才起作用**（一次涌来很多字），
//  平时一个字一个字说话时它完全不参与 —— 也就是说，**改坏了在正常使用里看不出来**，
//  要等某次识别结果成批到达时才暴露，而那时用户看到的只是"又卡了"。
//
//  用户的原话（它把这件事说得很准）：「如果我一次一个字一个字地去说，他就非常平衡；
//  但是如果很多字的话，他就不平衡……现在就是忽快忽慢。」
//
//  根因是**距离与时长解耦**：改之前时长只由"距上一条的间隔"决定，而距离由"这一批
//  来了多少字"决定 —— 一次 1 个字和一次 20 个字用的是同一个时长，后者速度就是前者的
//  20 倍。下面第一条断言钉住"一个字的手感不变"，第二条钉住"再多字也不许超速"。
//

import Foundation
import Testing
@testable import Wanna

struct MarqueeSpeedTests {

    /// 一个汉字的 advance —— 本仓实测值（纯中文、等宽字体，见 `SmoothRevealedTranscriptText`）。
    private let oneCharacterWidth: CGFloat = 14.883268

    /// ⭐ **一个字一个字说话时的时长一个字都不许变。**
    ///
    /// 用户明确说这一档"非常平衡" —— 所以改法必须是**加上限**，不是把速度定死。
    /// 速度定死会在慢速时"动画先跑完、空等、再跳一下"，那正是这个文件早就修过的毛病。
    @Test func aSingleCharacterUpdateIsUnchanged() {
        let base = 0.36
        let duration = SmoothRevealedTranscriptText.cappedSlideDuration(
            base, distance: oneCharacterWidth)
        #expect(duration == base)
    }

    /// ⭐ **一次涌来 20 个字，速度不许超过上限。**
    ///
    /// 20 个字 ≈ 298pt。若还按 0.36s 走，速度是 828pt/s（用户感觉到的"忽快"）；
    /// 加上限之后速度被压到 74pt/s，时长自己变长。
    @Test func aBurstOfCharactersNeverExceedsTheSpeedCap() {
        let base = 0.36
        let distance = oneCharacterWidth * 20
        let duration = SmoothRevealedTranscriptText.cappedSlideDuration(base, distance: distance)
        #expect(duration > base)
        let speed = distance / CGFloat(duration)
        #expect(speed <= 74.0001)
    }

    /// **涌得越多，时长越长 —— 而速度不变**（这才是"平滑"的定义）。
    @Test func speedStaysConstantAsTheBurstGrows() {
        let base = 0.36
        func speed(characterCount: Int) -> CGFloat {
            let distance = oneCharacterWidth * CGFloat(characterCount)
            let duration = SmoothRevealedTranscriptText.cappedSlideDuration(
                base, distance: distance)
            return distance / CGFloat(duration)
        }
        let speeds = [20, 60, 200].map(speed)
        for value in speeds {
            #expect(abs(value - 74) < 0.5)
        }
    }

    /// 距离为零（识别结果回来了但没长字）不该产生 0 时长的动画。
    @Test func noDistanceKeepsTheBaseDuration() {
        #expect(SmoothRevealedTranscriptText.cappedSlideDuration(0.12, distance: 0) == 0.12)
    }
}
