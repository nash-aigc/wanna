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
//  ### 尺寸归 SwiftUI、位置归我们（2026-09-27 量出来的根因，别改回去）
//
//  原来这里和 `NotchListeningTranscriptPanel` 一样：`sizingOptions = []` 挡住 SwiftUI 改窗口尺寸，
//  由 SwiftUI 那个 `GeometryReader` 偏好量出内容高度、我们 `setFrame` 摆位。**在这块面板上不成立**：
//  `sample`/栈探针量到窗口在 `setFrame` 之后**被 SwiftUI 自己改掉**，调用方是
//
//      SwiftUI.NSHostingView.updateAnimatedWindowSize(_:)  ←  NSHostingView.windowDidLayout()
//
//  它按内容的固有尺寸 `setFrame`，而且**保持顶边** —— 于是内容一长高，窗口就往下长：
//  实测 672,330,680×220（我们放的）→ 672,135,680×196 → 672,32,680×299 → **672,-7,680×338**
//  （y 是 AppKit，-7 就是底边掉到屏幕外面 15pt），屏幕上卡片最下面那行「取消本次/十分钟/今日」
//  被屏幕下沿切掉一半。
//
//  同一个配方在别处没这个问题，所以是这块面板独有的：探针（`scripts/panel-sizing-probe.swift`）
//  里 `sizingOptions = []` **确实**能让窗口一动不动 —— 差别在这块卡片的根视图带一个
//  `GeometryReader` 偏好（View 用它把自然尺寸报上来），SwiftUI 于是照固有尺寸改窗口。
//  **结论：不要跟 SwiftUI 抢尺寸。** 让它按内容把窗口撑到该有的大小，我们只在**尺寸变化之后
//  重新摆位**（`repositionForCurrentSize()`），位置永远是"锚点 + 夹进屏幕"算出来的那一个。
//  顶边被 SwiftUI 往下带、我们再把它挪回去的净效果就是用户要的「左下角固定、内容往上长」。
//

import AppKit
import Combine
import SwiftUI

@MainActor
final class DirectionBoardPanelController {

