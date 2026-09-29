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
    ///
    /// **2026-09-29：决策大脑已经搬进仓库**（`<仓库>/WannaAgent/`），所以这两个路径
    /// 从**仓库根**推导（`WorkspaceDirectory.rootURL`），不再写死绝对路径 ——
    /// 仓库挪地方、换机器都不会断。
    ///
    /// ⚠️ 那个 venv **不要用 `git` 管**（97MB，而且 `.venv/bin/pip` 这类脚本里写死了
    /// 建它时的绝对路径 —— 搬一次就得重建）。仓库里有 `WannaAgent/requirements.txt`，
    /// 重建就一句 `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`。
    static var pythonExecutablePath: String {
        ProcessInfo.processInfo.environment["WANNA_AGENT_PYTHON"]
            ?? WorkspaceDirectory.rootURL
                .appendingPathComponent("WannaAgent/.venv/bin/python").path
    }

    static var agentScriptPath: String {
        ProcessInfo.processInfo.environment["WANNA_AGENT_SCRIPT"]
            ?? WorkspaceDirectory.rootURL
                .appendingPathComponent("WannaAgent/wanna_agent.py").path
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
    /// - Parameter sessionID: **哪一段对话** —— 官方 Sessions 的 session id。
    ///   传的是 `ConversationSession` 的 UUID，和「卡片 id = 实体 UUID」同一个做法。
    ///   「连续对话」= 同一个 id；「新建对话」= 换一个。
    func runTurn(task: String,
                 sessionID: String,
                 memoryRounds: Int,
                 onProgress: @escaping (String) -> Void) async throws -> TurnResult {

        guard Self.isConfigured else {
            throw PythonAgentError.notConfigured(
                python: Self.pythonExecutablePath, script: Self.agentScriptPath)
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: Self.pythonExecutablePath)
        process.arguments = [Self.agentScriptPath, "--task", task,
                           "--session-id", sessionID,
                           "--memory-rounds", String(memoryRounds)]
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

        // stdout → 一行一个 JSON。
        //
        // ⚠️⚠️ **这段必须跑在主线程之外，否则整个系统死锁**（2026-09-29 实测踩到）：
        //
        // 它是**阻塞式**读管道（`availableData` 要等数据），而 Python 那边做的事是
        // "连 Wanna 的 MCP 服务端 → 调工具"。而 **MCP 工具的处理跑在主线程上**
        // （`WannaMCPServer` 是 `@MainActor`，工具实现要碰 App 内部）。
        // 于是：主线程在这里等 Python ↔ Python 在等主线程处理它的工具调用 → 死锁。
        //
        // 症状是**看起来什么都没发生**：日志停在 `[wanna-agent] 任务：…` 之后，
        // 没有报错、没有超时、没有完成 —— 因为两边都在等对方。
        // 所以用 `Task.detached` 把它挪出主 actor：阻塞一个后台线程是廉价的，
        // 阻塞主线程是致命的。
        // stdout → 一行一个 JSON。
        //
        // ⚠️⚠️ **必须用事件驱动的读法，不能用阻塞式读循环**（2026-09-29 实测，两版才对）：
        //
        // **第一版**：在主线程上 `while let line = reader.nextLine()`（内部是
        // `availableData` + `read`，会阻塞）。而 Python 要连的 Wanna MCP 服务端，
        // 工具处理**也跑在主线程上** → 两边互相等 → 死锁。实测：日志停在
        // `[wanna-agent] 任务：…` 之后什么都不发生，2 分 11 秒后才以一个 ExceptionGroup 收场。
        //
        // **第二版（也错）**：把它包进 `Task.detached`。**没有用** —— `sample` 3 秒，
        // 主线程 1892/1892 个样本仍然停在 `PipeLineReader.nextLine() → read`：
        // 因为这个工程编译时开着 **`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`**，
        // 那个闭包**连同它捕获的局部变量一起被推成 MainActor 隔离**，于是照样跑在主线程。
        //
        // **第三版（这一版）**：`readabilityHandler` —— 由 Foundation 在**它自己的后台队列**
        // 上回调，天生不阻塞、也不受默认隔离影响。收尾靠 `terminationHandler`。
        let shared = PythonTurnCollector(onProgress: onProgress)

        stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                return
            }
            shared.ingest(data)
        }
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else { handle.readabilityHandler = nil; return }
            if let text = String(data: data, encoding: .utf8) {
                MainFlowDiagnostics.log("🐍 \(text.trimmingCharacters(in: .newlines))")
            }
        }

        let collected: PythonTurnCollector.Outcome = await withCheckedContinuation { continuation in
            shared.attach(continuation: continuation)
            process.terminationHandler = { _ in shared.finishOnExit() }
        }
        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil

        if Task.isCancelled { throw CancellationError() }
        if let failure = collected.failure { throw PythonAgentError.agentFailed(failure) }
        guard let finalText = collected.finalText, !finalText.isEmpty else {
            throw PythonAgentError.noAnswer(exitCode: process.terminationStatus)
        }

        MainFlowDiagnostics.log("🐍 决策大脑完成 · \(collected.stepCount) 步 · \(finalText.prefix(80))")
        return TurnResult(finalText: finalText, stepCount: collected.stepCount)
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

