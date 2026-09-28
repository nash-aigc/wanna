//
//  SkillCatalog.swift
//  Wanna
//
//  **技能目录**：扫 `skills/*/SKILL.md`，只把**描述那一行**常驻提示词，正文按需拉。
//
//  ## 为什么是"技能"而不是"子 agent"（2026-09-28 的架构调整）
//
//  原来有三个 sub agent（图形 / 执行 / 文本），主 agent 靠 `[AGENT:谁:任务]` 把活派出去 ——
//  那意味着**两级模型接力**：第二个模型、第二份提示词、第二轮请求、第二套上下文。
//  实测六轮，这一级从来没稳定跑通过（断点每次不同，见 `开发经验/10-踩过的坑.md` D51）。
//
//  现在子 agent 没有了，它们各自变成**一个技能**：能力留在文件夹里，主 agent 常驻只拿到
//  一行描述；要用的时候写 `[SKILL:名字]` 把正文拉进**这一轮**，自己照着做。
//
//  **少了一整级接力，而"怎么做"仍然不占常驻提示词** —— 这正是用户要的形状：
//  「技能的话你只需要加载技能部分的描述提示词就可以了，他没有必要把所有的内容全都塞到
//  这个主 agent 的提示词里面」。
//
//  ## 和 `ToolCatalog` 的分工（用户 2026-09-28 的原话）
//
//  > 每一个子 agent 其实都是两部分：第一部分是**它具备什么样的能力**，
//  > 第二部分是**它具有什么工具**，比如 MCP 之类的。
//
//  - **能力 → 技能**（本文件）：一段方法论，教"这类事怎么做"，模型读进去照做。
//  - **工具 → 工具目录 / MCP**（`ToolCatalog` / `MCPRegistry`）：一条命令 / 一个 MCP 工具，
//    有参数有返回值，**由代码执行**，不是模型自己念。
//
//  ## 格式
//
//  沿用现有 7 个技能已经在用的 front matter（**格式统一，不另发明**）：
//
//      ---
//      name: 图形
//      description: 用户要在屏幕上看到指示或图形时：指位置、圈出某处、画示意图……
//      ---
//
//      （正文）
//
//  ⚠️ **只认 `name` 和 `description` 两个键**，够用；别的键（`version` / `credentials` /
//  `metadata`…）原样忽略 —— 现有技能里就有，不解析不等于不认识。
//

import Foundation

/// 一个技能：目录名、显示名、什么时候用、正文。
nonisolated struct SkillDefinition: Sendable, Equatable {
    /// front matter 里的 `name`，没有就回落成文件夹名。`[SKILL:名字]` 按它匹配。
    let name: String
    /// 一句话讲"什么时候用它" —— **它才是常驻提示词的那一行**。
    let description: String
    /// 正文（方法论）。**一个字都不常驻**，`[SKILL:名字]` 命中才进这一轮。
    let body: String
    let folderName: String
}

