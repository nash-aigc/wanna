//
//  TranscriptMarqueeLayer.swift
//  Wanna
//
//  字幕滚动的**渲染层**：位移交给 Core Animation（2026-09-28，按用户给的方案落地）。
//
//  ## 为什么必须是 Core Animation
//
//  用户报的第三个症状是「卡死」—— 而"卡"和"慢"是两件事。前一版用
//  `withAnimation` 每来一批字就重设一次动画：**主线程一忙，重设就晚**，而动画的目标
//  是"刚才算出来的那个位置"，于是主线程越忙、位置越旧、看起来越卡。
//
//  这一层的分工是：**主线程只负责"重设目标"，两次重设之间的位移由渲染服务器按自己的
//  时钟线性插值** —— 主线程被 ASR、布局、GC 占住多久，滚动都照走。这正是本仓给
//  "窗口展开动画"用过的同一条结论（逐帧改窗口 = 卡；交给渲染服务器 = 顺）。
//
//  ## 三条设计上的硬约束
//
//  1. **每次重设都先问渲染服务器"你现在在哪"**（`presentation()`），而不是用自己记的
//     模型值。模型值在动画进行中是"目标"，不是"当前位置" —— 拿它做起点会让画面回跳。
//  2. **任何像素都不累积**：位置永远由"权威字符索引 + 相位"现算（见
//     `TranscriptScrollState`），所以主线程卡多久都不会漂。
//  3. **线性**（`CAMediaTimingFunction(name: .linear)`）—— 那是"等速"在 Core Animation
//     里的唯一写法。
//
//  ## 相对方案原文改掉的两处（都不能照抄）
//
//  · 方案里用了 `AVCoreAnimationBeginTimeFromZero` 这个**私有符号**（"私有但十年稳定"）。
//    不能这么干：私有符号不做兼容承诺，而且这个仓库连 Sparkle 都因为打包问题删掉了。
//    这里改成标准的 `CACurrentMediaTime()` + `CATransaction.setDisableActions(true)`。
//  · 方案里动画的是 `sublayerTransform.translation.x`。`sublayerTransform` 整体是
//    可动画的，但"它的分量"不是文档化的 key path；这里改成动画**文字层自己的**
//    `transform.translation.x`（`transform.rotation.z` 那一族是文档化可用的）。
//

import AppKit
import Combine
import QuartzCore
import SwiftUI

/// 字幕那一行的数据源：文本 + 逐字宽度 + 滚动权威状态。
///
/// 文本**只在真正变化时**才重新量宽度（识别结果是增量的，每次只多几个字），
/// 这是本仓既有的一条优化，保留。
@MainActor
final class TranscriptMarqueeFeed: ObservableObject {

    @Published private(set) var text: String = ""

    /// 显示窗口在全文里的起点（0 = 从头显示）。
    ///
    /// **为什么还要一层窗口**：录音可以录三个小时，`CATextLayer` 不能拿着一整场文字。
    /// 这里只留最后 `maximumWindowCharacters` 个字，带 `trimHysteresisCharacters` 的迟滞
    ///（没有迟滞就会变成"每来一个字都裁一次"的定长窗口 —— 那是本仓早年的一个坑）。
    private(set) var windowStart = 0
    private static let maximumWindowCharacters = 200
    private static let trimHysteresisCharacters = 60

    private(set) var characterWidths: [CGFloat] = []
    private(set) var scrollState = TranscriptScrollState()

    /// 字体变了要重量宽度（三处内容列的页头字号不同）。
    var font: NSFont = .systemFont(ofSize: 14, weight: .medium) {
        didSet { remeasure() }
    }

    var totalWidth: CGFloat { characterWidths.reduce(0, +) }

    /// 显示用的那一段（窗口内的）。
    var displayedText: String { String(text.dropFirst(windowStart)) }

    /// 识别结果到达。**这里是"改写"的入口** —— 增量流会把同一句反复重发。
    func update(text newText: String) {
        guard newText != text else { return }
        let previousDisplayed = displayedText
        text = newText
        slideWindowIfNeeded()
        remeasure()
        // **权威状态钳回公共前缀**：已滚过的区域被改写时，索引可能指向别的内容。
        // 最多回退一个字宽，而且钳完一定合法 —— 所以"整行空"在结构上不可能出现。
        scrollState.clampToCommonPrefix(
            TranscriptTextMeasurement.commonPrefixLength(previousDisplayed, displayedText))
    }

    /// 窗口太长时从左边丢掉一批（只丢已经滚过去的，所以屏幕上看不出来）。
    private func slideWindowIfNeeded() {
        let total = text.count
        guard total - windowStart > Self.maximumWindowCharacters + Self.trimHysteresisCharacters
        else { return }
        let newStart = total - Self.maximumWindowCharacters
        let dropped = newStart - windowStart
        windowStart = newStart
        scrollState.shiftLeft(by: dropped)
    }

