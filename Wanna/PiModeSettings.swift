//
//  PiModeSettings.swift
//  Wanna
//
//  ⭐ **两个 Pi 进程各自的模型配置**（2026-09-29 用户定）：
//
//  · **实时进程**：思考**关**、要快 —— 结果显示在鼠标右下角的卡片；
//  · **执行进程**：思考**开**（默认）—— 让它真正高效地解决问题。
//
//  两者的模型 id 都可配（设置 → Agent → 「Pi 模型」），当前默认都是
//  `deepseek-official/deepseek-flash`（用户："方便用户调试嘛，未来可以让用户手动去设置"）。
//
//  ## 刻意不做的事
//
//  · **思考开关不给 UI**：实时强制 off、执行强制 on —— 这是这次设计的前提
//   （"一个要快、一个要想"），不是用户偏好，所以不给关掉它的入口。
//  · **url / api key 的独立配置暂不做**：pi 的供应商配置住在 `~/.pi/agent/models.json`
//   （官方位置），App 侧再做一份必然漂。等用户真的要给执行进程换供应商时，
//   把那份配置的读写接进设置页 —— 那时做的是"接线"，不是新设计。
//
//  形状照其它设置 store（`nonisolated` + `NSLock` + 原子写后补 0600 + 变更通知）。
//

import Foundation

nonisolated struct PiModeSettings: Codable, Equatable {
    /// 实时进程的模型 id（`provider/模型`，两个名字都要对 —— 见 `PiAgentRunner` 注释里那次事故）。
    var realtimeModelID: String = "deepseek-official/deepseek-flash"
    /// 执行进程的模型 id。
    var executeModelID: String = "deepseek-official/deepseek-flash"

    /// ⭐ **思考开关**（2026-09-29 用户：「每一个模式……它的思考都可以开或关。
    /// 现在做成了默认，默认状态是正确的，但**应该让用户可以选择**」）。
    /// 默认就是两个进程各自的默认（实时关 = 快、执行开 = 想得清楚），但**可以改**。
    var realtimeThinkingEnabled: Bool = false
    var executeThinkingEnabled: Bool = true

    func thinkingEnabled(for role: PiAgentRunner.ProcessRole) -> Bool {
        switch role {
        case .realtime: return realtimeThinkingEnabled
        case .execute: return executeThinkingEnabled
        }
    }

    func modelID(for role: PiAgentRunner.ProcessRole) -> String {
        switch role {
        case .realtime: return realtimeModelID
        case .execute: return executeModelID
        }
    }

    /// 解不出来的字段逐个回落默认（规则 E1：旧文件缺键不许让整份设置解不出来）。
    init() {}

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        realtimeModelID = try container.decodeIfPresent(String.self, forKey: .realtimeModelID)
            ?? Self().realtimeModelID
        executeModelID = try container.decodeIfPresent(String.self, forKey: .executeModelID)
            ?? Self().executeModelID
        realtimeThinkingEnabled = try container.decodeIfPresent(Bool.self, forKey: .realtimeThinkingEnabled)
            ?? Self().realtimeThinkingEnabled
        executeThinkingEnabled = try container.decodeIfPresent(Bool.self, forKey: .executeThinkingEnabled)
            ?? Self().executeThinkingEnabled
    }
}

nonisolated final class PiModeSettingsStore {
    static let shared = PiModeSettingsStore()

    static let didChangeNotification = Notification.Name("wannaPiModeSettingsDidChange")

    private var fileURL: URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home.appendingPathComponent("Library/Application Support/Wanna/PiModeSettings.json")
    }

    private let lock = NSLock()
    private var cache: PiModeSettings?

    private init() {}

    func snapshot() -> PiModeSettings {
        lock.lock()
        if let cache { lock.unlock(); return cache }
        lock.unlock()
        let loaded = loadFromDisk()
        lock.lock()
        cache = loaded
        lock.unlock()
        return loaded
    }

    func save(_ settings: PiModeSettings) {
        lock.lock()
        cache = settings
        lock.unlock()
        let url = fileURL
        if let data = try? JSONEncoder().encode(settings) {
            try? data.write(to: url, options: .atomic)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        }
        NotificationCenter.default.post(name: Self.didChangeNotification, object: nil)
    }

    private func loadFromDisk() -> PiModeSettings {
        guard let data = try? Data(contentsOf: fileURL),
              let settings = try? JSONDecoder().decode(PiModeSettings.self, from: data) else {
            return PiModeSettings()
        }
        return settings
    }
}