// MARK: - 收集 Python 的输出（**绝不能是 MainActor**）

/// 把 Python 子进程的输出攒起来，解析成进度与最终答复。
///
/// ⚠️ **这个类必须是 `nonisolated` 的。** 这个工程编译时开着
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` —— 不写 `nonisolated` 的话，
/// 它的每个方法都会被推成 MainActor 隔离，于是 `readabilityHandler` 的回调
/// （本该跑在 Foundation 的后台队列上）**又会跳回主线程**，死锁原样复现。
/// 这不是理论：第一版 `Task.detached` 就是这么栽的，`sample` 抓到的
/// 1892/1892 个主线程样本全停在阻塞读上。
///
/// 线程安全靠一把 `NSLock`：回调在 Foundation 的队列上，`finishOnExit` 在
/// `terminationHandler` 的队列上，两者可能同时来。
nonisolated final class PythonTurnCollector {

    struct Outcome {
        let finalText: String?
        let failure: String?
        let stepCount: Int
    }

    private let onProgress: (String) -> Void
    private let lock = NSLock()
    private var buffer = Data()
    private var finalText: String?
    private var failure: String?
    private var stepCount = 0
    private var continuation: CheckedContinuation<Outcome, Never>?
    private var didResume = false

    init(onProgress: @escaping (String) -> Void) {
        self.onProgress = onProgress
    }

    func attach(continuation: CheckedContinuation<Outcome, Never>) {
        lock.lock(); defer { lock.unlock() }
        self.continuation = continuation
    }

    /// 从管道来的一块数据 —— 攒行、解析、回调进度。
    func ingest(_ data: Data) {
        var lines: [String] = []
        lock.lock()
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer[buffer.startIndex..<newline]
            buffer.removeSubrange(buffer.startIndex...newline)
            if let line = String(data: lineData, encoding: .utf8) { lines.append(line) }
        }
        lock.unlock()

        for line in lines { parse(line) }
    }

    private func parse(_ line: String) {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else { return }

        switch type {
        case "step":
            var note: String?
            lock.lock()
            stepCount += 1
            lock.unlock()
            if let tool = object["tool"] as? String { note = "\(tool)…" }
            else if let result = object["result"] as? String { note = String(result.prefix(120)) }
            if let note { onProgress(note) }
        case "final":
            lock.lock(); finalText = (object["text"] as? String) ?? ""; lock.unlock()
        case "error":
            lock.lock(); failure = (object["text"] as? String) ?? "未知错误"; lock.unlock()
        default:
            break
        }
    }

    /// 进程退出 —— 收尾并放行等待方（幂等，两个来源都可能先到）。
    func finishOnExit() {
        lock.lock()
        guard !didResume, let continuation else { lock.unlock(); return }
        didResume = true
        let outcome = Outcome(finalText: finalText, failure: failure, stepCount: stepCount)
        lock.unlock()
        continuation.resume(returning: outcome)
    }
}