    static let shared = DirectionBoardPanelController()
    private init() {
        // **"他到底开口了没有"要单独看**（2026-09-27 用户报的：没说话也挂着）。
        //
        // 相位是必要条件不是充分条件：回答之后的 30 秒追问窗口里相位一直是 `.listening`，
        // 而那 30 秒里他可能一个字都没说 —— 那块板子就那么杵在屏幕上，很碍事。
        // 判据改成"**刘海下面那行字幕里有字**"：有字 = 他真的在说话。
        NotchListeningTranscriptModel.shared.$liveText
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.applyVisibility() }
            .store(in: &cancellables)
    }

    private var cancellables: Set<AnyCancellable> = []

    private var panel: NSPanel?
    private var hostingView: NSHostingView<DirectionBoardView>?
    /// 相位（+ 面板没铺开）是否允许看板出现 —— **这只是必要条件，不是充分条件**。
    private var phaseAllowsBoard = false
    private var transcriptObserver: AnyCancellable?
    /// 内容改尺寸时重新摆位（SwiftUI 自己会改窗口大小，见文件头那段根因）。
    private var sizeObserver: AnyCancellable?
    /// 显示那一刻的鼠标位置：**只看这一次**（用户：「位置固定，不随鼠标移动」）。
    private var anchorPoint: CGPoint?
    /// 上一次摆出去的矩形 —— 用来给重复通知去重（也用来打那行诊断）。
    private var lastPlacedFrame: CGRect = .zero
    private var isVisible = false

    // MARK: - 显示 / 收起

    /// 由 `NotchWindowController.syncListeningTranscriptPanel()` 驱动 —— **与刘海那行字幕同一个判据**。
    /// - Parameter isSheetExpanded: 刘海面板正铺开 —— 那时**整块不显示**（那块面板盖住全屏，
    ///   看板在它下面根本看不见；与右下角那张结果卡片同一条规矩）。由调用方传进来，
    ///   面板控制器不去猜刘海的状态。
    func sync(isVisible shouldBeVisible: Bool, isSheetExpanded: Bool) {
        phaseAllowsBoard = shouldBeVisible && !isSheetExpanded
        applyVisibility()
    }

    /// 两个条件都满足才显示：**相位允许**（说话期间 / 追问窗口）**且他真的说出了字**。
    private func applyVisibility() {
        guard AppSettingsStore.snapshot().directionBoardEnabled else {
            hide()
            return
        }
        let spokenText = NotchListeningTranscriptModel.shared.liveText
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // 自检不走相位（它直接喂假转写），所以那道闸门在自检模式下恒开 —— 否则相位机
        // 每次 `refreshActivityPhase` 都会把它关回去（实测过一次：面板建好又被收掉）。
        let phaseAllows = phaseAllowsBoard || DirectionBoardSession.selfCheckMode != nil
        // **用户取消了看板就不显示**（本次 / 十分钟 / 今日 —— 状态在 `DirectionBoardSession` 里，
        // 每次显隐判断只是一次布尔 + 一次日期比较，不轮询）。
        let notCancelled = !DirectionBoardSession.shared.isCancelled
        if phaseAllows && notCancelled && !spokenText.isEmpty {
            show()
        } else {
            hide()
        }
    }

    /// 自检（见 `DirectionBoardSession.selfCheckMode`）：没有麦克风也要把看板摆到屏幕上。
    func startSelfCheckIfRequested() {
        guard DirectionBoardSession.selfCheckMode != nil else { return }
        print("🎛️ 方向看板自检：把面板拉起来（不发请求）")
        // 自检不走相位，所以那道闸门要手动打开（否则 `applyVisibility` 会立刻把它收掉）。
        phaseAllowsBoard = true
        show()
    }

    /// **用户自己把它拖走过** —— 一旦拖过，就**不再自动摆位**（否则下一次内容变高又会跳回鼠标旁边，
    /// 把他刚摆好的位置抢走）。用户 2026-09-27：「现在没法拖动，相当于它完全占据了屏幕空间」。
    private var isUserPositioned = false

    // MARK: - 拖动（用户 2026-09-27：「看板可以通过拖动上面的文字部分或其他部分来移动位置」）

    private var dragMonitors: [Any] = []
    /// 按下那一刻：光标在哪、窗口在哪。之后每一次移动都**按绝对位置重算原点**
    /// （不是累加位移 —— 累加会漂，而绝对值不会）。
    private var dragStartMouseLocation: CGPoint?
    private var dragStartPanelOrigin: CGPoint?

    /// **拖动走 NSEvent 本地监听，不用 SwiftUI 的 `DragGesture`** —— 两个理由都是量出来的：
    ///  · `DragGesture` 会**吞掉点击**（`minimumDistance` 调大才不吞，而那又让它丢掉起步那几 pt）；
    ///  · 它给的 `translation` 是在**卡片自己的坐标系**里量的，而卡片正随窗口一起动 ——
    ///    于是每次只拿到"还差的那一半"（实测拖 −180pt 窗口只走 −92pt，**增益 1/2**）。
    ///    这与设置里那个窗口缩放手柄当年踩的是同一个坑，修法也一样：用**绝对屏幕位置**。
    ///
    /// 本地监听只看得见发给**本 App** 的事件，所以其他软件照常收不到影响；而且监听
    /// **不消耗事件** —— 按钮、输入框全都照常工作。
    private func installDragMonitors() {
        guard dragMonitors.isEmpty else { return }
        let down = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown]) { [weak self] event in
            self?.beginDragIfInsidePanel(with: event)
            return event
        }
        let dragged = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDragged]) { [weak self] event in
            self?.continueDrag()
            return event
        }
        let up = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseUp]) { [weak self] event in
            self?.endDrag()
            // ⚠️ **必须把事件放回去**：本地监听返回 `nil` ＝ **吞掉这个事件**，
            // 而 SwiftUI 的按钮是**靠 mouseUp 才触发的** —— 吞了它，板上每一个按钮
            //（选项、复制、取消三档）就全都点不动了。
            return event
        }
        dragMonitors = [down, dragged, up].compactMap { $0 }
    }

    private func removeDragMonitors() {
        for monitor in dragMonitors { NSEvent.removeMonitor(monitor) }
        dragMonitors = []
        dragStartMouseLocation = nil
        dragStartPanelOrigin = nil
    }

    private func beginDragIfInsidePanel(with event: NSEvent) {
        guard isVisible, let panel, event.window === panel else { return }
        dragStartMouseLocation = NSEvent.mouseLocation
        dragStartPanelOrigin = panel.frame.origin
    }

    private func continueDrag() {
        guard isVisible, let panel, let startMouse = dragStartMouseLocation,
              let startOrigin = dragStartPanelOrigin else { return }
        // 第一次真的移动了才算"他挪过它" —— 单纯点一下不该把这轮自动摆位关掉。
        isUserPositioned = true
        let current = NSEvent.mouseLocation
        var frame = panel.frame
        frame.origin = CGPoint(x: startOrigin.x + (current.x - startMouse.x),
                               y: startOrigin.y + (current.y - startMouse.y))
        lastPlacedFrame = frame
        panel.setFrame(frame, display: true)
    }

    private func endDrag() {
        dragStartMouseLocation = nil
        dragStartPanelOrigin = nil
    }

    private func show() {
        guard !isVisible else { return }
        isVisible = true
        isUserPositioned = false
        // 锚点取一次。没有鼠标事件过（比如自检注入）时退回鼠标当前位置。
        anchorPoint = NSEvent.mouseLocation
        lastPlacedFrame = .zero

        let panel = makePanel()
        self.panel = panel
        // 监听内容改尺寸 —— SwiftUI 会按内容把窗口撑大（见文件头），我们跟着重新摆位。
        sizeObserver = NotificationCenter.default
            .publisher(for: NSWindow.didResizeNotification, object: panel)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.repositionForCurrentSize() }
        panel.orderFrontRegardless()
        installDragMonitors()
        repositionForCurrentSize()
    }

    private func hide() {
        guard isVisible else { return }
        isVisible = false
        removeDragMonitors()
        sizeObserver = nil
        panel?.orderOut(nil)
        panel = nil
        hostingView = nil
        anchorPoint = nil
        lastPlacedFrame = .zero
    }

    // MARK: - 「用户正在看板上操作吗」（自动发送那一下要问的）

    /// 上一次用户与看板交互（点击/按键）的时刻 —— 点完把鼠标挪开一点也算"还在跟他打交道"。
    private var lastInteractionAt: Date?

    /// 记录一次交互（面板成为 key / 视图上报点击时调用）。
    func noteUserInteraction() {
        lastInteractionAt = Date()
    }

    /// **静音到点时该不该按住不发**（`BuddyDictationManager.automaticSendShouldWaitProvider` 问它）。
    ///
    /// 三个判据，满足一个就算"他正在跟看板打交道"（用户：「检测一次用户的鼠标是不是在这个看板上，
    /// 或者这个任务方向的看板是不是被激活、被点击、正在输入」）：
    /// 1. **鼠标在板上**（`NSEvent.mouseLocation` 落在面板矩形里）；
    /// 2. 面板**是 key**（他刚点过输入框，正在打字）；
    /// 3. 上一次交互在 2 秒内（点完立刻把鼠标挪开一点，仍然算"他还在弄这个"）。
    func holdsTheAutomaticSend() -> Bool {
        guard isVisible, let panel else { return false }
        if panel.frame.contains(NSEvent.mouseLocation) { return true }
        if panel.isKeyWindow { return true }
        if let lastInteractionAt, Date().timeIntervalSince(lastInteractionAt) < 2 { return true }
        return false
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
                                width: DirectionBoardView.cardWidth(forMultiplier: AppSettingsStore.snapshot().directionBoardWidthMultiplier), height: 220),
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
        // 他点了输入框（面板成为 key）也算"正在跟他打交道"。
        panel.onBecameKey = { [weak self] in self?.noteUserInteraction() }

        let settings = AppSettingsStore.snapshot()
        let hostingView = NSHostingView(rootView: DirectionBoardView(
            session: .shared,
            theme: AnswerCardTheme(style: settings.answerCardStyle),
            onInputFocused: { [weak panel] in
                // 用户点了输入框：这时候要键盘，成为 key 是**他的**意思。
                panel?.makeKey()
            }))
        // ⚠️ **这里刻意不设 `sizingOptions = []`** —— 这块面板上它挡不住 SwiftUI 按内容改窗口
        //（调用方是 `NSHostingView.updateAnimatedWindowSize`，见文件头那段根因：设了也照样
        // 672,-7,680×338，底边掉出屏幕）。尺寸交给 SwiftUI，位置由 `repositionForCurrentSize()`
        // 在每次改尺寸之后重新算 —— "谁改的尺寸"于是不再重要。
        panel.contentView = hostingView
        self.hostingView = hostingView

        return panel
    }

    /// **把面板摆到"锚点 + 夹进屏幕"算出来的那个位置**（尺寸用窗口当前的尺寸）。
    ///
    /// 每次显示、以及每次内容改尺寸（`NSWindow.didResizeNotification`）之后都调一次：
    /// SwiftUI 撑大窗口时**保持顶边**，底边于是往下跑；这一下把它挪回去，净效果就是用户要的
    /// 「左下角固定、内容往上长」。只改原点不改尺寸，所以不会再触发一次 resize 通知（不成环）。
    private func repositionForCurrentSize() {
        guard isVisible, let panel, let anchorPoint else { return }
        // 用户拖过之后就不再自动摆位（内容变高变矮时只保住他放的位置）。
        guard !isUserPositioned else { return }
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(anchorPoint) })
                ?? NSScreen.main else { return }
        let frame = NotchSupport.directionBoardPanelFrame(anchor: anchorPoint,
                                                          size: panel.frame.size,
                                                          on: screen)
        guard frame != lastPlacedFrame else { return }
        lastPlacedFrame = frame
        panel.setFrame(frame, display: true)
    }
}

/// 允许成为 key 的无边框面板（看板上的输入框要收键盘）。
///
/// 与 `NotchListeningTranscriptPanel` 同一个形状 —— 不能成为 key 的面板会**静默**吞掉每一次按键。
/// 但这里配了 `becomesKeyOnlyIfNeeded = true`：不是"一出现就是 key"，而是"点了输入框才是"。
private final class DirectionBoardPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    /// 成为 key 的那一下报一声（"他点了输入框"——自动发送那一下要据此按住不发）。
    var onBecameKey: (() -> Void)?
    override func becomeKey() {
        super.becomeKey()
        onBecameKey?()
    }
}
