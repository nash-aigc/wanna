//
//  CardChatModelPicker.swift
//  Wanna
//
//  ⭐ **页头右上角那颗「模型」+ 分隔线下面的选择面板**（2026-09-29 用户定）。
//
//  用户的原话：
//  「导航栏的右上角，增加一个（模型选项），类似（语音模式，全双工的选项）……
//    注意它的点击之后下面的模型显示的位置：**显示在分隔线下面**，注意下拉菜单按钮的样式……
//    让用户可以手动选择，哪个模型（相同模型，思考关，思考开，设置为 2 种模型，
//    先让它只显示 deepseek-flash，和 doubao-seed-2.1-lite，deepseek-v4.1-flash，
//    glm-5.3-flash，glm-5.3），【文字、图文、音频、视频】都要能显示对应的模型」。
//
//  ## 为什么是两行
//
//  那两个 Pi 进程各要一个模型（实时 = 思考关要快、执行 = 思考开要想），所以面板里是
//  **两行**：实时模式 / 执行模式，各自一个下拉。写入 `PiModeSettingsStore` ——
//  改完下一轮自动重起进程（`PiAgentRunner` 的启动参数哈希检查），不需要重启 App。
//
//  ## 为什么按钮在页头、面板在分隔线下面
//
//  页头那排只有 `cardChatModeBandHeight` 高，把面板挂在它的 `.overlay` 上会**画得出、
//  收不到点击**（这个仓库为它吃过一次亏，见 `开发经验/10-踩过的坑.md` D14）。
//  所以照 `CardChatRoleListPanel` 的先例：按钮在 `CardChatModeBar` 里，
//  **面板由 sheet 根画在分隔线下面**（`NotchSheetRootView`），位置用同一个
//  `sheetHeaderTopInset + cardChatModeBandHeight`。
//

import Combine
import SwiftUI

/// **可选模型清单**（用户 2026-09-29 点名的那几个）。
///
/// ⚠️ 每个名字都是**实测过能在本机 pi 上跑**的（`pi --list-models` + 真发一轮请求）：
/// · `deepseek-official/deepseek-flash` —— DeepSeek 官方，900K 上下文；
/// · `ark/*` —— 火山方舟 coding plan（key 在 `~/.pi/agent/keys/`，provider 在 models.json）。
///
/// **加一个模型 = 往这个数组加一行**（同时要确保它已经在 `~/.pi/agent/models.json` 里 ——
/// 那份文件是 pi 的配置，这里只是"给用户挑的短名单"）。
struct PiModelOption: Identifiable, Equatable {
    let id: String          // provider/模型 —— 直接写进 PiModeSettings
    let displayName: String // 给人看的短名

    static let catalog: [PiModelOption] = [
        PiModelOption(id: "deepseek-official/deepseek-flash", displayName: "deepseek-flash"),
        PiModelOption(id: "ark/doubao-seed-2.1-lite", displayName: "doubao-seed-2.1-lite"),
        PiModelOption(id: "ark/deepseek-v4.1-flash", displayName: "deepseek-v4.1-flash"),
        PiModelOption(id: "ark/glm-5.3-flash", displayName: "glm-5.3-flash"),
        PiModelOption(id: "ark/glm-5.3", displayName: "glm-5.3"),
    ]

    static func displayName(for modelID: String) -> String {
        catalog.first { $0.id == modelID }?.displayName ?? modelID
    }
}

/// 那颗按钮与那块面板共用的展开状态（单例：按钮在页头、面板在 sheet 根，两处两个对象）。
@MainActor
final class CardChatModelPickerState: ObservableObject {
    static let shared = CardChatModelPickerState()
    private init() {}

    /// 「模型」那颗按钮点开了没有 —— 面板显示与否只看它。
    @Published var isExpanded = false
    /// 面板里正在展开模型列表的那一行（nil = 两行都收着）。
    @Published var expandedRow: PiProcessRow?
}

/// 面板里的两行（= 两个 Pi 进程）。
enum PiProcessRow: String, CaseIterable, Identifiable {
    case realtime
    case execute

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .realtime: return "实时模式"
        case .execute: return "执行模式"
        }
    }

    /// 它对应哪个 Pi 进程（设置与启动参数都按 role 取）。
    var role: PiAgentRunner.ProcessRole {
        switch self {
        case .realtime: return .realtime
        case .execute: return .execute
        }
    }
}

// MARK: - 页头那颗按钮

/// **页头右上角的「模型 ⌄」** —— 样式照语音页那颗「全双工 ⌄」：绿色文字 + chevron，无底色。
///
/// ⚠️ **标签就两个字「模型」，不显示当前模型**（2026-09-29 用户明确要求：
/// 「样式不应该具体显示当前用户已选择的模型 ID，只需要显示"模型"两个字，绿色的」）。
/// 当前用哪个模型在点开之后那两行里看。
struct CardChatModelPickerButton: View {

