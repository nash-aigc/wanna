//
//  RealtimeWindow.swift
//  Wanna
//
//  ⭐ **实时窗口**（2026-09-29）：说话时点刘海左侧那颗「Listening」打开的那块大面板。
//
//  它**取代**了原来"鼠标右上角那块 7 字形看板"（`DirectionBoardView` + `DirectionBoardPanelController`，
//  2026-09-29 整块删除）。用户对这次改动的原话：
//
//  · 「实时模式下，右上角卡片的**实现逻辑 = 完全不变**，只是**调整卡片内容显示的位置**」；
//  · 「**只有点击 listening，才需要发送 API 等内容**……在不点击 listening 的时候，
//    **无论用户是否说话，是否停顿，都不发送，处于停止状态**」；
//  · 「窗口**持续显示 = 持续让程序运行**……窗口关闭，**保留之前的回复结果**……
//    再次打开窗口显示之前的结果，然后继续发送，获取最新结果。关闭后，**对应的请求停止运行**」；
//  · 排版照他给的图 2：三列（窄 ｜ 宽 ｜ 窄）+ 底部一条（见 `需求/05-实时窗口-三列布局.md`）。
//
//  ## 两条接线上的分寸
//
//  1. **窗口的开合是"这条链的开关"**：`DirectionBoardSession.setWindowOpen(_:)` ——
//     节拍表跟着它起落、`requestIfTheTranscriptChanged` 拿它当第一道闸门。
//     所以这个控制器只做一件事：把 `session.isWindowOpen` 翻译成面板的显示/收起。
//  2. **它和"一大轮结束"解耦**（刻意）：`endBigRound` 只清内容、不碰窗口 ——
//     否则"按 ESC 清空"会把用户刚打开的窗口一起收掉。
//
//  ## 窗口几何
//
//  宽 = 屏宽 × 80%、高 = 屏高 × 70%，**水平居中、顶边从刘海下沿往下**（用户 2026-09-29 选的）。
//  面板**建好一次永不改尺寸** —— 这是这个仓库在透明窗口上最贵的一条教训：几何在 CA 提交
//  之前就改了，中间那一瞬新露出来的区域是空的、桌面会透出来（录音那条带报过"背景穿透"）。
//

import AppKit
import Combine
import SwiftUI

// MARK: - 视图（三列 + 底部一条）

struct RealtimeWindowView: View {

    @ObservedObject var session: DirectionBoardSession
    @ObservedObject var transcript: NotchListeningTranscriptModel
    /// 这一轮带了哪些参考材料（屏幕一/二…、剪贴板、文件、文件夹）—— 采集器说了算。
    @ObservedObject var referenceCollector: TurnReferenceCollector = .shared

    let panelWidth: CGFloat
    let panelHeight: CGFloat

    /// 三列的宽度比（窄 ｜ 宽 ｜ 窄 —— 用户图 2 的形状）。
    static let sideColumnFraction: CGFloat = 0.22
    /// 底部「回复结果」那一块的高度。
    static let answerStripHeight: CGFloat = 132

