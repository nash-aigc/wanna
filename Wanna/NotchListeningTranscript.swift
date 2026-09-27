//
//  NotchListeningTranscript.swift
//  Wanna
//
//  主 Agent 说话时，刘海**下面那一行**滚动字幕 + 点开之后的转写编辑窗（2026-09-27）。
//
//  用户的原话是这件事的全部要求：
//
//  · 字幕 ——「在当前的主 agent 快捷键触发之后，它会在刘海的左侧、右侧这个分别展开，
//    然后显示 listening 或者是 thinking…这个东西要保留，但是要增加…下面要显示一个
//    类似于录音这个…它下面这个效果就是显示一横文字，然后从右到左滑动，然后非常平滑的
//    这样一个移动…你直接照搬这个代码就可以了，完整的复制过来」；
//  · 消失时机 ——「如果用户说完了，然后进入 thinking，那么这个录音的内容就消失掉了。
//    什么时候用户说话，下面这个内容才会显示」，补的一句是「Listening 时要显示，
//    Speaking 时不显示」（因为回答本来就会显示在鼠标右下角那张卡片上）；
//  · 可点开 ——「刘海左侧它这个时间是可以被点击的…我说话的时候它有一个叫 listening
//    这个单词，那么也同样一个逻辑。我让 listening 可以被点击，点击之后展开，展开的是录音，
//    可以让用户编辑录音里面的内容」。
//
//  **它不碰状态机。** 显示与否只看 `NotchPanelModel.activityPhase == .listening` 这一个
//  条件 —— 打断、说完等待、自动发送、相位一路都还是主 Agent 原来那套（用户：「包括什么打断
//  什么的都是要根据这个主 agent 的快捷键来走的，整个的逻辑…咱们替换的其实就是后端的这个
//  语音识别的模型，然后在说话的时候增加一个…字幕」）。
//
//  这块面板**不是**录音带那块：录音是一个「独立接线、跟面板里任何功能都没有关系」的子系统，
//  它有自己那块窗口（`NotchRecordingOverlayController`）。这里共用的是**视图**（
//  `NotchTranscriptLine` / `NotchExpandedTranscriptPanel`）和 `NotchSupport` 里那几个
//  几何常量 —— 也就是用户要的「一模一样」由同一份实现保证，而不是靠两处各调一次数字。
//

import AppKit
import Combine
import SwiftUI

// MARK: - 状态

/// 这一轮说话的字幕文本，以及那个编辑窗自己的状态。
///
/// 形状照 `LongFormRecorderController` 的转写那一半（`livePartialText` / `transcriptDraftText`
/// / `transcriptDisplayText`）：**草稿一旦存在，识别结果就不再覆盖它** —— 否则用户改到一半，
/// 下一句实时转写进来会把他的字冲掉。
///
/// 写它的是 `CompanionManager`（说话期间的每一句实时转写），读它的是那块面板；
/// 用户改过的正文由 `CompanionManager` 在这一句**提交前**取走（`consumeEditedTranscript`）。
///
/// 单例，理由与 `AgentActivityBoard.shared` / `NotionNoteSession.shared` 一样：真相本来就
/// 只有一份（这一轮说的那句话），而写它的和读它的分处两个对象。
@MainActor
final class NotchListeningTranscriptModel: ObservableObject {

    static let shared = NotchListeningTranscriptModel()
    private init() {}

    /// 这一轮说话到目前为止识别出来的文字。
    ///
    /// **只增不减**是那条字幕的硬要求（位移是 `可用宽度 − 文字宽度`，文字一变短就往右跳，
    /// 见 `SmoothRevealedTranscriptText`）—— 识别器吐的是这一句的累积结果，所以它天然只增。
    @Published private(set) var liveText: String = ""

    /// 展开的转写编辑窗开着没有。点刘海左侧那颗「Listening」切换（见 `handleGlobalClick`）。
    @Published var isEditorExpanded = false