    @ObservedObject private var pickerState = CardChatModelPickerState.shared

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.16)) {
                pickerState.isExpanded.toggle()
                if !pickerState.isExpanded { pickerState.expandedRow = nil }
            }
        } label: {
            HStack(spacing: 5) {
                Text("模型")
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                Image(systemName: pickerState.isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .foregroundColor(DS.Colors.success)
            // ⭐ **极简**（2026-09-29）：内边距 0、无底色 —— 分隔由那一行的白色竖线负责。
            .padding(.horizontal, 0)
            .fixedSize(horizontal: true, vertical: false)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help(pickerState.isExpanded ? "收起模型选择" : "选择模型（实时 / 执行各一个）")
    }
}

// MARK: - 分隔线下面那块面板

/// ⭐ **分隔线下面那两行：实时模式 / 执行模式**（2026-09-29 用户第二次定稿）。
///
/// **它不是弹窗、也不是浮层卡片** —— 用户的原话：「它不应该做成弹窗，而应该**类似"全双工"
/// 按钮，点击后在下方显示两行内容**」。所以这一块照 `VoiceChatSessionView` 里
/// 「全双工 / 三段式」那两行的语言做：**内联在内容区里**（无底色、无边框、行与行之间一条细线），
/// 每行从左到右 = 模式名 ｜ **思考开关**（可点）｜ 当前模型（可点，展开模型清单）。
///
/// 每一行有两个可点的东西，都是用户点名要的：
/// · **思考**（「每一个模式……它的思考都可以开或关。现在做成了默认，默认状态是正确的，
///   但应该让用户可以选择」）—— 写入 `PiModeSettings` 的 `*ThinkingEnabled`；
/// · **模型**（「右侧的模型按钮也应该让用户可以选择」）—— 展开 `PiModelOption.catalog`。
struct CardChatModelPickerPanel: View {

    @ObservedObject private var pickerState = CardChatModelPickerState.shared
    @State private var settings = PiModeSettingsStore.shared.snapshot()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(PiProcessRow.allCases.enumerated()), id: \.element.id) { index, row in
                rowView(row)
                if index < PiProcessRow.allCases.count - 1 {
                    Rectangle().fill(DS.Colors.borderSubtle).frame(height: 1)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        // ⚠️⚠️ **必须有不透明底色，而且要占满整行**（2026-09-29 用户实测报的：
        // 「模型点击之后，下面变成透明了，**不能透明**（应该是悬浮菜单），
        // 但是**占据一整行的效果**」）。
        //
        // 它是个浮层（在 `NotchSheetRootView` 的 `.overlay` 里，不参与布局），
        // 而第一版**没给背景** —— 于是那两行字直接叠在对话内容上，两段文字混在一起 ✗。
        // 现在：实底（surface1，比内容底更亮一档）+ 圆角 + 细边框 + 投影，
        // 视觉上就是"页头下面横着的一条"。
        .frame(width: Self.panelWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(DS.Colors.surface1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(DS.Colors.borderSubtle, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
        .onReceive(NotificationCenter.default.publisher(for: PiModeSettingsStore.didChangeNotification)) { _ in
            settings = PiModeSettingsStore.shared.snapshot()
        }
    }

    /// 面板的宽度 = **内容列宽度**（`NotchHomeView` 每次布局时记下来的那个值）——
    /// 它撑满整行，左右各留一个页边距。拿不到时退回一个保守值。
    static var panelWidth: CGFloat {
        let columnWidth = NotchHomeView.rememberedContentColumnWidthForModelPanel
        let fallback: CGFloat = 540
        let usable = (columnWidth > 100 ? columnWidth : fallback)
            - NotchSupport.contentColumnHorizontalMargin * 2
        return usable
    }

    private func rowView(_ row: PiProcessRow) -> some View {
        let currentModelID = row == .realtime ? settings.realtimeModelID : settings.executeModelID
        let thinkingOn = settings.thinkingEnabled(for: row.role)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(row.displayName)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(DS.Colors.textPrimary)
                    .frame(width: 62, alignment: .leading)

                // **思考开关**（可点）—— 绿色 = 开，灰 = 关。
                Button {
                    setThinking(!thinkingOn, for: row)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: thinkingOn ? "brain" : "brain.fill")
                            .font(.system(size: 10))
                        Text(thinkingOn ? "思考 开" : "思考 关")
                            .font(.system(size: 11.5, weight: .medium))
                    }
                    .foregroundStyle(thinkingOn ? DS.Colors.success : DS.Colors.textTertiary)
                    .padding(.horizontal, 7)
                    .frame(height: 22)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerCursor()
                .help(thinkingOn ? "这个模式现在会思考（点击：关掉，更快）" : "这个模式现在不思考（点击：打开）")

                Spacer(minLength: 8)

                // **模型**（可点，展开清单）—— 显示完整模型 ID（用户：「显示具体的模型 ID」）。
                Button {
                    withAnimation(.easeInOut(duration: 0.14)) {
                        pickerState.expandedRow = (pickerState.expandedRow == row) ? nil : row
                    }
                } label: {
                    HStack(spacing: 5) {
                        Text(currentModelID)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(DS.Colors.success)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Image(systemName: pickerState.expandedRow == row ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(DS.Colors.textSecondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerCursor()
                .help("换这个模式用的模型")
            }
            .padding(.vertical, 5)

            if pickerState.expandedRow == row {
                ForEach(PiModelOption.catalog) { option in
                    Button {
                        apply(option, to: row)
                    } label: {
                        // ⭐ **靠右对齐**（2026-09-29 用户：「模型点击之后，下面的选项，
                        // **必须靠右对齐**，现在在左边」）—— 与上面那行的模型名同一侧。
                        HStack(spacing: 8) {
                            Spacer(minLength: 0)
                            Text(option.id)
                                .font(.system(size: 12))
                                .foregroundStyle(option.id == currentModelID
                                                 ? DS.Colors.success : DS.Colors.textSecondary)
                            Image(systemName: option.id == currentModelID ? "checkmark" : "")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(DS.Colors.success)
                                .frame(width: 12)
                        }
                        .padding(.trailing, 4)
                        .frame(height: 26)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pointerCursor()
                }
            }
        }
    }

    private func setThinking(_ enabled: Bool, for row: PiProcessRow) {
        var updated = PiModeSettingsStore.shared.snapshot()
        switch row {
        case .realtime: updated.realtimeThinkingEnabled = enabled
        case .execute: updated.executeThinkingEnabled = enabled
        }
        PiModeSettingsStore.shared.save(updated)
        settings = updated
    }

    private func apply(_ option: PiModelOption, to row: PiProcessRow) {
        var updated = PiModeSettingsStore.shared.snapshot()
        switch row {
        case .realtime: updated.realtimeModelID = option.id
        case .execute: updated.executeModelID = option.id
        }
        PiModeSettingsStore.shared.save(updated)
        settings = updated
        // 选完把这一行的列表收起来（面板留着 —— 用户可能还要改另一行）。
        pickerState.expandedRow = nil
    }
}

// MARK: - 「音色」那颗按钮（2026-09-29 从页头搬到输入框那一行）

/// 音色选择面板的开关状态。
///
/// ⚠️ **它必须是单例**：那颗按钮现在住在 `NotchHomeView`（输入框那一行），
/// 而面板本身由 `NotchSheetRootView` 画（浮层要画在不参与布局的那一层）——
/// 两个对象、一份真相。与 `CardChatModelPickerState` 同一个理由。
@MainActor
final class VoicePickerState: ObservableObject {
    static let shared = VoicePickerState()
    private init() {}

    @Published var isPresented = false
}

/// **「音色」按钮**（用户 2026-09-29：「图文模式（音色，放在输入框的上面，右上角，
/// 放在：声音右侧）」）。
///
/// 它原来画在页头（`NotchSheetRootView.voiceChip`），搬到输入框那一行之后
/// 两处都能用同一份实现 —— 按钮只负责"打开面板"，面板与音色表都在 sheet 根那边。
struct VoiceChipButton: View {

    /// `CompanionManager` 没有单例 —— 它是**注入**的（`NotchHomeView` 那一层拿得到）。
    @ObservedObject var companionManager: CompanionManager
    @ObservedObject private var pickerState = VoicePickerState.shared

    var body: some View {
        Button {
            pickerState.isPresented.toggle()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "waveform")
                    .font(.system(size: 11))
                Text(displayName)
                    .font(.system(size: 11.5, weight: .medium))
            }
            .foregroundStyle(pickerState.isPresented ? DS.Colors.success : DS.Colors.textSecondary)
            .padding(.horizontal, 0)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help("选择回复用哪个音色（默认用设置里配的那个）")
    }

    /// 选了就显示它的名字，没选就显示「音色」。
    private var displayName: String {
        guard let voiceID = companionManager.replyVoiceOverride else { return "音色" }
        if let systemVoice = VoiceCatalog.threeStageVoices.first(where: { $0.id == voiceID }) {
            return systemVoice.displayName
        }
        return VoiceLibraryStore.nickname(forCustomVoiceID: voiceID) ?? voiceID
    }
}