/// 技能目录的读与查。
///
/// 形状照抄 `ToolCatalog` / `AppSettingsStore` 那一套：`nonisolated` + `NSLock` 护住缓存 +
/// 一个可作废的口子（用户往目录里加一个技能，不该等重启才生效）。
nonisolated enum SkillCatalog {

    private static let lock = NSLock()
    private static var cachedSkills: [SkillDefinition]?

    /// 技能根目录 —— 与 `CompanionManager.skillFolderPath` 同一个位置。
    /// **从 `NSHomeDirectory()` 拼，不写死 `/Users/mjm`**（换机器才不会指向别人家）。
    static var skillsRootPath: String {
        (NSHomeDirectory() as NSString)
            .appendingPathComponent("Documents/SuperAgent/APP/Design/wanna/skills")
    }

    // MARK: - 读目录

    static func allSkills() -> [SkillDefinition] {
        lock.lock()
        if let cachedSkills { lock.unlock(); return cachedSkills }
        lock.unlock()

        let loaded = loadFromDisk()
        lock.lock(); cachedSkills = loaded; lock.unlock()
        return loaded
    }

    /// 用户往目录里加了一个技能，调一下这个就不用重启。
    static func invalidateCache() {
        lock.lock(); cachedSkills = nil; lock.unlock()
    }

    private static func loadFromDisk() -> [SkillDefinition] {
        let rootURL = URL(fileURLWithPath: skillsRootPath)
        guard let folderNames = try? FileManager.default.contentsOfDirectory(atPath: rootURL.path) else {
            return []
        }
        var skills: [SkillDefinition] = []
        for folderName in folderNames.sorted() {
            // 隐藏文件 / `.DS_Store` 之类一律跳过。
            guard !folderName.hasPrefix(".") else { continue }
            let skillFileURL = rootURL
                .appendingPathComponent(folderName)
                .appendingPathComponent("SKILL.md")
            guard let text = try? String(contentsOf: skillFileURL, encoding: .utf8) else { continue }
            let (frontMatter, body) = Self.splitFrontMatter(text)
            let name = frontMatter["name"]?.trimmingCharacters(in: .whitespacesAndNewlines)
            let description = frontMatter["description"]?.trimmingCharacters(in: .whitespacesAndNewlines)
            skills.append(SkillDefinition(
                name: (name?.isEmpty ?? true) ? folderName : name!,
                description: description ?? "",
                body: body.trimmingCharacters(in: .whitespacesAndNewlines),
                folderName: folderName))
        }
        return skills
    }

    /// 切出 `---` 之间的 front matter 和剩下的正文。
    ///
    /// **只认最简单的 `键: 值` 一行** —— 技能文件是人手写的，不需要一个 YAML 解析器；
    /// 多行值 / 嵌套结构今天用不到，遇到就跳过（宁可少一个键，也不要写半个解析器还出错）。
    private static func splitFrontMatter(_ text: String) -> (fields: [String: String], body: String) {
        let lines = text.components(separatedBy: "\n")
        guard lines.first?.trimmingCharacters(in: .whitespaces) == "---" else {
            return ([:], text)
        }
        var fields: [String: String] = [:]
        var closingIndex: Int?
        for index in 1..<lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces) == "---" { closingIndex = index; break }
            guard let colonIndex = line.firstIndex(of: ":") else { continue }
            let key = String(line[..<colonIndex]).trimmingCharacters(in: .whitespaces)
            var value = String(line[line.index(after: colonIndex)...])
                .trimmingCharacters(in: .whitespaces)
            // 两边可能带引号（现有技能的 description 里就有）。
            if value.count >= 2, (value.hasPrefix("\"") && value.hasSuffix("\""))
                || (value.hasPrefix("'") && value.hasSuffix("'")) {
                value = String(value.dropFirst().dropLast())
            }
            if !key.isEmpty { fields[key.lowercased()] = value }
        }
        guard let closingIndex else { return ([:], text) }
        let body = lines[(closingIndex + 1)...].joined(separator: "\n")
        return (fields, body)
    }

    // MARK: - 查

    /// 按**名字**找，大小写不敏感；找不到再按文件夹名找一次。
    /// 找不到返回 nil —— 调用处负责如实说"没有这个技能"（**不做相似度匹配**）。
    static func skill(named name: String) -> SkillDefinition? {
        let wanted = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !wanted.isEmpty else { return nil }
        let all = allSkills()
        if let exact = all.first(where: { $0.name.lowercased() == wanted }) { return exact }
        return all.first(where: { $0.folderName.lowercased() == wanted })
    }

    // MARK: - 给提示词的清单

    /// **一个技能一行**：`技能：名字 — 什么时候用`。正文一个字都不在这里。
    ///
    /// 没有描述的技能**照样列出来**（只有名字）—— 少一行会让模型以为这个能力不存在，
    /// 而"描述没写"是人的疏漏，不该变成能力的缺失。
    static func indexLines() -> [String] {
        allSkills().map { skill in
            skill.description.isEmpty
                ? "技能：\(skill.name)"
                : "技能：\(skill.name) — \(skill.description)"
        }
    }
}
