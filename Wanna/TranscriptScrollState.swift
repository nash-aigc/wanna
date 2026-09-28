//
//  TranscriptScrollState.swift
//  Wanna
//
//  字幕那一行的**滚动权威状态**（2026-09-28，按用户给的"三层架构"方案落地）。
//
//  ## 为什么要有这一层
//
//  用户报的是「忽快忽慢、然后卡死、又是忽快忽慢」，要求「必须完全等速」。
//  前后两版都栽在同一件事上：**像素位置是攒出来的**（上一版是 `withAnimation` 把位置
//  一段一段挪过去，落后量只增不减 → 文字整体漂出屏幕 → 屏幕上看起来"卡死"）。
//
//  这一层的规矩只有一条：**权威状态永远是字符索引，不是像素**。
//      · 已消费的字数 `consumedCharacters`
//      · 当前字内的相位 `phaseWithinCharacter`（0..<1）
//  像素位置**每次现算**，从不累积 —— 所以"漂出屏幕"在结构上不可能发生。
//
//  ## 它同时解决了另一件事：ASR 会改写文本
//
//  识别结果是**流式增量**：同一句会被反复重发，末尾的字可能被改掉（「今天」→「今田」→
//  「今天」）。而"已滚过的字符数"在文本被改写之后可能指向别处 —— 所以更新文本时要
//  **钳回公共前缀**（`clampToCommonPrefix`）。钳回去最多回退一个字宽，而且**永远合法**。
//
//  ## 单位
//
//  一切以 **Character**（用户看到的"一个字"）为单位，不是 UTF-16 码元 —— 表情符号和
//  组合字符都算一个字，与 `String.count` 同一套。
//
//  纯值类型：不碰 UI、不碰时间、不碰全局状态，所以 `WannaTests` 能直接钉住它。
//

import AppKit
import CoreText
import Foundation

nonisolated struct TranscriptScrollState: Equatable {

    /// 已经滚过去的**字数**。等于 `characterWidths.count` 表示全部滚完（贴住末尾）。
    private(set) var consumedCharacters: Int = 0

    /// 当前这个字内部已经走过去多少（0..<1）。
    ///
    /// **它存在的唯一理由是"跨字边界时位置连续"**：没有它，推进只能整字跳（14.88pt 一跳），
    /// 而那正是本仓早就修过一次的「半个字半个字地蹦」。
    private(set) var phaseWithinCharacter: CGFloat = 0

    init() {}

    /// 已经消费掉的**像素**（pt）。
    func consumedPoints(characterWidths: [CGFloat]) -> CGFloat {
        var total: CGFloat = 0
        for index in 0..<min(consumedCharacters, characterWidths.count) {
            total += characterWidths[index]
        }
        if consumedCharacters < characterWidths.count {
            total += characterWidths[consumedCharacters] * phaseWithinCharacter
        }
        return total
    }

    /// **平移量**：文本层应该被放在 `x = viewWidth - totalWidth + consumed` 的位置。
    ///
    /// 这一条式子同时管住两件事：
    ///   · 文本比可视宽度**短**时，`consumed = 0` → `x = viewWidth - totalWidth > 0`，
    ///     文本**右对齐**（这就是本仓既有的「文字右边缘永远钉在右端」）；
    ///   · 文本比可视宽度**长**时，`consumed` 会长到 `totalWidth - viewWidth` 为止，
    ///     此时 `x = 0` —— 左边刚好滚出去、右边钉住。
    func contentOffsetX(viewWidth: CGFloat, characterWidths: [CGFloat]) -> CGFloat {
        let totalWidth = characterWidths.reduce(0, +)
        return viewWidth - totalWidth + consumedPoints(characterWidths: characterWidths)
    }

    /// **屏外还在排队多少 pt** —— 调度层的控制输入（"还欠用户多少没滚出来"）。
    func pendingPoints(viewWidth: CGFloat, characterWidths: [CGFloat]) -> CGFloat {
        let totalWidth = characterWidths.reduce(0, +)
        return max(0, totalWidth - consumedPoints(characterWidths: characterWidths) - viewWidth)
    }

    /// 还能往前滚多少 pt（滚到底就是 0）。**追上就停**用的是这个量。
    func remainingScrollablePoints(viewWidth: CGFloat, characterWidths: [CGFloat]) -> CGFloat {
        pendingPoints(viewWidth: viewWidth, characterWidths: characterWidths)
    }

    /// 往前滚 `points` 个 pt。**逐字扣减相位，所以跨字边界位置连续、速度不变。**
    mutating func advance(byPoints points: CGFloat, characterWidths: [CGFloat]) {
        guard points > 0 else { return }
        var remaining = points
        while remaining > 0 {
            guard consumedCharacters < characterWidths.count else {
                phaseWithinCharacter = 0
                return
            }
            let width = characterWidths[consumedCharacters]
            guard width > 0 else {          // 零宽字符（组合记号）直接跨过去
                consumedCharacters += 1
                phaseWithinCharacter = 0
                continue
            }
            let leftInThisCharacter = width * (1 - phaseWithinCharacter)
            if remaining < leftInThisCharacter {
                phaseWithinCharacter += remaining / width
                return
            }
            remaining -= leftInThisCharacter
            consumedCharacters += 1
            phaseWithinCharacter = 0
        }
    }

    /// **文本被改写之后，把权威状态钳回公共前缀。**
    ///
    /// `commonPrefixLength` 由调用方算（新旧文本从头开始的相同字数）。已滚过的区域若被
    /// 改写，索引就可能指向别的内容 —— 钳回去、相位归零。**最多回退一个字宽**，
    /// 而且钳完一定合法，所以屏幕上不可能出现"整行空"。
    mutating func clampToCommonPrefix(_ commonPrefixLength: Int) {
        guard consumedCharacters > commonPrefixLength else { return }
        consumedCharacters = max(0, commonPrefixLength)
        phaseWithinCharacter = 0
    }

    /// **把渲染出来的真实位置同步回字符索引**（幂等）。
    ///
    /// 渲染层每次重设动画前都会调它：主线程卡顿期间动画自己在渲染服务器上走，
    /// 恢复后拿 `presentation()` 的真实位置回来对齐 —— 这样**两侧永远不会累积误差**。
    mutating func sync(toConsumedPoints points: CGFloat, characterWidths: [CGFloat]) {
        var accumulated: CGFloat = 0
        for (index, width) in characterWidths.enumerated() {
            if accumulated + width > points {
                consumedCharacters = index
                phaseWithinCharacter = width > 0 ? (points - accumulated) / width : 0
                return
            }
            accumulated += width
        }
        // 走到末尾之外：贴在最后一个字上
        consumedCharacters = max(0, characterWidths.count - 1)
        phaseWithinCharacter = 0
    }

    /// 直接跳到末尾（调度层触发的"硬快进"兜底用）。
    mutating func jumpToEnd(characterWidths: [CGFloat]) {
        consumedCharacters = max(0, characterWidths.count - 1)
        phaseWithinCharacter = 0
    }

    /// **窗口从左边滑掉 N 个字时，把索引一起左移。**
    ///
    /// 录音可以录几个小时，字符串不能无限长 —— 所以显示的是"最后 N 个字"的窗口。
    /// 窗口滑动时丢掉的是**已经滚过去、已经在屏幕左边外面**的字，所以索引跟着减 N
    /// 之后，屏幕上**一个像素都不动**（这也正是滑动可以不带任何动画的原因）。
    mutating func shiftLeft(by droppedCharacters: Int) {
        guard droppedCharacters > 0 else { return }
        consumedCharacters = max(0, consumedCharacters - droppedCharacters)
    }

    mutating func reset() {
        consumedCharacters = 0
        phaseWithinCharacter = 0
    }
}

