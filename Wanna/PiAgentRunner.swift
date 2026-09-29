//
//  PiAgentRunner.swift
//  Wanna
//
//  **这一轮的决策大脑，交给 Pi（pi.dev 的 agent 运行时）。**
//
//  2026-09-29 换血（取代 `PythonAgentRunner` + `wanna_agent.py`）。用户定的方向：
//  「不再自己设计 agent，直接用现成的 agent」—— OpenAI Agents SDK 是 0.x、半年 42 版
//  且没有任何稳定性承诺（PyPI 实测），Pi 自称 "a minimal agent harness"、
//  原生带会话（树结构）/ 上下文压缩 / 技能加载，我们只做它的一层壳。
//
//  ```
//  用户说话 → Wanna 转写
//                ↓
//      PiAgentRunner（本文件，常驻 RPC 客户端）
//                ↓ stdin/stdout 的 JSONL（官方 docs/rpc.md）
//      pi --mode rpc --no-context-files --model deepseek/deepseek-flash
//                ↓ pi-mcp-adapter（第三方扩展）→ HTTP + 令牌
//      Wanna 自己的 MCP 服务端（19 个工具）
//                ↓
//      每步结果回到 pi → 继续决策 → agent_settled
//                ↓
//      最终文字交给管线播报/显示
//  ```
//
//  ## 官方协议的四条硬规矩（台账 P1–P7，全部照办）
//
//  1. **`prompt` 成功 ≠ 跑完** —— 等 `agent_settled`，不是 `agent_end`
//     （其后还可能有 retries / compaction / steering；实测：agent_end 比 settled 早 ~0.1s）
//  2. **先订阅、再发 prompt** —— readabilityHandler 在进程起来时就装上，
//     事件先攒进通道，绝无"快速完成收不到"的窗口
//  3. **只在 LF（0x0A）上切帧** —— U+2028/U+2029 在 JSON 字符串里合法
//     （官方点名 Node 的 readline 会切错；这里手写按字节切）
//  4. **stdout 只走协议** —— pi 的日志走 stderr，我们只把 stderr 喂诊断日志
//
//  ## 会话 = Wanna 的 UUID → pi 的一个 JSONL 文件
//
//  「连续对话」= 同一个 UUID → 同一个文件（pi 自己带历史与压缩）；
//  「新建对话」= 新 UUID → 新文件。实测：`switch_session` 指向不存在的路径会**直接创建**，
//  切走再切回记忆还在（"暗号是菠萝"实测通过）。
//  pi 的 compaction 默认开启（reserveTokens 16384 / keepRecentTokens 20000），
//  所以不再需要 Swift 那套「记住最近多少轮 / 历史压缩」。
//

import Foundation

/// 通过 RPC 驱动一个常驻的 pi 进程，把这一轮任务跑完。
@MainActor
final class PiAgentRunner {

    static let shared = PiAgentRunner()

    private init() {}

    /// 一轮的开始到结束。
    struct TurnResult {
        /// 给用户听的最终答复。
        let finalText: String
        /// 这一轮实际执行了几步（工具调用次数），用于日志与进度。
        let stepCount: Int
    }

    // MARK: 路径与配置

