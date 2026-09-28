//  ax-text-field-probe.swift
//
//  **一个能读回结果的靶子**：把网页 / Electron 里那个文本框当目标，
//  用纯 Accessibility 驱动（聚焦、读值、走菜单粘贴）—— 不依赖任何合成按键。
//
//  为什么需要它：先用终端当靶子时，我拿"发过按键了"当成了"终端真的进了 cat" ✗，
//  于是整个实验是坏的（对照实验里连 System Events 的 ⌘V 都"没落地"，说明靶子根本没准备好）。
//  这个探针的每一步都**要求一个可读回的证据**。
//
//  用法：swift scripts/ax-text-field-probe.swift focus|read|pasteMenu

import ApplicationServices
import AppKit

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

guard let frontmost = NSWorkspace.shared.frontmostApplication else { print("没有前台 App"); exit(2) }
let appElement = AXUIElementCreateApplication(frontmost.processIdentifier)

/// 深度优先找第一个 role 匹配的元素。
func firstElement(in root: AXUIElement, roles: Set<String>, depth: Int = 0) -> AXUIElement? {
    guard depth <= 25 else { return nil }
    if let role = attribute(root, kAXRoleAttribute as String) as? String, roles.contains(role) { return root }
    for child in (attribute(root, kAXChildrenAttribute as String) as? [AXUIElement]) ?? [] {
        if let hit = firstElement(in: child, roles: roles, depth: depth + 1) { return hit }
    }
    return nil
}

let command = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "read"
let textRoles: Set<String> = ["AXTextArea", "AXTextField"]

guard let field = firstElement(in: appElement, roles: textRoles) else {
    print("❌ 前台 App（\(frontmost.localizedName ?? "?")）里没找到文本区"); exit(1)
}

switch command {
case "focus":
    let error = AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    print(error == .success ? "✅ 已把焦点设到文本框" : "❌ 聚焦失败 \(error.rawValue)")
case "read":
    let value = (attribute(field, kAXValueAttribute as String) as? String) ?? ""
    print("当前内容（\(value.count) 字）：\(value)")
case "pasteMenu":
    guard let menuBar = attribute(appElement, kAXMenuBarAttribute as String) else {
        print("❌ 没有菜单栏"); exit(1)
    }
    let pasteTitles: Set<String> = ["粘贴", "Paste"]
    var found: AXUIElement?
    func scan(_ element: AXUIElement, depth: Int) {
        guard depth <= 4, found == nil else { return }
        for child in (attribute(element, kAXChildrenAttribute as String) as? [AXUIElement]) ?? [] {
            let title = (attribute(child, kAXTitleAttribute as String) as? String) ?? ""
            if pasteTitles.contains(title) { found = child; return }
            scan(child, depth: depth + 1)
            if found != nil { return }
        }
    }
    scan(menuBar as! AXUIElement, depth: 1)
    guard let pasteItem = found else { print("❌ 菜单里没有「粘贴」"); exit(1) }
    let error = AXUIElementPerformAction(pasteItem, kAXPressAction as CFString)
    print(error == .success ? "✅ 已按菜单「粘贴」" : "❌ AXPress \(error.rawValue)")
default:
    print("用法：focus|read|pasteMenu")
}
