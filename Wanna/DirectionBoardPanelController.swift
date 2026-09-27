//
//  DirectionBoardPanelController.swift
//  Wanna
//
//  **「任务方向看板」住的那块窗口**（2026-09-27）。
//
//  配方抄两个先例，各有各的理由：
//  · `AgentHUDController` —— **可点击、并且按内容重设尺寸**的那块面板（看板的内容会随 AI 回来
//    的那段话变长变短，所以尺寸必须跟着走）；
//  · `NotchListeningTranscriptPanel` —— 它那个 `canBecomeKey` 子类：输入框要收得到键盘。
//
//  ### 三条必须守住的分寸
//
//  1. **显示时不抢焦点**：`orderFrontRegardless()`，绝不 `makeKey()`。这块板子出现的时刻正是用户
//     在别的 App 里说话/打字的时候，抢一次 key 就够他把正在输入的东西丢掉。
//     `becomesKeyOnlyIfNeeded = true` —— 只有"点了输入框"这种真的需要键盘的操作才会让它成为 key。
//  2. **右上角钉住**：`show()` 那一刻把鼠标位置记下来当锚点，之后内容变高变矮都只重算原点
//     （`right - width, top - height`）—— 否则 AI 的说明一长，整块板子会往上滑一下。
//  3. **紧贴内容**：面板的矩形 = 视图量出来的尺寸，不留透明边 —— 留了的话点击会落在空处，
//     用户会以为按钮坏了（而这块面板是**吃点击**的，与那块点穿的遮罩不一样）。
//
//  刘海面板展开时它整个不出现（与右下角那张结果卡片同一条规矩，见 `sync(isVisible:)` 的调用方）。
//

import AppKit
import SwiftUI

@MainActor
final class DirectionBoardPanelController {

    static let shared = DirectionBoardPanelController()
    private init() {}

    private var panel: NSPanel?
    private var hostingView: NSHostingView<DirectionBoardView>?
    /// 显示那一刻的鼠标位置：**只看这一次**（用户：「位置固定，不随鼠标移动」）。
    private var anchorPoint: CGPoint?
    /// 已经摆好的内容尺寸 —— 用来给 `onPreferenceChange` 去重，避免"改尺寸 → 重新布局 → 再改尺寸"。
    private var lastLaidOutSize: CGSize = .zero
    private var isVisible = false

    // MARK: - 显示 / 收起

    /// 由 `NotchWindowController.syncListeningTranscriptPanel()` 驱动 —— **与刘海那行字幕同一个判据**。
    /// - Parameter isSheetExpanded: 刘海面板正铺开 —— 那时**整块不显示**（那块面板盖住全屏，
    ///   看板在它下面根本看不见；与右下角那张结果卡片同一条规矩）。由调用方传进来，
    ///   面板控制器不去猜刘海的状态。
    func sync(isVisible shouldBeVisible: Bool, isSheetExpanded: Bool) {
        guard AppSettingsStore.snapshot().directionBoardEnabled else {
            if isVisible { hide() }
            return
        }
        if shouldBeVisible && !isSheetExpanded {
            show()
        } else {
            hide()
        }
    }

    /// 自检（见 `DirectionBoardSession.selfCheckMode`）：没有麦克风也要把看板摆到屏幕上。
    func startSelfCheckIfRequested() {
        guard DirectionBoardSession.selfCheckMode != nil else { return }
        print("🎛️ 方向看板自检：把面板拉起来（不发请求）")
        show()
    }

    private func show() {
        guard !isVisible else { return }
        isVisible = true
        // 锚点取一次。没有鼠标事件过（比如自检注入）时退回鼠标当前位置。
        let mouse = NSEvent.mouseLocation
        anchorPoint = mouse
        lastLaidOutSize = .zero

        let panel = makePanel()
        self.panel = panel
        panel.orderFrontRegardless()
        // 先按一个保守的尺寸摆一次；视图量准之后 `handleMeasuredSize` 会把面板改到位。
        handleMeasuredSize(CGSize(width: DirectionBoardView.cardWidth, height: 220))
    }

    private func hide() {
        guard isVisible else { return }
        isVisible = false
        panel?.orderOut(nil)
        panel = nil
        hostingView = nil
        anchorPoint = nil
    }

    /// 屏幕参数变了（插拔显示器、分辨率）：重新锚一次。
    func rebuildForCurrentScreens() {
        guard isVisible else { return }
        hide()
        show()
    }

    // MARK: - 那块窗口

    private func makePanel() -> NSPanel {
        let panel = DirectionBoardPanel(
            contentRect: NSRect(x: 0, y: 0,
                                width: DirectionBoardView.cardWidth, height: 220),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false      // 阴影由 SwiftUI 画（与右下角那张卡片同一处，规格一致）
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        // **在结果卡片之上、在刘海那条带子之下。** 带子走 `.popUpMenu`（见
        // `notchTranscriptPanelWindowLevel`），所以这里取刘海面板那一档就正好夹在中间。
        panel.level = NotchSupport.notchPanelWindowLevel
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        // 只有真需要键盘（点输入框）时才成为 key —— 平时绝不抢用户正在用的那个 App。
        panel.becomesKeyOnlyIfNeeded = true

        let settings = AppSettingsStore.snapshot()
        let hostingView = NSHostingView(rootView: DirectionBoardView(
            session: .shared,
            configuration: DirectionBoardConfiguration.validated(settings.directionBoard),
            theme: AnswerCardTheme(style: settings.answerCardStyle),
            onInputFocused: { [weak panel] in
                // 用户点了输入框：这时候要键盘，成为 key 是**他的**意思。
                panel?.makeKey()
            },
            onMeasuredSize: { [weak self] size in
                self?.handleMeasuredSize(size)
            }))
        // **必须置空**：默认的 `.standardBounds` 会绕开我们算好的 frame 按内容改窗口尺寸
        //（录音那条带踩过：设好帧 82ms 后被改掉，屏幕上是"右上角甩一下"）。
        hostingView.sizingOptions = []
        panel.contentView = hostingView
        self.hostingView = hostingView

        return panel
    }

    /// 内容量出来了（或者变了）：把面板调成一样大，**右上角一个像素都不动**。
    private func handleMeasuredSize(_ size: CGSize) {
        guard isVisible, let panel, let anchorPoint else { return }
        let width = max(size.width, DirectionBoardView.cardWidth)
        let height = max(size.height, 1)
        guard abs(width - lastLaidOutSize.width) > 0.5 || abs(height - lastLaidOutSize.height) > 0.5 else { return }
        lastLaidOutSize = CGSize(width: width, height: height)

        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(anchorPoint) })
                ?? NSScreen.main else { return }
        let frame = NotchSupport.directionBoardPanelFrame(
            anchor: anchorPoint, size: CGSize(width: width, height: height), on: screen)
        panel.setFrame(frame, display: true)
    }
}

/// 允许成为 key 的无边框面板（看板上的输入框要收键盘）。
///
/// 与 `NotchListeningTranscriptPanel` 同一个形状 —— 不能成为 key 的面板会**静默**吞掉每一次按键。
/// 但这里配了 `becomesKeyOnlyIfNeeded = true`：不是"一出现就是 key"，而是"点了输入框才是"。
private final class DirectionBoardPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}