    // ⚠️ **这里原来有两个 `@Published`（`bandRevealProgress` / `isBandPresented`），
    // 2026-09-27 整块删掉。** 它们是"从刘海中心向左右展开"那套动画的全部状态：
    // 两翼与那一行读同一个进度值，靠"同一个值、同一个动画事务"让两块在每一帧对齐。
    // 用户最终把这个方案整体否掉了 ——
    // 「我觉得这完全放弃这个方案吧……用户第一次按快捷键的时候，你就让他**直接显示**吧，
    // 就是直接就跟那个录音的时候一样的效果，直接显示……**不需要动画**」——
    // 屏幕上的黑带与那一行现在都是**常数宽度、相位一到就在最终位置**，
    // 所以既不需要一个进度值，也不需要"这一块还在不在"那个标志。
    // 谁再想加回动画，先读 `开发经验/10-踩过的坑.md` D25/D26/D31/D34/D35 五条。

    /// 用户在编辑窗里改过的正文。`nil` = 没改过，编辑框跟着识别结果显示。
    @Published private(set) var editorDraftText: String?

    /// 编辑框现在应该显示什么。
    var editorText: String { editorDraftText ?? liveText }

    /// `CompanionManager` 每收到一句实时转写就喂进来。
    func setLiveText(_ text: String) {
        liveText = text
    }

    /// 用户在编辑框里打字。
    func applyEditedText(_ text: String) {
        editorDraftText = text
    }

