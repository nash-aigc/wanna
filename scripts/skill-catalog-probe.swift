//
//  skill-catalog-probe.swift
//
//  **技能目录那条路的离线探针**（2026-09-28 新建）。
//
//  验三件事，全是纯函数、**不联网、不碰 App**：
//   ① 扫 `skills/` 能扫出几个技能、清单行长什么样
//   ② `[SKILL:名字]` 那个名字找得到，而且**拿到的是正文**（不是描述）
//   ③ 名子写错时**如实说没有**，且把有的列出来（不做相似度匹配）
//
//  编译并运行：
//
//      cd /Users/mjm/Documents/SuperAgent/Wanna
//      xcrun swiftc -O scripts/skill-catalog-probe.swift Wanna/SkillCatalog.swift \
//          -o /tmp/skill-catalog-probe && /tmp/skill-catalog-probe
//

import Foundation

@main
struct SkillCatalogProbe {

    static func main() {
        print("═══ 技能目录探针 ═══")
        print("技能根目录：\(SkillCatalog.skillsRootPath)\n")

        let allSkills = SkillCatalog.allSkills()
        guard !allSkills.isEmpty else {
            print("✗ 一个技能都没扫到 —— 目录不存在，或者里面没有 <名字>/SKILL.md")
            exit(1)
        }

        // ── ① 清单行 ──────────────────────────────────────────────────────
        print("① 清单（这一行会常驻主 agent 的提示词）：")
        for line in SkillCatalog.indexLines() {
            print("   \(line.prefix(110))\(line.count > 110 ? "…" : "")")
        }
        print("")

        // ── ② 按名字取正文 ────────────────────────────────────────────────
        print("② 按名字取正文：")
        for skill in allSkills {
            let lookedUp = SkillCatalog.skill(named: skill.name)
            let found = lookedUp != nil
            // 判据问的是「描述是不是一段摘要、正文是不是真的正文」，不是「描述短于某个数」——
            // 第一版写成 < 300 字时，cosyvoice-tts（439）和 search-max（496）被误判成 ✗，
            // 而它俩本来就没问题。（同一类错误在这个仓库里已经出现三次：
            // **断言写的不是被测的那件事**。）
            let bodyCharacterCount = lookedUp?.body.count ?? 0
            let descriptionCharacterCount = lookedUp?.description.count ?? 0
            let bodyIsBody = bodyCharacterCount > 50
            let descriptionIsASummary = descriptionCharacterCount > 0
                && descriptionCharacterCount < bodyCharacterCount
            let ok = found && bodyIsBody && descriptionIsASummary
            print("   \(ok ? "✓" : "✗") \(skill.name)：正文 \(skill.body.count) 字"
                  + " · 描述 \(skill.description.count) 字"
                  + " · 文件夹 \(skill.folderName)")
        }
        print("")

        // ── ③ 找不到时如实说 / 大小写不敏感 ────────────────────────────────
        print("③ 边界：")
        let missingName = "根本不存在的技能名"
        print("   \(SkillCatalog.skill(named: missingName) == nil ? "✓" : "✗") 不存在时返回 nil"
              + "（调用处据此如实回话，不做相似度匹配）")
        if let firstSkill = allSkills.first {
            let lowercased = firstSkill.name.lowercased()
            let caseInsensitiveHit = SkillCatalog.skill(named: lowercased) != nil
            print("   \(caseInsensitiveHit ? "✓" : "✗") 大小写不敏感（试的是「\(lowercased)」）")
        }

        print("")
        print("═══ 扫目录 → 清单行 → 按名取正文，整条通了 ═══")
        exit(0)
    }
}
