//  board-shortcut-probe.swift
//
//  **发一下看板的那两下回车**（⌥⏎ 执行 / ⌘⏎ 粘贴）。
//
//  为什么要它：这两位是**看板自己的全局 tap 接住的**（不是某条快捷键绑定），
//  所以 `talk-shortcut-probe` 那套（读设置里的绑定）在这里用不上。
//  而"粘贴到底有没有落到用户的光标处"这件事只能自己走一遍 ——
//  用户 2026-09-28 报的正是这一条（Zed 能粘、Notion / Orca 不能）。
//
//  用法：`swift scripts/board-shortcut-probe.swift commandReturn|optionReturn`
//  —— `commandReturn` = ⌘⏎（粘贴并退出），`optionReturn` = ⌥⏎（执行，转 agent）。

import CoreGraphics
import Foundation

let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "commandReturn"
let source = CGEventSource(stateID: .hidSystemState)

// keyCode 36 = Return；55 = Command；58 = Option。
// 顺序：先修饰键（flagsChanged 累加），再回车；松开时反过来。
let modifierKeyCode: CGKeyCode
switch mode {
case "optionReturn": modifierKeyCode = 58
default:             modifierKeyCode = 55
}

let modifierDown = CGEvent(keyboardEventSource: source, virtualKey: modifierKeyCode, keyDown: true)!
modifierDown.post(tap: .cghidEventTap)
usleep(20_000)

let returnDown = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true)!
returnDown.flags = (mode == "optionReturn") ? .maskAlternate : .maskCommand
returnDown.post(tap: .cghidEventTap)
usleep(20_000)

let returnUp = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false)!
returnUp.flags = returnDown.flags
returnUp.post(tap: .cghidEventTap)
usleep(20_000)

let modifierUp = CGEvent(keyboardEventSource: source, virtualKey: modifierKeyCode, keyDown: false)!
modifierUp.post(tap: .cghidEventTap)

print("已发送：\(mode == "optionReturn" ? "⌥⏎" : "⌘⏎")")
