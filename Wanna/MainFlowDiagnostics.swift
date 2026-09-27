//
//  MainFlowDiagnostics.swift
//  Wanna
//
//  **主 Agent 这条语音链的诊断日志**（2026-09-27 新建）。
//
//  ## 为什么要有它
//
//  用户报：「连续问很多问题，到第六轮、第七轮就出现了卡死……**语音识别这块好像卡死**，
//  字幕这块不显示任何内容了，我说什么话都不显示了，问它问题它也不回复，整个界面也没有任何变化」。
//  然后他说：「你可以看一下刚才的记录，应该能够看到完整的记录」——
//  **可是那条路一个字都没落盘。** `print` 在双击启动的 App 里进不了任何地方
//（既不是终端，也不在统一日志里），所以那句话我没法回答，只能靠猜。
//
//  这个仓库为"录音录出来全是零"那件事立过一条规矩：
//  **发现故障的位置必须从用户手里挪到机器手里**（见 `开发经验/15-录音采集与设备自愈.md`）。
//  长录音那条路因此有了 `录音诊断.log` 与两条探针；**主 Agent 这条一直没有**，
//  而它的故障形状是一样的：**静默**——屏幕不动、没有报错、没有崩溃，只有用户能撞见。
//
//  ## 它记什么（三样，都是为了把"卡死"切成可判定的几段）
//
//  1. **音频还在不在**：连续监听期间每 2 秒一行 `块数/2s + 峰值`。这一行直接三分：
//     0 块 = tap 没了（引擎/设备那一层）；有块但峰值恒为 0 = 设备哑了（跨进程那一层）；
//     有块有峰值 = 音频**到得了**，故障在下游（识别会话/网络）。
//  2. **识别会话的生命周期**：开、首块、定稿、出错、重连，各一行。
//  3. **主线程有没有被占住**：一个后台看门狗每 1 秒往主队列投一次，往返超过 2 秒就记一行
//     **带上当时的阶段标记**（`stage`）。「界面没有任何变化」有两种完全不同的成因 ——
//     主线程被堵住（什么都刷不出来）与各条链各自停摆（主线程是空的）—— 这一行是判据。
//
//  ## 分寸
//
//  · **只写文件、绝不在主线程上做 IO**：`log` 把行丢进一条串行队列，调用方（哪怕是渲染线程）
//    只是入队，不等待。
//  · **不刷屏**：只有上面那三样会写，且都有节流（音频那行 2 秒一次、心跳 30 秒一次）。
//  · **文件有上限**：超过 2MB 就轮转成 `.1`，只留一份旧的 —— 它是排查用的，不是账本。
//  · 它**不改变任何行为**（除了看门狗那次主队列往返，代价是一次空 block）。
//

import Foundation

