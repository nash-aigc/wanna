//  ax-menu-paste-probe.swift
//
//  **让前台 App 自己执行「粘贴」**——走它的菜单 Edit ▸ Paste（AX 的 `kAXPressAction`），
//  而不是合成一次 ⌘V。
//
//  为什么值得试：实测（2026-09-28）本进程**合成的键盘事件落不到前台 App**
// （⌘V、连裸字符都进不去；同一份投递代码从终端进程发却能落地），
//  而往聚焦元素写 `kAXSelectedTextAttribute` 在**终端 / Electron 编辑器**里
//  **回报成功却什么都没做** ✗。菜单这条路两边的优点都有：
//  它是一个 **AX 动作**（不需要合成按键），而执行者是**目标 App 自己**（走它自己的粘贴实现，
//  终端、Electron、原生控件都认）。
//
//  用法：`swift scripts/ax-menu-paste-probe.swift`（先把要粘的文字放进剪贴板）
//  输出：找到的菜单项标题 + `AXPress` 的返回码。

import ApplicationServices
import AppKit

guard let frontmost = NSWorkspace.shared.frontmostApplication else {
    print("没有前台 App"); exit(2)
}
print("前台 App：\(frontmost.localizedName ?? "?")（pid \(frontmost.processIdentifier)）")
if NSPasteboard.general.string(forType: .string) == nil {
    print("⚠️ 剪贴板里没有文字 —— 这个探针不会自己写剪贴板"); exit(2)
}

let appElement = AXUIElementCreateApplication(frontmost.processIdentifier)

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

guard let menuBar = attribute(appElement, kAXMenuBarAttribute as String) else {
    print("❌ 这个 App 没有暴露菜单栏"); exit(1)
}
let menuBarElement = menuBar as! AXUIElement

// 菜单是四层：菜单栏 → 菜单栏项 → 菜单 → 菜单项（二级菜单再往下一层）。
// 写死层数容易漏，所以用**有上限的递归**，并把看过的标题打出来（找不到时要能看出为什么）。
func children(of element: AXUIElement) -> [AXUIElement] {
    (attribute(element, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
}
func title(of element: AXUIElement) -> String {
    (attribute(element, kAXTitleAttribute as String) as? String) ?? ""
}

let pasteTitles: Set<String> = ["粘贴", "Paste", "Paste and Match Style", "粘贴并匹配样式"]

var found: AXUIElement?
var foundTitle = ""
var seenTitles: [String] = []

func scan(_ element: AXUIElement, depth: Int) {
    guard depth <= 4, found == nil else { return }
    for child in children(of: element) {
        let childTitle = title(of: child)
        if !childTitle.isEmpty { seenTitles.append(String(repeating: "  ", count: depth) + childTitle) }
        if pasteTitles.contains(childTitle) { found = child; foundTitle = childTitle; return }
        scan(child, depth: depth + 1)
        if found != nil { return }
    }
}

scan(menuBarElement, depth: 1)

guard let pasteItem = found else {
    print("❌ 菜单里没找到「粘贴 / Paste」。看到过的标题（前 40 个）：")
    for line in seenTitles.prefix(40) { print("   \(line)") }
    exit(1)
}
print("找到菜单项：「\(foundTitle)」")

let pressError = AXUIElementPerformAction(pasteItem, kAXPressAction as CFString)
print(pressError == .success ? "✅ AXPress 返回 success" : "❌ AXPress 返回 \(pressError.rawValue)")
exit(pressError == .success ? 0 : 1)
