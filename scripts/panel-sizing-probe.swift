//
//  panel-sizing-probe.swift
//  独立最小复现：`NSPanel(.borderless + .nonactivatingPanel)` + `NSHostingView`，
//  `setFrame` 之后窗口会不会被 AppKit 自己改掉。
//
//  背景（2026-09-27）：任务方向看板的面板算好了位置（左下角钉在鼠标旁），可 0.7 秒后
//  窗口自己挪到了另一个位置的另一个尺寸 —— 卡片下沿被切在屏幕外面。
//  这个探针把那一幕从 App 里剥出来，逐个变量试（sizingOptions / autoresizingMask / 内容改高）。
//
//  跑法：swift scripts/panel-sizing-probe.swift
//

import AppKit
import SwiftUI

let variant = ProcessInfo.processInfo.environment["PROBE_VARIANT"] ?? "emptySizing"
print("探针变量：\(variant)")

final class ProbeView: ObservableObject {
    @Published var extraHeight: CGFloat = 0
}

struct ProbeContentView: View {
    @ObservedObject var model: ProbeView
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("面板内容")
            Rectangle().fill(Color.blue).frame(height: 40)
            Rectangle().fill(Color.green).frame(height: model.extraHeight)
        }
        .padding(10)
        .frame(width: 400, alignment: .leading)
        .background(Color.gray.opacity(0.3))
    }
}

final class Delegate: NSObject, NSApplicationDelegate {
    var panel: NSPanel!
    var hosting: NSHostingView<ProbeContentView>!
    let model = ProbeView()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 400, height: 160),
                            styleMask: [.borderless, .nonactivatingPanel],
                            backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.becomesKeyOnlyIfNeeded = true

        let hosting = NSHostingView(rootView: ProbeContentView(model: model))
        switch variant {
        case "emptySizing":
            hosting.sizingOptions = []
        case "emptySizingPlusMask":
            hosting.sizingOptions = []
            hosting.autoresizingMask = [.width, .height]
        case "defaultSizing":
            break   // 什么都不设（`.standardBounds` 默认）
        default:
            hosting.sizingOptions = []
        }
        panel.contentView = hosting
        self.hosting = hosting
        self.panel = panel

        // 摆在屏幕中下部（和看板一样的"左下角 + 12"锚定），先按保守高度 160 摆一次。
        let screen = NSScreen.main!
        let anchor = CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.minY + 120)
        func place(height: CGFloat, tag: String) {
            let frame = CGRect(x: anchor.x + 12, y: anchor.y + 12, width: 400, height: height)
            panel.setFrame(frame, display: true)
            print("\(tag) 放了 AppKit \(Int(frame.minX)),\(Int(frame.minY)) \(Int(frame.width))×\(Int(frame.height))"
                  + " → 立刻回读 \(Int(panel.frame.minX)),\(Int(panel.frame.minY))"
                  + " \(Int(panel.frame.width))×\(Int(panel.frame.height))")
        }
        panel.orderFrontRegardless()
        place(height: 160, tag: "t=0.0s")

        // 内容长高（模拟 AI 那段理解回来之后卡片变高）。
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.model.extraHeight = 120
            place(height: 280, tag: "t=1.0s（内容长高后重新摆）")
        }
        // 之后每 0.5 秒回读一次，看还有没有人动它。
        for step in 1...6 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 + Double(step) * 0.5) {
                print("  回读 \(step)（t=\(String(format: "%.1f", 1.0 + Double(step) * 0.5))s）"
                      + " frame=\(Int(self.panel.frame.minX)),\(Int(self.panel.frame.minY))"
                      + " \(Int(self.panel.frame.width))×\(Int(self.panel.frame.height))"
                      + " fitting=\(Int(self.hosting.fittingSize.width))×\(Int(self.hosting.fittingSize.height))")
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
            print("探针结束")
            NSApp.terminate(nil)
        }
    }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