    /// pi 可执行文件。GUI App 继承的 PATH 很短（同 `ExternalToolchain` 的教训），
    /// 所以按两套 Homebrew 前缀列候选，环境变量留一个手动出口。
    static var piExecutablePath: String {
        let candidates = [
            ProcessInfo.processInfo.environment["WANNA_PI_PATH"],
            "/opt/homebrew/bin/pi",
            "/usr/local/bin/pi",
        ].compactMap { $0 }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) } ?? candidates[0]
    }

    /// pi 的会话文件都落在这 —— 每个 Wanna 会话 UUID 一个 `.jsonl`，
    /// 与另外几条诊断数据同目录（都在 Application Support/Wanna）。
    static var sessionsDirectory: String {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home.appendingPathComponent("Library/Application Support/Wanna/pi-sessions").path
    }

    static var isConfigured: Bool {
        FileManager.default.isExecutableFile(atPath: piExecutablePath)
    }

    // MARK: 常驻进程

    private var process: Process?
    private var stdinHandle: FileHandle?
    private var channel: PiRPCChannel?
    private var requestSequence = 0

    /// pi 的 stderr 走诊断日志（官方：stdout 只走协议，日志走 stderr —— P6）。
    private func ensureProcess() throws -> (Process, FileHandle, PiRPCChannel) {
        if let process, let stdinHandle, let channel, process.isRunning {
            return (process, stdinHandle, channel)
        }

        try FileManager.default.createDirectory(
            atPath: Self.sessionsDirectory, withIntermediateDirectories: true)

        let newProcess = Process()
        newProcess.executableURL = URL(fileURLWithPath: Self.piExecutablePath)
        newProcess.arguments = [
            "--mode", "rpc",
            "--no-context-files",      // ⚠️ 仓库的 AGENTS.md 有 503KB —— 官方 security.md 写明
                                       // context 文件"regardless of project trust"照读，
                                       // 必须用 -nc 关掉（台账 P5'/12.1）
            "--exclude-tools", "bash,edit,write",
            // ⚠️⚠️ **为什么是"去掉三个"而不是 `--no-builtin-tools`（2026-09-29 实测定的）**
            //
            // 起因：用户报「点快捷键进入 agent 模式，没有返回」。会话文件实证，那一轮 Pi 拿
            // **自己内置的 bash** 把整件事重做了一遍，而不是用我们给的 19 个 MCP 工具：
            //     bash  open -a Calculator && osascript …   ← 自己开计算器
            //     bash  screencapture -x /tmp/calc.png      ← 自己截图
            //     read  /tmp/calc.png                       ← 自己看图
            //     bash  grep -rl "平凡" … find … url-tool   ← 满硬盘找目录，再也不回来
            // 它是个 coding agent，**只要手里有 bash，它就会用自己的手**。
            //
            // 第一版改法是 `--no-builtin-tools`（内置全关），结果**技能整批消失** ——
            // 官方源码 `core/system-prompt.ts:165`：
            //     const skillFileReadTool = (["read","bash"] as const).find(t => selectedTools.includes(t));
            //     if (skillFileReadTool && skills.length > 0) { …写入提示词… }
            // **只认这两个名字、扩展工具顶不上去**，所以关掉内置 = 技能段整段不出现，
            // 而且**不报错**（金丝雀实测：放一条"紫色犀牛协议"，问它认不认得 → 「没有」）。
            //
            // 所以留 `read` —— 技能那条官方机制要它（官方 `formatSkillsForPrompt` 给的是
            // `<name>`+`<description>`+`<location>` 绝对路径，正文靠 `read` 去读，正是三级披露）；
            // 去掉 `bash`/`edit`/`write` —— 那三个才是它"自己动手"和"满硬盘找"的来源。
            // 取舍就是这一条：**决策归 Pi，动手归 Wanna。**
            "--model", "deepseek/deepseek-flash",
            "--session-dir", Self.sessionsDirectory,
        ]
        // 工作目录给一个**我们自己的空目录**，不是随 App 继承来的 `/` ——
        // 万一还有任何按路径的动作，范围也可控。
        newProcess.currentDirectoryURL = URL(fileURLWithPath: Self.sessionsDirectory)

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        newProcess.standardInput = stdinPipe
        newProcess.standardOutput = stdoutPipe
        newProcess.standardError = stderrPipe

        MainFlowDiagnostics.log("🥧 起 Pi（常驻 RPC）· \(Self.piExecutablePath)")
        try newProcess.run()

        let newChannel = PiRPCChannel()
        // 先装上读取、再发任何命令 —— 官方 P5："Subscribe before sending a prompt
        // to avoid missing a fast completion."
        stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                return
            }
            newChannel.ingest(data)
        }
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else { handle.readabilityHandler = nil; return }
            if let text = String(data: data, encoding: .utf8) {
                MainFlowDiagnostics.log("🥧 \(text.trimmingCharacters(in: .newlines))")
            }
        }
        newProcess.terminationHandler = { [weak self] process in
            MainFlowDiagnostics.log("🥧 Pi 进程退出（码 \(process.terminationStatus)）")
            // 下一次 runTurn 会看到 isRunning == false 并重新拉起（常驻但不复活僵尸）。
            _ = self
        }

        process = newProcess
        // ⚠️ stdin 必须是 standardInput 管道的写端。第一版把它接成了 stdout 管道的
        // 写端 —— 命令喂给了自己的读取器，pi 一个字都没收到，switch_session 15 秒
        // 超时（2026-09-29 端到端实测抓到：起 Pi 之后毫无动静、无报错直到超时）。
        stdinHandle = stdinPipe.fileHandleForWriting
        channel = newChannel
        return (newProcess, stdinPipe.fileHandleForWriting, newChannel)
    }

    // MARK: 跑一轮

    /// 跑一轮任务。`onProgress` 每执行一步被叫一次（给界面显示"做到哪了"）。
    ///
    /// 取消：调用方取消它的 Task 时，会向 pi 发官方的 `abort` 命令并抛 `CancellationError`
    /// —— 用户按 ESC 打断必须真的停掉它，否则一个在后台点鼠标的 agent 会继续动用户的电脑。
    /// - Parameter sessionID: **哪一段对话** —— Wanna 会话的 UUID。
    ///   「连续对话」= 同一个 UUID（同一个 pi 会话文件）；「新建对话」= 换一个。
    func runTurn(task: String,
                 sessionID: String,
                 onProgress: @escaping (String) -> Void) async throws -> TurnResult {

        guard Self.isConfigured else {
            throw PiAgentError.notConfigured(path: Self.piExecutablePath)
        }

        let (process, stdin, channel) = try ensureProcess()

        // 上一轮可能留下的残余事件，全部倒掉再开始（防串台）。
        _ = channel.takeLines()

        MainFlowDiagnostics.log("🥧 这一轮交给 Pi · 会话 \(sessionID.prefix(8)) · \(task.prefix(60))")

        // ① 会话对准 —— switch_session 指向不存在的路径会直接创建（实测）。
        requestSequence += 1
        let sessionRequestID = "w-\(requestSequence)"
        let sessionPath = (Self.sessionsDirectory as NSString)
            .appendingPathComponent("\(sessionID).jsonl")
        try sendCommand(stdin, id: sessionRequestID, object: [
            "id": sessionRequestID,
            "type": "switch_session",
            "sessionPath": sessionPath,
        ])
        try await waitForResponse(channel, id: sessionRequestID, timeout: 15,
                                  process: process, what: "切换会话")

        // ② 发 prompt（唯一保留 progress 通道的命令）。
        requestSequence += 1
        let promptRequestID = "w-\(requestSequence)"
        try sendCommand(stdin, id: promptRequestID, object: [
            "id": promptRequestID,
            "type": "prompt",
            "message": task,
        ])

        // ③ 事件循环 —— 等 `agent_settled`，**不是** `agent_end`（官方 P4）。
        var finalText = ""
        var stepCount = 0
        let deadline = Date().addingTimeInterval(600)   // 一轮上限 10 分钟；超过即 abort
        var promptDisposition: String?
        var sawSettled = false

        while !sawSettled {
            if Task.isCancelled {
                // 官方的打断命令。发完就抛，不等响应 —— 打断要快。
                try? sendCommand(stdin, id: "w-abort-\(requestSequence)", object: [
                    "type": "abort",
                ])
                throw CancellationError()
            }
            if Date() > deadline {
                try? sendCommand(stdin, id: "w-abort-\(requestSequence)", object: [
                    "type": "abort",
                ])
                throw PiAgentError.agentFailed("一轮超过 10 分钟，已发送 abort")
            }
            guard process.isRunning else {
                throw PiAgentError.agentFailed("Pi 进程在任务进行中退出（退出码 \(process.terminationStatus)）")
            }

            for line in channel.takeLines() {
                guard let data = line.data(using: .utf8),
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let type = object["type"] as? String else { continue }

                switch type {
                case "response":
                    guard (object["id"] as? String) == promptRequestID else { continue }
                    if let payload = object["data"] as? [String: Any] {
                        promptDisposition = payload["disposition"] as? String
                    }
                    if object["success"] as? Bool == false {
                        throw PiAgentError.agentFailed(
                            (object["error"] as? String) ?? "prompt 命令被拒")
                    }
                    // disposition == "handled" 表示被扩展消费、不会有 run ——
                    // 官方明写这种情况不要等 agent_settled。
                    if promptDisposition == "handled" { sawSettled = true }

                case "message_update":
                    guard let inner = object["assistantMessageEvent"] as? [String: Any],
                          inner["type"] as? String == "text_delta",
                          let delta = inner["delta"] as? String else { continue }
                    finalText += delta

                case "tool_execution_start":
                    stepCount += 1
                    let toolName = object["toolName"] as? String ?? "工具"
                    onProgress("🔧 \(toolName)…")

                case "tool_execution_end":
                    if object["isError"] as? Bool == true {
                        onProgress("⚠️ 工具出错")
                    }

                case "agent_settled":
                    sawSettled = true

                default:
                    break
                }
            }

            if !sawSettled {
                try await Task.sleep(nanoseconds: 50_000_000)   // 50ms 轮询；事件本就异步到达
            }
        }

        finalText = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !finalText.isEmpty else {
            throw PiAgentError.noAnswer(disposition: promptDisposition ?? "未知")
        }

        MainFlowDiagnostics.log("🥧 Pi 完成 · \(stepCount) 步 · \(finalText.prefix(80))")
        return TurnResult(finalText: finalText, stepCount: stepCount)
    }

    // MARK: 命令与等待

    private func sendCommand(_ stdin: FileHandle, id: String, object: [String: Any]) throws {
        var command = object
        command["id"] = id
        let payload = try JSONSerialization.data(withJSONObject: command)
        // 官方分帧：一行一个 JSON + LF。
        try stdin.write(payload + Data([0x0A]))
    }

    /// 等某条命令的 response（仅用于 switch_session 这类"要确认结果"的命令；
    /// 期间的事件缓存在 channel 里，等下一轮事件循环再处理 —— 不丢）。
    private func waitForResponse(_ channel: PiRPCChannel, id: String, timeout: TimeInterval,
                                 process: Process, what: String) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for line in channel.takeLines() {
                guard let data = line.data(using: .utf8),
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      object["type"] as? String == "response",
                      (object["id"] as? String) == id else { continue }
                if object["success"] as? Bool == false {
                    throw PiAgentError.agentFailed(
                        "\(what)失败：\(object["error"] as? String ?? "未知")")
                }
                return
            }
            guard process.isRunning else {
                throw PiAgentError.agentFailed("Pi 进程在\(what)时退出")
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        throw PiAgentError.agentFailed("\(what)超时（\(Int(timeout))s）")
    }
}

