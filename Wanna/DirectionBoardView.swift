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
    /// 卡片主题（与右下角那张卡片同一个 `AnswerCardStyle`）。
    let theme: AnswerCardTheme
    /// 输入框被点了一下：宿主面板据此把窗口变成 key（否则打字进不来）。
    var onInputFocused: () -> Void = {}
    /// 量到的自然尺寸报给宿主面板（面板据此把自己调成一样大）。
    var onMeasuredSize: (CGSize) -> Void = { _ in }

    @FocusState private var isInputFocused: Bool

    /// **宽度固定，不随内容长**（用户 2026-09-27 两次强调）：
    /// 「卡片的宽度需要固定……**不能超过它的两倍**……要么一倍，要么两倍」
    /// 「让它固定显示为**两倍宽度**，这个宽度可以让用户去设定，设置页面里可以设定，
    /// 但**默认固定两倍宽度**，以便显示更多内容」。
    ///
    /// 所以宽度 = **结果卡片宽度（340）× 用户设的倍数**（默认 2 → 680），而且**恒定** ——
    /// 内容多了不撑宽，只多排几行（列数由这条宽度反推出来）。
    /// 左下角固定由面板那一侧保证（`directionBoardPanelFrame` 的原点 = 鼠标 +12pt）。
    static let resultCardWidth: CGFloat = 340
    static let columnWidth: CGFloat = 190
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

    /// 用户设的宽度倍数（默认 2）。
    private var widthMultiplier: Double {
        AppSettingsStore.snapshot().directionBoardWidthMultiplier
    }

    private var columnCount: Int {
        Self.columnCount(forMultiplier: widthMultiplier, itemCount: session.displayedItems.count)
    }
    /// **下面那两块固定高度**（用户点名要求）：说明 4 行 + 输入框一行。
    static let paragraphHeight: CGFloat = 4 * 20
    private static let inputHeight: CGFloat = 30
    /// 编号那一列有多宽（「第三个方向」里的 3）。
    private static let numberColumnWidth: CGFloat = 18

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // 上半：**会长高的那一半** —— 只有他说到的方向才出现，最多 5 行。
            if !session.displayedItems.isEmpty {
                directionList
                sectionDivider
            }
            // 下半：固定高度的两块（说明 + 输入框）。
            paragraphArea
            inputArea
            // 最下面一行：**取消看板**的三档（用户 2026-09-27：「把最下面这一行分成三列：
            // 第一列叫「取消本次」……第二列叫「取消十分钟」……第三列叫「取消今日」」）。
            cancelRow
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(width: Self.cardWidth(forMultiplier: widthMultiplier), alignment: .leading)
        .background(AnswerCardView.cardBackground(theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous)
                // **被按住不发的那一下，边框亮起来呼吸一下**（用户：「让看板边框闪一下、高亮一下或
                // 呼吸灯一下，让用户知道任务没有完成、没有发送过去，而不是直接发送任务」）。
                .strokeBorder(session.isHeldFromAutomaticSend
                                ? DS.Colors.warning
                                : theme.borderColor,
                              lineWidth: session.isHeldFromAutomaticSend
                                ? AnswerCardView.cardBorderWidth * 2
                                : AnswerCardView.cardBorderWidth)
                .animation(.easeInOut(duration: 0.35), value: session.isHeldFromAutomaticSend)
        )
        .shadow(color: Color.black.opacity(0.30), radius: 10, x: 0, y: 4)
        .background(
            GeometryReader { geometryProxy in
                Color.clear.preference(key: SizePreferenceKey.self, value: geometryProxy.size)
            }
        )
        .onPreferenceChange(SizePreferenceKey.self) { measuredSize in
            onMeasuredSize(measuredSize)
        }
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
            ForEach(session.displayedItems, id: \.rowIndex) { item in
                directionRow(item)
            }
        }
    }

    private func directionRow(_ item: DirectionBoardDisplayItem) -> some View {
        let state = session.selectionStates[item.rowIndex] ?? .pending
        let text = session.confirmedTexts[item.rowIndex] ?? item.text
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
                    session.toggleConfirm(rowIndex: item.rowIndex, displayedText: text)
                }
                .help("点一下 = 这个是我想做的（也可以直接说「第 \(item.number) 个方向」）")

            Button {
                session.toggleDeny(rowIndex: item.rowIndex)
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

    private func backgroundColor(for state: DirectionBoardSelectionState) -> Color {
        switch state {
        case .confirmed: return DS.Colors.success.opacity(0.18)
        case .denied: return DS.Colors.destructive.opacity(0.18)
        case .pending: return theme.textColor.opacity(0.06)
        }
    }

    private func borderColor(for state: DirectionBoardSelectionState) -> Color {
        switch state {
        case .confirmed: return DS.Colors.success.opacity(0.8)
        case .denied: return DS.Colors.destructive.opacity(0.8)
        case .pending: return theme.textColor.opacity(0.14)
        }
    }

    // MARK: - 说明区（**高度固定**）

    private var paragraphArea: some View {
        HStack(alignment: .top, spacing: 6) {
            paragraphText
            // **AI 那段总结也要能确认/否认**（用户：「在系统总结这块，也要增加一个选中或者确认、
            // 否认的按钮，即添加一个 X 叉按钮」）。只有真的有总结时才画。
            if !session.paragraph.isEmpty {
                Button {
                    session.toggleSummaryDeny()
                } label: {
                    Image(systemName: session.summaryState == .confirmed ? "checkmark" : "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(summaryTextColor.opacity(session.summaryState == .pending ? 0.5 : 1.0))
                        .frame(width: 14, height: 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("点一下 = 这个理解不对")
            }
        }
        .frame(height: Self.paragraphHeight, alignment: .topLeading)
        .clipped()
        // 点总结正文 = 确认"这个理解对"。
        .contentShape(Rectangle())
        .onTapGesture {
            guard !session.paragraph.isEmpty else { return }
            session.toggleSummaryConfirm()
        }
    }

    private var summaryTextColor: Color {
        switch session.summaryState {
        case .confirmed: return DS.Colors.success
        case .denied: return DS.Colors.destructive
        case .pending: return theme.textColor
        }
    }

    private var paragraphText: some View {
        Group {
            if session.paragraph.isEmpty {
                // 还没有结果时**不写占位话**（"正在理解…"这种字只会让人以为出错了）。
                Text(session.isRequesting ? "正在理解你这次要做的事…" : "说说你要做什么。")
                    .font(.system(size: 12))
                    .foregroundStyle(theme.textColor.opacity(0.45))
            } else {
                Text(session.summaryConfirmedText ?? session.paragraph)
                    .font(.system(size: AnswerCardView.fontSize))
                    .foregroundStyle(summaryTextColor)
                    .lineSpacing(AnswerCardView.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }

    // MARK: - 输入框区（**高度固定**）

    private var inputArea: some View {
        TextField("补充说明（会一起发过去）", text: $session.typedInput)
            .textFieldStyle(.plain)
            .font(.system(size: 12))
            .foregroundStyle(theme.textColor)
            .focused($isInputFocused)
            .onSubmit { isInputFocused = false }
            .padding(.horizontal, 8)
            .frame(height: Self.inputHeight)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(theme.textColor.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(theme.textColor.opacity(isInputFocused ? 0.35 : 0.14), lineWidth: 1)
            )
            .onTapGesture {
                // 点了才要键盘：宿主面板据此 `makeKey`（平时面板不是 key，绝不抢你正在用的 App）。
                isInputFocused = true
                onInputFocused()
            }
    }

    /// **取消看板那一行**：暗红色、三列、有高度（用户：「这一行要有一定的高度，颜色是暗红色」）。
    ///
    /// 三档的语义（用户）：取消本次 = 这一次大循环；取消十分钟 = 十分钟内（本循环或新循环）都不显示；
    /// 取消今日 = 到**明天凌晨 0 点**为止（不是"24 小时之后"）。
    private var cancelRow: some View {
        HStack(spacing: 0) {
            cancelButton(title: "取消本次", help: "这一次循环不再显示看板（录音照旧）") {
                session.cancelForThisCycle()
            }
            Rectangle().fill(Self.cancelRowDividerColor).frame(width: 1, height: 16)
            cancelButton(title: "取消十分钟", help: "十分钟内不显示（包括新开的循环）") {
                session.cancelForTenMinutes()
            }
            Rectangle().fill(Self.cancelRowDividerColor).frame(width: 1, height: 16)
            cancelButton(title: "取消今日", help: "到明天凌晨 0 点为止都不显示") {
                session.cancelUntilNextMidnight()
            }
        }
        .frame(height: Self.cancelRowHeight)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Self.cancelRowColor)
        )
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
    private static let cancelRowDividerColor = Color.white.opacity(0.12)

    private var sectionDivider: some View {
        Rectangle()
            .fill(theme.textColor.opacity(0.10))
            .frame(height: 1)
    }
}
