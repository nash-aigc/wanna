//
//  DirectionBoardView.swift
//  Wanna
//
//  **「任务方向看板」长什么样**（2026-09-27）。
//
//  用户定的规格（逐条）：
//  · 位置：鼠标**右上角**（不随鼠标移动），与右下角那张「结果看板」形成对照；
//  · 「宽度：与右下角结果看板完全一致，无论内容多少」→ 固定 340（就是结果卡片的宽度上限）；
//  · 「样式与文字渲染：与右下角看板完全一致」→ 外壳直接复用 `AnswerCardView` 的那几个常量与
//    `cardBackground(theme:)`（2026-09-27 把它们放开成 internal，就是为了这一句）；
//  · 「差异点：右上角看板可被点击」；
//  · 结构自上而下：**按钮区（3 行 2 列）→ 正文区（AI 的理解）→ 输入框区（补充说明）**；
//  · 每颗按钮两个操作：「点击文字 = 确认，文字变绿，右侧叉变对勾」「点击右侧叉 = 否认，
//    文字与叉整体变红」。
//
//  **它不认识引擎**：只读写 `DirectionBoardSession` 的状态，点下去就调 session 的两个 toggle。
//

import AppKit
import SwiftUI

struct DirectionBoardView: View {

    @ObservedObject var session: DirectionBoardSession
    /// 六个短语与关键词 —— 由装配方给（它读的是 `AppSettings`），视图不自己去读设置。
    let configuration: DirectionBoardConfiguration
    /// 卡片主题（与右下角那张卡片同一个 `AnswerCardStyle`）。
    let theme: AnswerCardTheme
    /// 输入框被点了一下：宿主面板据此把窗口变成 key（否则打字进不来）。
    var onInputFocused: () -> Void = {}
    /// 量到的自然尺寸报给宿主面板（面板据此把自己调成一样大，见控制器）。
    var onMeasuredSize: (CGSize) -> Void = { _ in }

    @FocusState private var isInputFocused: Bool

    /// 宽度固定 —— 用户：「与右下角结果看板完全一致，**无论内容多少**」。
    static let cardWidth: CGFloat = 340
    /// 输入框最多一行半高（看板不该因为输入变高）。
    private static let inputHeight: CGFloat = 30

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            buttonsArea
            sectionDivider
            bodyArea
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
        // 把自己量到的尺寸报上去，面板据此把自己调成一样大（见 `DirectionBoardPanelController`）。
        // 用仓库既有的惯用法（`SizePreferenceKey` + `onPreferenceChange`），不是 KVO ——
        // `NSHostingView.fittingSize` 不是 KVO 安全的属性。
        .background(
            GeometryReader { geometryProxy in
                Color.clear.preference(key: SizePreferenceKey.self, value: geometryProxy.size)
            }
        )
        .onPreferenceChange(SizePreferenceKey.self) { measuredSize in
            onMeasuredSize(measuredSize)
        }
    }

    // MARK: - 按钮区（3 行 2 列）

    private var buttonsArea: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(configuration.rows.enumerated()), id: \.offset) { rowIndex, row in
                HStack(spacing: 6) {
                    // 类别名（笔记类 / 显示类 / 执行类）—— 行是固定的，名字就在左边点一下位置。
                    Text(row.title)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(theme.textColor.opacity(0.55))
                        .frame(width: 40, alignment: .leading)

                    ForEach(Array(row.buttons.enumerated()), id: \.offset) { columnIndex, _ in
                        button(rowIndex: rowIndex, columnIndex: columnIndex)
                    }
                }
            }
        }
    }

    private func button(rowIndex: Int, columnIndex: Int) -> some View {
        let slot = DirectionBoardSlot(rowIndex: rowIndex, columnIndex: columnIndex)
        let state = session.slotStates[slot] ?? .pending
        let isLocallyMatched = session.isLocallyMatched(slot)
        let textColor: Color = {
            switch state {
            case .confirmed: return DS.Colors.success
            case .denied: return DS.Colors.destructive
            case .pending: return theme.textColor
            }
        }()

        return HStack(spacing: 4) {
            Text(session.displayedText(for: slot))
                .font(.system(size: 12, weight: state == .pending ? .regular : .semibold))
                .foregroundStyle(textColor)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
                // 点文字 = 确认（用户：「点击文字 = 确认，文字变绿，右侧叉变对勾」）。
                .contentShape(Rectangle())
                .onTapGesture {
                    session.toggleConfirm(slot: slot, displayedText: session.displayedText(for: slot))
                }
                .help("点一下 = 这个是我想做的")

            // 右边的叉 / 对勾：**点它 = 否认**（否认之后文字与叉整体变红）。
            Button {
                session.toggleDeny(slot: slot)
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
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(backgroundColor(for: state, isLocallyMatched: isLocallyMatched))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(borderColor(for: state, isLocallyMatched: isLocallyMatched), lineWidth: 1)
        )
        .frame(maxWidth: .infinity)
    }

    private func backgroundColor(for state: DirectionBoardSlotState, isLocallyMatched: Bool) -> Color {
        switch state {
        case .confirmed: return DS.Colors.success.opacity(0.18)
        case .denied: return DS.Colors.destructive.opacity(0.18)
        case .pending: return isLocallyMatched ? DS.Colors.success.opacity(0.10) : theme.textColor.opacity(0.06)
        }
    }

    private func borderColor(for state: DirectionBoardSlotState, isLocallyMatched: Bool) -> Color {
        switch state {
        case .confirmed: return DS.Colors.success.opacity(0.8)
        case .denied: return DS.Colors.destructive.opacity(0.8)
        case .pending: return isLocallyMatched ? DS.Colors.success.opacity(0.55) : theme.textColor.opacity(0.14)
        }
    }

    // MARK: - 正文区（AI 的理解）

    private var bodyArea: some View {
        Group {
            if session.paragraph.isEmpty {
                // 还没有结果时**不写占位话**（"正在理解…"这种字只会让人以为出错了）：
                // 一行很淡的提示，等第一次请求回来就被替换掉。
                Text(session.isRequesting ? "正在理解你这次要做的事…" : "说说你要做什么。")
                    .font(.system(size: 12))
                    .foregroundStyle(theme.textColor.opacity(0.45))
            } else {
                Text(session.paragraph)
                    .font(.system(size: AnswerCardView.fontSize))
                    .foregroundStyle(theme.textColor)
                    .lineSpacing(AnswerCardView.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 输入框区（补充说明）

    private var inputArea: some View {
        HStack(spacing: 6) {
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
    }

    private var sectionDivider: some View {
        Rectangle()
            .fill(theme.textColor.opacity(0.10))
            .frame(height: 1)
    }
}