// MARK: - 错误

nonisolated enum PiAgentError: Error, CustomStringConvertible {
    case notConfigured(path: String)
    case agentFailed(String)
    case noAnswer(disposition: String)

    var description: String {
        switch self {
        case .notConfigured(let path):
            return "决策大脑没配好：找不到 pi（\(path)）。装法：npm install -g @earendil-works/pi-coding-agent"
        case .agentFailed(let why):
            return "决策大脑出错：\(why)"
        case .noAnswer(let disposition):
            return "决策大脑没有给出答复（disposition：\(disposition)）"
        }
    }
}

// MARK: - 字节 → 行的通道（**绝不能是 MainActor**）

/// 攒 stdout 的字节、按 **LF（0x0A）** 切行、供事件循环取走。
///
/// ⚠️ `nonisolated` + `NSLock` 的理由见 `PythonTurnCollector`：这个工程开着
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`，不写的话 `readabilityHandler`
/// 的回调会跳回主线程 —— 死锁原样复现（2026-09-29 实测过两版才对）。
///
/// ⚠️ 只认 0x0A（官方 P3）：U+2028/U+2029 在 JSON 字符串里是合法字符，
/// 任何"按 Unicode 换行切"的读法都会把一条完整的协议记录切成两半。
nonisolated final class PiRPCChannel {

    private let lock = NSLock()
    private var buffer = Data()
    private var pendingLines: [String] = []

    /// 从 readabilityHandler 来的一块数据。
    func ingest(_ data: Data) {
        lock.lock()
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer[buffer.startIndex..<newline]
            buffer.removeSubrange(buffer.startIndex...newline)
            // 官方允许 CRLF：剥掉可选的前导 CR。
            var trimmed = lineData
            if trimmed.last == 0x0D { trimmed = trimmed.dropLast() }
            if let line = String(data: trimmed, encoding: .utf8), !line.isEmpty {
                pendingLines.append(line)
            }
        }
        lock.unlock()
    }

    /// 取走当前攒下的所有完整行（不足一行的尾部留在缓冲里）。
    func takeLines() -> [String] {
        lock.lock(); defer { lock.unlock() }
        let lines = pendingLines
        pendingLines = []
        return lines
    }
}
