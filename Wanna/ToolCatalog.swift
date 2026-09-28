//
//  ToolCatalog.swift
//  Wanna
//
//  **给模型一双手**：读一份工具目录，把 `[RUN:工具名:参数]` 变成一次真实的进程调用。
//
//  为什么需要它（2026-09-28 实测出来的）：`~/Documents/SuperAgent/APP/Design/wanna/skills/`
//  下那 7 个技能的正文里写的**全是命令行**（anysearch 跑 node CLI、notion 跑 python 脚本、
//  image-station 调 localhost:3000），而整个 App **没有任何跑命令的能力** ——
//  起进程的地方只有四处，全是写死的脚本（`[PY_AGENT:]` / `[SVG_AGENT:]` /
//  Claude Code / MCP 客户端）。所以提示词里那句「READ that SKILL.md FIRST and follow it」
//  是一句**做不到的话**：模型读到的是一串它无法执行的东西。这个文件就是那句话缺的那一半。
//
//  ## 两个刻意的设计决定
//
//  1. **目录是数据，不是代码**（`tools/manifest.json`，在仓库外）。用户可以自己往里加 ——
//     这正是技能目录存在的理由。模型**只能挑目录里有的**，不能自己造一条命令。
//  2. **不经过 shell。** `argv` 是一个**数组**，`{参数名}` 占位符直接替换成数组里的一项，
//     整串交给 `Process.arguments`。少了 shell 这一层，模型给的参数里带 `;`、`` ` ``、
//     `$(...)`、`|`、换行**都不会变成命令**——它们只是参数的一部分。
//     这是与"拼一条命令字符串再交给 shell"最大的区别，而它挡住了这一整类注入。
//
//  ⚠️ **模型只是"挑一个 + 填参数"，永远不生成命令本身**（方案 §07 的 L1 闭集分类）。
//

import Foundation

/// 工具目录里的一条参数声明。**只声明名字和是否必填** —— 参数校验今天只做"必填的有没有给"。
nonisolated struct ToolParameter: Codable, Sendable {
    var name: String
    var required: Bool?
}

/// 工具目录里的一条。
///
/// **别名是给模型用的，不是给人用的**：它让"中文名/英文名/口语说法"都能对上同一个工具
/// （方案 §四：`aliases` 解决对上问题）。
nonisolated struct ToolDefinition: Codable, Sendable {
    var name: String
    var aliases: [String]?
    var category: String?
    /// 一句话讲"什么时候用它" —— 它会进 L0 索引（常驻提示词那一行）。
    var when: String
    var params: [ToolParameter]?
    /// **参数化的命令，数组形式。** 见文件头第 2 条：不经过 shell。
    var argv: [String]
    /// 给模型看的用法细节（参数怎么填、有什么坑）。**命中之后才展开**，不常驻。
    var usage: String?
    var timeoutSeconds: Double?

    var effectiveAliases: [String] { aliases ?? [] }
    var effectiveTimeoutSeconds: Double { timeoutSeconds ?? 60 }
}

/// 目录读写的失败。**每一种都要能说清"是哪一个工具的什么不对"** ——
/// 静默失败会让模型以为自己跑过了，然后对着用户复述一个根本没发生的结果。
nonisolated enum ToolCatalogFailure: Error, CustomStringConvertible {
    case manifestUnreadable(String)
    case manifestMalformed(String)
    case noSuchTool(String, available: [String])
    case missingRequiredParameter(tool: String, parameter: String)
    case unresolvedPlaceholder(tool: String, placeholder: String)

    var description: String {
        switch self {
        case .manifestUnreadable(let why):
            return "工具目录读不到：\(why)"
        case .manifestMalformed(let why):
            return "工具目录格式不对：\(why)"
        case .noSuchTool(let name, let available):
            return "目录里没有叫「\(name)」的工具。目录里有的：" + available.joined(separator: "、")
        case .missingRequiredParameter(let tool, let parameter):
            return "工具「\(tool)」缺少必填参数：\(parameter)"
        case .unresolvedPlaceholder(let tool, let placeholder):
            return "工具「\(tool)」的命令里有一个没被填上的占位符：\(placeholder)"
        }
    }
}