    private var sideColumnWidth: CGFloat { (panelWidth * Self.sideColumnFraction).rounded() }
    private var middleColumnWidth: CGFloat { panelWidth - sideColumnWidth * 2 }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                leftColumn
                    .frame(width: sideColumnWidth)
                divider
                middleColumn
                    .frame(width: middleColumnWidth)
                divider
                rightColumn
                    .frame(width: sideColumnWidth)
            }
            .frame(maxHeight: .infinity)

            divider
            answerStrip
                .frame(height: Self.answerStripHeight)
        }
        .frame(width: panelWidth, height: panelHeight)
        .background(EmbossMaterial.page)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(DS.Colors.borderSubtle.opacity(0.9), lineWidth: 1)
        )
    }

    private var divider: some View {
        Rectangle().fill(DS.Colors.borderSubtle).frame(width: 1)
    }

    // MARK: 左列 —— 矛盾 / 疑问

    private var leftColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            block(title: "矛盾", value: understandingValue("矛盾"), tint: DS.Colors.warning)
            Rectangle().fill(DS.Colors.borderSubtle).frame(height: 1)
            block(title: "疑问", value: understandingValue("疑问"), tint: DS.Colors.accent)
        }
    }

    private func block(title: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
            Text(value.isEmpty ? "—" : value)
                .font(.system(size: 12.5))
                .foregroundStyle(EmbossMaterial.textPrimary.opacity(value.isEmpty ? 0.35 : 1))
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(12)
        // **两块各占一半、总高固定**（用户反复要的「不要让高度总是晃」）：
        // 内容多了内部裁掉，而不是把整块窗口撑变形。
        .frame(maxHeight: .infinity, alignment: .top)
        .clipped()
    }

    /// 那几行"理解"里某一行的值（`DirectionBoardPrompt.parseUnderstandingLines` 保证行恒在）。
    private func understandingValue(_ label: String) -> String {
        session.understandingLines.first { $0.label == label }?.value ?? ""
    }

    // MARK: 中列 —— 转写（可编辑） / 参考 / Harness

    private var middleColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            transcriptEditor
            Rectangle().fill(DS.Colors.borderSubtle).frame(height: 1)
            referenceRow
                .frame(height: 30)
            Rectangle().fill(DS.Colors.borderSubtle).frame(height: 1)
            harnessSection
                .frame(height: 92)
        }
    }

    /// **转写就是提示词**（用户 2026-09-29：「字幕 = 提示词，这个你必须理解」）——
    /// 所以它在这里是**可编辑**的，改过的字由 `consumeEditedTranscript()` 顶替识别结果发出去。
    private var transcriptEditor: some View {
        TextEditor(text: Binding(
            get: { transcript.editorText },
            set: { transcript.applyEditedText($0) }))
            .font(.system(size: 20, weight: .medium))
            .foregroundStyle(EmbossMaterial.textPrimary)
            .lineSpacing(8)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxHeight: .infinity)
    }

    /// **参考那一行**：一条、无边框、段间一条 1pt 纯白细线、**最近拿到的那一份底色点亮成绿色**
    ///（用户 2026-09-28 定的样式，2026-09-29 从横杠下沿搬到这里）。
    private var referenceRow: some View {
        let obtained = referenceCollector.materials.tags
        let unresolved = referenceCollector.materials.unresolved
        return HStack(spacing: 0) {
            ForEach(Array(obtained.enumerated()), id: \.offset) { index, tag in
                if index > 0 { separator }
                let isNewest = index == obtained.count - 1
                Text(tag)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(isNewest ? DS.Colors.success : EmbossMaterial.textPrimary.opacity(0.55))
                    .padding(.horizontal, 10)
                    .frame(maxHeight: .infinity)
                    .background(isNewest ? DS.Colors.success.opacity(0.30) : Color.clear)
            }
            ForEach(Array(unresolved.enumerated()), id: \.offset) { index, label in
                if index > 0 || !obtained.isEmpty { separator }
                Text("无法识别：" + label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DS.Colors.warning)
                    .padding(.horizontal, 10)
                    .frame(maxHeight: .infinity)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
    }

    private var separator: some View {
        Rectangle().fill(Color.white.opacity(0.20)).frame(width: 1)
    }

    /// ⭐ **Harness：命中模式**（用户 2026-09-29：「harness 切换成：**命中模式**，
    /// 而不是持续显示模式」＋「**只显示命中的**……显示多个显示 3 行：分别是：执行前、执行中、执行后」）。
    ///
    /// **只画命中的** —— 与它取代的那一版（整棵树常显、命中的白、没命中的灰）**相反**。
    /// 一个都没命中的那一组**整行不画**。
    private var harnessSection: some View {
        let summary = session.matchedHarness
        let catalog = session.harnessCatalogForDisplay
        return VStack(alignment: .leading, spacing: 4) {
            Text("Harness")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(EmbossMaterial.textPrimary.opacity(0.75))
            ForEach(catalog.phases, id: \.self) { phase in
                let keywords = matchedKeywords(inPhase: phase, summary: summary, catalog: catalog)
                if !keywords.isEmpty {
                    Text("\(phase)：\(keywords.joined(separator: " · "))")
                        .font(.system(size: 11.5))
                        .foregroundStyle(DS.Colors.success)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .clipped()
        .animation(.easeOut(duration: 0.25), value: summary)
    }

    /// 某一组（执行前 / 执行中 / 执行后）里**命中的那些关键词**，按清单自己的顺序。
    private func matchedKeywords(inPhase phase: String,
                                 summary: HarnessMatchSummary,
                                 catalog: HarnessCapabilityCatalog) -> [String] {
        catalog.groups.filter { $0.phase == phase }.flatMap { group -> [String] in
            let matched = summary.matchedKeywords(inGroup: group.id)
            return group.items.map(\.keyword).filter { matched.contains($0) }
        }
    }

    // MARK: 右列 —— 总结（你问过的每一件事）

    private var rightColumn: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("总结")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(EmbossMaterial.textPrimary.opacity(0.75))
            Text(mindMapValue.isEmpty ? "—" : mindMapValue)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(EmbossMaterial.textPrimary.opacity(mindMapValue.isEmpty ? 0.35 : 0.92))
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxHeight: .infinity, alignment: .top)
        .clipped()
    }

    /// 那棵树住在「细节」这一行里（`DirectionBoardPrompt.mindMapLabel`）。
    /// 列名以前叫「问题」，2026-09-29 按用户图 2 改成「总结」。
    private var mindMapValue: String {
        session.understandingLines.first { $0.label == DirectionBoardPrompt.mindMapLabel }?.value ?? ""
    }

    // MARK: 底部 —— 回复结果（独立 API 调用，流式）

    private var answerStrip: some View {
        let answer = session.previewAnswer ?? ""
        return VStack(alignment: .leading, spacing: 6) {
            Text("回复结果")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(EmbossMaterial.textPrimary.opacity(0.75))
            if answer.isEmpty {
                Text("—")
                    .font(.system(size: 13))
                    .foregroundStyle(EmbossMaterial.textPrimary.opacity(0.35))
            } else {
                ScrollView {
                    Text(answer)
                        .font(.system(size: 15))
                        .foregroundStyle(EmbossMaterial.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .textSelection(.enabled)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

// MARK: - 它住的那块窗口

@MainActor
final class RealtimeWindowController {

    static let shared = RealtimeWindowController()
    private init() {}

    private var panels: [NSPanel] = []
    private var cancellables: Set<AnyCancellable> = []
    private var isPresented = false

    /// ⌘⏎ = 粘贴到光标处并退出；⌥⏎ = 执行（交给主 Agent）—— 由 `CompanionManager` 注入
    ///（与 `voiceIdleProvider` 同一个先例：跨子系统只走注入的闭包）。
    var pasteReplyAtCursorAndExitAction: (() -> Void)?
    var executeAction: (() -> Void)?

    /// 键盘拦截（会吞事件的那一条）—— 见 `installConsumingKeyTap`。
    private var keyTap: CFMachPort?
    private var keyTapSource: CFRunLoopSource?
    private var lastInteractionAt: Date?

    /// 「现在该不该让位」（别的 App 全屏盖住了刘海）—— 由 `NotchWindowController` 注入。
    /// 与刘海自己那两个 pill 同一条规矩：屏幕被全屏 App 盖住时一起收起来。
    var isSuppressedProvider: (() -> Bool)?

    // MARK: 生命周期

    /// 订阅 `isWindowOpen` —— **显示与否只看它**（用户点开/点关），与相位无关。
    func bind() {
        guard cancellables.isEmpty else {
            applyWindowState()
            return
        }
        DirectionBoardSession.shared.$isWindowOpen
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.applyWindowState() }
            .store(in: &cancellables)
        applyWindowState()
    }

    private func applyWindowState() {
        let shouldShow = DirectionBoardSession.shared.isWindowOpen
            && !(isSuppressedProvider?() ?? false)
        if shouldShow {
            show()
        } else {
            hide()
        }
    }

    /// 屏幕参数变了：面板的矩形要按新屏幕重算。
    func rebuildForCurrentScreens() {
        guard isPresented else { return }
        hide()
        show()
    }

    func hide() {
        guard isPresented else { return }
        isPresented = false
        removeConsumingKeyTap()
        for panel in panels { panel.orderOut(nil) }
        panels.removeAll()
    }

    private func show() {
        guard !isPresented else { return }
        isPresented = true
        for screen in NSScreen.screens {
            guard let panel = makePanel(for: screen) else { continue }
            panel.orderFrontRegardless()
            panels.append(panel)
        }
        installConsumingKeyTap()
    }

    // MARK: 几何

    /// 宽 = 屏宽 × 0.8、高 = 屏高 × 0.7，**水平居中、顶边从刘海下沿往下**（用户 2026-09-29 选的）。
    private func panelFrame(for screen: NSScreen) -> CGRect? {
        guard let notch = NotchSupport.notchRect(on: screen) else { return nil }
        let width = min(screen.frame.width * 0.8, screen.frame.width - 40)
        let height = min(screen.frame.height * 0.7, screen.frame.height - notch.height - 40)
        let notchCenterX = screen.frame.minX + notch.minX + notch.width / 2
        return CGRect(x: notchCenterX - width / 2,
                      y: screen.frame.maxY - notch.height - height,
                      width: width,
                      height: height)
    }

    private func makePanel(for screen: NSScreen) -> NSPanel? {
        guard let frame = panelFrame(for: screen) else { return nil }

        // 必须能成为 key：中间那一列转写是**可编辑的**，收不到键盘就等于"这里不能输入"
        //（没有输入框的无边框面板会**静默**吞掉每一个按键）。
        let panel = RealtimeWindowPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.level = NotchSupport.notchTranscriptPanelWindowLevel
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isMovable = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        // 点了它才算"他在跟窗口打交道"（自动发送那一下据此按住不发）。
        panel.onBecameKey = { [weak self] in self?.lastInteractionAt = Date() }

        let hostingView = NSHostingView(rootView: RealtimeWindowView(
            session: .shared,
            transcript: .shared,
            panelWidth: frame.width,
            panelHeight: frame.height))
        // **必须置空**：`.standardBounds` 会绕开 Auto Layout 按内容固有尺寸改窗口，
        // 把这里算好的帧当场作废（录音那条带实测被改掉过）。
        hostingView.sizingOptions = []
        hostingView.frame = CGRect(origin: .zero, size: frame.size)
        panel.contentView = hostingView
        return panel
    }

    /// 收起 / 展开面板时把它变成 key（要收键盘）/ 让回焦点。
    ///
    /// ⚠️ **只在"用户真的点了中间那一列"时才 makeKey** —— 与看板那次的教训同一条：
    /// 一显示就 `makeKey()` 会让它成为整个会话的 key window，用户在别的 App 里**打不了字**
    ///（`开发经验/20` 9.55）。这里由转写编辑框自己请求（`TextEditor` 拿到点击时才需要 key），
    /// 而 AppKit 对 `.nonactivatingPanel` + 点击输入控件会自动给 key。
    func noteInputInteraction() {
        lastInteractionAt = Date()
    }

    /// **他正在跟这个窗口打交道吗** —— 静音自动发送那一下据此按住不发。
    ///
    /// 判据是"鼠标在窗口上"或"2 秒内交互过"。⚠️ **不用"面板是 key"**：那个判据是
    /// `makeKey()` 时代的产物，而它一旦恒为真，静音自动发送就**永远发不出去**
    ///（`开发经验/20` 9.55 与 `开发经验/10` D39）。
    func holdsTheAutomaticSend() -> Bool {
        guard isPresented else { return false }
        if let panel = panels.first, panel.frame.contains(NSEvent.mouseLocation) { return true }
        if let lastInteractionAt, Date().timeIntervalSince(lastInteractionAt) < 2 { return true }
        return false
    }

    // MARK: 全局按键拦截（⌘⏎ 粘贴 / ⌥⏎ 执行）

    /// **为什么必须"拦截"而不是"监听"**（2026-09-27 实测）：这块面板是 `.nonactivatingPanel`，
    /// 它可以是 key，**但系统只把键盘事件送给"当前激活的那个 App"** —— Wanna 从不成为激活 App，
    /// 所以本地监听一个事件都收不到。要用一条**会吞事件的** CGEvent tap，只在窗口开着时装上。
    private func installConsumingKeyTap() {
        guard keyTap == nil else { return }
        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        let callback: CGEventTapCallBack = { _, type, event, refcon in
            guard let refcon else { return Unmanaged.passUnretained(event) }
            let controller = Unmanaged<RealtimeWindowController>.fromOpaque(refcon)
                .takeUnretainedValue()
            return controller.handleKeyTap(type: type, event: event)
        }
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap,
                                          place: .headInsertEventTap,
                                          options: .defaultTap,
                                          eventsOfInterest: mask,
                                          callback: callback,
                                          userInfo: Unmanaged.passUnretained(self).toOpaque()) else {
            MainFlowDiagnostics.log("⌨️ 实时窗口：全局按键拦截装不上（辅助功能权限？）")
            return
        }
        keyTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        keyTapSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func removeConsumingKeyTap() {
        if let keyTap {
            CGEvent.tapEnable(tap: keyTap, enable: false)
            CFMachPortInvalidate(keyTap)
        }
        if let keyTapSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), keyTapSource, .commonModes)
        }
        keyTap = nil
        keyTapSource = nil
    }

    private nonisolated func handleKeyTap(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        // 看门狗：系统会因为回调太慢把 tap 关掉 —— 不重新打开，它就**静默失效**了。
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            MainActor.assumeIsolated {
                if let keyTap { CGEvent.tapEnable(tap: keyTap, enable: true) }
            }
            return Unmanaged.passUnretained(event)
        }
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        guard keyCode == 36 else { return Unmanaged.passUnretained(event) }   // 36 = Return
        let isCommand = event.flags.contains(.maskCommand)
        let isOption = event.flags.contains(.maskAlternate)
        let isShift = event.flags.contains(.maskShift)
        let shouldConsume = MainActor.assumeIsolated { () -> Bool in
            guard isPresented else { return false }
            return performReturnKeyAction(isCommand: isCommand, isOption: isOption, isShift: isShift)
        }
        // **只有真的做了那两件事之一才吞掉**：裸回车原样放行 —— 窗口开着期间白白吃掉
        // 用户在别的 App 里的回车，是没有理由的。
        return shouldConsume ? nil : Unmanaged.passUnretained(event)
    }

    /// 这一下回车做了什么；返回**要不要把这一下吞掉**。
    /// ⌥⏎ = 执行（交给主 Agent）、⌘⏎ = 粘贴；**裸回车不吞**。
    @discardableResult
    private func performReturnKeyAction(isCommand: Bool, isOption: Bool, isShift: Bool) -> Bool {
        if isShift { return false }
        let action = AppSettingsStore.snapshot().boardPasteShortcut
            .action(isCommand: isCommand, isOption: isOption)
        MainFlowDiagnostics.log("⌨️ 实时窗口：回车 → "
                                + (action == .paste ? "粘贴并退出"
                                   : action == .execute ? "执行（转 agent）" : "放行（不吞）"))
        switch action {
        case .paste:
            pasteReplyAtCursorAndExitAction?()
            return true
        case .execute:
            executeAction?()
            return true
        case .passThrough:
            return false
        }
    }
}

/// 允许成为 key 的无边框面板（中间那一列转写是可编辑的，要收键盘）。
private final class RealtimeWindowPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    /// 成为 key 的那一下报一声（"他点进来了"）。
    var onBecameKey: (() -> Void)?
    override func becomeKey() {
        super.becomeKey()
        onBecameKey?()
    }
}
