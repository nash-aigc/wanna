//
//  ComposerAttachmentStrip.swift
//  Wanna
//
//  **输入框上方那一条附件**（2026-09-28）。用户的原话：
//
//      「把对应的图片、文件或文件夹显示在连续对话这一行的按钮上方，依次显示，也可以点击，
//       显示为缩略图，用户可以左右滑动查看更多缩略图，也可以折叠。这一行的最左侧是一个折叠
//       按钮，用户点击之后可以把这些内容显示在一个列表上，然后展开查看。」
//
//  所以这一个文件里是三件东西、一件事：**缩略图条**（默认，左右滑动）、**列表**（点最左那颗
//  切过去，可展开）、**预览面板**（点任意一条打开）。它们共用同一份数据与同一套删除动作，
//  拆成三个文件只会让"删掉一条"要在三处各写一遍。
//
//  ## 为什么预览面板在这里、而不是在消息里展开
//
//  他在两个选项里选的是「在面板里预览」（不是"用系统默认 App 打开"）。实现上它必须画在
//  **内容列那一层**：缩略图条自己只有 64pt 高，SwiftUI 不会把落在这块 frame 之外的点击投给它
//  的子视图（本仓库吃过这个亏，见 开发经验/10-踩过的坑.md D14），所以面板挂在这一条上
//  「画得出、点不动」。三个页面各加一行 `.overlay { ComposerAttachmentPreviewOverlay() }`
//  就够了 —— 面板本体与状态都只有一份。
//

import AppKit
import SwiftUI

// MARK: - 条 / 列表

/// 输入框上方那一条：最左一颗折叠钮 + 缩略图条（或列表）。
struct ComposerAttachmentStrip: View {

    let attachments: [ComposerAttachment]
    let onRemove: (String) -> Void
    let onOpen: (ComposerAttachment) -> Void

    /// 现在是列表还是缩略图条。**用户点最左那颗切换** —— 纯界面状态，不进任何 store
    /// （关掉面板再打开，回到默认的缩略图条，与"我上次在看列表"这种噪音无关）。
    @State private var isListMode = false
    /// 列表是否展开（超过 5 行时才需要展开，用户那句「然后展开查看」）。
    @State private var isListExpanded = false

    /// 一格缩略图的边长。
    private static let thumbnailSize: CGFloat = 64
    /// 列表每行的高度，以及**不展开时最多显示几行**。
    private static let listRowHeight: CGFloat = 26
    private static let collapsedListRowCount = 5

