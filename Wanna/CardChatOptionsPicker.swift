//
//  CardChatOptionsPicker.swift
//  Wanna
//
//  ⭐ **页头最右那颗「选项」+ 它展开的面板**（2026-09-29 用户定）。
//
//  用户的原话：「在图文页面，把输入框右上角的模型、音色、语速三个按钮合并成一个按钮。
//  点击后展开，分成两行：模型占一行，下面一行分别是音色、语速。点击后在右侧分别显示
//  对应的内容，比如音色具体是哪一个。合并后的按钮显示在右上角顶部角色按钮的右侧」。
//
//  ## 位置是他从三张图里选的
//
//  「右上角顶部角色按钮的右侧」有一处说不通：页头最右那颗**本来就是「角色」**
//  （他 2026-09-26 定的「把角色按钮放在右侧…最右侧」），它右边已经没有位置了。
//  所以按他的习惯做了一页能点的对比（`设计稿/选项按钮-合并方案对比.html`，A/B/C 三种放法），
//  他选了 **A = 搬到页头最右、「角色」的右边** —— 明知这会把「角色」从最右挤开。
//
//  ## 面板为什么画在内容列顶上，而不是挂在页头那排上
//
//  页头那排只有 `NotchSupport.cardChatModeBandHeight` 那么高，面板挂在它的 `.overlay` 上会
//  **画得出、收不到点击**（这个仓库为它吃过一次亏，见 `开发经验/10-踩过的坑.md` D14）。
//  所以面板由 `NotchHomeView` 画在**内容列的最顶上**（`optionsPanelIfOpen`）—— 视觉上正好
//  接在页头下面，而且它参与布局，点击照常收得到。
//
//  ## 三块各自读写哪里（一份真相，没有第二份）
//
//  | 这一行 | 读写的设置 | 同一件事的另一个入口 |
//  |---|---|---|
//  | 模型 | `PiModeSettingsStore` —— 两个 Pi 进程各一个模型，外加各自的思考开关 | 设置 → Agent →「Pi 模型」 |
//  | 音色 | `CompanionManager.replyVoiceOverride` —— 这一条回复用哪个音色 | 设置 → 语音聊天 →「音色查看」 |
//  | 语速 | `AppSettings.speechPlaybackRate` —— 全局十档 | 设置 → 说（播报）→ 语速 |
//
//  ## 第二行的形状是用户定的
//
//  「分成两行：模型占一行，下面一行分别是音色、语速」—— 所以模型独占第一行，音色与语速
//  并排挤在第二行（它们各自只有"标签 + 一个当前值"那么宽）。
//

import Combine
import SwiftUI

// MARK: - 可选模型清单

/// **可选模型清单**（用户 2026-09-29 点名的那几个）。
///
/// ⚠️ 每个名字都必须是**本机 pi 上真能跑**的（`pi --list-models` 核对 + 真发一轮请求）：
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

// MARK: - 展开状态

/// 「选项」那颗按钮与那块面板共用的展开状态。
///
/// ⚠️ **必须是单例**：按钮住在页头（`CardChatModeBar` 里），面板由 `NotchHomeView` 画 ——
/// 两处两个对象，真相只能有一份。与 `AgentActivityBoard.shared` 同一个理由。
@MainActor
final class CardChatOptionsState: ObservableObject {

    static let shared = CardChatOptionsState()
    private init() {}

    /// 「选项」那颗按钮点开了没有 —— 面板显示与否只看它。
    @Published var isExpanded = false

    /// 面板里哪一块正在展开（nil = 三块都收着，只剩两行总览）。
    @Published var expandedSection: Section?

    /// 「模型」那一块里，两个进程哪一个的模型清单正展开着（nil = 都没展开）。
    @Published var expandedModelRow: PiProcessRow?

    /// 面板里的三块。
    enum Section: Equatable {
        case model
        case voice
        case speed
        case tools
    }

