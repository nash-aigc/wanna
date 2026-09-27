//
//  DirectionBoardSettingsView.swift
//  Wanna
//
//  设置 → 操作 里的「任务方向看板」一节（2026-09-27）。
//
//  用户对这一节的两句话：
//  > 把它设置一下，然后在设置页面增加一个设置选项，这就是任务方向卡片相关的东西。给我设计。
//  > 这些取消的时间可以在设置里面显示。
//
//  所以这一节管的是**这一整套功能**：总开关、**方向清单（一个文件）**、Jev 的 key 与概率阈值、
//  宽度、发送门槛、取消状态。方向清单是整套东西的真相（用户：「整个方向现在就是一个文件，
//  一个关键词加一些描述」），所以它在这个页面上**可看、可加、可删、可恢复默认**。
//

import SwiftUI

struct DirectionBoardSettingsSection: View {

    @ObservedObject var generalSettingsViewModel: GeneralSettingsViewModel

    /// 清单变了要重画（store 发通知）。
    @State private var directions: [TaskDirection] = TaskDirectionStore.shared.allDirections()

    private var pinnedStates: [(directionID: String, state: TaskDirectionStore.PinState)] {
        TaskDirectionStore.shared.pinnedStates()
    }

    private func reload() {
        directions = TaskDirectionStore.shared.allDirections()
        // 固定状态是算出来的（不是我持有的副本），但视图得知道它变了 —— 用一个计数器推一把。
        pinnedRevision += 1
    }
    @State private var pinnedRevision = 0
    @State private var newKeyword = ""
    @State private var newDetail = ""
    @State private var jevKeyDraft = JevDecisionClient.apiKey() ?? ""