/// 读工具目录 + 把一条 `[RUN:…]` 解析成可以直接执行的 argv + 真的跑它。
///
/// 形状照抄仓库里其它几个 store：`nonisolated` + `NSLock` 护住那一个缓存 + 变更后读盘。
nonisolated enum ToolCatalog {

    private static let lock = NSLock()
    private static var cachedTools: [ToolDefinition]?

    /// 目录文件的位置。与 `CompanionManager.skillFolderPath` 同一个父目录 ——
    /// 技能和方法学、工具和手，住在一起才找得到。
    static var manifestPath: String {
        (NSHomeDirectory() as NSString)
            .appendingPathComponent("Documents/SuperAgent/APP/Design/wanna/tools/manifest.json")
    }

    // MARK: - 读目录

    static func allTools() -> [ToolDefinition] {
        lock.lock()
        if let cachedTools { lock.unlock(); return cachedTools }
        lock.unlock()

        let loaded = loadFromDisk()
        lock.lock(); cachedTools = loaded; lock.unlock()
        return loaded
    }

    /// **缓存要能被外部作废** —— 用户往目录里加了一条工具，不该等重启才生效
    /// （与另外几个 store 那条「存了不生效比没有更糟」同一条规矩）。
    static func invalidateCache() {
        lock.lock(); cachedTools = nil; lock.unlock()
    }

    private static func loadFromDisk() -> [ToolDefinition] {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: manifestPath)) else { return [] }
        return (try? JSONDecoder().decode([ToolDefinition].self, from: data)) ?? []
    }

    /// 报告的失败原因（给 `[RUN:]` 的失败回传用）。读盘失败和"文件不存在"要分开说 ——
    /// 前者是用户写错了，后者是还没建，修法完全不同。
    static func loadFailureDescription() -> String? {
        let url = URL(fileURLWithPath: manifestPath)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return "还没有工具目录（\(manifestPath)）—— 去建一个，或者先用别的办法。"
        }
        guard let data = try? Data(contentsOf: url) else {
            return "工具目录读不出来（\(manifestPath)）—— 检查文件权限。"
        }
        do {
            _ = try JSONDecoder().decode([ToolDefinition].self, from: data)
            return nil
        } catch {
            return "工具目录的 JSON 格式不对（\(manifestPath)）：\(error)"
        }
    }

    // MARK: - 找工具 / 生成 argv

    /// 按**名字或别名**找，大小写不敏感。找不到返回 nil（调用处负责报"没有这个工具"）。
    static func tool(named name: String) -> ToolDefinition? {
        let wanted = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !wanted.isEmpty else { return nil }
        for tool in allTools() {
            if tool.name.lowercased() == wanted { return tool }
            if tool.effectiveAliases.contains(where: { $0.lowercased() == wanted }) { return tool }
        }
        return nil
    }

    /// 把一条 `[RUN:工具名:参数]` 变成可以直接交给 `Process.arguments` 的数组。
    ///
    /// **两种参数形状都支持**，因为目录里的工具本来就分这两种：
    /// - 只有一个参数 → 整段文本填进它的占位符（`[RUN:搜索:GitHub 视频生成]`）
    /// - 多个参数 → 按 `名=值` 切（`[RUN:某工具:城市=北京 天数=3]`）
    ///
    /// ⚠️ **填完之后还要扫一遍**：命令里剩下任何 `{…}` 都说明有必填参数没给 ——
    /// **宁可拒绝执行，也不要跑一条半截的命令**（那多半会做出别的事）。
    static func resolvedArgv(for tool: ToolDefinition,
                             argumentText: String) throws -> [String] {
        let trimmedArgumentText = argumentText.trimmingCharacters(in: .whitespacesAndNewlines)
        var substitutions: [String: String] = [:]

        let declaredParameters = tool.params ?? []
        if declaredParameters.count <= 1 {
            if let onlyParameter = declaredParameters.first {
                substitutions[onlyParameter.name] = trimmedArgumentText
            }
        } else {
            for pair in splitIntoNamedArguments(trimmedArgumentText) {
                substitutions[pair.name] = pair.value
            }
        }

        for parameter in declaredParameters where (parameter.required ?? false) {
            if (substitutions[parameter.name] ?? "").isEmpty {
                throw ToolCatalogFailure.missingRequiredParameter(tool: tool.name,
                                                                  parameter: parameter.name)
            }
        }

        let resolved = tool.argv.map { argument -> String in
            var result = argument
            for (parameterName, parameterValue) in substitutions {
                result = result.replacingOccurrences(of: "{\(parameterName)}", with: parameterValue)
            }
            return result
        }

        if let leftover = resolved.first(where: { $0.contains("{") && $0.contains("}") }) {
            let placeholder = leftover[leftover.firstIndex(of: "{")!...]
                .prefix(while: { $0 != "}" })
            throw ToolCatalogFailure.unresolvedPlaceholder(tool: tool.name,
                                                           placeholder: String(placeholder) + "}")
        }
        return resolved
    }

    /// `城市=北京 天数=3` → `[(城市, 北京), (天数, 3)]`。
    ///
    /// **用第一个 `=` 切，值里的 `=` 保留**（URL 的查询串里就有 `=`）。
    private static func splitIntoNamedArguments(_ text: String) -> [(name: String, value: String)] {
        text.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" })
            .compactMap { (piece: Substring) -> (name: String, value: String)? in
                guard let equalsIndex = piece.firstIndex(of: "=") else { return nil }
                let name = String(piece[..<equalsIndex])
                let value = String(piece[piece.index(after: equalsIndex)...])
                guard !name.isEmpty else { return nil }
                return (name: name, value: value)
            }
    }

    // MARK: - 真跑一次

    /// 跑一条已经解析好的 argv，返回它 stdout+stderr 的文字。
    ///
    /// **不经过 shell**：`Process.arguments` 直接吃这个数组（见文件头第 2 条）。
    /// 跑在 detached task 上：子进程最长跑 `timeoutSeconds`，不该占着主 actor。
    static func run(argv: [String], timeoutSeconds: Double) async -> (output: String, exitCode: Int32, timedOut: Bool) {
        await Task.detached(priority: .userInitiated) { () -> (String, Int32, Bool) in
            guard let executable = argv.first else { return ("命令是空的", -1, false) }

            let process = Process()
            // 用 `/usr/bin/env` 解析可执行文件名：**PATH 在这个进程里可能和用户终端不一样**
            // （GUI 启动的 App 没有登录 shell 的环境），而 `env` 会照 PATH 找。
            // 绝对路径的命令不受影响。
            if executable.hasPrefix("/") {
                process.executableURL = URL(fileURLWithPath: executable)
                process.arguments = Array(argv.dropFirst())
            } else {
                process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
                process.arguments = argv
            }

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            do {
                try process.run()
            } catch {
                return ("起不来：\(error.localizedDescription)", -1, false)
            }

            // 到点就杀。**必须做**：一条卡住的命令会让整轮永远不结束，
            // 而用户那边看到的是"它不说话了"。
            let deadline = Date().addingTimeInterval(timeoutSeconds)
            var didTimeOut = false
            while process.isRunning {
                if Date() > deadline {
                    didTimeOut = true
                    process.terminate()
                    break
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }

            // 两条管道都要抽干 —— 缓冲区满了会**把子进程堵死**（它会一直等我们读）。
            let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()

            let stdoutText = String(data: stdoutData, encoding: .utf8) ?? ""
            let stderrText = String(data: stderrData, encoding: .utf8) ?? ""
            let combined = stderrText.isEmpty ? stdoutText
                : stdoutText + "\n[stderr]\n" + stderrText
            return (combined, process.terminationStatus, didTimeOut)
        }.value
    }

    // MARK: - 给提示词的 L0 索引

    /// **每个工具一行**，常驻提示词。正文（`usage`）一个字都不在这里 ——
    /// 那是命中之后才展开的（方案 §五：L0 索引常驻、L1 展开按需）。
    static func indexLines() -> [String] {
        allTools().map { tool in
            let parameterList = (tool.params ?? []).map { parameter in
                (parameter.required ?? false) ? parameter.name : parameter.name + "?"
            }.joined(separator: ", ")
            return "工具：\(tool.name)（\(parameterList)）— \(tool.when)"
        }
    }
}
