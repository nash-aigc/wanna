//
//  DirectionBoardView.swift
//  Wanna
//
//  **「任务方向看板」长什么样**（2026-09-27，第二版）。
//
//  用户定的规格（第二版的原话）：
//  · 「根据用户的内容来去选择到底显示哪一个卡片、到底显示哪一个关键词……而不是直接就显示」→
//    **只画 `session.displayedItems`**（他说到的那些方向），一格都不多；
//  · 「这个上面的表格可以最多显示为 5 行」+「每一行的时候，这个任务方向给它标一个序号，
//    第一、第二、第三、第四」→ 每格左边一个**连续编号**，他可以用嘴说「第三个方向」；
//  · 「把它这个整个这个卡片的左下角固定，然后上面的内容可以变化」→ 面板左下角钉在鼠标 +12pt
//    （`NotchSupport.directionBoardPanelFrame`），方向区往上长；
//  · 「固定这个用户的输入框跟 AI 显示的文字……这部分你可以把它这个高度、宽度固定下来」→
//    下面那两块（说明 + 输入框）**高度固定**，方向区才是变高的那部分；
//  · 外壳与右下角那张结果卡片同一套（同一份常量、同一个 `cardBackground`），宽度固定 340。
//

import AppKit
import SwiftUI

struct DirectionBoardView: View {

    @ObservedObject var session: DirectionBoardSession
    /// 这一轮带了哪些参考材料（屏幕一/二…、剪贴板、文件、文件夹）—— 采集器说了算。
    @ObservedObject var referenceCollector: TurnReferenceCollector = .shared
    /// 卡片主题（与右下角那张卡片同一个 `AnswerCardStyle`）。
    let theme: AnswerCardTheme
    /// 输入框被点了一下：宿主面板据此把窗口变成 key（否则打字进不来）。
    var onInputFocused: () -> Void = {}
    /// **卡片本身被点了一下** → 只把面板变成 key（**不**把焦点给输入框）。
    ///
    /// 为什么两件事要分开：回车的行为取决于"光标在不在输入框里"（用户 2026-09-27）——
    /// 在框里按 `Cmd+Enter` 是**执行**，不在框里按 `Cmd+Enter` 是**粘贴**。
    /// 点卡片就抢走输入焦点的话，这两种就没法区分了。
    var onCardTapped: () -> Void = {}

    /// **7 字形的两段尺寸由 `NotchSupport` 给**（视图与定位共用那份，见那里的注释）：
    /// 横杠 360 × 224、竖条 340（**= 右下角那张回复卡的最大宽度**，用户 2026-09-28 指定）。
    ///
    /// 用户 2026-09-28：「右侧……竖向这个宽度其实跟右下角卡片的宽度应该设置为一样的」。
    /// 原来那套「宽度 = 340 × 设置里的倍数」随之作废 —— 形状定死了宽度，倍数那个设置
    /// 留着只会变成一个存了也不生效的开关，所以它连同设置页那一行一起删掉了。
    static var barWidth: CGFloat { NotchSupport.directionBoardBarWidth }
    static var barHeight: CGFloat { NotchSupport.directionBoardBarHeight }
    static var mapWidth: CGFloat { NotchSupport.directionBoardMapWidth }
    static let horizontalPadding: CGFloat = 12
    /// 竖条里文字离上下沿的边距。
    static let mapVerticalPadding: CGFloat = 12

    /// 竖条（脑图）能有多高：**菜单栏以下那块高度的 70%**，与右下角回复卡同一条规矩。
    static var maximumMapHeight: CGFloat {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else { return 560 }
        return NotchSupport.directionBoardMapMaximumHeight(on: screen)
    }

    /// **左列里那条表格排几列**：恒为 **2**（用户 2026-09-27 深夜：「标签3行肯定写不下，
    /// **写成2行就好**」）。
    ///
    /// 不能再用整张卡片的宽度去算：表格现在住在**左列**里（262pt），按 680pt 那套算会得出
    /// 4 列，在 262pt 里挤成一团。2 列 × 2 行 = 看得见 4 个方向，与他要的"两行"一致。
    private var directionColumnCount: Int {
        max(min(session.displayedItems.count, 2), 1)
    }

    /// **左边那半（横杠）里，问题那一块固定几行** —— 高度提前定死。
    /// 用户 2026-09-28：「矛盾的内容……每一行的开头写一个问号，就一个问号，然后冒号右边是
    /// 那些内容，让用户知道这是个问题」+「你就让它**固定 10 行**吧……也就是说渲染的时候
    /// **无论有没有字、有没有矛盾，你就固定渲染 10 行**就好了。然后渲染的时候就是按照
    /// **有动画**的方式来渲染」。
    static let questionRowLines = 10
    /// 问题那一块的高度 = 预留几行 × 行高。
    private static let questionRowHeight: CGFloat = CGFloat(questionRowLines) * 16
        + CGFloat(questionRowLines - 1) * 3

    /// **每条问题占的高度** —— 用它把问题那一块的高度**提前定死**（用户反复强调"高度不许晃"）。
    static let understandingLineHeight: CGFloat = 16

    /// **脑图那一行是哪一行**（「细节」）—— 它单独占右栏（那条竖条），且**不画标题**。
    static let mindMapLabel = "细节"

