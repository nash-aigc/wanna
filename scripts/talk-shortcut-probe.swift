//  talk-shortcut-probe.swift
//
//  **按一下"用户自己那条"说话快捷键**（按下 / 松开）。
//
//  为什么不能写死 ⌃⌥（2026-09-28 踩到）：用户**自己录过一条**快捷键，而
//  `pushToTalkShortcutBinding` 的规矩是"录过的赢过预设"—— 他机器上是
//  **⌘⌥⇧ + K**（`customPushToTalkShortcut = {keyCode: 40, modifierFlagsRawValue: 1703936}`）。
//  拿预设的 ⌃⌥ 去驱动，探针会以为"按键没反应"，其实按的是他从来不用的那颗键。
//  所以这里**先从设置里读出他真正在用的组合**，再照着发 —— 这才叫"模仿用户的真实操作"。
//
//  用法：`swift scripts/talk-shortcut-probe.swift press` / `release`

import AppKit
import CoreGraphics
import Foundation

let settingsURL = FileManager.default
    .homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/Wanna/AppSettings.json")

/// 按下的顺序：先修饰键（逐个 flagsChanged 累加），最后才是那个键。
func modifierKeyCodes(for flags: CGEventFlags) -> [(CGKeyCode, CGEventFlags)] {
    var accumulated: CGEventFlags = []
    var sequence: [(CGKeyCode, CGEventFlags)] = []
    if flags.contains(.maskControl) { accumulated.insert(.maskControl); sequence.append((59, accumulated)) }
    if flags.contains(.maskAlternate) { accumulated.insert(.maskAlternate); sequence.append((58, accumulated)) }
    if flags.contains(.maskShift) { accumulated.insert(.maskShift); sequence.append((56, accumulated)) }
    if flags.contains(.maskCommand) { accumulated.insert(.maskCommand); sequence.append((55, accumulated)) }
    return sequence
}

// 读他录的那条；没有就退回预设（⌃⌥，无 keyCode）。
var boundKeyCode: CGKeyCode?
var boundFlags: CGEventFlags = [.maskControl, .maskAlternate]
if let data = try? Data(contentsOf: settingsURL),
   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
   let custom = json["customPushToTalkShortcut"] as? [String: Any] {
    if let rawKeyCode = custom["keyCode"] as? Int, rawKeyCode >= 0 { boundKeyCode = CGKeyCode(rawKeyCode) }
    if let rawFlags = custom["modifierFlagsRawValue"] as? Int {
        // CGEventFlags 没有 deviceIndependentFlagsMask（那是 NSEvent 的常数）——
        // 手工去掉 CapsLock / Fn 这类跟组合无关的位。
        let deviceIndependent: CGEventFlags = [.maskControl, .maskAlternate, .maskShift, .maskCommand]
        boundFlags = CGEventFlags(rawValue: UInt64(rawFlags)).intersection(deviceIndependent)
    }
}

guard let source = CGEventSource(stateID: .hidSystemState) else { print("造不出事件源"); exit(1) }
let action = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "press"
let modifiers = modifierKeyCodes(for: boundFlags)

if action == "press" {
    for (keyCode, flags) in modifiers {
        let event = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)!
        event.flags = flags
        event.post(tap: .cghidEventTap)
        usleep(50_000)
    }
    if let boundKeyCode {
        let down = CGEvent(keyboardEventSource: source, virtualKey: boundKeyCode, keyDown: true)!
        down.flags = boundFlags
        down.post(tap: .cghidEventTap)
        usleep(50_000)
    }
} else {
    if let boundKeyCode {
        let up = CGEvent(keyboardEventSource: source, virtualKey: boundKeyCode, keyDown: false)!
        up.flags = boundFlags
        up.post(tap: .cghidEventTap)
        usleep(50_000)
    }
    for (keyCode, flags) in modifiers.reversed() {
        let event = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)!
        event.flags = flags.subtracting([.maskControl, .maskAlternate, .maskShift, .maskCommand])
        event.post(tap: .cghidEventTap)
        usleep(50_000)
    }
}
print("talk shortcut \(action)：keyCode=\(boundKeyCode.map(String.init) ?? "无") flags=\(boundFlags.rawValue)")
