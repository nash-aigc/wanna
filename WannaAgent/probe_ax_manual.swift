// 探针：Chromium 内核的 App 默认藏起界面树，但可以用 AXManualAccessibility 要求它打开。
//
// 背景：网易云音乐用的是 Chromium Embedded Framework（CEF），这类 App 出于性能考虑
// **默认不构建**无障碍树 —— 所以辅助功能读过去是"窗口内容 0 个元素"。
// WebKit/Chromium 都留了一个开关：往 App 的 AX 元素上设 `AXManualAccessibility = true`，
// 它会开始构建并暴露界面树。这个开关是**每个进程一次**的。
//
// 跑法：xcrun swift probe_ax_manual.swift <bundle-id>
// 判据：设之前 / 设之后，各读一次元素数量。

import AppKit
import ApplicationServices
import Foundation

func elementCount(pid: pid_t, depth: Int = 0) -> Int {
    guard depth < 12 else { return 0 }
    let app = AXUIElementCreateApplication(pid)
    var total = 0
    var stack: [(AXUIElement, Int)] = [(app, 0)]
    while let (element, level) = stack.popLast() {
        guard level < 12 else { continue }
        var childrenRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
              let children = childrenRef as? [AXUIElement] else { continue }
        total += children.count
        for child in children { stack.append((child, level + 1)) }
    }
    return total
}

let bundleID = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "com.netease.163music"

guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else {
    print("  ✗ \(bundleID) 没在运行 —— 先把它打开")
    exit(1)
}

let pid = app.processIdentifier
print("  App: \(app.localizedName ?? "?") · pid \(pid)")
print("  设之前，界面树元素数：\(elementCount(pid: pid))")

let axApp = AXUIElementCreateApplication(pid)
let result = AXUIElementSetAttributeValue(
    axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue)

print("  设置 AXManualAccessibility → \(result == .success ? "成功" : "失败（\(result.rawValue)）")")
print("  等 2 秒让它把树建起来…")
Thread.sleep(forTimeInterval: 2.0)
print("  设之后，界面树元素数：\(elementCount(pid: pid))")

// 顺便看一眼现在能读到什么（前 6 个有名字的）
func firstNamed(pid: pid_t, limit: Int) -> [String] {
    let appElement = AXUIElementCreateApplication(pid)
    var out: [String] = []
    var stack: [(AXUIElement, Int)] = [(appElement, 0)]
    while let (element, level) = stack.popLast(), out.count < limit {
        guard level < 6 else { continue }
        var roleRef: CFTypeRef?
        var titleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef)
        AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef)
        let role = (roleRef as? String) ?? "?"
        let title = (titleRef as? String) ?? ""
        if !title.isEmpty, role != "AXMenuBar", role != "AXMenuBarItem" {
            out.append("\(role) \"\(title.prefix(40))\"")
        }
        var childrenRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
           let children = childrenRef as? [AXUIElement] {
            for child in children { stack.append((child, level + 1)) }
        }
    }
    return out
}

let named = firstNamed(pid: pid, limit: 8)
if named.isEmpty {
    print("  仍然读不到任何有名字的控件")
} else {
    print("  现在读到的有名字控件：")
    for line in named { print("    · \(line)") }
}
