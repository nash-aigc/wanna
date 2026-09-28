//
//  PythonAgentRunner.swift
//  Wanna
//
//  **这一轮的决策大脑，交给 Python 那边的 OpenAI Agents SDK。**
//
//  2026-09-29 加。它是「把 Wanna 那套 Swift 决策循环换成 agent 框架」这件的桥：
//
//  ```
//  用户说话 → Wanna 转写
//                ↓
//          起一个 Python 子进程（本文件）
//                ↓
//          wanna_agent.py 用 Agents SDK 决策
//                ↓ 通过 MCP（HTTP + 令牌）
//          Wanna 自己的 MCP 服务端（10 个工具：截图/点击/打字/读界面…）
//                ↓
//          每一步的结果回到 Python → 继续决策 → 直到做完
//                ↓
//          Python 把最终答复打到 stdout → 本文件读出来 → 交给管线播报/显示
//  ```
//
//  ## 为什么 Python 不需要任何系统权限
//
//  **所有真正碰系统的动作都在 Wanna 里**（截图、点击、打字都是 MCP 工具，由 Wanna 执行）。
//  Python 只做决定。所以它不需要录屏/辅助功能/麦克风 —— 也正因为这样，**它可以先用
//  任意 Python 跑起来**，不必等"打包进 .app"那一步（那个是为了分发，不是为了权限）。
//
//  ## 输出约定（与 `wanna_agent.py` 的契约）
//
//  stdout 一行一个 JSON：`{"type":"step",…}` / `{"type":"final","text":…}` / `{"type":"error",…}`
//  stderr 是人看的日志，进 Wanna 的诊断日志。
//

import Foundation

/// 起一个 Python 子进程当决策大脑，把这一轮跑完。
@MainActor
final class PythonAgentRunner {

    static let shared = PythonAgentRunner()

    private init() {}

    /// 一轮的开始到结束。抛出的错误会被调用方说给用户听。
    struct TurnResult {
        /// 给用户听的最终答复（Python 那边的最后一句）。
        let finalText: String
        /// 这一轮实际执行了几步（工具调用次数），用于日志与进度。
        let stepCount: Int
    }

    // MARK: 路径

    /// Python 解释器。默认指向那个装了 `openai-agents` 的 venv。
    ///
    /// ⚠️ **现在指向仓库外那个开发目录**（`~/Documents/SuperAgent/WannaAgent`）。
    /// 打包进 `.app` 那一步做完之后，这里要换成 bundle 内的运行时 ——
    /// 见 `改造方案-Agent框架迁移.md` 阶段 2。
    static var pythonExecutablePath: String {
        ProcessInfo.processInfo.environment["WANNA_AGENT_PYTHON"]
            ?? (NSHomeDirectory() + "/Documents/SuperAgent/WannaAgent/.venv/bin/python")
    }

    static var agentScriptPath: String {
        ProcessInfo.processInfo.environment["WANNA_AGENT_SCRIPT"]
            ?? (NSHomeDirectory() + "/Documents/SuperAgent/WannaAgent/wanna_agent.py")
    }

    static var isConfigured: Bool {
        FileManager.default.isExecutableFile(atPath: pythonExecutablePath)
            && FileManager.default.fileExists(atPath: agentScriptPath)
    }

    // MARK: 跑一轮

