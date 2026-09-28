//  menu-bar-extras-probe.swift
//
//  **量出菜单栏右侧那一排状态项各自的位置**（含系统那个"正在使用麦克风/摄像头"的指示器）。
//
//  为什么要它：用户要把"引擎倒计时"放在**那个录音指示器的左侧**，还要背景同色、视觉上连成一块
//（2026-09-28：「你测量一下，能不能定位一下刘海那个按钮在哪里？然后把它显示到它左侧，
//  他们的背景颜色是一样的……让用户觉得它是一个按钮」）。
//  那一排属于**菜单栏附加区**（extras menu bar），不在任何 App 的 AX 树里 ——
//  macos-use MCP 打开 ControlCenter 只能拿到 1 个元素 ✗，只有这个 API 读得到。
//
//  用法：`swift scripts/menu-bar-extras-probe.swift`
//  输出：每一项的 x / 宽 / 高 / 标题 / 描述（按 x 从右往左，屏幕坐标 y 向下）。

import ApplicationServices
import AppKit

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

// ⚠️ `kAXExtrasMenuBarAttribute` 要在**某个 App 元素**上读（不是 system-wide ✗ —— 第一版就是这么写的，
// 读不到任何东西）。附加区本身是全局的，但接口挂在应用元素上。
let frontmostPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
    ?? ProcessInfo.processInfo.processIdentifier
let appElement = AXUIElementCreateApplication(frontmostPID)
var extrasRaw: CFTypeRef?
let extrasError = AXUIElementCopyAttributeValue(
    appElement, kAXExtrasMenuBarAttribute as CFString, &extrasRaw)
guard extrasError == .success, let extrasRaw else {
    print("❌ 读不到菜单栏附加区（AXError=\(extrasError.rawValue)）"); exit(1)
}
let extrasBar = extrasRaw as! AXUIElement

let items = (attribute(extrasBar, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
print("菜单栏附加区共 \(items.count) 项（屏幕坐标，y 向下）：\n")
print("   x        y      宽     高    标题 / 描述")
for item in items {
    var position = CGPoint.zero
    var size = CGSize.zero
    if let p = attribute(item, kAXPositionAttribute as String) {
        AXValueGetValue(p as! AXValue, .cgPoint, &position)
    }
    if let s = attribute(item, kAXSizeAttribute as String) {
        AXValueGetValue(s as! AXValue, .cgSize, &size)
    }
    let title = (attribute(item, kAXTitleAttribute as String) as? String) ?? ""
    let description = (attribute(item, kAXDescriptionAttribute as String) as? String) ?? ""
    print("  \(Int(position.x))  \(Int(position.y))  \(Int(size.width))  \(Int(size.height))   "
          + (title.isEmpty ? "（无标题）" : title) + (description.isEmpty ? "" : " · " + description))
}
if let screen = NSScreen.screens.first {
    print("\n主屏：\(Int(screen.frame.width))×\(Int(screen.frame.height))；可见区顶边 y=\(Int(screen.frame.height - screen.visibleFrame.maxY))")
}
