//  notch-state-word-probe.swift
//
//  **读刘海左翼那行状态词**（Listening / Starting / Thinking……）。
//  判据来自 AX 树（和这个仓库以前验状态词同一条路），不猜、不截图目测。
//
//  用法：`swift scripts/notch-state-word-probe.swift <pid>`
//  为什么要它：MCP 的一次遍历要几秒，而 `Starting` 只存在 1.5 秒左右 ✗ ——
//  它必须毫秒级（本进程直接问 AX）。
import ApplicationServices
import AppKit

guard CommandLine.arguments.count > 1, let pid = Int32(CommandLine.arguments[1]) else {
    print("用法：notch-state-word-probe.swift <pid>"); exit(2)
}
/// 状态词就那么几个（见 `NotchActivityPhase.notchStateWord`）。
let knownWords: Set<String> = ["Listening", "Starting", "Thinking", "Speaking", "Typing…", "Connecting", "Call"]

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func findStateWords(in element: AXUIElement, depth: Int = 0, into found: inout [String]) {
    guard depth <= 40 else { return }
    if let value = attribute(element, kAXValueAttribute as String) as? String, knownWords.contains(value) {
        found.append(value)
    }
    for child in (attribute(element, kAXChildrenAttribute as String) as? [AXUIElement]) ?? [] {
        findStateWords(in: child, depth: depth + 1, into: &found)
    }
}
var found: [String] = []
findStateWords(in: AXUIElementCreateApplication(pid), into: &found)
print(found.isEmpty ? "（没读到状态词）" : found.joined(separator: " / "))
