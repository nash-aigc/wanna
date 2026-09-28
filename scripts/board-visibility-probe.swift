//  board-visibility-probe.swift
//
//  「右上角那块看板此刻在不在屏上」—— 一个只读的探针，给流程脚本用。
//
//  为什么要它：看板的显隐出过好几次问题（"进 agent 模式了它还在"、"退出了它还粘在鼠标上"），
//  而那几次的共同点是 **判据变了却没人重新判**。眼睛看截图只能说"我看到了"，不能当判据 ——
//  这个探针给的是 `CGWindowListCopyWindowInfo` 里那个窗口在不在、矩形是多少。
//
//  用法：`swift scripts/board-visibility-probe.swift <pid>`
//  输出：`board=VISIBLE frame=x,y,w,h` 或 `board=HIDDEN`
//
//  ⚠️ **判据用"宽度 ≈ 700"认那块板**（7 字形 = 横杠 360 + 竖条 340）：
//  同一个进程还有全屏覆盖层（1728）、录音带面板（490）、transcript 面板（718）、
//  摄像头小窗（190），只有看板是 700 宽。

import AppKit
import CoreGraphics

let arguments = CommandLine.arguments
guard arguments.count > 1, let targetPID = Int(arguments[1]) else {
    print("用法：swift board-visibility-probe.swift <pid>")
    exit(2)
}

// 判据只有一条：**它此刻在不在屏上**。
//
// ⚠️ 第一版这里写的是 `.optionAll`（"所有窗口，含隐藏的"）—— 那会让一个"存在但没显示"
// 的面板也算 VISIBLE。当前实现里 `hide()` 会把面板对象置空，两种写法结果一样，
// 但那是实现细节，不是判据：**"在不在屏上"就该用 `.optionOnScreenOnly` + `kCGWindowIsOnscreen`**。
let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
var boardFrame: CGRect?
for window in windowList {
    guard let isOnScreen = window[kCGWindowIsOnscreen as String] as? Bool, isOnScreen,
          let ownerPID = window[kCGWindowOwnerPID as String] as? Int, ownerPID == targetPID,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          let width = bounds["Width"] as? Double, abs(width - 700) < 8,
          let height = bounds["Height"] as? Double, height > 40 else { continue }
    boardFrame = CGRect(x: bounds["X"] as? Double ?? 0,
                        y: bounds["Y"] as? Double ?? 0,
                        width: width, height: height)
    break
}

if let boardFrame {
    print(String(format: "board=VISIBLE frame=%.0f,%.0f,%.0f,%.0f",
                 boardFrame.minX, boardFrame.minY, boardFrame.width, boardFrame.height))
} else {
    print("board=HIDDEN")
}