    /// 方向格**固定两行**的高度（每行 = 一个格子的高度 28 + 行距 6）。
    ///
    /// 用户 2026-09-28 把左半压到 360pt 宽：2 列 × 2 行 = 看得见 4 个方向，与他说的
    /// 「最多显示 4 个」正好对上（筛选在 `DirectionBoardMatching` 那一侧）。
    static let directionGridRows = 2
    private static let directionGridHeight: CGFloat = CGFloat(directionGridRows) * 28
        + CGFloat(directionGridRows - 1) * 6

    /// 参考标签那一块**固定一行**（没有标题 —— 用户 2026-09-28：「不需要写"参考"两个字，
    /// 只需要把具体参考的内容用标签的形式显示在**一行**就可以了」）。
    static let referenceTagRowLines = 1
    /// 参考那一块的高度 = 预留行数 × 标签行高。
    private static let referenceTagRowHeight: CGFloat =
        CGFloat(referenceTagRowLines) * 17 + CGFloat(referenceTagRowLines - 1) * 4

    /// **左列（Harness 树）有多宽** —— 横杠总宽 360 去掉这条与右边的矛盾列。
    /// 用户 2026-09-28 把左列定成"提示词工程"，右边留给矛盾，中间一条细线。
    static let harnessColumnWidth: CGFloat = 150

    /// 编号那一列有多宽（「第三个方向」里的 3）。
    private static let numberColumnWidth: CGFloat = 18

    var body: some View {
        Group {
            if session.isCollapsed {
                collapsedCard
                    // **折叠之后整张卡片就只剩那个按钮**（用户：「折叠后……变成一个折叠按钮」）——
                    // 所以宽度也跟着收，不然屏幕上会留一条空条。
                    .padding(.horizontal, Self.horizontalPadding)
                    .padding(.vertical, Self.cardBottomPadding)
                    .frame(width: Self.collapseButtonWidth * 3 + Self.horizontalPadding * 2,
                           alignment: .leading)
            } else {
                sevenCard
            }
        }
        // 展开态：**7 字形**那一条轮廓（横杠 + 竖条）；折叠态：一个小圆角矩形。
        .background(AnswerCardView.cardBackground(theme: theme))
        .clipShape(currentOutlineShape)
        .overlay(
            currentOutlineShape
                // 被按住不发 → 告警色呼吸；**折叠着 → 绿色**（用户：「折叠后卡片边缘自动变成绿色，
                // 便于用户快速在桌面上看到其位置」）；其余用主题边框。
                .stroke(borderTint, lineWidth: borderWidth)
                .animation(.easeInOut(duration: 0.35), value: session.isHeldFromAutomaticSend)
                .animation(.easeInOut(duration: 0.25), value: session.isCollapsed)
        )
        .shadow(color: Color.black.opacity(0.30), radius: 10, x: 0, y: 4)
        .contentShape(Rectangle())
        .onTapGesture { onCardTapped() }
        // 他在说话 → 灯亮起（并开始呼吸）；停下来 → 立刻停（用户：「检测不到用户在说话，
        // 就停止呼吸」）。
        .onChange(of: session.isUserSpeaking) { _, isSpeaking in isBreathing = isSpeaking }
        .onAppear { isBreathing = session.isUserSpeaking }
    }