    private func remeasure() {
        characterWidths = TranscriptTextMeasurement.characterWidths(of: displayedText, font: font)
        scrollState.clampToCommonPrefix(min(scrollState.consumedCharacters, characterWidths.count))
    }

    func reset() {
        text = ""
        windowStart = 0
        characterWidths = []
        scrollState.reset()
    }

    // MARK: - 给渲染层的三个动作（`scrollState` 对外只读，改只走这三个口子）

    /// 把渲染出来的真实位置同步回字符索引（幂等）。
    func syncScroll(toConsumedPoints points: CGFloat) {
        scrollState.sync(toConsumedPoints: points, characterWidths: characterWidths)
    }

    /// 往前滚一段。
    func advanceScroll(byPoints points: CGFloat) {
        scrollState.advance(byPoints: points, characterWidths: characterWidths)
    }

    /// 硬快进到末尾。
    func jumpScrollToEnd() {
        scrollState.jumpToEnd(characterWidths: characterWidths)
    }

    func contentOffsetX(viewWidth: CGFloat) -> CGFloat {
        scrollState.contentOffsetX(viewWidth: viewWidth, characterWidths: characterWidths)
    }

    func pendingPoints(viewWidth: CGFloat) -> CGFloat {
        scrollState.pendingPoints(viewWidth: viewWidth, characterWidths: characterWidths)
    }
}

/// 那一行的层：一个容器 + 一个文字层，位移动画跑在渲染服务器上。
@MainActor
final class TranscriptMarqueeLayer: CALayer {

    private let feed: TranscriptMarqueeFeed
    private let textLayer = CATextLayer()
    private var scheduler = TranscriptScrollScheduler()

    /// 每次重设动画覆盖的时间窗（秒）。
    ///
    /// 越小 → 对排队变化的响应越快，但主线程重设越频繁；
    /// 越大 → 越抗卡顿（主线程可以卡这么久而滚动完全不受影响）。
    /// **0.25s 是两者的平衡点**：主线程卡四分之一秒，滚动一帧都不会少。
    private let horizon: CFTimeInterval = 0.25

    /// 低频校正定时器。**这是"保活"，不是"驱动"**：两次重设之间的位移由渲染服务器
    /// 自己走，这个 10Hz 的表只负责在有新排队量时把目标往前挪。
    private var refreshTimer: Timer?
    private var lastRetargetAt = CACurrentMediaTime()

    init(feed: TranscriptMarqueeFeed) {
        self.feed = feed
        super.init()
        masksToBounds = true
        // 让子层的 y 轴像 UIKit 一样向下 —— CATextLayer 才从**上边**开始画字。
        isGeometryFlipped = true
        textLayer.isWrapped = false
        textLayer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        // 文字**不进动画事务**：动画只挂在它的 transform 上。否则 Core Animation 会把
        // "旧字→新字"也当成可动画的变化，两层字同时画 = 叠影（SwiftUI 那版踩过同一条）。
        textLayer.actions = ["contents": NSNull(), "string": NSNull()]
        addSublayer(textLayer)
    }

