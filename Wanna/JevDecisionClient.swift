//
//  JevDecisionClient.swift
//  Wanna
//
//  **方向判断用的 Jev 决策模型**（2026-09-27 用户点名要的）。
//
//  用户的原话：
//  > 识别用户意图显示出来生成的文本，使用 deepseek 大语言模型。但是对于**方向的选择，不使用大语言
//  > 模型**来做，因为它太贵了。使用一个叫 **JEV 模型**……他这个模型是专门用来做判断的，而咱们的
//  > 任务刚好是做判断。所以你就按照分钟数实时去调这个模型，让它根据用户的意图来判断出来，然后做
//  > 一个类似于**概率估计**的东西，把高概率的内容显示出来。
//
//  ## 协议是**实测过的**，不是照文档猜的（2026-09-27，本机真跑）
//
//  · 端点 `POST https://openrouter.ai/api/alpha/decisions`，模型 `~typesafe/jev-latest`
//    （`/api/v1/decisions` 是 404，`/api/v1/models` 里也查不到 —— alpha 集成）；
//  · 鉴权用 OpenRouter 的 key（`OPENROUTER_API_KEY` 那一把，`Bearer`）；
//  · **一个请求可以问多题，按"次"计费** —— 所以"每条方向一道题"是一个请求，不是 N 个；
//  · 三个原语的 `criteria` 形状**各不相同**（写错就是 400 `invalid_union`，报错极难读）：
//    `choice` 用对象、`score` 用字符串数组、**`noul` 的键必须字面量是 `"true"`/`"false"`**；
//  · `noul` 只回**一个数**（P(true)，0~1），没有 probabilities/confidence —— 阈值自己定。
//
//  **实测那一次**（state = 「帮我把这段整理一下，存到 notion 里，顺便指给我看那个按钮在哪里」）：
//  保存到 Notion 0.97 ／ 指给我看 0.94 ／ 操作电脑 0.76 ／ 写成文字 0.50 ／ 画一张图 0.02，
//  成本 **$0.0000318**（输入 756 token）—— 每 3 秒一发，一整句话不到千分之一美分。
//

import Foundation

@MainActor
final class JevDecisionClient {

    static let shared = JevDecisionClient()
    private init() {}

    private static let endpoint = URL(string: "https://openrouter.ai/api/alpha/decisions")!
    /// 别名会漂移（上游一发版判断行为就可能变）—— 探针里那次实际回的是 `typesafe/jev-1.13-20260917`。
    /// 先跟着 latest 走，等行为要复现时再钉版本。
    private static let modelID = "~typesafe/jev-latest"

    /// 一条方向的判断结果。
    struct DirectionProbability {
        let directionID: String
        /// P(true)：这段话是在要求这个方向吗（0~1）。
        let probability: Double
    }

    enum JevError: LocalizedError {
        case keyMissing
        case http(code: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .keyMissing: return "还没填 Jev（OpenRouter）的 API Key（设置 → 操作 → 任务方向看板）"
            case .http(let code, let message): return "Jev \(code)：\(message)"
            }
        }
    }

    /// **一次请求问完所有方向**（每条方向一道 `noul` 题）。
    ///
    /// - Parameter transcriptState: 用户到目前为止说的话（几十字，**不是**几千字的主提示词 ——
    ///   这正是用户要的省钱做法：「没有必要发送那么多提示词，这样即便是高频调用也不会花费很多 token」）。
    func judge(transcriptState: String,
               directions: [(id: String, keyword: String, detail: String)]) async throws -> [DirectionProbability] {
        guard let key = Self.apiKey(), !key.isEmpty else { throw JevError.keyMissing }
        guard !directions.isEmpty else { return [] }

        var questions: [String: Any] = [:]
        for direction in directions {
            questions[direction.id] = [
                "type": "noul",
                "instructions": "用户这次要做的事，属于「\(direction.keyword)」吗？",
                // ⚠️ 键名必须字面量是 true / false —— 换成 yes/no 或 是/否 一律 400（手册实测）。
                "criteria": [
                    "true": direction.detail,
                    "false": "用户这次**没有**要做「\(direction.keyword)」这件事，或者只是顺带提一句、不是这次的任务",
                ],
            ]
        }
        let body: [String: Any] = [
            "model": Self.modelID,
            "state": transcriptState,
            "questions": questions,
        ]

        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 20

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw JevError.http(code: -1, message: "没有响应")
        }
        guard (200..<300).contains(http.statusCode) else {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw JevError.http(code: http.statusCode, message: String(raw.prefix(300)))
        }
        guard let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let answers = parsed["answers"] as? [String: Any] else {
            return []
        }
        var results: [DirectionProbability] = []
        for direction in directions {
            guard let answer = answers[direction.id] as? [String: Any],
                  let probability = answer["noul"] as? Double else { continue }
            results.append(DirectionProbability(directionID: direction.id, probability: probability))
        }
        return results
    }

    /// Key 放在仓库外、0600 的单独文件里（与 `NotionToken.txt` 同一个做法：
    /// 它不进 `AppSettings`，所以导出设置不会把它带出去）。
    static var keyFileURL: URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Wanna", isDirectory: true)
            .appendingPathComponent("JevKey.txt")
    }

    static func apiKey() -> String? {
        (try? String(contentsOf: keyFileURL, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func saveAPIKey(_ key: String) {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = keyFileURL
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        if trimmed.isEmpty {
            try? FileManager.default.removeItem(at: url)
            return
        }
        try? trimmed.write(to: url, atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    static var hasAPIKey: Bool {
        !(apiKey() ?? "").isEmpty
    }
}
