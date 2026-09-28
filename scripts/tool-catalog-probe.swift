//
//  tool-catalog-probe.swift
//
//  **「给模型一双手」那条路的离线探针**（2026-09-28 新建）。
//
//  验三件事，全都**不需要模型、不需要 App**：
//   ① 目录读得出来、L0 索引生成得对
//   ② `[RUN:工具名:参数]` 解析成的 argv 是对的
//   ③ **参数里的 shell 元字符不会变成命令**（不经过 shell 的直接后果，要当场证明）
//   ④（可选，联网）真跑一次，看有没有结果回来
//
//  编译并运行：
//
//      cd /Users/mjm/Documents/SuperAgent/Wanna
//      xcrun swiftc -O scripts/tool-catalog-probe.swift Wanna/ToolCatalog.swift \
//          -o /tmp/tool-catalog-probe && /tmp/tool-catalog-probe [--run]
//
//  不带 `--run` 时**只解析、不执行**（前面三件全是纯函数）。
//

import Foundation

@main
struct ToolCatalogProbe {

    static func main() async {
        print("═══ 工具目录探针 ═══")
        print("目录文件：\(ToolCatalog.manifestPath)")

        if let failure = ToolCatalog.loadFailureDescription() {
            fail(failure)
        }

        let allTools = ToolCatalog.allTools()
        print("读出来   ：\(allTools.count) 条工具\n")

        // ── ① L0 索引 ────────────────────────────────────────────────────────
        print("① L0 索引（这一行会常驻提示词）：")
        for line in ToolCatalog.indexLines() { print("   \(line)") }
        print("")

        // ── ② 解析成 argv ────────────────────────────────────────────────────
        print("② 解析 `[RUN:…]`：")
        let parsingCases: [(toolName: String, argumentText: String)] = [
            ("搜索", "GitHub 上最近很火的视频生成项目"),
            ("anysearch", "swift concurrency best practices"),   // 用别名找
        ]
        for testCase in parsingCases {
            guard let tool = ToolCatalog.tool(named: testCase.toolName) else {
                print("   ✗ 找不到工具「\(testCase.toolName)」")
                continue
            }
            do {
                let argv = try ToolCatalog.resolvedArgv(for: tool, argumentText: testCase.argumentText)
                print("   ✓ 「\(testCase.toolName)」→ \(argv.count) 项")
                print("        \(argv.map { $0.contains(" ") ? "\"\($0)\"" : $0 }.joined(separator: " "))")
            } catch {
                print("   ✗ 「\(testCase.toolName)」解析失败：\(error)")
            }
        }
        print("")

        // ── ③ 注入面：参数里带 shell 元字符 ──────────────────────────────────
        //
        // 这一条是整个设计里最要紧的一条：**argv 是数组、不经过 shell**，所以下面这些
        // 字符只能是参数的一部分。如果哪天有人把它改成"拼一个字符串交给 /bin/sh"，
        // 这一条会立刻红 —— 那正是它该拦的改动。
        print("③ 注入面（参数里塞 shell 元字符，看它是不是只是个参数）：")
        let injectionAttempt = #"x"; touch /tmp/被注入了; echo "$(whoami)" `id` | cat"#
        if let searchTool = ToolCatalog.tool(named: "搜索") {
            do {
                let argv = try ToolCatalog.resolvedArgv(for: searchTool,
                                                        argumentText: injectionAttempt)
                // **判据：整串原样躺在 argv 的某一项里**（而不是被拆成好几项、或被解释掉）。
                // ⚠️ 不能用 `argv.last` 去比 —— 命令末尾还有 `--max_results 5` 这类固定参数，
                // 探针第一版就是这么写错的，于是它"报了一个假的红"。
                let survivedAsOneArgument = argv.contains(injectionAttempt)
                print("   \(survivedAsOneArgument ? "✓" : "✗") 恶意串整体是**一个参数**，没有被拆开")
                print("        可执行文件 = \(argv.first ?? "?")")
                print("        落在第 \(argv.firstIndex(of: injectionAttempt).map { $0 + 1 } ?? -1) 项")
                print("        整条 argv  = \(argv.count) 项："
                      + argv.map { $0.count > 24 ? "«\($0.prefix(20))…»" : $0 }
                          .joined(separator: " "))
            } catch {
                print("   ✗ 解析失败：\(error)")
            }
        }
        print("")

        // ── ④ 真跑一次 ──────────────────────────────────────────────────────
        guard CommandLine.arguments.contains("--run") else {
            print("④ 真跑     ：**跳过**（加 `--run` 才执行，它会联网）")
            exit(0)
        }

        guard let searchTool = ToolCatalog.tool(named: "搜索") else { fail("目录里没有「搜索」") }
        print("④ 真跑     ：搜索「GitHub 视频生成 开源」…")
        let startedAt = Date()
        do {
            let argv = try ToolCatalog.resolvedArgv(for: searchTool,
                                                    argumentText: "GitHub 视频生成 开源 仓库")
            let outcome = await ToolCatalog.run(argv: argv,
                                                timeoutSeconds: searchTool.effectiveTimeoutSeconds)
            print("   ✓ 退出码 \(outcome.exitCode)"
                  + "（\(String(format: "%.1f", Date().timeIntervalSince(startedAt))) 秒"
                  + (outcome.timedOut ? "，**超时被杀**" : "") + "）")
            print("   ── 输出开头 ──")
            for line in outcome.output.prefix(900).split(separator: "\n") {
                print("   │ \(line)")
            }
        } catch {
            fail("解析失败：\(error)")
        }

        print("═══ 目录 → argv → 真跑，整条通了 ═══")
        exit(0)
    }

    static func fail(_ message: String) -> Never {
        print("✗ \(message)")
        exit(1)
    }
}
