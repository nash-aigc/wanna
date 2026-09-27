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
    /// 用户 2026-09-27：「卡片整体宽度在之前缩小 30% 的基础上**增加回来**，
    /// **约为右下角卡片宽度的两倍**」→ 340 × 2 = **680**。
    static let resultCardWidth: CGFloat = 340
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

    /// **左列里那条表格排几列**：恒为 **2**（用户 2026-09-27 深夜：「标签3行肯定写不下，
    /// **写成2行就好**」）。
    ///
    /// 不能再用整张卡片的宽度去算：表格现在住在**左列**里（262pt），按 680pt 那套算会得出
    /// 4 列，在 262pt 里挤成一团。2 列 × 2 行 = 看得见 4 个方向，与他要的"两行"一致。
    private var directionColumnCount: Int {
        max(min(session.displayedItems.count, 2), 1)
    }

    /// **每一行文字占的高度** —— 用它把「目标 / 细节 / 疑问」的高度**提前定死**。
    ///
    /// 用户 2026-09-27：「目标预留三行内容，细节预留五行内容，固定下来……不要让卡片高度总是变化。
    /// 如果显示不完全，就隐藏」，随后改成「细节显示为 7 行，需要提前预留 7 行」，
    /// 并新增一行「疑问」预留 4 行；以及「目标和细节这两行内容的高度**总是不固定，总是漂移**……
    /// 内容渲染到右侧提前预留的空行部分，**不要因为生成了新内容就让整个标题和内容上下晃动**」。
    static let understandingLineHeight: CGFloat = 16
    /// 每一行预留几行（顺序与 `understandingLabels` 一致）。
    /// 用户 2026-09-27 深夜第三轮：**疑问缩小两次 30%**（10 → **5 行**，「太大了，整个高度宽度
    /// 占用太大」）、**目标再增加一点**（6 → **8 行**，「目标也太墨迹了」—— 地方给足、话要少）。
    /// 键就是卡片上显示的那两个字 —— 2026-09-27 深夜随标签一起改名
    ///（用户：「把左侧这个**目标**调整为**需求**，把**疑问**调整为**矛盾**，
    /// 因为左侧其实就是在**了解用户的需求**」）。
    /// ⚠️ 2026-09-27 深夜：左侧只剩「矛盾」（「需求」并进了右侧那张脑图）。
    /// 2026-09-27 深夜：加了第三行。名字先是「歧义」，随后按用户的意思改成「**拼写错误**」——
    /// 他在用语音输入法：「让 AI 思考一下**哪些单词可能存在拼写错误**」。
    static let reservedLineCounts: [String: Int] = ["细节": 7, "矛盾": 5, "拼写错误": 4]

    /// **脑图那一行是哪一行**（「细节」）—— 它单独占右栏，且**不画标题**。
    static let mindMapLabel = "细节"
    /// 左栏宽度 = 卡片宽度的 **40%**（用户指定的比例）。
    private var understandingColumnWidth: CGFloat {
        // 用户 2026-09-27 深夜第四轮：「**左侧有点太宽了，把左侧缩小 20%**」→ 48% × 0.8 = 38.4%。
        (Self.cardWidth(forMultiplier: widthMultiplier) - Self.horizontalPadding * 2) * 0.384
    }
    /// 方向格**固定三行**的高度（每行 = 一个格子的高度 28 + 行距 6）。
    /// 表格固定几行（用户 2026-09-27：「最上面这个表格**写成四行**」）。
    static let directionGridRows = 4
    private static let directionGridHeight: CGFloat = CGFloat(directionGridRows) * 28
        + CGFloat(directionGridRows - 1) * 6

    /// 内容那一整块的高度（固定）：左列要装下「表格 2 行 + 参考 1 行 + 目标 4 行 + 疑问 5 行」，
    /// 右列的脑图就铺满这个高度（用户：「**右侧全部都是脑图**」）。
    /// 参考标签那一行的高度：**固定两行**（单行时下面空着）—— 理由见 `referenceTagRow`。
    /// 参考标签那一块固定几行（用户 2026-09-27：「参考这块**写成三行**」）。
    static let referenceTagRowLines = 3
    /// 参考那一块的高度 = **标题那一行** + 三行标签。
    private static let referenceTagRowHeight: CGFloat = understandingLabelHeight
        + CGFloat(referenceTagRowLines) * 17 + CGFloat(referenceTagRowLines - 1) * 4

    private static var contentBlockHeight: CGFloat {
        // 左列「装得下」的最低要求：表格 2 行 + 参考 2 行 + 目标 6 行 + 疑问 10 行 + 三处间距。
        // 左列：参考 + 矛盾（5 行）+ 拼写错误（4 行）。
        let leftColumnRequirement = directionGridHeight
            + referenceTagRowHeight                       // 含它自己的标题行
            + understandingLabelHeight + understandingLineHeight * 5   // 矛盾：标题 + 5 行
            + understandingLabelHeight + understandingLineHeight * 4   // 拼写错误：标题 + 4 行
            + 20                                          // 三处间距：8 + 8 + 4
        // 用户 2026-09-27 深夜：「……**整体高度再增加一倍**」—— 上一版这一块是 264，
        // 所以取两者里更大的那个：行数是下限，翻倍是他明写的数。多出来的高度全给右栏那张脑图
        //（他要的就是「右侧全部都是脑图」）。
        let doubledFromPreviousVersion: CGFloat = 2 * 264
        return max(leftColumnRequirement, doubledFromPreviousVersion)
    }

    /// 用户设的宽度倍数（默认 2）。
    private var widthMultiplier: Double {
        AppSettingsStore.snapshot().directionBoardWidthMultiplier
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
        .padding(.top, Self.cardBottomPadding)
        .padding(.bottom, Self.cardBottomPadding)
        // **折叠之后整张卡片就只剩那个按钮**（用户：「折叠后……变成一个折叠按钮」）——
        // 所以宽度也跟着收，不然屏幕上会留一条 680 宽的空条。
        .frame(width: session.isCollapsed
               ? Self.collapseButtonWidth * 3 + Self.horizontalPadding * 2
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
        // 他在说话 → 灯亮起（并开始呼吸）；停下来 → 立刻停（用户：「检测不到用户在说话，
        // 就停止呼吸」）。
        .onChange(of: session.isUserSpeaking) { _, isSpeaking in isBreathing = isSpeaking }
        .onAppear { isBreathing = session.isUserSpeaking }
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
    /// 左 1/3（能点）与右 2/3（只能拖）的底色 —— 他要"用颜色区分开"。
    private static let collapseClickableColor = Color.white.opacity(0.13)
    private static let collapseDragColor = Color.white.opacity(0.03)

    private var directionList: some View {
        // **多列**（用户：「表格上面那几个表格应该是多列的，不是单列，你现在是单列、多行。
        // 我的意思是多行可以多列，可以到 2 到 3 列」）—— 有几个方向就排几列（最多 5），
        // 超过 5 个才换行。
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8),
                                 count: directionColumnCount),
                  alignment: .leading,
                  spacing: 6) {
            if session.displayedItems.isEmpty {
                // 一行占位（与别的行同一个宽度、同一个高度）—— 卡片在这一块**高度与位置都不动**。
                Text(Self.emptyValuePlaceholder)
                    .font(.system(size: 12))
                    .foregroundStyle(theme.textColor.opacity(0.35))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(theme.textColor.opacity(0.04))
                    )
                    .gridCellColumns(directionColumnCount)
            }
            ForEach(session.displayedItems, id: \.directionID) { item in
                directionRow(item)
            }
        }
        // **固定占两行的高度**（用户 2026-09-27 深夜：「标签3行肯定写不下，**写成2行就好**」——
        // 表格现在住在左列里，左列只有 262pt 宽，排 2 列正好、第 3 行放不下）——
        // 于是这一块也**不再随卡片里有多少个方向而变高变矮**，多的被裁掉（`maximumItemCount` 另有上限）。
        .frame(height: Self.directionGridHeight, alignment: .top)
        .clipped()
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
        // **标题在上、标签在下**（与「目标 / 疑问」同一套 —— 见 `understandingRow` 的注释）。
        VStack(alignment: .leading, spacing: 2) {
            Text("参考")
                .font(.system(size: Self.understandingLabelFontSize, weight: .semibold))
                .foregroundStyle(theme.textColor.opacity(0.55))

            // ⚠️ **标签放在一个会换行的流里，而不是 HStack**（2026-09-27 实测）：表格搬进左列之后
            // 这一栏只有 262pt 宽，`HStack` 里放不下就**从右边截掉** —— 屏幕上量到的是
            // 「无法识别…」，而被截掉的正是"哪一类没拿到"这唯一有用的信息。
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
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // **高度提前定死成三行**（用户那条反复强调的规矩：「它每一个位置上的高度都是固定的……
        // 不要让高度总是晃」）：标签不够三行时下面空着，但卡片高度因此恒定。
        .frame(height: Self.referenceTagRowHeight, alignment: .top)
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

    /// **四行固定**：目标问题 / 类型 / 参考 / 细节（顺序、标签都由 `DirectionBoardPrompt` 给）。
    ///
    /// 用户 2026-09-27 的两句合起来就是这一段的设计：「他回复结果的时候总是跳、总是蹦……
    /// 内容有时候有软件目标细节，有时候没有」+「这几行固定在这，而不是突然间有、突然间没有，
    /// 这对体验影响太差了」。所以：行的集合恒定、值可能为空（画占位符）、**卡片高度因此恒定**。
    /// **左栏**：AI 对用户的理解（目标 / 疑问）。
    private var understandingColumn: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(session.understandingLines.enumerated()), id: \.offset) { index, line in
                if line.label != Self.mindMapLabel {
                    understandingRow(label: line.label, value: line.value, revealIndex: index + 1)
                }
            }
        }
        // 整块**高度固定**（各行自己预留了几行就占几行）—— 这样内容来了也只是填进预留的位置，
        // 卡片高度与标题位置都不动。
        // ⚠️ 这里原来有一个 ✕（"这个理解不对"）。**删掉了**：理解现在是**无条件**跟着提示词发给
        // 模型的（用户 2026-09-27：「这个大语言模型的理解，你可以去发，发过去」），
        // 也就是说"确认"这个动作没有意义了 —— 一个点了不改变任何事情的按钮比没有按钮更糟。
    }

    /// **右栏：那张脑图**（「细节」）—— 用户 2026-09-27：「右侧从上到下都是细节，**高度占据整个
    /// 卡片的高度**。**不再有细节标题**，直接显示整个脑图」。

    private var expandedCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            // **左右两栏**（用户 2026-09-27 深夜说清了两次：「我说的是**左右布局**。
            // **最上面那个标签和表格也要放在左边**，**右侧全部都是脑图**」）：
            //
            //   左列（40%）：方向表格（固定 2 行）→ 参考标签 → 目标 → 疑问
            //   右列（60%）：**从上到下整块都是脑图**（不画标题，高度铺满这一整块）
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 8) {
                    // **表格永远画着**（用户 2026-09-27：「卡片设计出来之后，**整个样式和位置不应该变化**。
                    // 我发现**左上角这五行突然间消失了**」）。
                    //
                    // 原来这里是 `if !displayedItems.isEmpty { directionList }` —— 一旦那一轮
                    // 本地关键词没命中、Jev 又没给出概率（第一轮请求还没回来时就是这种状态），
                    // 整块**凭空消失**，下面所有东西一起往上跳。这和"需求/矛盾空着也画占位符"
                    // 是同一条规矩：**行的集合恒定**，没内容就画占位。
                    directionList
                    if !referenceCollector.materials.tags.isEmpty ||
                        !referenceCollector.materials.unresolved.isEmpty {
                        referenceTagRow
                    }
                    understandingColumn
                }
                .frame(width: understandingColumnWidth, alignment: .leading)

                mindMapColumn
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: Self.contentBlockHeight, alignment: .top)

            // 最下面一行：折叠钮（贴左下角）+ 复制/执行/退出 + 两档取消。
            cancelRow
        }
    }

    /// **右栏：那张脑图**（「细节」）—— 用户 2026-09-27：「右侧从上到下都是细节，**高度占据整个
    /// 卡片的高度**。**不再有细节标题**，直接显示整个脑图」。
    private var mindMapColumn: some View {
        let value = session.understandingLines.first { $0.label == Self.mindMapLabel }?.value ?? ""
        return Text(value.isEmpty ? Self.emptyValuePlaceholder : value)
            .font(.system(size: 12, design: .monospaced))
            .foregroundStyle(theme.textColor.opacity(value.isEmpty ? 0.35 : 1.0))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .id(value)
            .transition(.opacity)
            .animation(.easeOut(duration: 0.28), value: value)
    }

    /// 一行理解：左边标签定宽，右边值（**空值画占位符**，不是不画）。
    private func understandingRow(label: String, value: String, revealIndex: Int) -> some View {
        // **标题在上面、内容在下面**（用户 2026-09-27 深夜：「把右侧的标题和内容**换行显示**，
        // 不要显示在一行，**这样内容会有更多空间**。**标题在上面，内容在下面，标题文字稍微大一点**」）。
        //
        // 原来标签和值挤在同一行，值那边被标签那一列吃掉 50pt —— 左列只有 262pt 的时候
        // 这是很实在的一笔；换行之后值拿到**整列宽度**，同一个字号的文字每行多装三四个字。
        let reservedHeight = Self.understandingLabelHeight
            + CGFloat(Self.reservedLineCounts[label] ?? 3) * Self.understandingLineHeight
        return VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: Self.understandingLabelFontSize, weight: .semibold))
                .foregroundStyle(theme.textColor.opacity(0.55))
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
    /// 标题那一行的高度（标题现在自己占一行，见 `understandingRow`）。
    static let understandingLabelHeight: CGFloat = 18
    /// 标题的字号 —— 用户 2026-09-27：「**标题文字稍微大一点**」（原来是 11）。
    static let understandingLabelFontSize: CGFloat = 12.5


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
            // **复制 / 执行 / 退出**：把结果拿走（不是"丢掉这一轮"），所以是绿色系。
            actionButton(title: "复制", icon: "doc.on.doc", width: Self.copyButtonWidth,
                         help: "把右下角那张卡片里 AI 回复的内容复制下来",
                         isEnabled: session.hasCopyableReply) {
                session.copyReplyAction?()
            }
            cancelRowDivider
            actionButton(title: "执行", icon: "play.fill", width: Self.executeButtonWidth,
                         help: "把当前任务发给主 Agent 去执行（与按 Command + 回车同效）") {
                session.sendTurnAction?()
            }
            cancelRowDivider
            actionButton(title: "退出", icon: "xmark", width: Self.exitButtonWidth,
                         help: "不执行，直接取消这一轮（与按 ESC 同效）") {
                session.exitTurnAction?()
            }

            cancelRowDivider
            // 两档取消：暗红只给这两格（它们是"把这一轮丢掉"）。
            cancelButton(title: "取消", help: "这一次循环不再显示看板（录音照旧）") {
                session.cancelForThisCycle()
            }
            cancelRowDivider
            cancelButton(title: "取消十分钟", help: "十分钟内不显示（包括新开的循环）") {
                session.cancelForTenMinutes()
            }
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