    /// 把用户改过的正文**取走**（一轮只顶替一次）。
    ///
    /// 返回 `nil` = 他没改过，照识别结果走。返回空串 = 他**清空了** —— 那也是他的意思
    ///（"这句别发"），所以照传：主 Agent 那条路的空转写本来就有一条早退（什么都不发、
    /// 也不问模型），行为和"他没说话"完全一样。
    func consumeEditedTranscript() -> String? {
        guard let draft = editorDraftText else { return nil }
        editorDraftText = nil
        return draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// ⌘Enter：把编辑框里现在这份文字放进剪贴板。
    func copyEditorTextToClipboard() {
        let text = editorText
        guard !text.isEmpty else { return }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    /// 新的一轮说话开始（那一行字幕要出现的时候）—— 文字与编辑状态全部归零。
    ///
    /// 由面板控制器的 `show()` 调用，所以「新的一轮」的定义只有一个：**那一行字幕重新出现**。
    func beginRound() {
        liveText = ""
        editorDraftText = nil
        isEditorExpanded = false
    }
}

// MARK: - 那一行 / 那个窗口

/// 面板里的内容：**收起时是刘海下面那一行字幕，展开时是那个转写编辑窗。**
///
/// 两态之间的区别只有内容 —— 位置与宽度都是 `NotchSupport` 给的那几个数，
/// 而那一行与那个窗口本身的排版、渐隐、圆角分别是 `NotchTranscriptLine` 与
/// `NotchExpandedTranscriptPanel`（录音带用的是同两个视图）。
struct NotchListeningTranscriptView: View {

    @ObservedObject var model: NotchListeningTranscriptModel

    let notchWidth: CGFloat
    let notchHeight: CGFloat

    /// 字幕条 / 编辑窗的宽度。与录音带那一处**同一个式子**（两翼 + 刘海）。
    private var bandWidth: CGFloat {
        NotchSupport.leadingWingWidth + notchWidth + NotchSupport.trailingWingWidth
    }

    /// 这一行的宽度 —— **从第一帧就是整条，不做宽度动画**。
    ///
    /// 用户 2026-09-27（第二次报同一件事）：「用户按快捷键的时候，那个按钮它的中间有一个空白，
    /// 你到现在也没有修复这个问题……**直接把那个图形重新画一下**……中间的部分不应该出现这样
    /// 一个空白区域。」他给的底线是：**任何一帧都不允许出现能透出桌面的区域**。
    ///
    /// 前两版都是"让这一行跟着那条带子一起长"（同一个进度值、同一个式子，量到每侧 ≤2px）——
    /// 但那是**时序对齐**，只要两块有任何一个环节不同拍（窗口层级、动画事务、相位晚一轮），
    /// 桌面就会从那里透出来。**不做动画就没有这个自由度**：这一行从第一帧起就铺满整条宽度，
    /// 上面那条黑带再怎么长，下面永远有一块黑接着 —— 结构上不可能露出桌面 ✓。
    /// 这与用户允许的"退一步直接显示"一致（"如果不可以的话，你就直接让它直接显示出来也行"），
    /// 而**黑带自己的展开动画照旧**（动的是它，不是这一行）。
    private var revealedLineWidth: CGFloat { bandWidth }

    var body: some View {
        VStack(spacing: 0) {
            // **刘海那一行让开。** 静止 pill 自己画着那条黑带和两翼（它有自己一块窗口），
            // 这里只画它**下面**的那一行 —— 录音带那块面板画自己的黑带是因为它盖在 pill
            // 上面；这一块不盖，所以上面留空、下面接上。
            Color.clear.frame(height: notchHeight)

            if model.isEditorExpanded {
                NotchExpandedTranscriptPanel(
                    topLineText: model.liveText,
                    panelWidth: bandWidth * 2,
                    bodyText: Binding(
                        get: { model.editorText },
                        set: { model.applyEditedText($0) }),
                    // 主 Agent 这条**没有草稿可存** —— 改的字在这一句提交时自动生效
                    //（见 `consumeEditedTranscript`），所以没有 ⌘S。
                    savesDraft: nil,
                    onCollapse: { model.isEditorExpanded = false },
                    onCopyAllAndCollapse: {
                        model.copyEditorTextToClipboard()
                        model.isEditorExpanded = false
                    })
            } else {
                // **收起态那一行不在这里画了**（2026-09-27）：它搬进了刘海面板，
                // 与黑带同一个视图、同一个宽度、同一个动画事务（见 `NotchPillRootView`）。
                // 这块面板只剩下"展开后的编辑窗"这一个职责 —— 也就是从这一版起，
                // 屏幕上那条黑带与它下面的字幕**只有一个动画**。
                Color.clear
            }
        }
        // 横向铺满面板（那一行自己居中），纵向**显式顶对齐** —— 宿主视图是铺满整块面板的，
        // 不写这一行，这条字幕的位置就由 SwiftUI 的默认对齐说了算
        //（录音带那边为同一件事写过一条更长的注释）。
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

// MARK: - 它住的那块窗口

/// 刘海下面那行字幕（和它的编辑窗）住的窗口。
///
/// 配方照抄这个仓库既有的做法（`NotchRecordingOverlay` / `AgentStripPanelController` /
/// `CameraStripPanelController`）：
///
/// - **透明、无边框、非激活**：`isOpaque = false` + `backgroundColor = .clear`，
///   `.nonactivatingPanel` 所以它成为 key 也不会把用户当时在用的 App 顶掉；
/// - **层级 `NotchSupport.notchTranscriptPanelWindowLevel`** —— 在刘海面板**之上**：
///   面板展开时那一行也要看得见（和展开态那条状态带同一条理由，用户 2026-09-24：
///   「用户在对话页面时也应该有这个动画效果」）；
/// - **收起时 `ignoresMouseEvents = true`**：点击穿透，所以菜单栏、桌面、别的 App 全都
///   照常可点 —— 那一行是个显示物，它的点击由 `NotchWindowController.handleGlobalClick`
///   按**屏幕矩形**接走（刘海左侧那颗「Listening」）。展开时打开，编辑框要收键盘和点击；
/// - **窗口建好一次、永不改尺寸。** 这是这个仓库在透明窗口上最贵的一条教训：几何在 CA
///   提交**之前**就改了，中间那一瞬新露出来的区域是空的、桌面会透出来（录音那条带报过
///   「背景穿透」）。所以收起态那行只占 32pt，而窗口从建好那天起就是「刘海 + 编辑窗」
///   那么高 —— 多出来的部分是透明且点击穿透的。
///
/// **生命周期只有一条**：`NotchWindowController` 看相位，`== .listening` 就 `show()`、
/// 否则 `hide()`。它不认识麦克风、不认识转写、也不认识打断。
@MainActor
final class NotchListeningTranscriptPanelController {

    static let shared = NotchListeningTranscriptPanelController()
    private init() {}

    private var panels: [NSPanel] = []
    private var isPresented = false
    private var cancellables: Set<AnyCancellable> = []
    /// 展开/收起动画的代次：排着的那次 `orderOut` 只在代次没变时执行 ——
    /// 否则「收起动画还没走完又来了新一轮」会把新面板一起关掉。
    private var revealGeneration = 0
    /// 展开态才装的那两个「折叠」监听（ESC / 点外面）。
    private var outsideClickMonitor: Any?
    private var escapeKeyMonitor: Any?

    /// 那一行该出现了。幂等。
    ///
    /// **新的一轮从这里开始**：文字与编辑状态归零（`beginRound`），所以"上一轮说的字"
    /// 不会在新一轮的第一句到达之前先在屏幕上闪一下。
    ///
    /// ⚠️ **没有展开动画**（2026-09-27，用户的最终裁决）：「用户第一次按快捷键的时候，
    /// 你就让他**直接显示**吧，就是直接就跟那个录音的时候一样的效果，**直接显示**……
    /// 整个这个东西是**直接显示出来，不需要动画**。注意第一次不需要动画」。
    ///
    /// 这里原来有一套"先以宽度=刘海出现、下一拍再把进度翻成 1"的两段式（为了让那一行
    /// 从刘海中心向左右长出来）—— 整段删掉。面板出现的那一帧，刘海面板那边的黑带与
    /// 这一行**都已经在最终位置、最终宽度**上，屏幕上没有任何"正在长"的中间态，
    /// 也就不存在"某一帧两块对不齐"这回事（那一类问题用户报过三遍）。
    func show() {
        revealGeneration += 1
        isPresented = true

        guard panels.isEmpty else { return }

        NotchListeningTranscriptModel.shared.beginRound()

        for screen in NSScreen.screens {
            guard let panel = makePanel(for: screen) else { continue }
            panel.orderFrontRegardless()
            panels.append(panel)
        }
        // 收起态：点击穿透（那一行的点击走全局监听里的屏幕矩形）。
        for panel in panels { panel.ignoresMouseEvents = true }
        startObservingEditorExpansion()
        applyEditorExpansionState()
    }

    /// 那一行该走了 —— 用户说完、相位离开 Listening，或者刘海整个被别的 App 的全屏挡住。
    ///
    /// **收也是直接收**（没有动画）：相位一走，字幕与那一行同时消失。用户对这条的要求
    /// 从头到尾都是"瞬间"（「界面应该瞬间消失」），展开那一半的动画现在也删了，
    /// 所以出现与消失都是同一帧的事。
    func hide() {
        guard isPresented else { return }
        isPresented = false
        removeDismissMonitors()
        // 编辑窗也跟着收起 —— 这一句已经交出去了，留一个还在邀请用户改字的框
        // 比收起来更糟（那个改动不会再有任何去处）。
        NotchListeningTranscriptModel.shared.isEditorExpanded = false

        revealGeneration += 1
        for panel in panels { panel.orderOut(nil) }
        panels.removeAll()
    }

    /// 屏幕参数变了（插拔显示器、分辨率）：面板的矩形要按新屏幕重算。
    /// `NotchWindowController.rebuildScreenPresences` 的每一条调用路径都从这里过。
    func rebuildForCurrentScreens() {
        guard isPresented else { return }
        hide()
        show()
    }

    /// 展开态跟着 `isEditorExpanded` 走：命中测试 + 成为 key（编辑框要收键盘）+ 折叠监听。
    private func startObservingEditorExpansion() {
        guard cancellables.isEmpty else { return }
        NotchListeningTranscriptModel.shared.$isEditorExpanded
            .receive(on: DispatchQueue.main)
            // **参数只用来看「有东西变了」，具体值现读 live 值。** `@Published` 在
            // willSet 里发值，`receive(on:)` 又把它推迟一个主队列轮次，闭包拿到的参数
            // 和运行时的真实值会是两份不同的读取 —— 录音那边为这件事吃过一次亏。
            .sink { [weak self] _ in
                self?.applyEditorExpansionState()
            }
            .store(in: &cancellables)
    }

    private func applyEditorExpansionState() {
        guard isPresented else { return }
        let isExpanded = NotchListeningTranscriptModel.shared.isEditorExpanded
        for panel in panels { panel.ignoresMouseEvents = !isExpanded }
        if isExpanded {
            installDismissMonitors()
            // 不主动 makeKey 的话，用户得先点一下编辑区才能打字 —— 而他会以为
            // 「这里不能输入」（录音那条的展开面板同一条理由）。
            panels.first?.makeKey()
        } else {
            removeDismissMonitors()
            panels.first?.resignKey()
        }
    }

    /// 「按 ESC 折叠」和「点弹窗外面折叠」。
    ///
    /// 两个都用**全局**监听，理由和录音那条一模一样：`onExitCommand` 只在文本框拿到焦点
    /// 时才触发，而用户经常是展开之后没点进去就直接按 ESC —— 那时焦点还在别的 App 上。
    /// 监听**只读不吞**，所以 ESC / 那一次点击照常传给下面那个 App。
    ///
    /// 只在展开时装：平时不该有一条全局键盘监听在吃用户的 ESC。
    private func installDismissMonitors() {
        guard outsideClickMonitor == nil else { return }

        outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self else { return }
            let location = NSEvent.mouseLocation
            // 点在面板自己的矩形里就不算「外面」。
            if self.panels.contains(where: { $0.frame.contains(location) }) { return }
            Task { @MainActor in NotchListeningTranscriptModel.shared.isEditorExpanded = false }
        }

        escapeKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
            // 53 = ESC。
            guard event.keyCode == 53 else { return }
            Task { @MainActor in NotchListeningTranscriptModel.shared.isEditorExpanded = false }
        }
    }

    private func removeDismissMonitors() {
        if let outsideClickMonitor { NSEvent.removeMonitor(outsideClickMonitor) }
        if let escapeKeyMonitor { NSEvent.removeMonitor(escapeKeyMonitor) }
        outsideClickMonitor = nil
        escapeKeyMonitor = nil
    }

    /// 面板的矩形。**建的时候算一次，之后永不改变。**
    ///
    /// 和录音带那块面板同一个式子（宽度取「带子宽 × 2」并把屏幕边距留出来，高度取
    /// 「刘海 + 编辑窗」，顶边贴屏幕顶边、水平对准刘海中心）—— 用户要的就是这两个窗口
    /// 看起来是同一个，所以坐标不能各算一套。
    private func panelFrame(for screen: NSScreen) -> CGRect? {
        guard let notch = NotchSupport.notchRect(on: screen) else { return nil }
        let bandWidth = NotchSupport.leadingWingWidth + notch.width + NotchSupport.trailingWingWidth
        let panelWidth = min(bandWidth * 2, screen.frame.width - 40)
        let panelHeight = notch.height + NotchSupport.notchTranscriptEditorBodyHeight
        let notchCenterX = screen.frame.minX + notch.minX + notch.width / 2
        return CGRect(x: notchCenterX - panelWidth / 2,
                      y: screen.frame.maxY - panelHeight,
                      width: panelWidth,
                      height: panelHeight)
    }

    private func makePanel(for screen: NSScreen) -> NSPanel? {
        guard let notch = NotchSupport.notchRect(on: screen),
              let frame = panelFrame(for: screen) else { return nil }

        // 必须是能成为 key 的面板：编辑那一块时要收得到键盘（录音那条同一条理由 ——
        // 不能成为 key 的无边框面板会**静默**吞掉每一个按键）。
        let panel = NotchListeningTranscriptPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.level = NotchSupport.notchTranscriptPanelWindowLevel
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isMovable = false
        panel.isReleasedWhenClosed = false
        // 关掉 NSWindow 自带的 frame 动画（改 frame 时 AppKit 会插一段短动画）。
        panel.animationBehavior = .none

        let hostingView = NSHostingView(rootView: NotchListeningTranscriptView(
            model: .shared,
            notchWidth: notch.width,
            notchHeight: notch.height))
        // **必须置空。** `NSHostingView.sizingOptions` 默认的 `.standardBounds` 会绕开 Auto
        // Layout 直接按内容的固有尺寸调 `setContentSize`，把这个面板算好的帧当场作废
        //（录音那条带实测：设好帧 82ms 后被改掉，dx=+179pt、高度少 42pt —— 用户看到的是
        // 「展开时向右上角甩一下」）。这块面板的几何全部由 `panelFrame(for:)` 说了算。
        hostingView.sizingOptions = []
        hostingView.frame = CGRect(origin: .zero, size: frame.size)
        panel.contentView = hostingView
        return panel
    }
}

/// 允许成为 key 的无边框面板（编辑框要收键盘）。
private final class NotchListeningTranscriptPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}
