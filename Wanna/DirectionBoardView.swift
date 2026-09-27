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

    /// 宽度固定 —— 用户：「与右下角结果看板完全一致，**无论内容多少**」。
    static let cardWidth: CGFloat = 340
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
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(width: Self.cardWidth, alignment: .leading)
        .background(AnswerCardView.cardBackground(theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AnswerCardView.cardCornerRadius, style: .continuous)
                .strokeBorder(theme.borderColor, lineWidth: AnswerCardView.cardBorderWidth)
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
        VStack(alignment: .leading, spacing: 6) {
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

            Text(item.rowTitle)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(theme.textColor.opacity(0.55))
                .frame(width: 38, alignment: .leading)

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
        Group {
            if session.paragraph.isEmpty {
                // 还没有结果时**不写占位话**（"正在理解…"这种字只会让人以为出错了）。
                Text(session.isRequesting ? "正在理解你这次要做的事…" : "说说你要做什么。")
                    .font(.system(size: 12))
                    .foregroundStyle(theme.textColor.opacity(0.45))
            } else {
                Text(session.paragraph)
                    .font(.system(size: AnswerCardView.fontSize))
                    .foregroundStyle(theme.textColor)
                    .lineSpacing(AnswerCardView.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        // **固定高度**：用户要的是"这块高度固定，上面的方向区往上长"。
        // 说明比这长就裁掉尾巴（让它自己滚动会在面板里再套一个滚动区，不值当）。
        .frame(height: Self.paragraphHeight, alignment: .topLeading)
        .clipped()
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

    private var sectionDivider: some View {
        Rectangle()
            .fill(theme.textColor.opacity(0.10))
            .frame(height: 1)
    }
}
