//
//  DirectionBoardSettingsView.swift
//  Wanna
//
//  设置 → 操作 里的「任务方向看板」一节（2026-09-27）。
//
//  用户对这一段的要求只有一句：「六个方向短语 + 每类的预设关键词，**做成设置页可改**」。
//
//  它改的是 `AppSettings.directionBoard`（`DirectionBoardConfiguration`）：
//  · 六个短语 = 看板上那六格的固定文字；
//  · 每个短语自己的关键词 = **本地匹配**用的词（命中就把那一格点亮，不花请求）。
//
//  为什么关键词是**按按钮**（六份）而不是按行（三份）：一行有两个短语，一份关键词没法回答
//  「该点亮哪一个」（见 `DirectionBoardSettings.swift` 的注释）。
//

import SwiftUI

struct DirectionBoardSettingsSection: View {

    @ObservedObject var generalSettingsViewModel: GeneralSettingsViewModel

    private var configuration: DirectionBoardConfiguration {
        generalSettingsViewModel.draftSettings.directionBoard
    }

    var body: some View {
        SettingsGroupLabel("任务方向看板")
        SettingsCard {
            SettingsRow(
                label: "显示任务方向看板",
                description: "说话时在鼠标右上角显示一块板：AI 怎么理解你这次要做的事 + 六个方向按钮 + 一个补充说明框。关掉之后面板不出现，也不会发那次请求。"
            ) {
                SettingsSwitch(isOn: generalSettingsViewModel.binding(\.directionBoardEnabled))
            }

            ForEach(0..<DirectionBoardConfiguration.rowCount, id: \.self) { rowIndex in
                ForEach(0..<DirectionBoardConfiguration.buttonsPerRow, id: \.self) { columnIndex in
                    SettingsCardRowDivider()
                    SettingsRow(
                        label: "\(configuration.rows[rowIndex].title) · 第 \(columnIndex + 1) 格",
                        description: columnIndex == 0
                            ? "第 1 格在关键词没命中时会显示 AI 写的短语（≤12 字）。"
                            : "第 2 格永远是这句话，AI 不会改它。"
                    ) {
                        // 上下排而不是左右排：真机上这一页的控件宽度只有 ~300pt，
                        // 并排两个框会把关键词截成半句（离屏渲染一眼看出来：`… 存到`）。
                        VStack(alignment: .trailing, spacing: 4) {
                            SettingsPlainField(
                                placeholder: "短语",
                                text: phraseBinding(rowIndex: rowIndex, columnIndex: columnIndex),
                                width: 260)
                            SettingsPlainField(
                                placeholder: "关键词（逗号分隔）",
                                text: keywordsBinding(rowIndex: rowIndex, columnIndex: columnIndex),
                                width: 260)
                        }
                    }
                }
            }

            SettingsCardRowDivider()
            SettingsRow(
                label: "恢复默认",
                description: "把六个短语和它们的关键词恢复成出厂的那一套。"
            ) {
                Button("恢复默认") {
                    generalSettingsViewModel.draftSettings.directionBoard = .default
                }
                .buttonStyle(DSPillButtonStyle())
            }
        }
        SettingsNote(
            text: "关键词是本地匹配：你说话时只要有哪一格的关键词出现在识别结果里，那一格就会自己亮起来（并显示它的预设短语），不用等 AI。关键词没命中时，第 1 格才交给 AI 去写 —— 所以预设写得越准，看板越稳。空着不写就是「这一格永远交给 AI 判断」。"
        )
    }

    // MARK: - 绑定（草稿，按「保存」才落盘）

    private func phraseBinding(rowIndex: Int, columnIndex: Int) -> Binding<String> {
        Binding(
            get: { configuration.rows[rowIndex].buttons[columnIndex].presetText },
            set: { newValue in
                var updated = configuration
                updated.rows[rowIndex].buttons[columnIndex].presetText = newValue
                generalSettingsViewModel.draftSettings.directionBoard = updated
            })
    }

    private func keywordsBinding(rowIndex: Int, columnIndex: Int) -> Binding<String> {
        Binding(
            get: { configuration.rows[rowIndex].buttons[columnIndex].keywords.joined(separator: "，") },
            set: { newValue in
                var updated = configuration
                // 中英文逗号都认（用户在中文输入法下打的是「，」）。
                let keywords = newValue
                    .split(whereSeparator: { $0 == "," || $0 == "，" })
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                updated.rows[rowIndex].buttons[columnIndex].keywords = keywords
                generalSettingsViewModel.draftSettings.directionBoard = updated
            })
    }
}

/// 设置页里那个小输入框 —— 与「claude 命令路径」那一行的输入框同一个样子。
///
/// 抽出来只因为这一节有 12 个同样的框；形状（底色、圆角、边框）与那一行逐点一致。
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
                    .stroke(DS.Colors.borderSubtle, lineWidth: 1)
            )
    }
}