    private var visibleListRows: [ComposerAttachment] {
        guard !isListExpanded else { return attachments }
        return Array(attachments.prefix(Self.collapsedListRowCount))
    }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            collapseButton
            if isListMode {
                listBody
            } else {
                thumbnailStrip
            }
        }
    }

    // MARK: 最左那颗折叠钮

    /// **它恒在**（没有附件时置灰）—— 它是这一行的锚点，一会儿有、一会儿没有会让整行左右跳。
    private var collapseButton: some View {
        Button {
            SoundEffectPlayer.shared.play(.sidebarButton)
            isListMode.toggle()
            if !isListMode { isListExpanded = false }
        } label: {
            Image(systemName: isListMode ? "square.grid.2x2" : "list.bullet")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(attachments.isEmpty
                                 ? .white.opacity(0.22)
                                 : .white.opacity(0.65))
                .frame(width: 24, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.white.opacity(attachments.isEmpty ? 0.03 : 0.08))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(attachments.isEmpty)
        .pointerCursor(isEnabled: !attachments.isEmpty)
        .help(isListMode ? "显示成缩略图（可以左右滑动）" : "把这些内容显示成一个列表")
    }

    // MARK: 缩略图条

    private var thumbnailStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 6) {
                ForEach(attachments) { attachment in
                    thumbnailCell(attachment)
                }
            }
            // 内边距在滚动内容里，所以贴着两端的格子不会被裁掉阴影/描边。
            .padding(.vertical, 2)
        }
        .frame(height: Self.thumbnailSize + 4)
    }

    private func thumbnailCell(_ attachment: ComposerAttachment) -> some View {
        Button {
            SoundEffectPlayer.shared.play(.sidebarButton)
            onOpen(attachment)
        } label: {
            ZStack(alignment: .topTrailing) {
                thumbnailImage(attachment)
                    .frame(width: Self.thumbnailSize, height: Self.thumbnailSize)
                    .background(
                        RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                            .fill(Color.white.opacity(0.06))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                            .strokeBorder(DS.Colors.borderSubtle, lineWidth: 1)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: DS.CornerRadius.small,
                                                  style: .continuous))

                removeButton(attachment)
            }
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help("\(attachment.displayName) · \(attachment.shortDescription)（点一下看大图）")
    }

    /// 有真图就画图，否则画一个类别图标。**图片按原比例填充并裁切**（`scaledToFill` + `clipped`）：
    /// 一张竖图被压成正方形会变形，而变形会让用户认不出自己贴的是哪张。
    @ViewBuilder
    private func thumbnailImage(_ attachment: ComposerAttachment) -> some View {
        if let imageData = attachment.imageData, let image = NSImage(data: imageData) {
            Image(nsImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: Self.thumbnailSize, height: Self.thumbnailSize)
                .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.small,
                                            style: .continuous))
        } else {
            Image(systemName: attachment.kind.symbolName)
                .font(.system(size: 22, weight: .regular))
                .foregroundColor(.white.opacity(0.55))
        }
    }

    private func removeButton(_ attachment: ComposerAttachment) -> some View {
        Button {
            SoundEffectPlayer.shared.play(.sidebarButton)
            onRemove(attachment.id)
        } label: {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.75))
                .background(Circle().fill(Color.black.opacity(0.55)).padding(1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .padding(2)
        .help("移除「\(attachment.displayName)」")
    }

    // MARK: 列表

    private var listBody: some View {
        VStack(spacing: 0) {
            ForEach(visibleListRows) { attachment in
                listRow(attachment)
            }
            if attachments.count > Self.collapsedListRowCount {
                expandRow
            }
        }
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .fill(DS.Colors.surface2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                .strokeBorder(DS.Colors.borderSubtle, lineWidth: 1)
        )
    }

    private func listRow(_ attachment: ComposerAttachment) -> some View {
        Button {
            SoundEffectPlayer.shared.play(.sidebarButton)
            onOpen(attachment)
        } label: {
            HStack(spacing: 8) {
                listRowIcon(attachment)
                Text(attachment.displayName)
                    .font(.system(size: 12))
                    .foregroundColor(DS.Colors.textPrimary)
                    .lineLimit(1)
                Text(attachment.shortDescription)
                    .font(.system(size: 11))
                    .foregroundColor(DS.Colors.textTertiary)
                    .lineLimit(1)
                    .fixedSize()
                if let absolutePath = attachment.absolutePath {
                    // **路径是等宽 + 从中间截断**：文件名在末尾，从尾部截会把最要紧的那截切掉。
                    Text(absolutePath)
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundColor(DS.Colors.textTertiary.opacity(0.8))
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 4)
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.white.opacity(0.45))
            }
            .padding(.horizontal, 8)
            .frame(height: Self.listRowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help("\(attachment.displayName) · 点一下看大图")
    }

    @ViewBuilder
    private func listRowIcon(_ attachment: ComposerAttachment) -> some View {
        if let imageData = attachment.imageData, let image = NSImage(data: imageData) {
            Image(nsImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 18, height: 18)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        } else {
            Image(systemName: attachment.kind.symbolName)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.55))
                .frame(width: 18, height: 18)
        }
    }

    private var expandRow: some View {
        Button {
            SoundEffectPlayer.shared.play(.sidebarButton)
            isListExpanded.toggle()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: isListExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                Text(isListExpanded
                     ? "收起"
                     : "展开查看另外 \(attachments.count - Self.collapsedListRowCount) 条")
                    .font(.system(size: 11))
            }
            .foregroundColor(DS.Colors.textSecondary)
            .frame(maxWidth: .infinity, minHeight: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
    }
}

// MARK: - 预览面板

/// 点一条附件之后弹的那块面板。
///
/// 由**三个内容列各挂一行**（`.overlay { ComposerAttachmentPreviewOverlay() }`），
/// 显示与否读 `ComposerAttachmentStore.previewingAttachment` —— 状态只有一份。
struct ComposerAttachmentPreviewOverlay: View {

    @ObservedObject private var store = ComposerAttachmentStore.shared

    var body: some View {
        Group {
            if let attachment = store.previewingAttachment {
                ZStack {
                    // 背板：点它 = 关掉（与角色面板/音色面板同一套做法）。
                    Color.black.opacity(0.45)
                        .contentShape(Rectangle())
                        .onTapGesture { store.previewingAttachment = nil }

                    panel(for: attachment)
                        .padding(.horizontal, NotchSupport.contentColumnHorizontalMargin)
                }
            }
        }
    }

