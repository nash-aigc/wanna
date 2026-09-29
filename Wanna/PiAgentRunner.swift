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
///
/// ⭐ **双进程**（2026-09-29 用户定）：这个软件**同时开着两个 pi 进程**，从启动到退出
/// 任何时候都必须活着，互相之间零混淆 ——
/// · `.realtime`（`PiAgentRunner.realtime`）：**实时模式**专用。**思考关**（`--thinking off`）、
///   模型可配（默认 deepseek-flash）—— 目的是"快速出结果，显示在鼠标右下角的卡片"。
/// · `.execute`（`PiAgentRunner.shared`）：**执行模式**专用。**思考开**（不传 `--thinking`，
///   走 pi 默认），模型可配 —— 让它"真正高效地解决问题"。
/// 两者**MCP、技能完全相同**（同一份 `~/.pi/agent/` 配置），差的只有模型与思考开关。
/// 会话文件靠前缀区分：执行 = 会话 UUID；实时 = `realtime-` 前缀。
@MainActor
final class PiAgentRunner {

    enum ProcessRole {
        /// 实时模式：思考关、要快。
        case realtime
        /// 执行模式：思考开、可以配另一个模型。
        case execute
    }

    /// 执行模式的常驻进程（原有那条链都走它）。
    static let shared = PiAgentRunner(role: .execute)
    /// 实时模式的常驻进程（2026-09-29 新增；与 shared 是**两个进程**）。
    static let realtime = PiAgentRunner(role: .realtime)

    let role: ProcessRole
    private init(role: ProcessRole) {
        self.role = role
    }

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

    /// **这个进程用哪个模型、开不开思考**（2026-09-29）。
    ///
    /// 两条规则（都是用户定的）：
    /// · 模型 id 从设置读（`PiModeSettings`），默认 `deepseek-official/deepseek-flash`；
    /// · **实时进程强制 `--thinking off`**（要快）；执行进程**不传 `--thinking`**
    ///   （pi 默认 = 开思考）—— "执行要思考"是这次设计的前提，不给出错关掉它的入口。
    func modelAndThinkingArguments() -> [String] {
        let settings = PiModeSettingsStore.shared.snapshot()
        var arguments = ["--model", settings.modelID(for: role)]
        // **思考开 = 不传参数**（pi 默认就是开思考）；**关 = 显式 `--thinking off`**
        //（它会发出 `reasoning_effort: none`，实测火山与 DeepSeek 都认）。
        // 默认值仍是"实时关、执行开"，但用户可以在设置页 / 那颗「模型」面板里改
        //（2026-09-29 用户：「它的思考都可以开或关……应该让用户可以选择」）。
        if !settings.thinkingEnabled(for: role) {
            arguments += ["--thinking", "off"]
        }
        return arguments
    }

    /// ⭐ **启动即预热**（2026-09-29 用户定：两个进程"任何时候都必须要开"）。
    ///
    /// 在 `CompanionManager.start()` 里各调一次 —— 进程在后台拉起来，等第一轮真的来时
    /// 握手已经完成。进程挂了不在这里复活（`runTurn` 会看到 isRunning == false 自动重拉），
    /// 这里只负责"App 活着的时候进程也活着"。
    /// ⚠️ **失败必须留一行日志**（第一版 `try?` 把失败吞了 —— "起 Pi"日志打在 `run()`
    /// 之前，`run()` 抛错时既没有进程也没有退出日志，屏幕上与日志里都看不出任何异常）。
    static func warmUpBothProcesses() {
        guard isConfigured else {
            MainFlowDiagnostics.log("🥧 双进程预热跳过：pi 不在（\(piExecutablePath)）")
            return
        }
        Task { @MainActor in
            do {
                _ = try realtime.ensureProcess()
                MainFlowDiagnostics.log("🥧 实时进程已预热（思考关）")
            } catch {
                MainFlowDiagnostics.log("🥧 ⚠️ 实时进程预热失败：\(error.localizedDescription)")
            }
        }
        Task { @MainActor in
            do {
                _ = try shared.ensureProcess()
                MainFlowDiagnostics.log("🥧 执行进程已预热（思考开）")
            } catch {
                MainFlowDiagnostics.log("🥧 ⚠️ 执行进程预热失败：\(error.localizedDescription)")
            }
        }
    }