    var body: some View {
        SettingsGroupLabel("任务方向看板")
        SettingsCard {
            SettingsRow(
                label: "显示任务方向看板",
                description: "说话时在鼠标右上角显示一块板：AI 怎么理解你这次要做的事 + 几个方向按钮 + 一个补充说明框。关掉之后面板不出现，也不发任何请求。"
            ) {
                SettingsSwitch(isOn: generalSettingsViewModel.binding(\.directionBoardEnabled))
            }

            // ⚠️ **「看板宽度」那一行删掉了（2026-09-28）**：卡片改成 7 字形之后，宽度由形状定死 ——
            // 横杠 360pt、竖条 340pt（= 右下角那张回复卡的最大宽度，用户指定），
            // 于是那个倍数设置**存了也不会有任何效果**。一个存了不生效的开关比没有开关更糟，
            // 所以连同 `AppSettings.directionBoardWidthMultiplier` 一起删掉。

            SettingsCardRowDivider()
            // ⚠️ **「每隔 3 秒问一次的门槛」（新增多少个字才问一次）删掉了（2026-09-28）**：
            // 实时那条链改成"**他停下来了就刷**"（见 `DirectionBoardSession.hasPausedLongEnough`
            // 与 `shouldRequest`），字数门槛整个没有了 —— 那个设置留着就是存了也不生效。
            SettingsCardRowDivider()
            SettingsRow(
                label: "方向概率阈值",
                description: "Jev 判断「这句话是在要求这个方向」的概率，到多少才把它显示出来。越低显示得越多、越容易干扰；越高越准、越容易漏。"
            ) {
                SettingsSlider(
                    value: generalSettingsViewModel.binding(\.directionBoardProbabilityThreshold),
                    range: 0.3...0.9,
                    step: 0.05,
                    valueLabel: { String(format: "%.2f", $0) })
            }

            SettingsCardRowDivider()
            SettingsRow(
                label: "看板被取消到什么时候",
                description: cancelledDescription
            ) {
                Button("恢复显示") {
                    DirectionBoardSession.shared.resumeImmediately()
                }
                .buttonStyle(DSPillButtonStyle())
            }
        }

        SettingsNote(
            text: "「取消本次 / 取消十分钟 / 取消今日」在说话时可以直接点，也可以说「取消任务看板」。"
        )

        SettingsGroupLabel("方向清单（一个文件）")
        SettingsCard {
            SettingsRow(
                label: "清单（\(directions.count) 条）",
                description: "**只有一个来源**：这个文件。一个关键词 + 一句描述。出厂那份是从主 Agent 提示词里提炼的；每天中午复盘扫你的历史记录，出现超过两次的才追加进来（先去重）；你也可以在这里手动加或删。"
            ) {
                HStack(spacing: 6) {
                    Button("在访达中显示") {
                        NSWorkspace.shared.activateFileViewerSelecting([TaskDirectionStore.fileURL])
                    }
                    .buttonStyle(DSPillButtonStyle())
                    Button("恢复默认") {
                        TaskDirectionStore.shared.restoreBuiltinDefaults()
                        reload()
                    }
                    .buttonStyle(DSPillButtonStyle())
                }
            }

            ForEach(directions) { direction in
                SettingsCardRowDivider()
                SettingsRow(
                    label: direction.keyword,
                    description: "\(sourceLabel(direction.source))｜\(direction.detail)"
                ) {
                    Button("删除") {
                        TaskDirectionStore.shared.remove(id: direction.id)
                        reload()
                    }
                    .buttonStyle(DSPillButtonStyle())
                }
            }

            SettingsCardRowDivider()
            SettingsRow(
                label: "已固定的方向（\(pinnedStates.count) 条）",
                description: pinnedDescription
            ) {
                Button("全部取消") {
                    TaskDirectionStore.shared.clearPins()
                    reload()
                }
                .buttonStyle(DSPillButtonStyle())
            }

            SettingsCardRowDivider()
            SettingsRow(
                label: "手动加一条",
                description: "关键词是显示在卡片上的那几个字（建议 3~7 字）；描述是给判断用的判据，越具体越准。"
            ) {
                HStack(spacing: 6) {
                    SettingsPlainField(placeholder: "关键词", text: $newKeyword, width: 110)
                    SettingsPlainField(placeholder: "一句描述", text: $newDetail, width: 150)
                    Button("追加") {
                        let added = TaskDirectionStore.shared.append(keyword: newKeyword,
                                                                     detail: newDetail,
                                                                     source: .review)
                        if added { newKeyword = ""; newDetail = "" }
                        reload()
                    }
                    .buttonStyle(DSPillButtonStyle())
                }
            }
        }

        SettingsGroupLabel("回车那套")
        SettingsCard {
            SettingsRow(
                label: "粘贴用哪个键",
                description: "看板显示着的时候，这两个键**不用点卡片**就生效：选中的那个 = 把**右下角那段回复粘到你光标的位置**（覆盖掉选中的东西）然后这一轮结束；**另一个** = **把当前这一轮发给主 Agent 去执行**（也就是转到 agent 模式）。默认 **Command + Enter 粘贴 / Option + Enter 执行**。"
            ) {
                SettingsSegmentedPicker(
                    selection: generalSettingsViewModel.binding(\.boardPasteShortcut),
                    options: [
                        SettingsPickerOption(label: "Command + Enter", value: BoardPasteShortcut.commandReturn),
                        SettingsPickerOption(label: "Option + Enter", value: BoardPasteShortcut.optionReturn),
                    ])
            }
        }
        SettingsNote(
            text: "看板一显示这两个组合就生效 —— 不用点卡片，正是「直接显示之后就自动识别」。**裸回车（以及 Shift + 回车）原样放行**，因为那两个动作现在都带修饰键，再吞掉裸回车只会白白吃掉你在别的 App 里的回车。"
        )

        SettingsGroupLabel("参考材料（说这些词就带上）")
        SettingsCard {
            SettingsTextEditorRow(
                label: "屏幕",
                description: "说到这些词就**再截一张当下的屏幕**（说几次截几张；按下快捷键时本来就已经自动截了一张）。卡片上会显示成「屏幕一 / 屏幕二」。",
                text: generalSettingsViewModel.binding(\.notionScreenKeywords),
                placeholder: "参考屏幕\n屏幕内容")
            SettingsCardRowDivider()
            SettingsTextEditorRow(
                label: "剪贴板",
                description: "说到这些词就把**剪贴板最近一条内容**带上（文字直接发；文字文件抽正文；其他文件与文件夹只发绝对路径）。一轮只取一次。",
                text: generalSettingsViewModel.binding(\.notionClipboardKeywords),
                placeholder: "复制内容\n参考剪贴板")
            SettingsCardRowDivider()
            SettingsTextEditorRow(
                label: "文件 / 文件夹",
                description: "说到这些词就**去看剪贴板里是不是一个绝对路径**（`/` 开头那种），是就带上 —— **只给路径、不给内容**，需要看内容让 Agent 自己去读。不是路径就什么都不带（卡片上标「无法识别」）。**在你说的那一刻读**，所以之后再复制别的东西也不影响这一轮。",
                text: generalSettingsViewModel.binding(\.selectedItemKeywords),
                placeholder: "参考文件\n参考文件夹")
        }
        SettingsNote(
            text: "这三组词是**代码**在认（不是 AI）：识别到就去取材料，**取到了才在卡片上显示标签** —— 说了词但没取到（比如剪贴板里不是路径），标签不会出现。一行一个词。"
        )

        SettingsGroupLabel("方向判断（Jev 决策模型）")
        SettingsCard {
            SettingsRow(
                label: "Jev API Key",
                description: JevDecisionClient.hasAPIKey
                    ? "已配置（存在仓库外的 0600 文件里）。它就是 OpenRouter 的 key，判断一次约 $0.00003。"
                    : "还没配。它是 OpenRouter 的 key；不配的话仍然能用（只靠本地关键词匹配 + AI 写理解），但不会有概率判断。"
            ) {
                HStack(spacing: 6) {
                    SettingsPlainField(placeholder: "sk-or-…", text: $jevKeyDraft, width: 220)
                    Button("保存") {
                        JevDecisionClient.saveAPIKey(jevKeyDraft)
                    }
                    .buttonStyle(DSPillButtonStyle())
                }
            }
        }
        SettingsNote(
            text: "为什么用 Jev：它是专门做判断的模型，给的是概率（不是一段话），而且便宜到可以每三秒问一次。方向和理解分开：方向由 Jev 判，那段「我理解你要做什么」由大模型写 —— 两边都只拿「方向清单 + 你说的话」，不再发主 Agent 那一大段提示词。"
        )
    }