    private func panel(for attachment: ComposerAttachment) -> some View {
        VStack(spacing: 0) {
            header(for: attachment)
            content(for: attachment)
            Divider().overlay(DS.Colors.borderSubtle)
            actionRow(for: attachment)
        }
        .background(
            RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous)
                .fill(DS.Colors.surface1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous)
                .strokeBorder(DS.Colors.borderStrong, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.5), radius: 24, y: 8)
        .frame(maxWidth: 460)
    }

    private func header(for attachment: ComposerAttachment) -> some View {
        HStack(spacing: 8) {
            Image(systemName: attachment.kind.symbolName)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.6))
            Text(attachment.displayName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)
                .lineLimit(1)
            Text(attachment.shortDescription)
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
                .fixedSize()
            Spacer(minLength: 4)
            Button {
                SoundEffectPlayer.shared.play(.sidebarButton)
                store.previewingAttachment = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerCursor()
            .help("关上预览")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func content(for attachment: ComposerAttachment) -> some View {
        if let imageData = attachment.imageData, let image = NSImage(data: imageData) {
            Image(nsImage: image)
                .resizable()
                .scaledToFit()
                // 上下都留出面板本身、标题与按钮行的高度，所以这里给的是一个**上限**
                // 而不是固定值 —— 小图不会被拉大，大图按比例铺到这个框里。
                .frame(maxWidth: 440, maxHeight: 360)
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
        } else {
            fileInformation(for: attachment)
        }
    }

    /// 文件 / 文件夹没有画面可看，就把"这是什么、在哪、多大、什么时候改的"如实列出来 ——
    /// 这是这一条在界面上唯一能提供的信息。
    private func fileInformation(for attachment: ComposerAttachment) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let absolutePath = attachment.absolutePath {
                informationLine(label: "路径", value: absolutePath, isMonospaced: true)
            }
            if let attributes = attachment.absolutePath.flatMap({
                try? FileManager.default.attributesOfItem(atPath: $0)
            }) {
                if let size = attributes[.size] as? Int64 {
                    informationLine(label: "大小", value: ByteCountFormatter.string(fromByteCount: size,
                                                                                   countStyle: .file))
                }
                if let modified = attributes[.modificationDate] as? Date {
                    informationLine(label: "修改时间", value: Self.dateFormatter.string(from: modified))
                }
            }
            if let childCount = attachment.childCount {
                informationLine(label: "内容", value: "\(childCount) 项")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
    }

    private func informationLine(label: String,
                                 value: String,
                                 isMonospaced: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
                .frame(width: 52, alignment: .leading)
            Text(value)
                .font(.system(size: 11.5, design: isMonospaced ? .monospaced : .default))
                .foregroundColor(DS.Colors.textSecondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func actionRow(for attachment: ComposerAttachment) -> some View {
        HStack(spacing: 8) {
            previewActionButton(title: "用默认 App 打开",
                                isEnabled: attachment.absolutePath != nil) {
                guard let path = attachment.absolutePath else { return }
                NSWorkspace.shared.open(URL(fileURLWithPath: path))
            }
            previewActionButton(title: "在访达中显示",
                                isEnabled: attachment.absolutePath != nil) {
                guard let path = attachment.absolutePath else { return }
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            }
            Spacer(minLength: 4)
            previewActionButton(title: "移除", tint: Color(red: 0.95, green: 0.45, blue: 0.42)) {
                store.remove(id: attachment.id, forCardID: attachmentCardID(for: attachment))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }

    private func previewActionButton(title: String,
                                     isEnabled: Bool = true,
                                     tint: Color? = nil,
                                     action: @escaping () -> Void) -> some View {
        Button(action: {
            SoundEffectPlayer.shared.play(.sidebarButton)
            action()
        }) {
            Text(title)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundColor(tint ?? DS.Colors.textSecondary)
                .padding(.horizontal, 10)
                .frame(height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.35)
        .pointerCursor(isEnabled: isEnabled)
    }

    /// 预览里的「移除」要落回**它所属的那张卡片**，而面板本身只知道这一条附件。
    /// 所以从 store 的字典里反查一次 —— 附件条与"它在哪张卡片上"是同一条真相。
    private func attachmentCardID(for attachment: ComposerAttachment) -> String {
        store.attachmentsByCardID.first { $0.value.contains(attachment) }?.key ?? ""
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter
    }()
}