    // MARK: 系统提示词（Wanna 的规矩）

    /// **Wanna 那份规矩**（`CompanionManager.companionSystemPrompt`）—— 由 `CompanionManager` 注入。
    ///
    /// 2026-09-29 才发现：在它之前，这份提示词**从来没有送到过任何模型** ——
    /// `companionSystemPrompt` 只被用来打了一行字数日志。
    /// 于是 pi 拿到的是它自己的 coding-agent 提示词，对 Wanna 的规矩（用 MCP 工具、
    /// 动手后要核对、只说一句话的收据）一无所知 —— 它拿 `bash` 去 mkdir（没有那个工具）、
    /// 拿界面去点 Finder，最后还说了句「已完成」✗（用户报的「建个文件夹都建不成」）。
    ///
    /// 用**官方机制**挂上去：`--append-system-prompt <文件>` —— pi 自己的提示词保留，
    /// 我们的规矩追加在它后面。
    var systemPromptProvider: (() -> String)?

    /// 起进程时实际挂上去的那一份（算哈希）—— 用户改了提示词就重起进程，否则
    /// 长驻进程永远读不到新那份（那就是又一次静默失效）。
    private var spawnedSystemPromptHash: Int?

    /// 提示词先写这个文件，再把**路径**传给 pi（官方接受文件路径，免得 6KB 文本进 argv）。
    static var systemPromptFileURL: URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home.appendingPathComponent("Library/Application Support/Wanna/pi-system-prompt.md")
    }

    // MARK: 常驻进程

    private var process: Process?
    private var stdinHandle: FileHandle?
    private var channel: PiRPCChannel?
    private var requestSequence = 0
    /// ⚠️ **stdin 管道本体必须被这个实例持有**（2026-09-29 实测抓到）：
    /// `ensureProcess` 的返回值如果被调用方丢弃（`warmUpBothProcesses` 那样 `_ =`），
    /// 局部的 `Pipe` 对象随之释放 —— **stdin 的 fd 被关**，pi 的 RPC 模式读到 EOF
    /// 就**干净退出**（实测：终端里 `pi --mode rpc` 一旦 stdin 断开，立刻退出、零输出、
    /// 零报错）。`runTurn` 路径一直持有返回值所以从没暴露；预热路径一上就现形。
    /// 存在这里 = fd 永远开着，调用方持不持有返回值都无所谓。
    private var stdinPipe: Pipe?
    /// ⭐ **此刻有没有一轮在跑**（2026-09-29）—— 常驻进程一次只能对准一个会话，
    /// 两轮并发会互相切走对方的会话（见 `runTurn` 门口那道 guard）。
    private var isTurnRunning = false
    /// 起进程那一刻的"模型 + 思考"参数哈希（变了 → runTurn 门口重起，见 runTurn 注释）。
    private var spawnedModelArgumentsHash: Int?

    /// pi 的 stderr 走诊断日志（官方：stdout 只走协议，日志走 stderr —— P6）。
    private func ensureProcess() throws -> (Process, FileHandle, PiRPCChannel) {
        if let process, let stdinHandle, let channel, process.isRunning {
            return (process, stdinHandle, channel)
        }

        try FileManager.default.createDirectory(
            atPath: Self.sessionsDirectory, withIntermediateDirectories: true)

        // **先把 Wanna 的规矩写成文件**（官方 `--append-system-prompt` 接受一个存在的文件路径）。
        let currentSystemPrompt = systemPromptProvider?() ?? ""
        if !currentSystemPrompt.isEmpty {
            try? currentSystemPrompt.write(to: Self.systemPromptFileURL,
                                           atomically: true, encoding: .utf8)
        }
        spawnedSystemPromptHash = currentSystemPrompt.hashValue
        spawnedModelArgumentsHash = modelAndThinkingArguments().hashValue

        let newProcess = Process()
        newProcess.executableURL = URL(fileURLWithPath: Self.piExecutablePath)
        var launchArguments: [String] = [
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
            // ⭐ **模型与思考开关按进程角色走设置**（2026-09-29 用户定）：
            // 实时进程 = 思考**关**（快，显示在右下角卡片）、执行进程 = 思考**开**（默认）；
            // 两者都可配模型，当前默认都是 deepseek-flash（用户："方便用户调试嘛，
            // 未来可以让用户手动去设置"）。设置页在 设置 → Agent → 「Pi 模型」一节
            //（`PiModeSettings`，读的是已保存的快照 —— 改了会**重起进程**，见上面的哈希检查）。
            //
            // 起因：用户报「点快捷键进实时模式说话能回，切进 agent 模式后没有返回、非常慢」。
            // 实时那半边走的是本地小模型那条快链，agent 这半边才走本文件这条 pi 链。
            // `pi --list-models deepseek` 显示真实 provider 名是 `deepseek-official`；
            // 而这里原来写死 `deepseek/deepseek-flash` —— pi 把 `deepseek` 当成一个**不存在的
            // provider**，`prompt` 直接回 `success:false · No API key found for deepseek`，
            // 于是这一轮永远等不到 `agent_settled`，表现就是「没有返回、非常慢（干等到超时）」。
            // 名字对齐配置里那一条即可（`~/.pi/agent/models.json` 的 providers 键名）。
            //
            // ⚠️ **`--thinking off`：关掉思考**（用户点名「对 wanna 必须使用非思考模式」）。
            //
            // `deepseek-flash` 是推理模型（reasoning=true）：不关的话它先吐一大段 reasoning_content，
            // 正文迟迟不来，用户端就是「慢、半天不出字」。官方 CLI 参数 `--thinking off` 会让
            // openai-completions 那条链发出 `reasoning_effort: "none"`（deepseek 中转实测认这个字段）。
            // 端到端实测（保持 stdin 开着、等到 agent_settled）：off = 0.8s 无思考流；
            // 默认 medium = 1.6s 有思考流 —— 关掉既满足要求又更快一倍。
        ]
        launchArguments += modelAndThinkingArguments()
        // **Wanna 的规矩追加在 pi 自己的提示词后面**（官方机制 `--append-system-prompt`，非自造）。
        // 没注入提示词提供者时不加这个参数，退回原来的行为。
        if !currentSystemPrompt.isEmpty {
            launchArguments += ["--append-system-prompt", Self.systemPromptFileURL.path]
        }
        launchArguments += ["--session-dir", Self.sessionsDirectory]
        newProcess.arguments = launchArguments
        // 工作目录给一个**我们自己的空目录**，不是随 App 继承来的 `/` ——
        // 万一还有任何按路径的动作，范围也可控。
        newProcess.currentDirectoryURL = URL(fileURLWithPath: Self.sessionsDirectory)

        // ⚠️⚠️ **必顶补 PATH，否则双击启动的 App 根本起不了 pi**（2026-09-29 实测报到）。
        //
        // `/opt/homebrew/bin/pi` 的 shebang 是 `#!/usr/bin/env node` —— **它要找 `node`**。
        // 而**双击（LaunchServices）启动的 App 只拿到极简 PATH**（`/usr/bin:/bin:/usr/sbin:/sbin`），
        // 里面没有 `/opt/homebrew/bin`，于是 `env node` 找不到：
        //     实验：`env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/pi --version`
        //           → `env: node: No such file or directory`
        // 进程当场退出 —— **退出码 127**，诊断日志里就是
        //     `🥧 起 Pi（常驻 RPC）· /opt/homebrew/bin/pi` → `🥧 Pi 进程退出（码 127）`
        // 而用户看到的只是「**进入 agent 模式没回复**」。
        //
        // 为什么以前没查到：**我所有测试都是从终端起的**（`/Applications/.../Wanna` 直接执行，
        // 继承终端那份完整的 PATH），所以 pi 一直起得来；用户双击启动就 127。
        // 这就是「你（pi）能用、客户端不能用」的真正分界线 —— 不在模型、不在 API，
        // 在**子进程拿不到 node**。
        //
        // 补法与仓库里另外两个 spawn 点（`ExternalToolchain` / `ClaudeAgentProcess`）同源：
        // 把那串 garantor 目录拼在 PATH 前面，一份常量、两处共读。
        var childEnvironment = ProcessInfo.processInfo.environment
        childEnvironment["PATH"] = ExternalToolchain.guaranteedPaths
            + ":" + (childEnvironment["PATH"] ?? "/usr/bin:/bin")
        newProcess.environment = childEnvironment

        let newStdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        newProcess.standardInput = newStdinPipe
        newProcess.standardOutput = stdoutPipe
        newProcess.standardError = stderrPipe
        // ⚠️ **管道本体归实例持有**（见 stdinPipe 字段的注释 —— 丢了它 pi 会静默退出）。
        stdinPipe = newStdinPipe

        MainFlowDiagnostics.log("🥧 起 Pi（常驻 RPC）· \(Self.piExecutablePath)")
        // **把实际参数打出来**（包含提示词有没有挂上去）：这一条是 2026-09-29 那次
        // 「规则挂了却看不出有没有生效」的直接教训 —— 参数不落盘，就只能靠猜。
        MainFlowDiagnostics.log("🥧 参数：\(launchArguments.joined(separator: " "))")
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
        stdinHandle = newStdinPipe.fileHandleForWriting
        channel = newChannel
        return (newProcess, newStdinPipe.fileHandleForWriting, newChannel)
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
                 // 每一块文字到达时叫一次，给的是**累计全文**（与旧视觉那条 `onTextChunk` 同形）。
                 // 2026-09-29 补：官方 RPC 本来就是按 `text_delta` 逐块推的，不交出去的话
                 // 上游三个下游（卡片流式上屏 / 逐句快答喂字 / isAnswerStreamLive）
                 // 全都拿不到东西 —— 用户报的「agent 模式没有回复」有一半出在这里。
                 onTextDelta: @escaping @MainActor @Sendable (String) -> Void = { _ in },
                 onProgress: @escaping (String) -> Void) async throws -> TurnResult {

        guard Self.isConfigured else {
            throw PiAgentError.notConfigured(path: Self.piExecutablePath)
        }

        // ⭐ **一轮一开，同一时刻只允许一轮**（2026-09-29，实时窗口那条临时会话加进来的）。
        //
        // 常驻进程的 `switch_session` 是**全局**的 —— 临时轮和 agent 轮共用同一个 pi 进程，
        // 同时跑两次 `runTurn` 会互相把对方的会话切走（临时轮正说着话，agent 轮把会话切到
        // agent 那个文件上，临时轮的回复就落进别人的会话里）。所以进门前先看旗标：
        // 忙就抛错 —— 实时窗口那一侧**有意**把它当"这一拍跳过"处理（下一拍再试），
        // agent 那一侧（用户提交的那一轮）照常 throw，因为它等的是用户的结果，不该静默。
        guard !isTurnRunning else {
            throw PiAgentError.agentFailed("Pi 正在跑另一轮（同一进程一次只能跑一轮）")
        }
        isTurnRunning = true
        defer { isTurnRunning = false }

        // **提示词变了就重起。（2026-09-29）**
        // 进程是常驻的，而 `--append-system-prompt` 只在**启动那一刻**读一次 ——
        // 不重起的话，用户在设置里改了系统提示词/补充指令，屏幕上将没有任何变化 ✗，
        // 而那种静默失效正是这个仓库最不想再看到的一类。
        if let runningProcess = process, runningProcess.isRunning,
           let spawnedSystemPromptHash,
           spawnedSystemPromptHash != (systemPromptProvider?() ?? "").hashValue {
            MainFlowDiagnostics.log("🥧 系统提示词变了 —— 重起 Pi 进程让它生效")
            runningProcess.terminate()
            process = nil
            stdinHandle = nil
            channel = nil
        }
        // ⭐ **模型/思考开关变了也要重起**（2026-09-29 双进程）：它们也是**启动那一刻**
        // 读一次的启动参数 —— 不重起的话，用户在设置页改了模型，屏幕上没有任何变化，
        // 跑的还是旧模型（与提示词那条静默失效同一类，见 `PiModeSettings`）。
        if let runningProcess = process, runningProcess.isRunning,
           spawnedModelArgumentsHash != modelAndThinkingArguments().hashValue {
            MainFlowDiagnostics.log("🥧 模型配置变了 —— 重起 Pi 进程让它生效")
            runningProcess.terminate()
            process = nil
            stdinHandle = nil
            channel = nil
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
                    // **交出去，不要只攒着**（2026-09-29）：`runTurn` 要等 `agent_settled`
                    // 才返回，而在此之前屏幕上那张卡片、逐句快答、刘海相位都在等这个字。
                    // 主 actor 上的同步调用，所以卡片拿到字的那一帧就是它到达的那一帧。
                    onTextDelta(finalText)

                case "tool_execution_start":
                    stepCount += 1
                    let toolName = object["toolName"] as? String ?? "工具"
                    onProgress("🔧 \(toolName)…")

                case "tool_execution_end":
                    if object["isError"] as? Bool == true {
                        onProgress("⚠️ 工具出错")
                    }

                case "message_end":
                    // ⚠️⚠️ **这一支是 2026-09-29 实测补上的，它挡的是"静默失败"**：
                    // 模型调用出错时 pi **不发任何 `text_delta`**，只在 `message_end` 里
                    // 带 `stopReason: "error"` + `errorMessage`。原来这里不读它 ——
                    // 于是"DeepSeek 余额不足（402）"被整条吞掉，`agent_settled` 照常到达，
                    // `finalText` 为空 → 抛 `noAnswer`，**屏幕上和日志里都看不出真正的原因**
                    //（用户报的"实时模式等一秒没输出、执行模式也没反应"就是这个）。
                    guard let message = object["message"] as? [String: Any],
                          (message["role"] as? String) == "assistant" else { continue }
                    if let stopReason = message["stopReason"] as? String, stopReason == "error" {
                        let detail = (message["errorMessage"] as? String)
                            ?? "模型调用失败（没有给出原因）"
                        throw PiAgentError.agentFailed(detail)
                    }
                    // **文本兜底**：非流式回复（或 text_delta 缺失时）文本在 `content` 里，
                    // 只收 `text_delta` 的话这种回复会被当成"没有答复"。
                    if finalText.isEmpty,
                       let parts = message["content"] as? [[String: Any]] {
                        finalText = parts.compactMap { $0["text"] as? String }.joined()
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

nonisolated enum PiAgentError: Error, CustomStringConvertible, LocalizedError {
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

    /// ⚠️ **必须实现 `errorDescription`**（2026-09-29 实测教训）：只有 `description` 时，
    /// 日志里打 `error.localizedDescription` 会显示成
    /// `The operation couldn't be completed. (Wanna.PiAgentError error 2.)`
    /// —— **完全看不出是什么错**（那次排查就因为这一行多绕了一圈）。
    var errorDescription: String? { description }
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
