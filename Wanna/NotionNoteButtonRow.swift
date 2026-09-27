//
//  NotionNoteButtonRow.swift
//  Wanna
//
//  **刘海左侧那几颗「Notion 笔记」按钮的"画"**（2026-09-27 从
//  `NotchRecordingOverlay.notionNoteButtons` 原样搬出来）。
//
//  搬这一下是因为那套东西换了主人：录音那边剥干净了（录音只剩「录 → 转写 → 润色 → 落盘 →
//  剪贴板」，一颗按钮都没有），按钮现在长在**主 Agent 说话时的刘海**上。形状、文案、三态、
//  宽度来源一字未改 —— 用户对这几颗按钮的样子已经定过好几轮，不重画。
//
//  ## ⚠️ 它**不吃点击**，这是刻意的
//
//  按钮画在**点击穿透**的窗口里（静止的刘海面板 `ignoresMouseEvents = true`），所以里面的
//  SwiftUI 按钮收不到事件 —— 这一点 2026-09-27 实测踩过（D20：点一下直接穿到下面的 App，
//  把 Notion 切到了前台）。本仓库对这类东西早就有规矩：**画在哪由视图算，点在哪由控制器的
//  全局监听用"屏幕矩形"接**。所以这一层 `.allowsHitTesting(false)`，点击归
//  `NotchWindowController.handleGlobalClick` 里那三个 slot。
//
//  **不能省掉这一行**：面板展开时它是收事件的，若这里也吃点击，同一个动作会被
//  SwiftUI 按钮和全局监听各触发一次（"打开那一页"会开出两个标签页）。
//

import SwiftUI

/// 那三颗按钮（最多三颗）。位置由**父视图**摆 —— 父视图拿到的是
/// `NotchSupport.notionNoteButtonPlacement(on:)` 给的偏移，与控制器接点击的屏幕矩形同源。
struct NotionNoteButtonRow: View {

    @ObservedObject private var session = NotionNoteSession.shared

    var body: some View {
        // 从右到左排：取消在最右（挨着刘海），屏幕在最左。
        HStack(spacing: NotchSupport.notionNoteButtonSpacing) {
            if session.showsScreenButton {
                slotButton(index: 2, title: "屏幕", systemImage: "display",
                           tint: Color(red: 0.95, green: 0.42, blue: 0.40),
                           help: "不参考屏幕内容") {
                    session.cancelNotionScreenReference()
                }
            }
            if session.showsClipboardButton {
                slotButton(index: 1, title: "剪贴板", systemImage: "doc.on.clipboard",
                           tint: Color(red: 0.95, green: 0.42, blue: 0.40),
                           help: "不参考剪贴板内容，这一轮照旧存成笔记") {
                    session.cancelNotionClipboardReference()
                }
            }
            slotButton(index: 0,
                       title: session.notionNoteSaved ? "已保存"
                            : (session.isSavingNotionNote ? "保存中" : "取消"),
                       systemImage: session.notionNoteSaved ? "checkmark"
                            : (session.isSavingNotionNote ? "arrow.triangle.2.circlepath" : "xmark"),
                       tint: session.notionNoteSaved ? DS.Colors.success
                            : Color(red: 0.95, green: 0.42, blue: 0.40),
                       help: session.notionNoteSaved ? "打开那一页"
                            : "取消这条笔记（不点就会存进 Notion）") {
                session.handleNotionNoteButtonTap()
            }
        }
        // 见类型注释：点击归全局监听，这一层一律不吃事件。
        .allowsHitTesting(false)
    }

    /// 一格按钮：宽度与高度都取自 `NotchSupport` 里那份尺寸表（**与命中矩形同一个数**）。
    private func slotButton(index: Int, title: String, systemImage: String, tint: Color,
                            help: String, action: @escaping () -> Void) -> some View {
        let size = NotchSupport.notionNoteButtonSizes[index]
        return Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: systemImage).font(.system(size: 10.5, weight: .semibold))
                Text(title).font(.system(size: 12, weight: .medium)).lineLimit(1)
            }
            .foregroundColor(tint)
            .frame(width: size.width, height: size.height)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.black.opacity(0.78))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(tint.opacity(0.6), lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help(help)
    }
}
