//
//  mcp-chain-probe.swift
//
//  **MCP「调工具」那条路的离线探针** —— 2026-09-28 新建。
//
//  为什么要有它：到这一天为止，全库日志里 `🔌 MCP[调用] ✓` **一条都没有**。
//  也就是说 MCP 这条路我从来没验过后面那一半：
//
//      起进程 → 握手 → tools/list   ← 这三步 11:13 那一轮实测通了（29 个工具，1.9 秒）
//      tools/call 并拿回结果         ← **从来没有执行过一次**
//
//  而这条路**根本不需要模型、不需要 App、也不花任何额度**：它是纯代码
//  （`MCPClient` 就是起一个子进程、按换行分隔的 JSON-RPC 收发）。所以把它拎出来单独跑，
//  几十秒一次、可以反复跑 —— 而不是拿真机 + 真模型去赌一轮（那是这个仓库反复吃亏的地方）。
//
//  编译并运行（不用 Xcode、不碰签名）：
//
//      cd /Users/mjm/Documents/SuperAgent/Wanna
//      xcrun swiftc -O scripts/mcp-chain-probe.swift Wanna/MCPClient.swift \
//          -o /tmp/mcp-chain-probe && /tmp/mcp-chain-probe [服务器名] [工具名] ['{"参数": "值"}']
//
//  不带参数时**只列工具、不调用任何东西**（安全：MCP 工具可能有副作用，
//  先看清有什么，再决定调哪个）。带工具名时才真的调一次；第三个参数是 JSON 形式的
//  工具参数，不给就是 `{}`。
//
//  靶子建议用本机的 `macos-use` 服务器：本地进程、不花钱。
//
//  ⚠️ 入口必须是 `@main`（不能用文件顶层的语句）：这个探针要和 `MCPClient.swift`
//  一起编译，而多文件编译时**只有 `main.swift` 才允许顶层代码**。仓库里另一个探针
//  （`direction-board-corner-probe.swift`）同样是 `@main`，照同一个写法。
//

import Foundation

/// `MCPClient.swift` 里只有一处引用这个符号（诊断日志），探针不需要真日志 —— 打到 stdout 就够。
enum SoundEffectPlayer {
    static func appendToDiagnosticLog(_ line: String) {
        print("   [诊断] \(line)")
    }
}


@main
struct MCPChainProbe {

