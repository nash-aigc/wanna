//  HarnessCapabilityIndex.swift
//
//  **Harness 工程清单：读进来 + 跟用户的话做关键词匹配。**
//
//  为什么要它（用户 2026-09-28）：「右上角这个看板，其实就是为了梳理用户的**提示词**，
//  让用户永远都知道**应该怎么样去描述自己的提示词**……如果用户匹配到这个关键词，
//  就在卡片上把它高亮、变绿；没匹配到的不显示 —— 因为全显示的话，高度就不够了。」
//
//  设计上的三条硬约束（都是他定的）：
//   1. **纯代码匹配** ✓ —— 不叫 JEV、不叫大模型（「只要你能代码做匹配到了，然后你再在
//      右上角渲染出来就可以了」）。所以这里没有任何网络、没有异步、没有概率。
//   2. **只显示匹配到的** ✓ —— 没命中的不画（高度）。但**组名与阶段名照样参与判定**：
//      一个阶段下全部命中 → 阶段名也变绿（见 `HarnessMatchSummary`）。
//   3. **换内容不改代码** ✓ —— 清单全在 `HarnessCapabilities.json` 里（0600，App Support），
//      改那个文件就是换内容；这个文件一行都不用动。
//
//  匹配规则沿用看板那套本地匹配的老规矩（去标点后比较、4 字以下只认精确），
//  理由见 `DirectionBoardMatching`：短词模糊匹配会到处误命中。

import Foundation

/// 清单里的一条能力。
struct HarnessCapability: Codable, Identifiable, Equatable {
    var keyword: String
    var detail: String
    /// 同义说法（只影响这条免费的路 —— 与看板的方向清单同一个约定）。
    var matchKeywords: [String]

    var id: String { keyword }
}

/// 清单里的一组能力（例如"提示词"「执行与工具」）。
struct HarnessCapabilityGroup: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    /// 三个阶段之一：执行前 / 执行中 / 执行后。
    var phase: String
    var items: [HarnessCapability]
}

/// 整份清单。
struct HarnessCapabilityCatalog: Codable, Equatable {
    var version: Int
    var note: String?
    var phases: [String]
    var groups: [HarnessCapabilityGroup]

    /// 文件不存在或解不出来时用的空清单 —— **没有它 app 也得能跑**。
    static let empty = HarnessCapabilityCatalog(version: 0, note: nil, phases: [], groups: [])

    var isEmpty: Bool { groups.isEmpty }
}

/// 一次匹配的结果：命中的条目 + **每个阶段是否整段命中**。
struct HarnessMatchSummary: Equatable {
    /// 命中的条目，按 `groupID → [keyword]` 组织（渲染直接读它）。
    var matchedKeywordsByGroup: [String: Set<String>] = [:]
    /// 阶段名 → 该阶段下**所有**条目都命中（用户：「如果某个分支下用户全都考虑了，
    /// 那么整个这个执行前这个字它也高亮」）。
    var fullyMatchedPhases: Set<String> = []

    var isEmpty: Bool { matchedKeywordsByGroup.values.allSatisfy(\.isEmpty) }

    /// 某一组里命中了哪些（渲染用）。
    func matchedKeywords(inGroup groupID: String) -> Set<String> {
        matchedKeywordsByGroup[groupID] ?? []
    }
}

/// 清单的读取 + 匹配。整个类型 `nonisolated`、纯逻辑，能脱 App 编译（与
/// `DirectionBoardMatching` 同一个约定）。
enum HarnessCapabilityMatcher {

    /// 清单文件在 App Support 下（与其它 Wanna 数据文件同一处，0600）。
    nonisolated static var catalogURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Wanna/HarnessCapabilities.json")
    }

    /// 读清单。**失败就是空清单** —— 卡片上什么都不画，绝不让 app 因为一份配置崩掉。
    nonisolated static func loadCatalog() -> HarnessCapabilityCatalog {
        guard let data = try? Data(contentsOf: catalogURL),
              let catalog = try? JSONDecoder().decode(HarnessCapabilityCatalog.self, from: data)
        else { return .empty }
        return catalog
    }

    /// 跟一段话做匹配。
    nonisolated static func match(transcript: String,
                                  catalog: HarnessCapabilityCatalog) -> HarnessMatchSummary {
        var summary = HarnessMatchSummary()
        let normalizedTranscript = normalizedForComparison(transcript)

        for group in catalog.groups {
            var matched: Set<String> = []
            for item in group.items {
                if matches(item, in: normalizedTranscript) { matched.insert(item.keyword) }
            }
            if !matched.isEmpty { summary.matchedKeywordsByGroup[group.id] = matched }
            // 整段命中：这一组里**每一条**都命中，而且这一组不是空的。
            if !group.items.isEmpty, matched.count == group.items.count {
                summary.fullyMatchedPhases.insert(group.phase)
            }
        }
        return summary
    }

    /// 一条能力是否出现在这段话里。
    ///
    /// **判据就是"包含"** ✓ —— 中文没有词边界，包含是最实用的判据。
    /// ⚠️ 已知代价（如实记着）：短关键词（「角色」「约束」）在谈到别的事情时也可能被提到而误命中 ✗。
    /// 处理它的位置**不在代码里、在内容里** ✓ —— 用户要的正是"换内容不改代码"：
    /// 把关键词写长一点（「角色设定」）或从 `matchKeywords` 里删掉容易撞的说法，就能收窄。
    private nonisolated static func matches(_ item: HarnessCapability, in normalizedTranscript: String) -> Bool {
        for candidate in [item.keyword] + item.matchKeywords {
            let normalizedCandidate = normalizedForComparison(candidate)
            guard !normalizedCandidate.isEmpty else { continue }
            if normalizedTranscript.contains(normalizedCandidate) { return true }
        }
        return false
    }

    /// 去标点、统一大小写、去掉空白 —— 比较之前两边都过一遍。
    private nonisolated static func normalizedForComparison(_ text: String) -> String {
        let allowed = text.unicodeScalars.filter { scalar in
            CharacterSet.alphanumerics.contains(scalar)
                || (scalar.value >= 0x4E00 && scalar.value <= 0x9FFF)   // CJK 基本区
        }
        return String(String.UnicodeScalarView(allowed)).lowercased()
    }
}