nonisolated enum TranscriptTextMeasurement {

    /// **逐字的排版推进量**（pt）。用 CoreText 量，所以标点、数字、拉丁混排都精确 ——
    /// 用"字数 × 平均字宽"会在中英混排时错得很离谱。
    ///
    /// 与 `String.count` 同一套单位（每行一个元素 = 一个 `Character`）。
    static func characterWidths(of text: String, font: NSFont,
                                kern: CGFloat = 0) -> [CGFloat] {
        guard !text.isEmpty else { return [] }
        let attributed = NSAttributedString(
            string: text,
            attributes: [.font: font, .kern: kern])
        let line = CTLineCreateWithAttributedString(attributed)
        let utf16Count = (text as NSString).length

        // 每一个 Character 在 UTF-16 里的起点，末尾补一个"文字结尾"哨兵。
        var utf16Offsets: [Int] = []
        utf16Offsets.reserveCapacity(text.count + 1)
        var offset = 0
        for character in text {
            utf16Offsets.append(offset)
            offset += String(character).utf16.count
        }
        utf16Offsets.append(offset)

        var widths: [CGFloat] = []
        widths.reserveCapacity(text.count)
        for index in 0..<(utf16Offsets.count - 1) {
            let start = utf16Offsets[index]
            let end = utf16Offsets[index + 1]
            guard start < utf16Count else { break }
            let startOffset = CTLineGetOffsetForStringIndex(line, start, nil)
            let endOffset = end <= utf16Count
                ? CTLineGetOffsetForStringIndex(line, min(end, utf16Count), nil)
                : startOffset
            widths.append(CGFloat(max(0, endOffset - startOffset)))
        }
        return widths
    }

    /// 新旧文本从头开始相同的前缀长度（单位：`Character`）。
    static func commonPrefixLength(_ old: String, _ new: String) -> Int {
        var count = 0
        for (left, right) in zip(old, new) {
            guard left == right else { break }
            count += 1
        }
        return count
    }
}