    static func main() async {
        let argumentsFromCommandLine = CommandLine.arguments
        let serverNameFromCommandLine = argumentsFromCommandLine.count > 1
            ? argumentsFromCommandLine[1] : "macos-use"
        let toolNameFromCommandLine = argumentsFromCommandLine.count > 2
            ? argumentsFromCommandLine[2] : nil
        // 第三个参数是 JSON 形式的工具参数（不给就是空）。**用 JSON 字符串而不是一堆
        // `--key value`**：MCP 的参数本来就是 JSON，中间再过一层翻译只会多一种出错的方式。
        let toolArgumentsJSONFromCommandLine = argumentsFromCommandLine.count > 3
            ? argumentsFromCommandLine[3] : "{}"

        // 配置直接读 App 自己那份，**不在探针里另写一份** —— 否则"探针能跑、App 跑不了"
        // 这种最坏的情况无法排除。（路径与 `MCPServersStore.fileURL` 相同。）
        let configurationPath = (NSHomeDirectory() as NSString)
            .appendingPathComponent("Library/Application Support/Wanna/MCPServers.json")

        guard let configurationData = try? Data(contentsOf: URL(fileURLWithPath: configurationPath)),
              let allServerConfigurations = try? JSONDecoder().decode([MCPServerConfig].self,
                                                                     from: configurationData) else {
            fail("读不到 \(configurationPath) —— App 还没配过 MCP 服务器？")
        }

        guard let serverConfiguration = allServerConfigurations.first(where: {
            $0.name.caseInsensitiveCompare(serverNameFromCommandLine) == .orderedSame
        }) else {
            fail("没配过名为 `\(serverNameFromCommandLine)` 的服务器。已配的是："
                 + allServerConfigurations.map { $0.name }.joined(separator: "、"))
        }

        print("═══ MCP 调工具探针 ═══")

        // ── ⓪ 先验解析：模型写的标签，App 到底认不认 ─────────────────────────
        //
        // 这一段**不联网、不起进程**，纯 `ActionTagParser`。放在最前面是因为它是整条链的
        // 入口：标签认不出来，后面的进程、工具、结果全都无从谈起 —— 而"标签没被认出来"
        // 和"模型根本没写标签"在屏幕上长得一模一样（都是什么都不发生、也不报错）。
        runTagParsingCheck()

        print("服务器   ：\(serverConfiguration.name)")
        print("命令     ：\(serverConfiguration.command) \(serverConfiguration.args.joined(separator: " "))")

        let mcpClient = MCPClient(config: serverConfiguration)

        // ── ① 起进程 + 握手 ──────────────────────────────────────────────────
        let handshakeStartedAt = Date()
        do {
            try await mcpClient.start()
        } catch {
            fail("起进程 / 握手失败：\(error)")
        }
        print("① 握手   ：✓ \(String(format: "%.2f", Date().timeIntervalSince(handshakeStartedAt))) 秒")

        // ── ② 列工具 ────────────────────────────────────────────────────────
        let listStartedAt = Date()
        let availableTools: [MCPTool]
        do {
            availableTools = try await mcpClient.listTools()
        } catch {
            fail("tools/list 失败：\(error)")
        }
        print("② 列工具 ：✓ \(availableTools.count) 个"
              + "（\(String(format: "%.2f", Date().timeIntervalSince(listStartedAt))) 秒）")
        for tool in availableTools.prefix(40) {
            let firstLineOfDescription = tool.description
                .split(separator: "\n").first.map(String.init) ?? ""
            print("     · \(tool.name) — \(firstLineOfDescription.prefix(70))")
        }

        // ── ③ 调工具（只有点名了才调）────────────────────────────────────────
        guard let toolNameFromCommandLine else {
            print("③ 调工具 ：**跳过**（没点工具名）。挑一个上面的，再跑一次带上它。")
            print("   例：/tmp/mcp-chain-probe \(serverConfiguration.name) <工具名>")
            exit(0)
        }

        guard availableTools.contains(where: { $0.name == toolNameFromCommandLine }) else {
            fail("这个服务器没有名为 `\(toolNameFromCommandLine)` 的工具")
        }

        guard let toolArgumentsData = toolArgumentsJSONFromCommandLine.data(using: .utf8),
              let toolArguments = try? JSONSerialization.jsonObject(with: toolArgumentsData)
                as? [String: Any] else {
            fail("第三个参数不是合法的 JSON 对象：\(toolArgumentsJSONFromCommandLine)")
        }

        print("③ 调工具 ：\(toolNameFromCommandLine)  参数 = \(toolArgumentsJSONFromCommandLine)")
        let callStartedAt = Date()
        do {
            let toolResultText = try await mcpClient.callTool(name: toolNameFromCommandLine,
                                                              arguments: toolArguments)
            print("   ✓ 拿回 \(toolResultText.count) 字"
                  + "（\(String(format: "%.2f", Date().timeIntervalSince(callStartedAt))) 秒）")
            print("   ── 结果开头 ──")
            for line in toolResultText.prefix(600).split(separator: "\n") {
                print("   │ \(line)")
            }
        } catch {
            fail("tools/call 失败：\(error)")
        }

        print("═══ 整条链通了：起进程 → 握手 → 列工具 → 调工具拿回结果 ═══")
        exit(0)
    }

    static func fail(_ message: String) -> Never {
        print("✗ \(message)")
        exit(1)
    }

    // MARK: - ⓪ 标签解析