    /// 已固定那一行的说明（有固定项时把它们连起来给用户看）。
    private var pinnedDescription: String {
        let pins = pinnedStates
        guard !pins.isEmpty else {
            return "你在说话时明确说过「这个方向对 / 不对」的那些会固定显示在板上，并一直留着 —— 这里可以一次全清。"
        }
        let names = pins.map { pin -> String in
            let keyword = directions.first { $0.id == pin.directionID }?.keyword ?? pin.directionID
            return keyword + (pin.state == .confirmed ? " ✓" : " ✗")
        }
        return "这些是你明确说过「对 / 不对」的方向：" + names.joined(separator: "、")
            + "。固定项永远排在板子最前、编号不变；说「取消任务方向 N」也能取消一条。"
    }

    private func sourceLabel(_ source: String) -> String {
        switch TaskDirection.Source(rawValue: source) {
        case .builtin: return "出厂"
        case .user: return "你加的"
        case .review: return "复盘追加"
        case .none: return source
        }
    }

    private var cancelledDescription: String {
        guard let until = DirectionBoardSession.shared.cancelledUntilDate else {
            return "现在没有取消（看板在说话时正常显示）。"
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "M月d日 HH:mm"
        return "看板被取消到 \(formatter.string(from: until))。到时间会自动恢复；也可以按右边这颗立刻恢复。"
    }
}

/// 设置页里那个小输入框 —— 与「claude 命令路径」那一行的输入框同一个样子。
private struct SettingsPlainField: View {

    let placeholder: String
    @Binding var text: String
    let width: CGFloat

    var body: some View {
        TextField(placeholder, text: $text)
            .textFieldStyle(.plain)
            .font(.system(size: 12))
            .foregroundColor(DS.Colors.textSecondary)
            .frame(width: width)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(DS.Colors.surface2)
            .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DS.CornerRadius.small, style: .continuous)
                    .strokeBorder(DS.Colors.borderSubtle, lineWidth: 1)
            )
    }
}