    /// 跑一轮任务。`onProgress` 每执行一步被叫一次（给界面显示"做到哪了"）。
    ///
    /// 取消：调用方取消它的 Task 时，子进程会被终止 —— 用户按 ESC 打断必须真的停掉它，
    /// 否则一个在后台点鼠标的进程会继续动用户的电脑。
    func runTurn(task: String,
                 onProgress: @escaping (String) -> Void) async throws -> TurnResult {

        guard Self.isConfigured else {
            throw PythonAgentError.notConfigured(
                python: Self.pythonExecutablePath, script: Self.agentScriptPath)
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: Self.pythonExecutablePath)
        process.arguments = [Self.agentScriptPath, "--task", task]
        // 关掉 Python 自己的缓冲，否则 stdout 会攒着不吐 → 进度要等结束才看得到。
        process.environment = ProcessInfo.processInfo.environment.merging(
            ["PYTHONUNBUFFERED": "1"]) { _, new in new }

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        MainFlowDiagnostics.log("🐍 起 Python 决策大脑 · \(task.prefix(60))")
        try process.run()

        // stderr → 诊断日志（人看的）。单独一条队列，不挡 stdout 的读取。
        let stderrReader = PipeLineReader(stderrPipe.fileHandleForReading)
        DispatchQueue.global(qos: .utility).async {
            while let line = stderrReader.nextLine() {
                MainFlowDiagnostics.log("🐍 \(line)")
            }
        }

        // stdout → 一行一个 JSON。这里**边读边回调**，所以"做到哪了"是实时的。
        var finalText: String?
        var failure: String?
        var stepCount = 0

        let stdoutReader = PipeLineReader(stdoutPipe.fileHandleForReading)
        while let line = stdoutReader.nextLine() {
            // 用户按下 ESC 打断时，这里要立刻停手 —— 否则子进程会继续操控用户的电脑。
            if Task.isCancelled {
                process.terminate()
                throw CancellationError()
            }
            guard let data = line.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = object["type"] as? String else { continue }

            switch type {
            case "step":
                stepCount += 1
                if let tool = object["tool"] as? String {
                    onProgress("\(tool)…")
                } else if let result = object["result"] as? String {
                    onProgress(String(result.prefix(120)))
                }
            case "final":
                finalText = (object["text"] as? String) ?? ""
            case "error":
                failure = (object["text"] as? String) ?? "未知错误"
            default:
                break
            }
        }

        process.waitUntilExit()

        if Task.isCancelled { throw CancellationError() }
        if let failure { throw PythonAgentError.agentFailed(failure) }
        guard let finalText, !finalText.isEmpty else {
            throw PythonAgentError.noAnswer(exitCode: process.terminationStatus)
        }

        MainFlowDiagnostics.log("🐍 决策大脑完成 · \(stepCount) 步 · \(finalText.prefix(80))")
        return TurnResult(finalText: finalText, stepCount: stepCount)
    }
}

// MARK: - 错误

nonisolated enum PythonAgentError: Error, CustomStringConvertible {
    case notConfigured(python: String, script: String)
    case agentFailed(String)
    case noAnswer(exitCode: Int32)

    var description: String {
        switch self {
        case .notConfigured(let python, let script):
            return "决策大脑没配好：找不到 \(python) 或 \(script)"
        case .agentFailed(let why):
            return "决策大脑出错：\(why)"
        case .noAnswer(let code):
            return "决策大脑没有给出答复（退出码 \(code)）"
        }
    }
}

// MARK: - 逐行读

/// 从一个管道**逐行**读。
///
/// 用 `availableData` 而不是 `readDataToEndOfFile`：后者要等进程结束才返回，
/// 那样"做到哪一步了"就只能等做完才知道 —— 而用户按 ESC 想打断时，
/// 我们必须在**下一行到达的那一刻**就看得见取消。
///
/// ⚠️ 必须是**有状态**的（缓冲留在对象里）：第一版写成了 `FileHandle` 的
/// extension，每次调用都新建一个局部缓冲 —— 读到半行时那半行就被丢掉了，
/// 于是偶尔会解析失败或丢步。
private final class PipeLineReader {
    private let handle: FileHandle
    private var buffer = Data()

    init(_ handle: FileHandle) { self.handle = handle }

    /// 下一行（不含换行符）。管道关闭且没有残留时返回 nil。
    func nextLine() -> String? {
        while true {
            if let newline = buffer.firstIndex(of: 0x0A) {
                let lineData = buffer[buffer.startIndex..<newline]
                buffer.removeSubrange(buffer.startIndex...newline)
                return String(data: lineData, encoding: .utf8)
            }
            let chunk = handle.availableData
            if chunk.isEmpty {
                guard !buffer.isEmpty else { return nil }   // 管道关了，也没残留
                let rest = String(data: buffer, encoding: .utf8)
                buffer.removeAll()
                return rest
            }
            buffer.append(chunk)
        }
    }
}