/// 主 Agent 语音链的诊断日志 + 主线程看门狗。
nonisolated enum MainFlowDiagnostics {

    /// 文件路径（给人看的正式位置，不在临时目录里）。
    static var logFileURL: URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Wanna", isDirectory: true)
            .appendingPathComponent("主Agent诊断.log")
    }

    private static let queue = DispatchQueue(label: "wanna.main-flow-diagnostics", qos: .utility)
    private static let lock = NSLock()
    /// **当时的阶段标记** —— 看门狗报"主线程被占住"时要把这个一起写进去，否则只知道堵了、不知道堵在哪。
    private static var _stage: String = "（未标记）"

    /// 标记"现在这一步"（在耗时步骤的入口设、出口清）。轻量，随便调。
    static func stage(_ value: String) {
        lock.lock()
        _stage = value
        lock.unlock()
    }

    static var currentStage: String {
        lock.lock()
        defer { lock.unlock() }
        return _stage
    }

    /// 写一行。**纯入队，不阻塞调用方**（可以在渲染线程上放心调）。
    static func log(_ message: String) {
        let stamp = Self.timestampFormatter.string(from: Date())
        let line = "[\(stamp)] \(message)\n"
        queue.async {
            append(line)
        }
    }

    private static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM-dd HH:mm:ss.SSS"
        return formatter
    }()

    private static var didLogFileHeader = false

    private static func append(_ line: String) {
        let url = logFileURL
        let fileManager = FileManager.default
        try? fileManager.createDirectory(at: url.deletingLastPathComponent(),
                                         withIntermediateDirectories: true)
        if !didLogFileHeader {
            didLogFileHeader = true
            let header = "\n===== 主 Agent 诊断（新的一次启动）=====\n"
            if let handle = try? FileHandle(forWritingTo: url) {
                handle.seekToEndOfFile()
                handle.write(Data(header.utf8))
                try? handle.close()
            } else {
                try? Data(header.utf8).write(to: url)
            }
        }
        rotateIfNeeded(url: url)
        guard let data = line.data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: url)
        }
    }

    /// 超过 2MB 就轮转（只留一份旧的）。
    private static func rotateIfNeeded(url: URL) {
        let limit = 2 * 1024 * 1024
        guard let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int,
              size > limit else { return }
        let old = url.deletingPathExtension().appendingPathExtension("1.log")
        try? FileManager.default.removeItem(at: old)
        try? FileManager.default.moveItem(at: url, to: old)
    }

    // MARK: - 主线程看门狗

    private static var watchdogTimer: DispatchSourceTimer?

    /// **主线程被占住的判据**：一个后台队列每 1 秒往主队列投一次，量往返时间。
    ///
    /// 它回答的是「界面没有任何变化」到底属于哪一种：主线程被堵住（什么都刷不出来），
    /// 还是主线程闲着、各条链各自停摆。用户的两种说法（"软件没卡死" / "界面没有任何变化"）
    /// 正好分别对应这两种，所以必须能分辨。
    static func startMainThreadWatchdog(thresholdSeconds: Double = 2.0) {
        guard watchdogTimer == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 5, repeating: 1.0)
        timer.setEventHandler {
            let sent = Date()
            DispatchQueue.main.async {
                let roundTrip = Date().timeIntervalSince(sent)
                guard roundTrip > thresholdSeconds else { return }
                log(String(format: "⚠️ 主线程被占住 %.2f 秒（当时的阶段：%@）",
                           roundTrip, currentStage))
            }
        }
        timer.resume()
        watchdogTimer = timer
        log("🩺 主 Agent 诊断已启动（看门狗阈值 \(thresholdSeconds) 秒）；日志：\(logFileURL.path)")
    }

    // MARK: - 音频那一路的节流心跳

    private static var audioWindowStart = Date()
    private static var audioBlocksInWindow = 0
    private static var audioPeakInWindow: Float = 0

    /// 音频 tap 每来一块就调一次（**在采集线程上**，所以这里只做几个算术）。
    ///
    /// 每 2 秒落一行：`音频：N 块/2s 峰值 x.xxx`。这一行是"卡死"的第一判据 ——
    /// 0 块、有块但全零、有块有峰值，对应三种完全不同的故障层。
    static func noteAudioBuffer(peak: Float) {
        lock.lock()
        audioBlocksInWindow += 1
        audioPeakInWindow = max(audioPeakInWindow, peak)
        let elapsed = Date().timeIntervalSince(audioWindowStart)
        guard elapsed >= 2 else { lock.unlock(); return }
        let blocks = audioBlocksInWindow
        let peakValue = audioPeakInWindow
        audioBlocksInWindow = 0
        audioPeakInWindow = 0
        audioWindowStart = Date()
        lock.unlock()
        log(String(format: "🎤 音频：%d 块/%.1fs 峰值 %.3f", blocks, elapsed, peakValue))
    }

    /// 一段音频/一场录音结束 → 把窗口里剩下的也写出去（不然最后不到 2 秒的那点会被吞掉）。
    static func flushAudioHeartbeat() {
        lock.lock()
        let blocks = audioBlocksInWindow
        let peakValue = audioPeakInWindow
        let elapsed = Date().timeIntervalSince(audioWindowStart)
        audioBlocksInWindow = 0
        audioPeakInWindow = 0
        audioWindowStart = Date()
        lock.unlock()
        guard blocks > 0 else { return }
        log(String(format: "🎤 音频（收尾）：%d 块/%.1fs 峰值 %.3f", blocks, elapsed, peakValue))
    }
}