    override init(layer: Any) {
        self.feed = (layer as? TranscriptMarqueeLayer)?.feed ?? TranscriptMarqueeFeed()
        super.init(layer: layer)
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - 生命周期

    func start() {
        let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.retargetAnimation() }
        }
        // .common 模式：滚动、拖拽、菜单弹出期间也照跑（默认模式会被这些交互挡住）。
        RunLoop.main.add(timer, forMode: .common)
        refreshTimer = timer
        lastRetargetAt = CACurrentMediaTime()
        retargetAnimation()
    }

    func stop() {
        refreshTimer?.invalidate()
        refreshTimer = nil
        textLayer.removeAnimation(forKey: "scroll")
    }

    /// 文本或尺寸变了：更新文字层，并立刻重设一次动画。
    func refresh(animated: Bool = true) {
        updateTextLayerContents()
        if animated { retargetAnimation() } else { snapToRestingPosition() }
    }

    private func updateTextLayerContents() {
        let lineHeight = ceil(feed.font.ascender - feed.font.descender + feed.font.leading)
        textLayer.string = NSAttributedString(
            string: feed.displayedText,
            attributes: [.font: feed.font,
                         .foregroundColor: NSColor.white])
        textLayer.frame = CGRect(
            x: 0,
            y: max(0, (bounds.height - lineHeight) / 2),
            width: max(feed.totalWidth, bounds.width),
            height: min(lineHeight, max(bounds.height, lineHeight)))
    }

    // MARK: - 核心：把位移交给渲染服务器

    private func retargetAnimation() {
        guard bounds.width > 0 else { return }
        updateTextLayerContents()

        let now = CACurrentMediaTime()
        let elapsed = max(0.001, now - lastRetargetAt)
        lastRetargetAt = now

        // ① 真实显示位置：**问渲染服务器**，主线程卡顿期间它一直在走。
        //    模型值在动画进行中是"目标"不是"当前位置"，拿它当起点会让画面回跳。
        let renderedX = presentationX()

        // ② 把渲染位置同步回字符索引（幂等）——两侧因此永远不会累积误差。
        let consumedPoints = bounds.width - feed.totalWidth - renderedX
        feed.syncScroll(toConsumedPoints: consumedPoints)

        // ③ 调度：这一窗该滚多快。
        let pending = feed.pendingPoints(viewWidth: bounds.width)
        switch scheduler.tick(pendingPoints: pending, viewWidth: bounds.width,
                              elapsedSeconds: elapsed) {
        case .idle:
            snapToRestingPosition()
        case .jumpToEnd:
            jumpToEnd()
        case .scroll(_, let points):
            animateScroll(byPoints: points)
        }
    }

    /// 文字层当前的**呈现位置**（渲染服务器上的真实 x）。没有动画在跑时回落到模型值。
    private func presentationX() -> CGFloat {
        if let presented = textLayer.presentation() {
            return presented.transform.m41
        }
        return textLayer.transform.m41
    }

    /// 滚 `points` 个 pt：一段线性动画，`horizon` 秒内走完。
    private func animateScroll(byPoints points: CGFloat) {
        guard points > 0.01 else { return }
        let from = presentationX()
        // ④ 位置由**权威状态**现算，不由"上一个位置 + 本窗位移"累积 ——
        //    这正是"主线程卡多久都不漂"的原因。
        feed.advanceScroll(byPoints: points)
        let target = feed.contentOffsetX(viewWidth: bounds.width)
        // 不要冲过终点（越过之后会回弹，那也是一眼能看出来的抖动）。
        let resting = max(0, bounds.width - feed.totalWidth)
        let to = max(min(target, from), resting)

        guard abs(to - from) > 0.05 else { return }

        let animation = CABasicAnimation(keyPath: "transform.translation.x")
        animation.fromValue = from
        animation.toValue = to
        animation.duration = horizon
        // **线性 = 等速**（Core Animation 里唯一的写法）。
        animation.timingFunction = CAMediaTimingFunction(name: .linear)
        animation.isRemovedOnCompletion = false
        animation.fillMode = .forwards
        animation.beginTime = CACurrentMediaTime()

        CATransaction.begin()
        CATransaction.setDisableActions(true)   // 模型值直接落到终点，不额外补一段隐式动画
        textLayer.add(animation, forKey: "scroll")
        textLayer.transform = CATransform3DMakeTranslation(to, 0, 0)
        CATransaction.commit()
    }

    /// 停在它该停的地方（已追上 / 没有任何可滚的）。
    private func snapToRestingPosition() {
        let resting = feed.contentOffsetX(viewWidth: bounds.width)
        guard abs(presentationX() - resting) > 0.05 || textLayer.animation(forKey: "scroll") != nil
        else { return }
        textLayer.removeAnimation(forKey: "scroll")
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        textLayer.transform = CATransform3DMakeTranslation(resting, 0, 0)
        CATransaction.commit()
    }

    /// 硬快进兜底：排队超过两屏时放弃连续，直接跳到末尾。
    ///
    /// **代价用一次淡出掩盖**（0.15 秒的不透明脉冲）—— 一次跳变若没有任何遮掩，
    /// 用户会以为程序出错了；而"落后两屏"是他明确接受上限之外的情况。
    private func jumpToEnd() {
        feed.jumpScrollToEnd()
        let resting = max(0, bounds.width - feed.totalWidth)

        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.35
        fade.toValue = 1.0
        fade.duration = 0.15
        fade.timingFunction = CAMediaTimingFunction(name: .easeOut)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        textLayer.removeAnimation(forKey: "scroll")
        textLayer.add(fade, forKey: "jumpFade")
        textLayer.transform = CATransform3DMakeTranslation(resting, 0, 0)
        CATransaction.commit()
    }
}

/// SwiftUI 宿主。宽度来自布局，每次 text / 宽度变化就通知层重设一次。
struct TranscriptMarqueeView: NSViewRepresentable {

    @ObservedObject var feed: TranscriptMarqueeFeed

    func makeNSView(context: Context) -> NSView {
        let host = NSView()
        host.wantsLayer = true
        let marquee = TranscriptMarqueeLayer(feed: feed)
        marquee.frame = host.bounds
        host.layer?.addSublayer(marquee)
        context.coordinator.marquee = marquee
        marquee.start()
        return host
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        guard let marquee = context.coordinator.marquee else { return }
        if marquee.frame != nsView.bounds {
            marquee.frame = nsView.bounds
            context.coordinator.lastWidth = nsView.bounds.width
            marquee.refresh()
            return
        }
        if context.coordinator.lastText != feed.text {
            context.coordinator.lastText = feed.text
            marquee.refresh()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var marquee: TranscriptMarqueeLayer?
        var lastText: String?
        var lastWidth: CGFloat = 0
    }
}