    /// 用几条**真实形状**的模型回复验 `ActionTagParser`：两条合法的（列工具 / 调工具），
    /// 加一条刁钻的（JSON 参数里带 `]`，看它会不会被当成标签结束）。
    ///
    /// 语料取自 2026-09-28 日志里模型真写过的那一条：`[MCP:firecrawl.*]`（29 字，纯标签）。
    static func runTagParsingCheck() {
        print("⓪ 标签解析：")

        let cases: [(name: String, reply: String, expectKind: MCPToolRequest.Kind?)] = [
            ("列工具（模型真写过的那条）",
             "[MCP:firecrawl.*]", .listTools),
            ("调工具（带 JSON 参数）",
             #"先搜一下。[MCP:firecrawl.firecrawl_search:{"query": "GitHub 视频生成 开源", "limit": 5}]"#,
             .call),
            ("刁钻：参数里带 `]`",
             #"[MCP:firecrawl.firecrawl_search:{"query": "数组 [1,2] 的写法"}]"#,
             .call),
        ]

        for testCase in cases {
            let parseResult = ActionTagParser.parse(from: testCase.reply)
            guard let request = parseResult.mcpRequests.first else {
                print("   ✗ \(testCase.name)：**一个 MCP 请求都没解析出来**")
                continue
            }
            let kindMatches = request.kind == testCase.expectKind
            print("   \(kindMatches ? "✓" : "✗") \(testCase.name)")
            print("        kind=\(request.kind) server=\(request.serverName) "
                  + "tool=\(request.toolName) args=\(request.argumentsJSON)")
        }
        print("")
        runToolRunTagParsingCheck()
        runSkillTagParsingCheck()
    }

    /// `[SKILL:技能名]` —— 三个 sub agent 变成技能之后，"怎么做"进这一轮的唯一入口。
    static func runSkillTagParsingCheck() {
        print("⓪ter `[SKILL:]` 标签解析：")
        let cases: [(name: String, reply: String, expected: String)] = [
            ("普通一句", "[SKILL:执行]", "执行"),
            ("带前后缀正文（标签要从朗读文本里被摘掉）",
             "先看一眼说明。[SKILL:图形] 然后照做。", "图形"),
            ("名字里有空格", "[SKILL: 执行 ]", "执行"),
        ]
        for testCase in cases {
            let parseResult = ActionTagParser.parse(from: testCase.reply)
            guard let request = parseResult.skillRequests.first else {
                print("   ✗ \(testCase.name)：**一个 `[SKILL:]` 都没解析出来**")
                continue
            }
            let ok = request.skillName == testCase.expected
            print("   \(ok ? "✓" : "✗") \(testCase.name)  技能名=「\(request.skillName)」")
            if parseResult.spokenText.contains("[SKILL:") {
                print("        ✗ 标签没被摘掉：\(parseResult.spokenText)")
            }
        }
        print("")
    }

    // MARK: - ⓪之二 `[RUN:]` 标签

    /// 工具目录那条路的入口。**和 MCP 那三条同一个理由**：标签认不出来，
    /// 后面"跑没跑、结果回没回"全都无从谈起，而"标签没认出来"和"模型没写标签"
    /// 在屏幕上长得一模一样。
    static func runToolRunTagParsingCheck() {
        print("⓪bis `[RUN:]` 标签解析：")

        let cases: [(name: String, reply: String, expectedTool: String, expectedArgument: String)] = [
            ("普通一句",
             "[RUN:搜索:GitHub 上最近很火的视频生成项目]",
             "搜索", "GitHub 上最近很火的视频生成项目"),
            ("参数里带冒号（URL 场景）",
             "[RUN:读网页:https://example.com/a:b]",
             "读网页", "https://example.com/a:b"),
            ("带前后缀正文（标签要从朗读文本里被摘掉）",
             "我查一下。[RUN:搜索:北京 明天 天气] 稍等。",
             "搜索", "北京 明天 天气"),
            ("多参数写法",
             "[RUN:某工具:城市=北京 天数=3]",
             "某工具", "城市=北京 天数=3"),
        ]

        for testCase in cases {
            let parseResult = ActionTagParser.parse(from: testCase.reply)
            guard let request = parseResult.toolRunRequests.first else {
                print("   ✗ \(testCase.name)：**一个 `[RUN:]` 都没解析出来**")
                continue
            }
            let toolMatches = request.toolName == testCase.expectedTool
            let argumentMatches = request.argumentText == testCase.expectedArgument
            let ok = toolMatches && argumentMatches
            print("   \(ok ? "✓" : "✗") \(testCase.name)")
            print("        工具=\(request.toolName) 参数=「\(request.argumentText)」")
            if !ok {
                print("        期望 工具=\(testCase.expectedTool) 参数=「\(testCase.expectedArgument)」")
            }
            // 标签必须**不出现在朗读文本里**（否则用户会听见 "[RUN:搜索:…]"）。
            if parseResult.spokenText.contains("[RUN:") {
                print("        ✗ 标签没被摘掉，朗读文本里还有它：\(parseResult.spokenText)")
            }
        }
        print("")
    }
}