    /// 整个面板收起时把两块子展开也收掉 —— 否则下一次点开它会带着上次的展开状态出现。
    func collapse() {
        isExpanded = false
        expandedSection = nil
        expandedModelRow = nil
    }
}

// MARK: - 面板里的两行（= 两个 Pi 进程）

/// 面板里的两行 —— 它们**就是**那两个常驻的 pi 进程，设置与启动参数都按 `role` 取。
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

    /// 它对应哪个 Pi 进程。
    var role: PiAgentRunner.ProcessRole {
        switch self {
        case .realtime: return .realtime
        case .execute: return .execute
        }
    }
}

// MARK: - 页头那颗按钮

/// **页头最右那颗「选项 ⌄」** —— 在「角色」的右边（用户从对比页里选的方案 A）。
///
/// 样式照页头那排的其他格子：绿色文字 + chevron，无底色无边框 —— 分隔由那一行的白竖线负责。
/// ⚠️ **标签就两个字「选项」，不显示当前值**（与它替掉的那颗「模型」同一个理由：
/// 页头那排的宽度要留给模式和角色，当前值在点开之后看）。
struct CardChatOptionsButton: View {

    @ObservedObject private var state = CardChatOptionsState.shared

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.16)) {
                if state.isExpanded {
                    state.collapse()
                } else {
                    state.isExpanded = true
                }
            }
        } label: {
            HStack(spacing: 5) {
                Text("选项")
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                Image(systemName: state.isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .foregroundColor(DS.Colors.success)
            .padding(.horizontal, 0)
            .fixedSize(horizontal: true, vertical: false)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help(state.isExpanded ? "收起选项" : "模型 / 音色 / 语速，都在这里改")
    }
}

// MARK: - 分隔线

/// 一条横贯面板的细线（两块之间）。
private struct OptionsHorizontalRule: View {
    var body: some View {
        Rectangle()
            .fill(DS.Colors.borderSubtle)
            .frame(height: 1)
    }
}

// MARK: - 面板

/// ⭐ **两行总览 + 谁点开谁展开**（2026-09-29 用户定稿）。
///
/// ```
/// ┌──────────────────────────────────────────────────────────┐
/// │ 模型                       doubao-seed-2.0-mini        ⌄ │  ← 点开：两个进程各一行
/// ├──────────────────────────────────────────────────────────┤
/// │ 音色 赵今麦 ⌄    │    语速 1.2× ⌄                         │  ← 点开：音色表 / 十档
/// └──────────────────────────────────────────────────────────┘
/// ```
///
/// 第二行的两块**共用一个展开区**（互斥）：点「音色」就在第二行下面出声色表，点「语速」
/// 就出十档 —— 两块的内容不会同时堆在一起，面板高度因此最多只有"两行 + 一块"。
struct CardChatOptionsPanel: View {

    /// 音色要读它（`replyVoiceOverride`）；`NotchHomeView` 那一层拿得到，所以从上面传进来。
    @ObservedObject var companionManager: CompanionManager

    @ObservedObject private var state = CardChatOptionsState.shared

    /// 模型与思考开关（两个 Pi 进程那份设置）。
    @State private var piSettings = PiModeSettingsStore.shared.snapshot()

    /// 语速是**全局**的，改它的入口不止这一个（「说（播报）」那一页也改）——
    /// 所以这里存一份快照，靠 `wannaAppSettingsChanged` 跟上，不能现读现画。
    @State private var speechRate = AppSettingsStore.snapshot().speechPlaybackRate

    /// 每一行的高度 —— 与页头那排的控件同高，两处看上去才是一套。
    private let rowHeight: CGFloat = NotchSupport.contentHeaderControlHeight

    var body: some View {
        VStack(spacing: 0) {
            modelSummaryRow
            if state.expandedSection == .model {
                modelOptions
            }

            OptionsHorizontalRule()

            // ⭐ **整行靠右**（2026-09-29 用户：「音色和语速也都放在最右侧对齐，因为这些
            // 选项在右侧，这些东西都应该在最右侧」）—— Spacer 在最左，三组贴着右边缘。
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                voiceSummaryItem
                TableVerticalRule(rowHeight: rowHeight)
                speedSummaryItem
                TableVerticalRule(rowHeight: rowHeight)
                toolsSummaryItem
            }
            .frame(height: rowHeight)

            if state.expandedSection == .voice {
                voiceOptions
            }
            if state.expandedSection == .speed {
                speedOptions
            }
            if state.expandedSection == .tools {
                toolsOptions
            }
        }
        .padding(.horizontal, 12)
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
            piSettings = PiModeSettingsStore.shared.snapshot()
        }
        .onReceive(NotificationCenter.default.publisher(for: .wannaAppSettingsChanged)) { _ in
            speechRate = AppSettingsStore.snapshot().speechPlaybackRate
        }
    }

    // MARK: 第一行 · 模型

    /// **「模型」两个字在最右、当前模型 ID 在它的左侧**（2026-09-29 用户：
    /// 「把『模型』这两个字放在最右侧……然后把具体的模型 ID 放在『模型』两个字的左侧」）。
    /// 标签与值都靠右 —— 因为这颗按钮在页头右侧，面板里的一切也该落在右侧。
    private var modelSummaryRow: some View {
        HStack(spacing: 8) {
            Spacer(minLength: 8)
            summaryValueButton(title: modelSummaryText, section: .model)
            Text("模型")
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(DS.Colors.textPrimary)
        }
        .frame(height: rowHeight)
    }

    /// 两个进程用的是不是同一个模型 —— 是就只显示一个名字（页头那一行本来就不宽）。
    private var modelSummaryText: String {
        let realtimeName = PiModelOption.displayName(for: piSettings.realtimeModelID)
        let executeName = PiModelOption.displayName(for: piSettings.executeModelID)
        return realtimeName == executeName ? realtimeName : "\(realtimeName) · \(executeName)"
    }

    /// 模型那一块展开之后：**两个进程各一行**，每行 = 名字 ｜ 思考开关 ｜ 当前模型（可换）。
    private var modelOptions: some View {
        VStack(spacing: 0) {
            ForEach(PiProcessRow.allCases) { processRow in
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        Text(processRow.displayName)
                            .font(.system(size: 12))
                            .foregroundStyle(DS.Colors.textSecondary)
                            .frame(width: 62, alignment: .leading)

                        thinkingToggle(processRow)

                        Spacer(minLength: 8)

                        modelListButton(processRow)
                    }
                    .padding(.horizontal, 4)
                    .frame(height: 30)

                    if state.expandedModelRow == processRow {
                        ForEach(PiModelOption.catalog) { option in
                            modelOptionRow(option, for: processRow)
                        }
                    }
                }
            }
        }
        .padding(.bottom, 4)
    }

    /// 「思考 开 / 思考 关」—— 写入 `PiModeSettings`，下一轮自动重起那个进程。
    ///
    /// 落法（`PiAgentRunner.modelAndThinkingArguments`）：**开 = 不传参数**（pi 默认就开），
    /// **关 = 显式 `--thinking off`**（它发出 `reasoning_effort: none`，火山与 DeepSeek 都认）。
    private func thinkingToggle(_ processRow: PiProcessRow) -> some View {
        let isOn = piSettings.thinkingEnabled(for: processRow.role)
        return Button {
            var updated = PiModeSettingsStore.shared.snapshot()
            switch processRow {
            case .realtime: updated.realtimeThinkingEnabled.toggle()
            case .execute: updated.executeThinkingEnabled.toggle()
            }
            PiModeSettingsStore.shared.save(updated)
            piSettings = updated
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isOn ? "brain" : "brain.fill")
                    .font(.system(size: 10))
                Text(isOn ? "思考 开" : "思考 关")
                    .font(.system(size: 11.5, weight: .medium))
            }
            .foregroundStyle(isOn ? DS.Colors.success : DS.Colors.textTertiary)
            .padding(.horizontal, 7)
            .frame(height: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help(isOn ? "这个模式现在会思考（点击：关掉，更快）" : "这个模式现在不思考（点击：打开，想得更清楚）")
    }

    /// 当前模型 —— 点它展开 `PiModelOption.catalog`。显示的是**完整 id**（用户要的
    /// 「显示具体的模型 ID」；总览那一行才用短名，因为页头那一行放不下）。
    private func modelListButton(_ processRow: PiProcessRow) -> some View {
        let currentModelID = modelID(of: processRow)
        return Button {
            withAnimation(.easeInOut(duration: 0.14)) {
                state.expandedModelRow = (state.expandedModelRow == processRow) ? nil : processRow
            }
        } label: {
            HStack(spacing: 5) {
                Text(currentModelID)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(DS.Colors.success)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Image(systemName: state.expandedModelRow == processRow ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(DS.Colors.textSecondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help("换这个模式用的模型")
    }

    private func modelOptionRow(_ option: PiModelOption, for processRow: PiProcessRow) -> some View {
        let currentModelID = modelID(of: processRow)
        return Button {
            var updated = PiModeSettingsStore.shared.snapshot()
            switch processRow {
            case .realtime: updated.realtimeModelID = option.id
            case .execute: updated.executeModelID = option.id
            }
            PiModeSettingsStore.shared.save(updated)
            piSettings = updated
            // 选完把清单收起来（面板留着 —— 可能还要改另一个进程）。
            state.expandedModelRow = nil
        } label: {
            // **靠右对齐**（用户 2026-09-29：「模型点击之后，下面的选项，必须靠右对齐」）——
            // 与上面那行的模型名同一侧。
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Text(option.id)
                    .font(.system(size: 12))
                    .foregroundStyle(option.id == currentModelID ? DS.Colors.success
                                                                 : DS.Colors.textSecondary)
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

    private func modelID(of processRow: PiProcessRow) -> String {
        switch processRow {
        case .realtime: return piSettings.realtimeModelID
        case .execute: return piSettings.executeModelID
        }
    }

    // MARK: 第二行 · 音色 ｜ 语速

    private var voiceSummaryItem: some View {
        HStack(spacing: 6) {
            Text("音色")
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(DS.Colors.textPrimary)
            summaryValueButton(title: currentVoiceName, section: .voice)
        }
        .padding(.trailing, 12)
    }

    private var speedSummaryItem: some View {
        HStack(spacing: 6) {
            Text("语速")
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(DS.Colors.textPrimary)
            summaryValueButton(title: speedSummaryText, section: .speed)
        }
        .padding(.leading, 12)
    }

    // MARK: 工具

    /// 「工具」——三个模式都有的第三项（2026-09-29 用户：「右上角的选项，无论是图文、
    /// 语音还是视频，都再增加一个选项，就是工具调用」）。图文这一页展开是 **MCP 工具
    /// 清单**（21 个，写全），语音 / 视频页那一颗是它自己的（见 `VoiceChatSessionView`）。
    private var toolsSummaryItem: some View {
        HStack(spacing: 6) {
            Text("工具")
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(DS.Colors.textPrimary)
            summaryValueButton(title: "\(WannaMCPTools.list().count) 个", section: .tools)
        }
        .padding(.leading, 12)
    }

    /// 工具清单 —— **写全、左对齐**（用户：「具体工具放在最左边对齐，然后写清楚。
    /// 现在只显示一个 MCP，就显示"MCP"三个字，这跟没写一样」）。
    ///
    /// 数据就是 MCP 服务端 `tools/list` 报出去的那份（`WannaMCPTools.list()`）——
    /// 模型能调的与这里显示的**必然一致**，因为是同一个函数。
    private var toolsOptions: some View {
        let tools = WannaMCPTools.list()
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(tools.enumerated()), id: \.offset) { _, tool in
                let name = tool["name"] as? String ?? "?"
                let description = tool["description"] as? String ?? ""
                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(DS.Colors.success)
                    if !description.isEmpty {
                        Text(description)
                            .font(.system(size: 10.5))
                            .foregroundStyle(DS.Colors.textTertiary)
                            .lineLimit(1)
                    }
                }
                .padding(.vertical, 3)
            }
        }
        .padding(.vertical, 6)
    }

    private var speedSummaryText: String {
        String(format: "%.2f×", speechRate)
    }

    /// 当前音色名 —— 系统音色查表，克隆音色查本地昵称（照搬原来那颗「音色」按钮的读法，
    /// 所以合并之后显示的仍是同一个名字）。
    private var currentVoiceName: String {
        guard let voiceID = companionManager.replyVoiceOverride else { return "默认" }
        if let systemVoice = VoiceCatalog.threeStageVoices.first(where: { $0.id == voiceID }) {
            return systemVoice.displayName
        }
        return VoiceLibraryStore.nickname(forCustomVoiceID: voiceID) ?? voiceID
    }

    /// 三块右下角那个「当前值 ⌄」—— 长得一样、行为一样，只有写回的地方不同。
    private func summaryValueButton(title: String, section: CardChatOptionsState.Section) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.14)) {
                state.expandedSection = (state.expandedSection == section) ? nil : section
                state.expandedModelRow = nil
            }
        } label: {
            HStack(spacing: 5) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(DS.Colors.success)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Image(systemName: state.expandedSection == section ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(DS.Colors.textSecondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerCursor()
        .help("点击选择")
    }

    // MARK: 音色那一块展开之后

    /// 音色表直接用语音页那一块（`VoicePickerPanel`）—— 它是自包含的（分类 / 克隆音色 /
    /// 试听都在里面），照搬比在这里重写一遍可靠。
    private var voiceOptions: some View {
        VoicePickerPanel(
            engine: .threeStage,
            modelID: ModelConfigurationStore.snapshot().status(of: .speech).resolvedRole?.modelID
                ?? BailianConfiguration.Models.textToSpeech,
            selectedVoiceID: companionManager.replyVoiceOverride ?? "",
            onSelectVoice: { voiceID in
                SoundEffectPlayer.shared.play(.sidebarButton)
                companionManager.replyVoiceOverride = voiceID.isEmpty ? nil : voiceID
                state.expandedSection = nil
            },
            onClose: { state.expandedSection = nil })
            .padding(.vertical, 8)
    }

    // MARK: 语速那一块展开之后

    /// 十档**横着排**。原来那个（`SpeechSpeedChip.panel`）是竖着的浮层 —— 十个 28pt 的行
    /// 放进这块面板里会长得离谱，而这一行本来就只有"语速"两个字宽。
    private var speedOptions: some View {
        let currentLevel = SpeechSpeedLevels.currentLevel(forRate: speechRate)
        return HStack(spacing: 0) {
            ForEach(SpeechSpeedLevels.all, id: \.level) { entry in
                Button {
                    var settings = AppSettingsStore.snapshot()
                    settings.speechPlaybackRate = entry.rate
                    try? AppSettingsStore.save(settings)
                    speechRate = entry.rate
                    state.expandedSection = nil
                } label: {
                    Text("\(entry.level)")
                        .font(.system(size: 12, weight: entry.level == currentLevel ? .semibold : .regular))
                        .foregroundStyle(entry.level == currentLevel ? DS.Colors.success
                                                                     : DS.Colors.textSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 26)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerCursor()
                .help(String(format: "%d 档 · %.2f×", entry.level, entry.rate))
            }
        }
        .padding(.bottom, 4)
    }
}