    /// 当前该用哪条轮廓：折叠态是小圆角矩形，展开态是 **7 字形**。
    private var currentOutlineShape: AnyShape {
        session.isCollapsed
            ? AnyShape(RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous))
            : AnyShape(DirectionBoardSevenShape(barWidth: Self.barWidth, barHeight: Self.barHeight))
    }

    private var borderTint: Color {
        if session.isHeldFromAutomaticSend { return DS.Colors.warning }
        if session.isCollapsed { return DS.Colors.success }
        return theme.borderColor
    }

    private var borderWidth: CGFloat {
        if session.isHeldFromAutomaticSend { return AnswerCardView.cardBorderWidth * 2 }
        if session.isCollapsed { return AnswerCardView.cardBorderWidth * 2 }
        return AnswerCardView.cardBorderWidth
    }

    /// **折叠态**：整张卡片只剩那个折叠钮。
    private var collapsedCard: some View {
        collapseToggle
    }

    /// **折叠钮**（横向）：在「复制」左边，**左半是折叠/展开按钮，右半是空白**。
    ///
    /// 用户 2026-09-27：「输入框左侧这个折叠的东西，你就把它显示到**复制的按钮左侧**吧，
    /// 然后把它**横向**显示。横向显示就是说这个按钮的**左边左半部分点击一下折叠，右半部分不会被点击**，
    /// 然后可以**按住它的时候拖动**。你把这个区域给我**用颜色区分开**。」
    ///
    /// 所以两半的底色**刻意不一样**（左半亮一点、右半几乎透明）—— 他要一眼看出"哪半边能点"。
    /// 右半不留任何手势，于是按住它就是按住这张卡片（拖动的监听在面板那一侧）。
    /// **左下角那个长方形**（用户 2026-09-27：「可以理解为左下角显示一个**长方形**，左边缘是整个卡片的
    /// 边缘，下边缘是整个卡片的下边缘……它不是正方形，是长方形，**左侧折叠按钮宽度小，右侧宽度是它的两倍**。
    /// 这个按钮在**高度上与复制按钮对齐，是对齐不是相同**，因为**它的底边比较低**」）。
    ///
    /// 所以：左 1/3 是折叠按钮、右 2/3 是拖动区；**顶边与按钮行齐平**、**底边压到卡片最下沿**
    /// （比按钮行低一个下边距）—— 高度 = 按钮行高 + 下边距。
    private var collapseToggle: some View {
        HStack(spacing: 0) {
            Button {
                session.isCollapsed.toggle()
            } label: {
                Image(systemName: session.isCollapsed ? "chevron.right" : "chevron.left")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(session.isCollapsed ? DS.Colors.success : theme.textColor.opacity(0.75))
                    .frame(width: Self.collapseButtonWidth, height: Self.collapseToggleHeight)
                    // **呼吸灯**（用户 2026-09-27：「一开始的时候，应该在**左下角折叠按钮**的位置上
                    // 做一个**呼吸灯效果**：只要检测到用户在说话，就是呼吸的效果；如果检测不到用户在
                    // 说话，就停止呼吸。**目的是让用户知道当前左上角、右上角的卡片是不是能够真正
                    // 接收到用户的提示词和输入内容**」）。
                    //
                    // 判据是 `session.isUserSpeaking`（转写每来一次字亮 0.9 秒）。
                    // 只做**透明度 + 一点点缩放**，不换颜色也不做光晕 —— 它要回答的是
                    // "卡还在听吗"，抢眼反而会盖过卡片本身的内容。
                    .background(
                        Self.collapseClickableColor
                            .opacity(session.isUserSpeaking ? 1 : 1)
                            .scaleEffect(session.isUserSpeaking ? 1.0 : 1.0)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            // 用户 2026-09-27：「颜色**再深一点**，有点看不见」——
                            // 底色从 26% 提到 **70%**，呼吸的谷底也从 12% 抬到 30%（谷底太浅会闪没）。
                            .fill(DS.Colors.success.opacity(0.70))
                            // ⚠️ **呼吸要真的来回**：`repeatForever` 必须挂在**一个会变的布尔**上
                            //（挂在"当前是否在说话"上是没用的 —— 那个值只说了一次，
                            // 动画播完就停，看到的是一亮一灭不是呼吸）。
                            // 这里 `isBreathing` 由 `isUserSpeaking` 驱动，动画交给渲染服务器来回跑。
                            .opacity(isBreathing ? 1.0 : 0.30)
                            .animation(isBreathing
                                       ? .easeInOut(duration: 0.75).repeatForever(autoreverses: true)
                                       : .easeOut(duration: 0.25),
                                       value: isBreathing)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(session.isCollapsed ? "展开看板" : "把看板折叠起来")

            // 右侧**两倍宽**、**故意不给功能** —— 留给鼠标按住拖动（底色刻意不同，一眼看出哪半边能点）。
            Color.clear
                .frame(width: Self.collapseButtonWidth * 2, height: Self.collapseToggleHeight)
                .background(Self.collapseDragColor)
        }
        // **不加自己的边框**（用户：「外边框也就是折叠按钮的边框，不要再增加一个边框」）——
        // 边框由卡片本身给；折叠态时卡片边框变绿，那也就是它的边框。
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    /// **呼吸的开关**：`false → true` 那一下挂上 `repeatForever` 的动画，之后由**渲染服务器**来回跑 ——
    /// 主线程一次都不参与（这个仓库为"逐帧在主线程上做工作"吃过一次大亏：那块面板的展开动画）。
    /// ⚠️ 不要写 `Timer` + 每帧改值：那是 24fps 的主线程工作，只为了一盏呼吸灯不值得。
    @State private var isBreathing = false

    /// 折叠钮的宽度（左 1/3 折叠、右 2/3 拖动 → 整块是它的 3 倍宽）。
    private static let collapseButtonWidth: CGFloat = 22
    /// 折叠钮的高度 = 按钮行高 + 卡片下边距（于是顶边与按钮行齐平、底边压到卡片最下沿）。
    private static var collapseToggleHeight: CGFloat { cancelRowHeight }
    /// 卡片四周的内边距（原来是写死的 10；折叠钮要"贴到最下面"，所以它得是个常量）。
    private static let cardBottomPadding: CGFloat = 10
    /// 横杠里第一行与上沿的距离。
    static let barTopPadding: CGFloat = 12
    /// 左 1/3（能点）与右 2/3（只能拖）的底色 —— 他要"用颜色区分开"。
    private static let collapseClickableColor = Color.white.opacity(0.13)
    private static let collapseDragColor = Color.white.opacity(0.03)

    // ⚠️ **2026-09-28：原来那个多列的「方向表格」（`directionList` / `directionRow` / 那套
    // 按状态变色的底色与边框）删掉了** —— 它被横杠底下那一行 3 个格子的 `optionRow` 取代
    //（用户：「三个显示在一行……把这些与文字无关的那些按钮的区间全都给取消掉，
    // 就留一个文字，留一个编号就可以了」）。这就是"尽可能精简"，好让一行塞得下三个。



    // MARK: - 参考材料的标签

    /// 这一轮带上了什么：**左边是拿到的**（「屏幕一」「屏幕二」「剪贴板」「文件」「文件夹」），
    /// **右边是说了「参考」但没拿到的**（「无法识别：剪贴板」）。
    ///
    /// 用户 2026-09-27：「即便用户说了"参考"，但没有找到，就直接在……看板上显示"无法识别"」
    /// +「左侧是识别到的，右侧是用户需求需要、但没有识别到的东西」。
    ///
    /// 样式也是他定的：「改大一点，做成矩形，**上下边距小一点**，加上圆角，字体大一点」——
    /// 所以从 Capsule(10pt 字) 改成 RoundedRectangle(12pt 字、垂直 1pt)。
    /// **参考标签那一行**（用户 2026-09-28：「不需要写"参考"两个字，只需要把具体参考的内容
    /// 用标签的形式显示在**一行**就可以了」）—— 所以没有标题，只有标签本身。
    private var referenceTagRow: some View {
        ReferenceTagFlowLayout(spacing: 6, lineSpacing: 4) {
            ForEach(referenceCollector.materials.tags, id: \.self) { tag in
                referenceTag(tag, tint: DS.Colors.success)
            }
            // **多张截图时明确"以最近一次为准"**（用户：「用户询问屏幕内容时，重点关注最近一次
            // 屏幕截图……避免回复最初的屏幕内容」）。提示词里也写了同一句。
            if referenceCollector.materials.screenshots.count > 1 {
                referenceTag("重点关注最近一次屏幕内容", tint: DS.Colors.accent)
            }
            ForEach(referenceCollector.materials.unresolved, id: \.self) { label in
                referenceTag("无法识别：" + label, tint: DS.Colors.warning)
            }
        }
        // **高度提前定死成两行**（那条反复强调的规矩：「它每一个位置上的高度都是固定的……
        // 不要让高度总是晃」）：标签不够两行时下面空着，但卡片高度因此恒定。
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: Self.referenceTagRowHeight, alignment: .topLeading)
        .transition(.opacity)
        .animation(.easeOut(duration: 0.2), value: referenceCollector.materials.tags)
        .animation(.easeOut(duration: 0.2), value: referenceCollector.materials.unresolved)
    }

    /// **会换行的标签流**（左列只有 262pt，标签数量随参考材料变 —— 一行放不下就换到第二行）。
///
/// 用 `Layout` 而不是 `HStack`：`HStack` 放不下是从右边**截掉**，而被截掉的恰好是
/// 「无法识别：选中文件」里"哪一类"那半句 —— 2026-09-27 在屏幕上量到的就是「无法识别…」。
private struct ReferenceTagFlowLayout: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maximumWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var widestLine: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX > 0 && currentX + size.width > maximumWidth {
                currentX = 0
                currentY += lineHeight + lineSpacing
                lineHeight = 0
            }
            currentX += size.width + spacing
            widestLine = max(widestLine, currentX - spacing)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: min(widestLine, maximumWidth), height: currentY + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX > bounds.minX && currentX + size.width > bounds.maxX {
                currentX = bounds.minX
                currentY += lineHeight + lineSpacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: ProposedViewSize(size))
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

/// 一枚参考标签。**矩形 + 小圆角 + 上下边距很小**（用户：「做成矩形，上下边距小一点，
    /// 加上圆角，字体大一点」）—— 拿到的用绿色（与复制那两个按钮同一族颜色），
    /// 没拿到的用告警色。
    private func referenceTag(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(tint)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 1)
            .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(tint.opacity(0.16)))
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(tint.opacity(0.45), lineWidth: 1)
            )
    }

    // MARK: - 说明区（**固定四行，永远画着**）

    // ⚠️ **2026-09-28：这里原来那一套「目标 / 细节 / 疑问 / 拼写错误」的四行、以及画它们的
    // `understandingRow` 一起删掉了** —— 左半只剩「矛盾」一条，而它是**没有标题**的
    //（`?：` 就是它的行首，见 `questionLines`）；脑图搬进了 7 的那条竖条（`mapColumn`）。
    // 行的数据仍然由 `DirectionBoardPrompt.understandingLabels` 给（`理解` 那一行在提示词里照旧发），
    // 只是屏幕上不再一五一十地画。

    /// **7 字形**（用户 2026-09-28 的规格 + 他给的示意图）。
    ///
    /// ```text
    ///   ┌──── 横杠（360）─────┬─ 竖条（340 = 右下角回复卡宽度）─┐
    ///   │ 方向 ≤4             │                                 │
    ///   │ ?：矛盾（每行一个问号）│        脑 图（整条，           │
    ///   │ 参考标签（没有标题）  │        高度 ≤ 菜单栏以下 70%）   │
    ///   │ 折叠｜执行｜取消      │                                 │
    ///   └─────────────────────┘                                 │
    ///                          └─────────────────────────────────┘
    /// ```
    ///
    /// 为什么是 7：用户的原话 ——「右侧……它非常非常长，而左侧又非常的少，
    /// 所以就会占用一个很大的空白空间，这完全没有意义，所以把它做成一个 7 字形」。
    /// 右下角那张 AI 回复卡就嵌进**凹口**里（横杠在上、竖条在右，中间留一点距离）。
    private var sevenCard: some View {
        HStack(alignment: .top, spacing: 0) {
            barColumn
            mapColumn
        }
    }

    /// **7 的那一横**（三段，从下往上）。
    ///
    /// 用户 2026-09-28 定的顺序（他中途改过一次口，最后确认的是这一版）：
    ///
    /// ```text
    ///   ?：矛盾 ①…            ← 固定 10 行（有没有内容都占这 10 行，高度不晃）
    ///   ……                    （有动画：一行一行淡入）
    ///   [屏幕一] [剪贴板]      ← 参考标签，一行，定高
    ///   ┌─────┬─────┬─────┐
    ///   │1 看图说话│2 操作电脑│3 写成文字│  ← **贴住底边**（这行不许留空隙）
    ///   └─────┴─────┴─────┘
    /// ```
    ///
    /// 底下为什么贴边：用户 2026-09-28 ——「这一行一定要**紧贴这个边框线**……我发现你之前总是
    /// 有很大的空行、很大的空隙。我为什么要这样设计呢？**不就是为了压缩高度空间吗**」。
    ///
    /// ⚠️ **底部那一行按钮（折叠 / 执行 / 取消）整行注释掉了**（用户：「什么折叠呀、执行啊、
    /// 这些取消啊，**全都删掉，全都注释掉**」）—— 看板现在是**纯展示**的：执行走 ⌥⏎、
    /// 退出走 ESC、取消走「取消任务看板」那句话。按钮的实现都留着（见 `actionRow` 的注释）。
    /// 横杠：**左 提示词工程（Harness）｜ 右 矛盾**，中间一条细线（用户 2026-09-28：
    /// 「它其实跟这个矛盾，它们两个是**分成两列**的，中间你可以画一条细线」）。
    ///
    /// ⚠️ 底下原来那行「3 个方向格」（`optionRow`）**不画了**（用户：「最下面这个之前的什么、
    /// 对于工具的这些选项……给我清掉，换成全新的这个内容」）—— 换成左边这一列 Harness 树 ✓。
    /// `optionRow` 的实现留在下面（没有删），想放回来只要在这一列后面加一句 `optionRow` ✓。
    private var barColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                harnessColumn
                    .frame(width: Self.harnessColumnWidth, alignment: .topLeading)
                // 那条细线：两列之间，上下留一点气口，不与文字齐头齐尾。
                Rectangle()
                    .fill(theme.textColor.opacity(0.22))
                    .frame(width: 1)
                    .padding(.vertical, 2)
                questionLines
                    .padding(.leading, 10)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .padding(.horizontal, Self.horizontalPadding)
            .padding(.top, Self.barTopPadding)
            Spacer(minLength: 8)
            referenceTagRow
                .padding(.horizontal, Self.horizontalPadding)
        }
        .frame(width: Self.barWidth, height: Self.barHeight, alignment: .topLeading)
        // ⚠️ **横杠与竖条之间那条分割线删掉了**（用户 2026-09-28：「把**分隔线删除**，
        // 这样视觉效果（右上角的卡片）**就是一个整体**」）—— 现在那一整块是同一个面，
        // 只靠**7 字形自己的轮廓**把凹口划出来（见 `DirectionBoardSevenShape`）。
    }

    /// **左列：Harness 工程树**（只画**命中**的 ✓ —— 用户：「如果用户的内容没有匹配到的话，
    /// 你就不显示，因为如果完全显示的话，可能这个高度就不够了」）。
    ///
    /// 三级：**阶段（执行前/中/后）→ 组（提示词 / 执行与工具 …）→ 条目（角色 / 约束 …）**。
    /// 颜色按用户 2026-09-28 的原话分两档：
    ///   · **条目**命中了 → **绿**（它只有命中才会被画 ✓）；
    ///   · **阶段名与组名**平时是**白**的，**一整个分支全命中**时也变绿 ✓
    ///     （「如果某一个分支下用户全都考虑了，那么整个这个执行前这个字它也高亮」）。
    private var harnessColumn: some View {
        let summary = session.matchedHarness
        let catalog = session.harnessCatalogForDisplay
        return VStack(alignment: .leading, spacing: 2) {
            ForEach(catalog.phases, id: \.self) { phase in
                let groupsInPhase = catalog.groups.filter {
                    $0.phase == phase && !summary.matchedKeywords(inGroup: $0.id).isEmpty
                }
                if !groupsInPhase.isEmpty {
                    Text(phase)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(summary.fullyMatchedPhases.contains(phase)
                                         ? DS.Colors.success : theme.textColor)
                        .padding(.top, 2)
                    ForEach(groupsInPhase) { group in
                        let matched = summary.matchedKeywords(inGroup: group.id)
                        let isWholeGroupMatched = matched.count == group.items.count && !group.items.isEmpty
                        Text(group.title)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(isWholeGroupMatched ? DS.Colors.success
                                                                 : theme.textColor.opacity(0.85))
                            .padding(.leading, 2)
                        ForEach(group.items.filter { matched.contains($0.keyword) }) { item in
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                Text("·").font(.system(size: 11))
                                Text(item.keyword).font(.system(size: 11))
                            }
                            .foregroundStyle(DS.Colors.success)
                            .padding(.leading, 8)
                            .id(item.keyword)
                            .transition(.opacity.combined(with: .offset(y: 4)))
                        }
                    }
                }
            }
        }
        .animation(.easeOut(duration: 0.25), value: summary)
    }

    /// **最下面那一行：模型筛出来的 3 个方向**（用户 2026-09-28：「最多 4 个……多了不要，
    /// 那就这样吧，这 3 个吧，三个显示在一行上」）。
    ///
    /// 样式**照抄最下面原来那一行按钮**（他的原话：「三个按钮的样式应该参考最下边这一行，
    /// 那个取消按钮、执行按钮，它们这些样式就是极简化，然后中间用分割线分割就行了。
    /// 颜色呢，就是正常颜色」）—— 所以是同一套：一整条底 + 格子之间一条细线 +
    /// **一格只留「编号 + 文字」**（编号就是 `1 2 3` 三个字符，没有圆圈底、没有 ✗、没有别的按钮）。
    ///
    /// ⚠️ 这一行**贴住卡片的下沿和左右两边**（负内边距，与原来那条按钮行同一种做法）——
    /// 他要的就是"压缩高度空间"，底下不许再留内边距。
    private var optionRow: some View {
        HStack(alignment: .center, spacing: 0) {
            ForEach(0..<Self.optionSlots, id: \.self) { slot in
                if slot > 0 { cancelRowDivider }
                if slot < session.displayedItems.count {
                    let item = session.displayedItems[slot]
                    optionCell(item)
                } else {
                    // 不够 3 个也照样占着这一格 —— 行的集合恒定，高度与位置都不动。
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .frame(height: Self.cancelRowHeight)
        .background(Self.buttonBarColor)
        // 贴死左/右/下三边（负内边距把这一行顶出横杠的内边距）。
        .padding(.bottom, 0)
    }

    /// 一格选项：`编号 + 关键词`，颜色按它的状态（确认＝绿 / 否定＝红 / 待定＝正文色）。
    ///
    /// 可点（用户一直用它 ——「点一下 = 这个是我想做的」），但**没有任何多余的东西**：
    /// 编号只是两个字符，没有圆圈底、没有 ✗ 按钮（用户 2026-09-28：
    /// 「把这些与文字无关的那些…全都给取消掉，就留一个文字，留一个编号就可以了」）。
    private func optionCell(_ item: DirectionBoardDisplayItem) -> some View {
        let tint: Color = {
            switch item.state {
            case .confirmed: return DS.Colors.success
            case .denied: return DS.Colors.destructive
            case .pending: return theme.textColor
            }
        }()
        return Button {
            session.toggleConfirm(directionID: item.directionID, displayedText: item.keyword)
        } label: {
            HStack(spacing: 4) {
                Text("\(item.number)")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(tint.opacity(0.8))
                Text(item.keyword)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(item.state == .confirmed
              ? "点一下 = 取消这个方向（也可以直接说「第 \(item.number) 个方向」）"
              : "点一下 = 这个是我想做的（也可以直接说「第 \(item.number) 个方向」）")
    }

    /// 左边那一栏里**固定几个方向格**（用户 2026-09-28：3 个，一行）。
    static let optionSlots = 3

    /// **7 的那一竖**：整条脑图（不画标题），宽度与右下角回复卡相同。
    private var mapColumn: some View {
        let value = session.understandingLines.first { $0.label == Self.mindMapLabel }?.value ?? ""
        return Text(value.isEmpty ? Self.emptyValuePlaceholder : value)
            .font(.system(size: 12, design: .monospaced))
            .foregroundStyle(theme.textColor.opacity(value.isEmpty ? 0.35 : 1.0))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .id(value)
            .transition(.opacity)
            .animation(.easeOut(duration: 0.28), value: value)
            .padding(.horizontal, Self.horizontalPadding)
            .padding(.vertical, Self.mapVerticalPadding)
            .frame(width: Self.mapWidth, alignment: .topLeading)
            // **能长多长由屏幕决定**（上限 = 菜单栏以下 × 70%），超了就在下面截断。
            //
            // ⚠️ **这里不能加 `maxHeight: .infinity`**（第一版加了，实测面板恒为横杠的 224 高）：
            // 那会让竖条变成"可伸缩的子视图"，于是 HStack 的高度只由**横杠**决定，
            // 脑图再多也被裁在 224 里 —— 而 "7 的竖条一直往下长" 正是这个形状的意义。
            // 去掉之后高度由内容自己撑（上限只挂在屏幕上），HStack 取两者较大的那个。
            .frame(maxHeight: Self.maximumMapHeight, alignment: .topLeading)
            .clipped()
    }

    /// **左侧那几条问题**（原「矛盾」）：**不画标签**，每行以 `?：` 开头
    ///（用户 2026-09-28：「也不需要写"矛盾"，只需要在**每一行的开头写一个问号，就一个问号**，
    /// 然后冒号右边是那些内容，让用户知道这是个问题」）。
    private var questionLines: some View {
        let value = session.understandingLines.first { $0.label == DirectionBoardPrompt.questionLabel }?.value ?? ""
        let lines = Self.questionTexts(from: value)
        return VStack(alignment: .leading, spacing: 3) {
            if lines.isEmpty {
                Text(Self.emptyValuePlaceholder)
                    .font(.system(size: 12))
                    .foregroundStyle(theme.textColor.opacity(0.35))
            } else {
                ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("?：")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(DS.Colors.accent)
                        Text(line)
                            .font(.system(size: 12))
                            .foregroundStyle(theme.textColor)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .id(line)
                    .transition(.opacity.combined(with: .offset(y: 5)))
                    .animation(.easeOut(duration: 0.28).delay(Double(index) * 0.05), value: line)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        // 预留几行就是几行 —— 内容少了下面空着，卡片高度不动。
        .frame(height: Self.questionRowHeight, alignment: .topLeading)
        .clipped()
    }

    /// 把模型给的那一段拆成"一条一个问题"的行。
    ///
    /// 去掉行首的序号（`一、` / `1.` 这类）—— 左半现在用 `?：` 当行首，再带个序号就重复了。
    /// 提示词里也已经写明不要编号、不要「关于…的疑问：」那种包装（`DirectionBoardPrompt`），
    /// 这里再兜一次：**模型写回老格式时也不会在屏幕上露出两层前缀**。
    static func questionTexts(from rawValue: String) -> [String] {
        rawValue
            .split(separator: "\n")
            .map { DirectionBoardPrompt.questionLineText(String($0)) }
            .filter { !$0.isEmpty }
    }


    /// 那一行没有内容时画的东西（**占位符**：行不能消失，否则卡片会跳）。
    private static let emptyValuePlaceholder = "—"


    // MARK: - 输入框区（**高度固定**）

    // ⚠️ **这里原来有个"补充说明"输入框，用户 2026-09-27 让删掉**：
    // 「把卡片右上角说话时的输入框删掉，这个输入框的功能实在特别低频」。
    // 删掉之后：`session.typedInput` 再也没有人写（它仍然参与提交时那几行的拼装，
    // 但恒为空，于是「用户的补充说明是：…」那一行不会再出现 ✓）；
    // 回车那套里"光标在输入框内"这一支也随之失效 —— `panel.firstResponder is NSTextView`
    // 永远是 false，于是 `Cmd+Enter` 恒等于"粘贴"、`Enter` 恒等于"执行"，正是他要的。

    /// **7 字横杠最下面那一行按钮**：折叠 ｜ 执行 ｜ 取消（2026-09-28 只留这三个）。
    ///
    /// 剩下的（复制 / 退出 / 取消十分钟）**在代码里注释着**，实现一行没删 —— 去掉注释就能回来。
    /// 「取消」的语义（用户）：这一次大循环不再显示看板（**录音照旧**）。
    /// ⚠️⚠️ **2026-09-28：整行注释掉了，`barColumn` 里不再画它**（用户：「什么折叠呀、执行啊、
    /// 这些取消啊，**全都删掉，全都注释掉**」）。看板现在是**纯展示**的：
    /// 执行走 ⌥⏎、退出走 ESC、取消说「取消任务看板」—— 三条路都还在，与这一行无关。
    /// **想放回来**：在 `barColumn` 的最后加一句 `actionRow`（它需要的 `collapseToggle` /
    /// `actionButton` / `cancelButton` 与那几个宽度常量**都原样留着**）。
    private var actionRow: some View {
        // **这一行是"一个按钮"**（用户 2026-09-27 深夜：「最下边这一行**所有的按钮样式变成统一的
        // 样式**，**用颜色来区分**，可以理解为**它们是一个按钮**，颜色不一样，
        // **用分割线和颜色来区分**」）。
        //
        // 所以从"三组各自带底色的圆角块 + 组间留白"改成**一整条**：一个圆角底铺满卡片下沿，
        // 里面每一格同高、同字体、同内边距，**格子之间一律一条纯白细线**，
        // 每一格自己刷所属那一组的颜色（折叠＝中性灰、复制/执行/退出＝绿、取消两档＝暗红）。
        // 三组的宽度、字号、圆角从此不可能漂 —— 它们不是三个控件，是一条按钮上的三段颜色。
        HStack(alignment: .center, spacing: 0) {
            collapseToggle

            cancelRowDivider
            actionButton(title: "执行", icon: "play.fill", width: Self.executeButtonWidth,
                         help: "把当前任务发给主 Agent 去执行（与按 Command + 回车同效）") {
                session.sendTurnAction?()
            }

            cancelRowDivider
            cancelButton(title: "取消", help: "这一次循环不再显示看板（录音照旧）") {
                session.cancelForThisCycle()
            }

            // ⚠️⚠️ **下面三个按钮暂时注释掉（2026-09-28，用户：「只保留折叠按钮、执行按钮、取消按钮，
            // 只保留这三个，其他的以后可以随时取消注释让它功能复现」）**。
            // 它们各自的实现（`session.copyReplyAction` / `exitTurnAction` / `cancelForTenMinutes`）
            // 一个字都没动，去掉注释就能回来 —— 相关的 `actionButton` / `cancelButton` /
            // 宽度常量也都留着。
            //
            //            cancelRowDivider
            //            // **复制**：把右下角那张卡片里 AI 回复的内容复制下来。
            //            actionButton(title: "复制", icon: "doc.on.doc", width: Self.copyButtonWidth,
            //                         help: "把右下角那张卡片里 AI 回复的内容复制下来",
            //                         isEnabled: session.hasCopyableReply) {
            //                session.copyReplyAction?()
            //            }
            //
            //            cancelRowDivider
            //            // **退出**：不执行，直接取消这一轮（与按 ESC 同效）。
            //            actionButton(title: "退出", icon: "xmark", width: Self.exitButtonWidth,
            //                         help: "不执行，直接取消这一轮（与按 ESC 同效）") {
            //                session.exitTurnAction?()
            //            }
            //
            //            cancelRowDivider
            //            cancelButton(title: "取消十分钟", help: "十分钟内不显示（包括新开的循环）") {
            //                session.cancelForTenMinutes()
            //            }
        }
        .frame(height: Self.cancelRowHeight)
        // 一整条的底 —— 各格自己的颜色刷在上面，所以这里只是"缝"和圆角的底色。
        .background(Self.buttonBarColor)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        // **贴住卡片的下沿和左右两边**（用户 2026-09-27：「按钮最左边跟卡片外边框之间有间距，
        // **不应该有间距**」）。做法是把整行向外顶出卡片内边距那么多 ——
        // 于是它从左边缘到下边缘到右边缘都是通的，读起来就是卡片底部那一条。
        .padding(.horizontal, -Self.horizontalPadding)
        .padding(.bottom, -Self.cardBottomPadding)
        // ⚠️ **这里不许再加 `frame(height:)`**：负内边距是靠"内容的布局高度比它画出来的高度
        // 小 10pt"起作用的，再套一个 frame 就把这个高度**顶回去**、负内边距等于没写
        //（第一版就是这么写的，屏幕上量到的仍是 15pt 的缝）。
    }

    /// 这一整条的底色（各格自己的颜色刷在上面，所以它只在格子之间的缝里露出来）。
    private static let buttonBarColor = Color.white.opacity(0.04)
    /// 取消那一行**左侧那两个按钮的底色**    /// 取消那一行**左侧那两个按钮的底色**（中性 —— 它们不是"取消"）。
    private static let actionButtonColor = DS.Colors.success.opacity(0.12)
    /// 两个按钮各自的宽度（用户 2026-09-27：「复制的按钮要小一点，因为它就两个字；
    /// 复制并退出的按钮大一点」）。
    private static let copyButtonWidth: CGFloat = 58
    private static let executeButtonWidth: CGFloat = 58
    private static let exitButtonWidth: CGFloat = 58

    /// 三档之间的分割线 —— 用户 2026-09-27：「它们中间的分割线你给它画得**再亮一点、再大一点，
    /// 颜色再明确一点，用白色**」。所以是**纯白**（不是原来那种 12% 白），而且比原来高
    /// （16 → 20，跟这一行 26 的高度比是能一眼看见的）。
    private var cancelRowDivider: some View {
        Rectangle()
            .fill(Self.cancelRowDividerColor)
            .frame(width: 1.5, height: Self.cancelRowHeight - 6)
    }

    /// 复制 / 复制并退出 —— 中性色（`surface2` 底 + 正文色字），与三档取消明确区分。
    private func actionButton(title: String,
                              icon: String,
                              width: CGFloat,
                              help: String,
                              isEnabled: Bool = true,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 10, weight: .semibold))
                Text(title).font(.system(size: 11, weight: .medium))
            }
            // **绿色**（用户 2026-09-27：「它的字体、背景颜色是绿色」，与右侧那套极简风格一致）。
            .foregroundStyle(DS.Colors.success)
            .frame(width: width, height: Self.cancelRowHeight)
            // 每一格自己刷底色 —— 一条按钮上的三段颜色就是这么来的。
            .background(Self.actionButtonColor)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
        // ⚠️ **只有「复制」受这条管**（右下角那张卡片是空的时候没什么可复制）。
        // 第一版把 `.disabled` 加在 `actionButton` 里，于是「执行」「退出」也跟着灰了 ——
        // 而那两个键任何时候都该能按（没有可复制的内容 ≠ 不能执行/不能退出）。
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.4)
    }

    private func cancelButton(title: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Self.cancelRowTextColor)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Self.cancelRowColor)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    /// 用户 2026-09-27 深夜：「最下面这一行的按钮**高度增加 30%**，现在太小了」
    ///（上一轮刚按他说的减了 20%，他看完说太小 —— 21 → **27**）。
    private static let cancelRowHeight: CGFloat = 27
    /// 暗红：比正文暗、比背景亮，一眼看出是"关掉它"这一类的动作，但不至于抢走注意。
    private static let cancelRowColor = Color(red: 0.35, green: 0.09, blue: 0.10)
    private static let cancelRowTextColor = Color(red: 0.98, green: 0.72, blue: 0.72)
    private static let cancelRowDividerColor = Color.white

    private var sectionDivider: some View {
        Rectangle()
            .fill(theme.textColor.opacity(0.10))
            .frame(height: 1)
    }
}

/// **7 字形那条轮廓**：左上一条横杠 + 右侧一整条竖条（长出来的是那条竖条）。
///
/// 用户 2026-09-28 给的形状 —— 右下角那张 AI 回复卡就嵌进 **凹口** 里（横杠在上、竖条在右）。
/// 四个外角圆角；**凹口那两个内角都是直角** —— 脑图的左下角先是加了圆角，用户在真机上看过之后
/// 改回直角（2026-09-28：「右侧卡片的左下角，还是设置成**没有圆角**的形式吧」）。
///
/// ⚠️ **左上角那一段圆弧不能漏**（第一版漏了）：`closeSubpath()` 会从底左角直接连回起点，
/// 左边缘于是成了**斜线** —— 屏幕上看就是"整个左边是畸形的梯形"
///（用户 2026-09-28 截图圈出来的正是它）。
struct DirectionBoardSevenShape: Shape {
    /// 横杠（左半内容）的宽度 —— 竖条从这条线往右开始。
    var barWidth: CGFloat
    /// 横杠的高度 —— 凹口的顶边就是它。
    var barHeight: CGFloat
    var cornerRadius: CGFloat = AnswerCardView.cardCornerRadius

    func path(in rect: CGRect) -> Path {
        let radius = max(0, min(cornerRadius, min(rect.width, rect.height) / 2, barHeight / 2))
        let barBottom = rect.minY + barHeight
        let innerX = min(rect.minX + barWidth, rect.maxX)
        var path = Path()
        // 从左边缘（底左角圆角之上）起，顺时针一圈。坐标系 y 向下，所以角度 0° = 向右、90° = 向下。
        path.move(to: CGPoint(x: rect.minX, y: barBottom - radius))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addArc(center: CGPoint(x: rect.minX + radius, y: rect.minY + radius),
                    radius: radius,
                    startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
                    radius: radius,
                    startAngle: .degrees(270), endAngle: .degrees(360), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
                    radius: radius,
                    startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        // 竖条的下沿往左，走到**脑图的左下角（直角）** —— 再沿竖条的左边缘往上。
        path.addLine(to: CGPoint(x: innerX, y: rect.maxY))
        path.addLine(to: CGPoint(x: innerX, y: barBottom))
        // 凹口的顶边（横杠的下沿）往左 → 底左角圆角 → 回到起点。
        path.addLine(to: CGPoint(x: rect.minX + radius, y: barBottom))
        path.addArc(center: CGPoint(x: rect.minX + radius, y: barBottom - radius),
                    radius: radius,
                    startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.closeSubpath()
        return path
    }
}
