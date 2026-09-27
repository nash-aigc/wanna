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

    /// **宽度固定，不随内容长**（用户 2026-09-27 两次强调）：
    /// 「卡片的宽度需要固定……**不能超过它的两倍**……要么一倍，要么两倍」
    /// 「让它固定显示为**两倍宽度**，这个宽度可以让用户去设定，设置页面里可以设定，
    /// 但**默认固定两倍宽度**，以便显示更多内容」。
    ///
    /// 所以宽度 = **结果卡片宽度（340）× 用户设的倍数**（默认 2 → 680），而且**恒定** ——
    /// 内容多了不撑宽，只多排几行（列数由这条宽度反推出来）。
    /// 左下角固定由面板那一侧保证（`directionBoardPanelFrame` 的原点 = 鼠标 +12pt）。
    /// 卡片的**基准宽度**：1 倍 = 240、1.5 倍 = 360、2 倍 = **480**（默认）。
    ///
    /// 用户 2026-09-27：「把卡片的宽度再缩小 50%，现在太宽了」——
    /// 680 减一半是 340，但那样**选项格会掉到 1 列**（4 列要 ~656pt）、理解四行也会大量折行，
    /// 卡片会变成又窄又高的一条。问过他之后选的是 **480（−30%）**：选项格 2 列、按钮行照旧放得下。
    /// 基准跟着从 340 调到 240，这样设置页那三档（1 / 1.5 / 2 倍）的**相对关系不变**，
    /// 默认值也仍然是 2 倍 —— 不用迁移任何存盘的值。
    static let resultCardWidth: CGFloat = 240
    /// 一格的最小宽度 —— 它决定"这条宽度里排几列"：680 的卡片用掉 24 的左右边距之后是 656，
    /// 656 / 164 = **4 列**（用户 2026-09-27：「改成 4 列显示吧，现在 3 列太窄了，
    /// 每个卡片的空白间距太大」—— 原来是 190，算出来是 3 列）。
    static let columnWidth: CGFloat = 152    // 480 的卡片（可用 456）→ **3 列**（用户 2026-09-27：
                                             // 「卡片是三列，现在还是两列」）
    static let horizontalPadding: CGFloat = 12

    /// 这张卡片该多宽（**与内容无关**，只看设置里那个倍数）。
    static func cardWidth(forMultiplier multiplier: Double) -> CGFloat {
        let clamped = min(max(multiplier, 1.0), 2.0)
        return resultCardWidth * CGFloat(clamped)
    }

    /// 这条宽度里能排几列（至少 1 列，最多 5 列 —— 用户：「最多不要超过 5 列」）。
    static func columnCount(forMultiplier multiplier: Double, itemCount: Int) -> Int {
        let usableWidth = cardWidth(forMultiplier: multiplier) - horizontalPadding * 2
        let fitting = Int(usableWidth / columnWidth)
        return min(max(min(fitting, max(itemCount, 1)), 1), 5)
    }

    /// **每一行文字占的高度** —— 用它把「目标 / 细节 / 疑问」的高度**提前定死**。
    ///
    /// 用户 2026-09-27：「目标预留三行内容，细节预留五行内容，固定下来……不要让卡片高度总是变化。
    /// 如果显示不完全，就隐藏」，随后改成「细节显示为 7 行，需要提前预留 7 行」，
    /// 并新增一行「疑问」预留 4 行；以及「目标和细节这两行内容的高度**总是不固定，总是漂移**……
    /// 内容渲染到右侧提前预留的空行部分，**不要因为生成了新内容就让整个标题和内容上下晃动**」。
    static let understandingLineHeight: CGFloat = 16
    /// 每一行预留几行（顺序与 `understandingLabels` 一致）。
    static let reservedLineCounts: [String: Int] = ["目标": 3, "细节": 7, "疑问": 4]

    /// 用户设的宽度倍数（默认 2）。
    private var widthMultiplier: Double {
        AppSettingsStore.snapshot().directionBoardWidthMultiplier
    }

    private var columnCount: Int {
        Self.columnCount(forMultiplier: widthMultiplier, itemCount: session.displayedItems.count)
    }
    /// 编号那一列有多宽（「第三个方向」里的 3）。
    private static let numberColumnWidth: CGFloat = 18

    var body: some View {
        Group {
            if session.isCollapsed {
                collapsedCard
            } else {
                expandedCard
            }
        }
        .padding(.horizontal, Self.horizontalPadding)
        .padding(.vertical, 10)
        // **折叠之后整张卡片就只剩那个按钮**（用户：「折叠后……变成一个折叠按钮」）——
        // 所以宽度也跟着收，不然屏幕上会留一条 680 宽的空条。
        .frame(width: session.isCollapsed
               ? Self.collapseHalfWidth * 2 + Self.horizontalPadding * 2
               : Self.cardWidth(forMultiplier: widthMultiplier),
               alignment: .leading)
        .background(AnswerCardView.cardBackground(theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous)
                // 被按住不发 → 告警色呼吸；**折叠着 → 绿色**（用户：「折叠后卡片边缘自动变成绿色，
                // 便于用户快速在桌面上看到其位置」）；其余用主题边框。
                .strokeBorder(borderTint, lineWidth: borderWidth)
                .animation(.easeInOut(duration: 0.35), value: session.isHeldFromAutomaticSend)
                .animation(.easeInOut(duration: 0.25), value: session.isCollapsed)
        )
        .shadow(color: Color.black.opacity(0.30), radius: 10, x: 0, y: 4)
        .contentShape(Rectangle())
        .onTapGesture { onCardTapped() }
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
    private var collapseToggle: some View {
        HStack(spacing: 0) {
            Button {
                session.isCollapsed.toggle()
            } label: {
                Image(systemName: session.isCollapsed ? "chevron.right" : "chevron.left")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(session.isCollapsed ? DS.Colors.success : theme.textColor.opacity(0.75))
                    .frame(width: Self.collapseHalfWidth, height: Self.cancelRowHeight)
                    .background(Self.collapseClickableColor)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(session.isCollapsed ? "展开看板" : "把看板折叠起来")

            // 右半：**故意不给功能** —— 它是留给鼠标按住拖动的地方（底色也刻意不同）。
            Color.clear
                .frame(width: Self.collapseHalfWidth, height: Self.cancelRowHeight)
                .background(Self.collapseDragColor)
        }
        // **不加自己的边框**（用户 2026-09-27：「外边框也就是折叠按钮的边框，**不要再增加一个边框**」）——
        // 它就是卡片左下角那一块，边框由卡片本身给。折叠态时卡片的边框变绿，那也就是它的边框。
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private static let collapseHalfWidth: CGFloat = 26
    /// 左半（能点）与右半（只能拖）的底色 —— 他要"用颜色区分开"。
    private static let collapseClickableColor = Color.white.opacity(0.13)
    private static let collapseDragColor = Color.white.opacity(0.03)

    private var expandedCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            // 上半：**会长高的那一半** —— 只有他说到的方向才出现，最多 5 行。
            if !session.displayedItems.isEmpty {
                directionList
                sectionDivider
            }
            // ⚠️ **这里原来有一行「任务结果」**（模型算出来的答案）。用户 2026-09-27 把它删掉了
            //（「你注意，我刚才是把这个任务结果删掉了」）—— **答案归鼠标右下角那张卡片**
            //（`CompanionManager.answerPreviewText`，与最终结果同一张），右上角只回答
            //「我理解得对不对」。所以这一段现在直接从选项跳到理解。
            // **参考材料的标签**（用户 2026-09-27：「在表格下面、AI 回复上面添加几个小标签」）——
            // 只有**真的拿到了**才画（采集器只在成功时写材料，所以这条是结构上成立的）。
            if !referenceCollector.materials.tags.isEmpty {
                referenceTagRow
            }
            // 第三段：理解（**固定四行**，见 `understoodRow`）。
            understandingArea
            // （第四段原来在这里：那个"补充说明"输入框，已按用户要求删掉。
            //   左侧那条竖折叠条也一起挪走了 —— 用户 2026-09-27：「这个输入框左侧这个折叠的东西，
            //   你就把它显示到复制的按钮左侧吧，然后把它横向显示」。见 `collapseToggle`。）
            // 最下面一行：**取消看板**的三档（用户 2026-09-27：「把最下面这一行分成三列：
            // 第一列叫「取消本次」……第二列叫「取消十分钟」……第三列叫「取消今日」」）。
            cancelRow
        }
        // ⚠️ **拖动不在这里做**：它是面板那一侧用 NSEvent 监听做的（见
        // `DirectionBoardPanelController` 的 `installDragMonitors`）。
        // 两个原因，都是量出来的：
        //  · SwiftUI 的 `DragGesture` 会**吞掉点击**（`minimumDistance` 调大才不吞，
        //    而那又让它丢掉起步那几 pt）；
        //  · 它给的 `translation` 是在**卡片自己的坐标系**里量的，而卡片正随着窗口一起动 ——
        //    于是每次只能拿到"还差的那一半"（实测拖 −180 只走了 −92，增益 1/2）。
        // 监听走的是**光标的绝对屏幕位置 + 按下那一刻的抓取偏移**，增益恒等于 1，也不吃点击。
    }

    // MARK: - 方向区（只画说到的那些，每格一个连续编号）

    private var directionList: some View {
        // **多列**（用户：「表格上面那几个表格应该是多列的，不是单列，你现在是单列、多行。
        // 我的意思是多行可以多列，可以到 2 到 3 列」）—— 有几个方向就排几列（最多 5），
        // 超过 5 个才换行。
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8),
                                 count: columnCount),
                  alignment: .leading,
                  spacing: 6) {
            ForEach(session.displayedItems, id: \.directionID) { item in
                directionRow(item)
            }
        }
    }

    private func directionRow(_ item: DirectionBoardDisplayItem) -> some View {
        // 状态**就在这一格上**（固定状态存在文件里，`displayedItems` 每轮带着它）——
        // 不再有第二份"界面上的选中状态"要去同步。
        let state = item.state
        let text = item.keyword
        let textColor: Color = {
            switch state {
            case .confirmed: return DS.Colors.success
            case .denied: return DS.Colors.destructive
            case .pending: return theme.textColor
            }
        }()

        return HStack(spacing: 6) {
            // **编号**：用户说「第三个方向」指的就是它。
            Text("\(item.number)")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(state == .pending ? theme.textColor.opacity(0.75) : textColor)
                .frame(width: Self.numberColumnWidth, height: 18)
                .background(
                    Circle().fill(textColor.opacity(state == .pending ? 0.12 : 0.20))
                )

            Text(text)
                .font(.system(size: 12, weight: state == .pending ? .regular : .semibold))
                .foregroundStyle(textColor)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
                // 点文字 = 选中（用户：「任务方向可以通过点击的方式选择，用户点击某一个方向即可」）。
                .contentShape(Rectangle())
                .onTapGesture {
                    session.toggleConfirm(directionID: item.directionID, displayedText: text)
                }
                .help("点一下 = 这个是我想做的（也可以直接说「第 \(item.number) 个方向」）")

            Button {
                session.toggleDeny(directionID: item.directionID)
            } label: {
                Image(systemName: state == .confirmed ? "checkmark" : "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(textColor.opacity(state == .pending ? 0.5 : 1.0))
                    .frame(width: 14, height: 14)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("点一下 = 这个不是我想做的")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(backgroundColor(for: state))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(borderColor(for: state), lineWidth: 1)
        )
    }

    private func backgroundColor(for state: DirectionBoardDisplayItem.State) -> Color {
        switch state {
        case .confirmed: return DS.Colors.success.opacity(0.18)
        case .denied: return DS.Colors.destructive.opacity(0.18)
        case .pending: return theme.textColor.opacity(0.06)
        }
    }

    private func borderColor(for state: DirectionBoardDisplayItem.State) -> Color {
        switch state {
        case .confirmed: return DS.Colors.success.opacity(0.8)
        case .denied: return DS.Colors.destructive.opacity(0.8)
        case .pending: return theme.textColor.opacity(0.14)
        }
    }

    // MARK: - 参考材料的标签

    /// 这一轮带上了什么：**左边是拿到的**（「屏幕一」「屏幕二」「剪贴板」「文件」「文件夹」），
    /// **右边是说了「参考」但没拿到的**（「无法识别：剪贴板」）。
    ///
    /// 用户 2026-09-27：「即便用户说了"参考"，但没有找到，就直接在……看板上显示"无法识别"」
    /// +「左侧是识别到的，右侧是用户需求需要、但没有识别到的东西」。
    ///
    /// 样式也是他定的：「改大一点，做成矩形，**上下边距小一点**，加上圆角，字体大一点」——
    /// 所以从 Capsule(10pt 字) 改成 RoundedRectangle(12pt 字、垂直 1pt)。
    private var referenceTagRow: some View {
        HStack(spacing: 6) {
            // **左侧标题「参考」**（用户 2026-09-27：「最上面一行（屏幕一、屏幕二）左侧加标题「参考」」）。
            // 它也是原来那一行「参考」被删掉之后的去处 —— 参考材料这件事现在由这排标签代表。
            // **「参考」占的正是下面那个标签列**（用户 2026-09-27：「左侧的标题要对齐……
            // 现在屏幕上这些标签比下面的内容更靠左，应该让它们在竖直方向上的位置固定、确定」）——
            // 所以它用与「目标/细节/疑问」**同一个宽度**，标签于是从**内容列**开始，整块是齐的。
            Text("参考")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(theme.textColor.opacity(0.55))
                .frame(width: Self.understandingLabelWidth, alignment: .leading)
            ForEach(referenceCollector.materials.tags, id: \.self) { tag in
                referenceTag(tag, tint: DS.Colors.success)
            }
            Spacer(minLength: 8)
            // **多张截图时明确"以最近一次为准"**（用户 2026-09-27：「用户询问屏幕内容时，重点关注
            // 最近一次屏幕截图……避免回复最初的屏幕内容」）。提示词里也写了同一句（见
            // `TurnReferenceMaterials.promptBlock`）—— 界面上标出来是为了让他知道这条生效了。
            if referenceCollector.materials.screenshots.count > 1 {
                referenceTag("重点关注最近一次屏幕内容", tint: DS.Colors.accent)
            }
            ForEach(referenceCollector.materials.unresolved, id: \.self) { label in
                referenceTag("无法识别：" + label, tint: DS.Colors.warning)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(.opacity)
        .animation(.easeOut(duration: 0.2), value: referenceCollector.materials.tags)
        .animation(.easeOut(duration: 0.2), value: referenceCollector.materials.unresolved)
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

    /// **四行固定**：目标问题 / 类型 / 参考 / 细节（顺序、标签都由 `DirectionBoardPrompt` 给）。
    ///
    /// 用户 2026-09-27 的两句合起来就是这一段的设计：「他回复结果的时候总是跳、总是蹦……
    /// 内容有时候有软件目标细节，有时候没有」+「这几行固定在这，而不是突然间有、突然间没有，
    /// 这对体验影响太差了」。所以：行的集合恒定、值可能为空（画占位符）、**卡片高度因此恒定**。
    private var understandingArea: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(session.understandingLines.enumerated()), id: \.offset) { index, line in
                understandingRow(label: line.label, value: line.value, revealIndex: index + 1)
            }
        }
        // 整块**高度固定**（各行自己预留了几行就占几行）—— 这样内容来了也只是填进预留的位置，
        // 卡片高度与标题位置都不动。
        // ⚠️ 这里原来有一个 ✕（"这个理解不对"）。**删掉了**：理解现在是**无条件**跟着提示词发给
        // 模型的（用户 2026-09-27：「这个大语言模型的理解，你可以去发，发过去」），
        // 也就是说"确认"这个动作没有意义了 —— 一个点了不改变任何事情的按钮比没有按钮更糟。
    }

    /// 一行理解：左边标签定宽，右边值（**空值画占位符**，不是不画）。
    private func understandingRow(label: String, value: String, revealIndex: Int) -> some View {
        let reservedHeight = CGFloat(Self.reservedLineCounts[label] ?? 3) * Self.understandingLineHeight
        return HStack(alignment: .top, spacing: 6) {
            // 标签列顶对齐（`alignment: .top`）——「左侧的标题要对齐」。
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(theme.textColor.opacity(0.55))
                // 标签定宽按**最长的那一个**（「目标问题」四个字）算 —— 写死 26 会让它折行。
                .frame(width: Self.understandingLabelWidth, alignment: .leading)
            Text(value.isEmpty ? Self.emptyValuePlaceholder : value)
                // 「细节」那张关系图要**等宽**才对齐（用户要的竖形图/脑图，靠的就是字符对齐）。
                .font(.system(size: 12,
                              design: label == "细节" ? .monospaced : .default))
                .foregroundStyle(theme.textColor.opacity(value.isEmpty ? 0.35 : 1.0))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(value)
                .transition(.opacity.combined(with: .offset(y: 6)))
        }
        // **高度提前定死**：这些行有多少内容都占这么多（超出隐藏）——
        // 于是新内容只是填进预留的位置，标题与内容都不会上下晃。
        .frame(height: reservedHeight, alignment: .top)
        .clipped()
        // 换了内容就淡入（用户：「我希望让它有一种动画效果，而不是突然间显示出来」）——
        // 逐行错开一点点，四行看起来是"写进去"的，而不是整块跳出来。
        .animation(.easeOut(duration: 0.28).delay(Double(revealIndex) * 0.05), value: value)
    }

    /// 那一行没有内容时画的东西（**占位符**：行不能消失，否则卡片会跳）。
    private static let emptyValuePlaceholder = "—"
    /// 标签那一列的宽度（按「目标问题」四个字量出来的）。
    private static let understandingLabelWidth: CGFloat = 50


    // MARK: - 输入框区（**高度固定**）

    // ⚠️ **这里原来有个"补充说明"输入框，用户 2026-09-27 让删掉**：
    // 「把卡片右上角说话时的输入框删掉，这个输入框的功能实在特别低频」。
    // 删掉之后：`session.typedInput` 再也没有人写（它仍然参与提交时那几行的拼装，
    // 但恒为空，于是「用户的补充说明是：…」那一行不会再出现 ✓）；
    // 回车那套里"光标在输入框内"这一支也随之失效 —— `panel.firstResponder is NSTextView`
    // 永远是 false，于是 `Cmd+Enter` 恒等于"粘贴"、`Enter` 恒等于"执行"，正是他要的。

    /// **取消看板那一行**：暗红色、三列、有高度（用户：「这一行要有一定的高度，颜色是暗红色」）。
    ///
    /// 三档的语义（用户）：取消本次 = 这一次大循环；取消十分钟 = 十分钟内（本循环或新循环）都不显示；
    /// 取消今日 = 到**明天凌晨 0 点**为止（不是"24 小时之后"）。
    private var cancelRow: some View {
        HStack(spacing: 0) {
            // **两个"不是取消"的按钮**（用户 2026-09-27：「在取消这一行的最左侧增加一个按钮，
            // 叫复制按钮……它的右侧还有一个按钮，叫复制并退出」）——
            // 刻意用中性色并与那三档之间隔一条线：它们是"把结果拿走"，不是"把这一轮丢掉"，
            // 混成暗红会让人以为按了会丢东西。
            // **折叠钮贴左下角**（用户 2026-09-27：「最左侧是折叠按钮，**左边距、下边距为 0，
            // 也就是贴紧边缘，类似从左下角长出来一样**。可以理解为左下角有一个正方形」）。
            // 所以它不能再被卡片的 12pt 内边距套住 —— 用负 padding 把它顶到边上（见下面 buttonRowInset）。
            collapseToggle

            // **两个复制按钮是"一整块"**（用户 2026-09-27：「你让他们的两个按钮合并成一个，
            // 就是**样式上合并成一个**，然后**中间有条细线**，就跟右侧是一样的」）——
            // 与右边那三档完全同一种做法：一个圆角底 + 里面一条**纯白细线**，
            // 而不是两个各自带底色的圆角块中间夹一条线（那是上一版，他说没改对）。
            // **复制 / 执行 / 退出**（用户 2026-09-27：「右侧分别是复制按钮、执行按钮和退出按钮。
            // 执行按钮就是**执行并退出**，退出按钮是**不执行、直接取消任务**」）——
            // 一整块底 + 中间两条纯白细线，与右侧那三档同一种做法。
            HStack(spacing: 0) {
                actionButton(title: "复制", icon: "doc.on.doc", width: Self.copyButtonWidth,
                             help: "把右下角那张卡片里 AI 回复的内容复制下来",
                             isEnabled: session.hasCopyableReply) {
                    session.copyReplyAction?()
                }
                Rectangle().fill(Self.cancelRowDividerColor).frame(width: 1.5, height: 20)
                actionButton(title: "执行", icon: "play.fill", width: Self.executeButtonWidth,
                             help: "把当前任务发给主 Agent 去执行（与按 Command + 回车同效）") {
                    session.sendTurnAction?()
                }
                Rectangle().fill(Self.cancelRowDividerColor).frame(width: 1.5, height: 20)
                actionButton(title: "退出", icon: "xmark", width: Self.exitButtonWidth,
                             help: "不执行，直接取消这一轮（与按 ESC 同效）") {
                    session.exitTurnAction?()
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Self.actionButtonColor)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .opacity(session.hasCopyableReply ? 1 : 0.45)

            // 中性按钮与三档取消之间隔一条**空白**（不是分割线）：底色的分界本身就把它们分开了。
            Spacer().frame(width: 8)

            // 三档取消自成一组，**暗红底色只给这一组** —— 那两个按钮是"拿走结果"，
            // 不该跟着一起变红。
            HStack(spacing: 0) {
                cancelButton(title: "取消本次", help: "这一次循环不再显示看板（录音照旧）") {
                    session.cancelForThisCycle()
                }
                cancelRowDivider
                cancelButton(title: "取消十分钟", help: "十分钟内不显示（包括新开的循环）") {
                    session.cancelForTenMinutes()
                }
                // 「取消今日」按用户 2026-09-27 的要求删掉（「卡片右下角「取消」「今日」删除」）。
                // 那三档的总闸门仍在设置页与「取消任务看板」那句话里 —— 只是这一行不再画它。
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Self.cancelRowColor)
            )
        }
        .frame(height: Self.cancelRowHeight)
    }

    /// 取消那一行**左侧那两个按钮的底色**（中性 —— 它们不是"取消"）。
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
            .frame(width: 1.5, height: 20)
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
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    private static let cancelRowHeight: CGFloat = 26
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
