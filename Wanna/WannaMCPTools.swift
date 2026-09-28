//
//  WannaMCPTools.swift
//  Wanna
//
//  MCP 工具的**声明**与**实现**。服务端（`WannaMCPServer`）只管协议，这里管"手能做什么"。
//
//  ## 与 mcp-server-macos-use 的根本差别：坐标系
//
//  那只手的坐标是**元素坐标**（界面树里的 x/y/w/h）；这里一律是 **0–1000 归一化网格** ——
//  就是模型看图说话时用的那套，也正是 `MacosUseController` 里已经处理好的那套。
//  两套语义混用会**点歪且不报错**，所以这里**只暴露一套**（见方案 §五）。
//
//  ## 两种「瞄准方式」都要保留（用户 2026-09-28 拍板）
//
//  用户实测："macos-use 更准，截图有时候会截偏"，并要求**两种方式都留着**，
//  放到整件事最后（方案阶段 4）由他自己测出用哪一个。所以 `click` 工具带一个
//  `targeting` 参数：
//
//    - `auto`（默认）= 现在的行为：先按名字找、找不到再坐标吸附、还不行才用裸坐标
//    - `by_name`       = 只走「按名字」，查不到就**如实报错**，绝不退到坐标
//    - `by_coordinate` = **跳过按名字**，直接走坐标那条链（②吸附 → ③裸坐标）
//
//  ⚠️ **阶段 4 出结论之前，这三层一层都不许删。** 被测对象被删掉，测试就没有意义了。
//

import Foundation

/// 工具声明与分发。`nonisolated` 的纯声明 + `@MainActor` 的执行 —— 因为执行要碰 App 内部。
nonisolated enum WannaMCPTools {

    // MARK: 声明

    /// `tools/list` 的返回。形状照 MCP 规范：name / description / inputSchema。
    static func list() -> [[String: Any]] {
        [screenshotDeclaration]
    }

    private static var screenshotDeclaration: [String: Any] {
        [
            "name": "screenshot",
            "description": """
                截取用户当前所有屏幕。返回每块屏幕的尺寸，以及**归一化坐标系**的说明：\
                所有坐标都是 0–1000 的网格（(0,0) 左上、(1000,1000) 右下），\
                点某个位置时直接给这个网格里的 x/y 即可，不需要换算成像素。\
                Wanna 自己的窗口会自动从截图里剔除，你看不到本应用自己的界面。
                """,
            // 参数按屏幕编号会用到；先留一个可选的 screen 便于将来按屏裁剪
            "inputSchema": [
                "type": "object",
                "properties": [
                    "screen": [
                        "type": "integer",
                        "description": "只截某一块屏幕（1 起）。不传 = 全部屏幕。",
                    ],
                ],
                "required": [String](),
            ],
        ]
    }

    // MARK: 执行

    /// `tools/call` 的执行入口。抛出的错误会被服务端包成 `isError: true` 的结果。
    @MainActor
    static func call(name: String, arguments: [String: Any]) async throws -> [String: Any] {
        switch name {
        case "screenshot":
            return try await screenshot(arguments: arguments)
        default:
            throw MCPToolError.unknownTool(name)
        }
    }

    // MARK: screenshot

    @MainActor
    private static func screenshot(arguments: [String: Any]) async throws -> [String: Any] {
        let captures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()
        guard !captures.isEmpty else { throw MCPToolError.failed("没有截到任何屏幕") }

        // 只要某一块屏时，按 1 起的编号过滤（与模型数屏幕的方式一致）。
        let wanted = arguments["screen"] as? Int
        let selected = wanted.map { number in
            captures.enumerated().filter { $0.offset + 1 == number }.map { $0.element }
        } ?? captures
        guard !selected.isEmpty else {
            throw MCPToolError.failed("没有第 \(wanted ?? 0) 块屏幕（一共 \(captures.count) 块）")
        }

        var content: [[String: Any]] = []
        var summaryLines: [String] = []

        for (index, capture) in selected.enumerated() {
            let number = wanted ?? (index + 1)
            summaryLines.append(
                "屏幕 \(number)：\(capture.label) · 逻辑尺寸 \(capture.displayWidthInPoints)×\(capture.displayHeightInPoints) 点"
                + " · 截图 \(capture.screenshotWidthInPixels)×\(capture.screenshotHeightInPixels) 像素"
                + (capture.isCursorScreen ? " · **鼠标在这块屏上**" : ""))
            content.append([
                "type": "image",
                "data": capture.imageData.base64EncodedString(),
                "mimeType": "image/jpeg",
            ])
        }

        summaryLines.insert(
            "坐标一律用 **0–1000 归一化网格**：(0,0) 是左上角、(1000,1000) 是右下角，"
            + "两块屏各自独立编号。请求动作时直接给这个网格的 x/y。", at: 0)

        content.insert(["type": "text", "text": summaryLines.joined(separator: "\n")], at: 0)
        return ["content": content, "isError": false]
    }
}

// MARK: - 错误

/// 工具自己报的错。服务端会把它包成 `isError: true` 的结果（协议层没错）。
nonisolated enum MCPToolError: Error, CustomStringConvertible {
    case unknownTool(String)
    case failed(String)

    var description: String {
        switch self {
        case .unknownTool(let name): return "没有这个工具：\(name)"
        case .failed(let why): return why
        }
    }
}
