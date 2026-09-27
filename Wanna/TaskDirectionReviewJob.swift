//
//  TaskDirectionReviewJob.swift
//  Wanna
//
//  **每天中午 12 点，由复盘把"高频任务方向"追加进那份清单**（2026-09-27 用户的设计，第三条来源）。
//
//  用户的原话：
//  > 再增加第三点：这些方向还应该有第三个来源，但不是实时的，是**每天中午 12 点**，由复盘 agent 去
//  > 识别用户的历史记录或历史对话，提炼出用户主要的或高频的任务方向、任务类型、使用的工具类型，
//  > 然后追加到之前设定好的任务方向里面，**并标注日期**。注意是追加，而且**只允许修改这个文件**，
//  > 其他文件不可以修改。修改方法必须是**追加方式**，**一定要去重**，用关键词形式显示，也可以在
//  > 关键词右侧添加描述，方便 AI 理解。
//
//  ## 两条硬规矩（都写在这个文件里，别处不许改）
//
//  1. **只碰 `TaskDirectionStore`** —— 它只调 `append(keyword:detail:source:.review)`，
//     读历史用的是会话 store 的只读接口。别的文件一个字都不写。
//  2. **不轮询** —— 一次 `Task.sleep` 睡到下一个中午 12 点（本地时间），跑完再排下一次。
//     没有定时器、没有每分钟醒一次（用户对"轮询太费电脑成本"的要求同样适用在这里）。
//

import Foundation

@MainActor
final class TaskDirectionReviewJob {

    static let shared = TaskDirectionReviewJob()
    private init() {}

    private var scheduledTask: Task<Void, Never>?
    /// 一次复盘最多提炼几条（用户说"最高频"，不是"全部"）。
    private static let maximumExtractedDirections = 5
    /// 喂给模型的对话片段上限（字符）—— 成本与准确度的折中。
    private static let maximumHistoryCharacters = 6_000

    /// App 启动时调一次；它自己排到下一个中午 12 点。
    func start() {
        guard scheduledTask == nil else { return }
        scheduledTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                let nextNoon = Self.nextNoon()
                let seconds = max(60, nextNoon.timeIntervalSinceNow)
                print("🧭 方向复盘：下一次在 \(Self.formatter.string(from: nextNoon)) 跑")
                try? await Task.sleep(for: .seconds(seconds))
                guard !Task.isCancelled else { return }
                await self?.runReviewOnce()
            }
        }
    }

    /// 下一个**本地**中午 12 点（不是"12 小时之后"）。
    static func nextNoon(from now: Date = Date()) -> Date {
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: now)
        let todayNoon = calendar.date(byAdding: .hour, value: 12, to: startOfToday) ?? now
        if todayNoon > now { return todayNoon }
        return calendar.date(byAdding: .day, value: 1, to: todayNoon) ?? todayNoon
    }

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "M月d日 HH:mm"
        return formatter
    }()

    /// 跑一次：读最近的对话 → 让模型提炼 → **追加**（去重由 store 负责）。
    func runReviewOnce() async {
        let history = Self.recentHistoryText()
        guard !history.isEmpty else {
            print("🧭 方向复盘：最近的对话是空的，这次不提炼")
            return
        }
        let settings = AppSettingsStore.snapshot()
        let systemPrompt = """
        你是任务方向复盘器。下面是用户最近几天跟他的 Mac 助手之间的对话片段。
        请提炼出他**反复出现的**任务方向 / 任务类型 / 用到的工具类型 —— 只要那些值得做成一个"快捷方向"的，
        最多 \(Self.maximumExtractedDirections) 条。

        只输出一个 JSON 数组，不要任何别的文字、不要代码块：
        [{"keyword": "3~7 个字的关键词", "detail": "一句话说明这个方向是干什么的"}]

        规则：关键词要短（3~7 字）、用他自己的说法；描述要具体到能拿去做判断（"是不是这个方向"）；
        不要输出已经存在的方向（下面给了现有清单）。
        """
        let userPrompt = """
        现有的方向清单：
        \(TaskDirectionStore.shared.allDirections().map { "- \($0.keyword)：\($0.detail)" }.joined(separator: "\n"))

        最近的对话片段：
        \(history)
        """
        do {
            let (reply, _) = try await BailianVisionChatAPI().analyzeImageStreaming(
                images: [],
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                roleOverride: CompanionManager.visionRoleOverride(
                    forCardID: ConversationSessionsStore.activeSession().id.uuidString),
                onTextChunk: { _ in })
            let extracted = Self.parseExtractedDirections(reply)
            guard !extracted.isEmpty else {
                print("🧭 方向复盘：这次没提炼出新的方向")
                return
            }
            var appendedCount = 0
            for direction in extracted {
                if TaskDirectionStore.shared.append(keyword: direction.keyword,
                                                     detail: direction.detail,
                                                     source: .review) {
                    appendedCount += 1
                }
            }
            print("🧭 方向复盘：提炼 \(extracted.count) 条，追加 \(appendedCount) 条（其余重复）")
        } catch {
            print("🧭 方向复盘：这次没跑成 —— \(error.localizedDescription)")
        }
    }

    /// 解析模型回的那个 JSON 数组（宽容：能认出 `[{keyword, detail}]` 就行，认不出就当没提炼到）。
    static func parseExtractedDirections(_ raw: String) -> [(keyword: String, detail: String)] {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let start = text.firstIndex(of: "["), let end = text.lastIndex(of: "]"), start < end {
            text = String(text[start...end])
        }
        guard let data = text.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        var results: [(String, String)] = []
        for item in array {
            let keyword = (item["keyword"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let detail = (item["detail"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !keyword.isEmpty else { continue }
            results.append((keyword, detail.isEmpty ? keyword : detail))
        }
        return results.prefix(maximumExtractedDirections).map { ($0.0, $0.1) }
    }

    /// 最近几天的对话文本（只读，**不改任何东西**）。
    private static func recentHistoryText() -> String {
        let sessions = ConversationSessionsStore.allSessionsIncludingArchived()
        let cutoff = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? .distantPast
        var lines: [String] = []
        // 条目本身没有时间戳，所以"最近"按**会话**的 updatedAt 判：最近 7 天动过的会话，
        // 各取最后 20 轮（宁可少取，也别把三个月前的老话当"最近的高频"）。
        for session in sessions.sorted(by: { $0.updatedAt > $1.updatedAt })
        where session.updatedAt > cutoff {
            for entry in session.entries.suffix(20) {
                let question = entry.userTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
                let answer = (entry.displayResponse ?? entry.assistantResponse)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !question.isEmpty else { continue }
                lines.append("用户：\(question.prefix(120))")
                if !answer.isEmpty { lines.append("助手：\(answer.prefix(120))") }
                if lines.joined().count > maximumHistoryCharacters { break }
            }
            if lines.joined().count > maximumHistoryCharacters { break }
        }
        return String(lines.joined(separator: "\n").prefix(maximumHistoryCharacters))
    }
}
