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
//  由他自己测出用哪一个。所以 `click` 带一个 `targeting` 参数：
//
//    - `auto`（默认）= 加这个参数之前的全部行为：①按名字 → ②坐标吸附 → ③估算点
//    - `by_name`       = **只走 ①**，查不到就**如实失败**，绝不退到坐标
//    - `by_coordinate` = **跳过 ①**，直接走 ② → ③
//
//  ⚠️ **出结论之前，这三层一层都不许删。** 被测对象被删掉，测试就没有意义了。
//

import Foundation

/// 工具声明与分发。声明是 `nonisolated` 的纯数据；执行要碰 App 内部，所以是 `@MainActor`。
nonisolated enum WannaMCPTools {

    // MARK: - 声明

    /// `tools/list` 的返回。形状照 MCP 规范：name / description / inputSchema。
    static func list() -> [[String: Any]] {
        [screenshotDeclaration, clickDeclaration, typeTextDeclaration,
         pressKeyDeclaration, scrollDeclaration, openAppDeclaration, readScreenDeclaration,
         setValueDeclaration, pressAXDeclaration, setSelectedDeclaration,
         pointDeclaration, drawDeclaration]
    }

    /// 坐标参数的措辞，七处重复所以抽出来 —— 它必须**逐字一致**，
    /// 否则模型对同一套网格会读到两种说法。
    private static let coordinateNote =
        "坐标用 **0–1000 归一化网格**：(0,0) 左上角、(1000,1000) 右下角。不要换算成像素。"

    private static func coordinateProperties() -> [String: Any] {
        [
            "x": ["type": "number", "description": "网格里的横坐标（0–1000）。\(coordinateNote)"],
            "y": ["type": "number", "description": "网格里的纵坐标（0–1000）。"],
            "screen": ["type": "integer", "description": "第几块屏幕（1 起）。不传 = 鼠标所在的那块。"],
        ]
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
            "inputSchema": [
                "type": "object",
                "properties": [
                    "screen": ["type": "integer",
                               "description": "只截某一块屏幕（1 起）。不传 = 全部屏幕。"],
                ],
                "required": [String](),
            ],
        ]
    }

    private static var clickDeclaration: [String: Any] {
        var properties = coordinateProperties()
        properties["label"] = [
            "type": "string",
            "description": """
                你要点的控件的**原文名字**（例如「7」「发送」「关闭」）。\
                写了它 Wanna 会去界面树里按名字找那个控件的真实位置，比坐标准得多；\
                不写就只能用你估的坐标，而估的坐标实测误差可达 ±25% 屏宽。**尽量写。**
                """,
        ]
        properties["targeting"] = [
            "type": "string",
            "enum": ["auto", "by_name", "by_coordinate"],
            "description": """
                用哪种方式瞄准。默认 auto。
                · auto = 先按名字找，找不到再按坐标吸附，还不行才用你估的坐标
                · by_name = **只用名字**，找不到就如实失败（不会退到坐标）
                · by_coordinate = **只用坐标**（跳过按名字）
                这是在对比两种方式的准确率时才需要传，日常用 auto。
                """,
        ]
        properties["kind"] = [
            "type": "string", "enum": ["left", "right", "double"],
            "description": "点击类型，默认 left。",
        ]
        return [
            "name": "click",
            "description": "在屏幕上点击一个位置。\(coordinateNote)",
            "inputSchema": [
                "type": "object",
                "properties": properties,
                "required": ["x", "y"],
            ],
        ]
    }

    private static var typeTextDeclaration: [String: Any] {
        [
            "name": "type_text",
            "description": "把一段文字打进**当前聚焦**的输入框。要用之前先确保焦点在正确的位置。",
            "inputSchema": [
                "type": "object",
                "properties": ["text": ["type": "string", "description": "要输入的文字。"]],
                "required": ["text"],
            ],
        ]
    }

    private static var pressKeyDeclaration: [String: Any] {
        [
            "name": "press_key",
            "description": "按一个键，可带修饰键（例如回车、Tab、Escape、上下左右）。",
            "inputSchema": [
                "type": "object",
                "properties": [
                    "key": ["type": "string", "description": "键名，例如 return / tab / escape / up / a"],
                    "modifiers": [
                        "type": "array", "items": ["type": "string"],
                        "description": "修饰键，可多选：command / shift / option / control",
                    ],
                ],
                "required": ["key"],
            ],
        ]
    }

    private static var scrollDeclaration: [String: Any] {
        var properties = coordinateProperties()
        properties["x"] = ["type": "number", "description": "在哪个位置滚（网格 0–1000）。"]
        properties["direction"] = ["type": "string", "enum": ["up", "down"],
                                   "description": "往上还是往下滚。"]
        properties["steps"] = ["type": "integer", "description": "滚几格，默认 3。"]
        return [
            "name": "scroll",
            "description": "在一个位置滚动页面或列表。",
            "inputSchema": [
                "type": "object",
                "properties": properties,
                "required": ["x", "y", "direction"],
            ],
        ]
    }

    private static var openAppDeclaration: [String: Any] {
        [
            "name": "open_app",
            "description": "打开或激活一个应用。**名字要用 bundle id**（例如 com.apple.calculator、"
                           + "com.apple.finder）—— 传英文名会报「找不到应用」。",
            "inputSchema": [
                "type": "object",
                "properties": ["name": ["type": "string", "description": "应用的 bundle id 或路径。"]],
                "required": ["name"],
            ],
        ]
    }

    private static var readScreenDeclaration: [String: Any] {
        [
            "name": "read_screen",
            "description": """
                读当前**最前面那个应用**的界面树（有哪些按钮、输入框、文字，以及它们的真实位置）。\
                在你打算点某个控件、但不确定它叫什么名字时，先用这个查。
                """,
            "inputSchema": ["type": "object", "properties": [String: Any](), "required": [String]()],
        ]
    }

    // MARK: 三个原子动作（2026-09-28 从 mcp-server-macos-use 移植）
    //
    // 它们和 `click` 的区别不是"能不能点"，而是**在点击不管用的地方管用**：
    // 合成事件会被 Catalyst / 沙箱 / 安全输入框吞掉，那时只有 AX 动作这条路。

    /// 三个原子动作共用的参数（坐标 + 可选的名字，用来走那条按名字解析的链）。
    private static func atomicCoordinateProperties(extra: [String: Any] = [:]) -> [String: Any] {
        var properties = coordinateProperties()
        properties["label"] = [
            "type": "string",
            "description": "目标控件的名字（可选，但**强烈建议写**）—— 写了它 Wanna 会去界面树里"
                           + "按名字找到那个控件的真实位置，比只给坐标准得多。",
        ]
        return properties.merging(extra) { _, new in new }
    }

    private static var setValueDeclaration: [String: Any] {
        [
            "name": "set_value",
            "description": """
                把一个值**直接写进**控件（走无障碍 API，**不经过键盘**）。\
                在普通输入框上 `type_text` 更好（更像真人）；但**合成键盘事件会被\
                沙箱输入框、Catalyst 应用、安全输入框吞掉** —— 那些地方只有这个能用。
                """,
            "inputSchema": [
                "type": "object",
                "properties": atomicCoordinateProperties(extra: [
                    "value": ["type": "string", "description": "要写进去的值。"],
                ]),
                "required": ["x", "y", "value"],
            ],
        ]
    }

    private static var pressAXDeclaration: [String: Any] {
        [
            "name": "press_ax",
            "description": """
                对控件发一次**无障碍"按下"动作**（由目标 App 自己执行）。\
                和 `click` 的区别：`click` 是往屏幕坐标发一个合成鼠标事件，\
                而 **某些按钮（Catalyst 应用、沙箱应用、部分自绘控件）根本收不到合成事件** —— \
                那时用这个。点不动的时候换它试试。
                """,
            "inputSchema": [
                "type": "object",
                "properties": atomicCoordinateProperties(),
                "required": ["x", "y"],
            ],
        ]
    }

    private static var setSelectedDeclaration: [String: Any] {
        [
            "name": "set_selected",
            "description": """
                **选中**一个列表行 / 表格行 / 侧栏项。\
                这类目标普通点击**选不中**（点下去只得到焦点，不算选中），只有设选中属性才算。\
                不传 selected 默认是选中（true）。
                """,
            "inputSchema": [
                "type": "object",
                "properties": atomicCoordinateProperties(extra: [
                    "selected": ["type": "boolean", "description": "true 选中（默认）/ false 取消选中。"],
                ]),
                "required": ["x", "y"],
            ],
        ]
    }

    // MARK: - 执行

    /// `tools/call` 的执行入口。抛出的错误会被服务端包成 `isError: true` 的结果。
    @MainActor
    static func call(name: String, arguments: [String: Any]) async throws -> [String: Any] {
        switch name {
        case "screenshot": return try await screenshot(arguments: arguments)
        case "click": return try await click(arguments: arguments)
        case "type_text": return try await run(.typeText(try string(arguments, "text")), arguments)
        case "press_key": return try await run(.pressKey(
            keyName: try string(arguments, "key"),
            modifierNames: (arguments["modifiers"] as? [String]) ?? []), arguments)
        case "scroll": return try await scroll(arguments: arguments)
        case "open_app": return try await run(.openApplication(named: try string(arguments, "name")),
                                              arguments)
        case "read_screen": return try await run(.readAccessibilityTree, arguments)
        case "set_value": return try await run(
            .setValue(try string(arguments, "value"), at: try coordinate(arguments)), arguments)
        case "press_ax": return try await run(
            .pressAccessibility(at: try coordinate(arguments)), arguments)
        case "point": return try await point(arguments: arguments)
        case "draw": return try await draw(arguments: arguments)
        case "set_selected": return try await run(
            .setSelected(at: try coordinate(arguments),
                         selected: (arguments["selected"] as? Bool) ?? true), arguments)
        default: throw MCPToolError.unknownTool(name)
        }
    }

    // MARK: screenshot

    @MainActor
    private static func screenshot(arguments: [String: Any]) async throws -> [String: Any] {
        let captures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()
        guard !captures.isEmpty else { throw MCPToolError.failed("没有截到任何屏幕") }

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

    // MARK: click

    @MainActor
    private static func click(arguments: [String: Any]) async throws -> [String: Any] {
        let coordinate = ModelReportedCoordinate(
            normalizedCoordinate: CGPoint(x: try number(arguments, "x"), y: try number(arguments, "y")),
            elementLabel: (arguments["label"] as? String).flatMap { $0.isEmpty ? nil : $0 },
            screenNumber: arguments["screen"] as? Int
        )

        // 瞄准方式：认不出来就退回 auto，并且**把这件事说出来**（不静默）。
        let rawTargeting = arguments["targeting"] as? String
        var targeting = ClickTargeting.auto
        if let rawTargeting, let parsed = ClickTargeting(rawValue: rawTargeting) {
            targeting = parsed
        }

        let action: CompanionAction
        switch arguments["kind"] as? String {
        case "right": action = .rightClick(at: coordinate)
        case "double": action = .doubleClick(at: coordinate)
        default: action = .click(at: coordinate)
        }

        let outcome = await MacosUseController.execute(action, among: try await currentScreens(),
                                                       targeting: targeting)
        var text = outcome.description
        if let rawTargeting, ClickTargeting(rawValue: rawTargeting) == nil {
            text = "（targeting 传的是「\(rawTargeting)」，认不出来，已按 auto 处理）\n" + text
        }
        return ["content": [["type": "text", "text": text]], "isError": false]
    }

    // MARK: scroll

    @MainActor
    private static func scroll(arguments: [String: Any]) async throws -> [String: Any] {
        let coordinate = ModelReportedCoordinate(
            normalizedCoordinate: CGPoint(x: try number(arguments, "x"), y: try number(arguments, "y")),
            elementLabel: nil,
            screenNumber: arguments["screen"] as? Int
        )
        let direction = ScrollDirection(rawValue: try string(arguments, "direction")) ?? .down
        let steps = (arguments["steps"] as? Int) ?? 3
        return try await run(.scroll(at: coordinate, direction: direction, amountInSteps: steps),
                             arguments)
    }

    // MARK: 公共尾巴

    /// 所有动作最后都走这里：执行 → 把结果原样回给调用方。
    @MainActor
    private static func run(_ action: CompanionAction, _ arguments: [String: Any]) async throws
        -> [String: Any] {
        let outcome = await MacosUseController.execute(action, among: try await currentScreens())
        var content: [[String: Any]] = [["type": "text", "text": outcome.description]]
        if let context = outcome.contextForNextTurn, !context.isEmpty {
            content.append(["type": "text", "text": context])
        }
        return ["content": content, "isError": false]
    }

    /// **动作必须带一份当前屏幕的信息。**
    ///
    /// ⚠️ 这里踩过一次坑，记下来：`MacosUseController.screenCapture(for:among:)` 在
    /// **空数组**上直接返回 nil（既没有 screenNumber 可查、也找不到 `isCursorScreen` 那块），
    /// 于是 `resolvedClickPoint` 返回 nil → **每一个坐标类动作都会失败**，
    /// 报的还是「找不到要操作的那块屏幕」这种看不出原因的错。
    ///
    /// 所以每个动作前都要拿一份 —— 但**只取屏幕信息**（尺寸 / 位置 / displayID），
    /// 图片不会发给模型，那是 `screenshot` 工具自己的事。
    @MainActor
    private static func currentScreens() async throws -> [CompanionScreenCapture] {
        try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()
    }

    // MARK: 指向 与 画标（2026-09-29 加，用户说这两个是刚需）

    // 这两件事原来只能由"模型在回复里写 `[POINT:]` / `[SHAPE:]` 标签"触发，
    // 而换成 Python 决策大脑之后它调的是 MCP 工具、**不写标签** —— 所以它们
    // 静默失效了。用户明确说「这两个我是刚需」，于是各给一个工具。
    //
    // 关键是**没有另写一套**：`point` 走的是和点击完全相同的那条三层解析链
    // （`resolvedPointerLocation` 内部就是 `resolvedClickPoint`），
    // `draw` 走的是管线里那条 `resolvedAnnotationMarks` → `screenAnnotationManager.show`。
    // 各写一套必然出现"指得准、点得歪"，本仓早就吃过那个亏。

    private static var pointDeclaration: [String: Any] {
        var properties = coordinateProperties()
        properties["label"] = [
            "type": "string",
            "description": "要指的那个控件的名字。**写它** —— 写了 Wanna 会去界面树里"
                           + "按名字找真实位置；不写只能用你估的坐标，而估的坐标实测只有约 17% 准。",
        ]
        return [
            "name": "point",
            "description": """
                让屏幕上那个**蓝色光标飞过去指一个位置**。\n\
                这是用户能亲眼看见的动作 —— 他说「在哪里」「哪个按钮」「指给我看」这类话时用它。\n\
                **不要无缘无故指**：用户没要求定位就别调，乱飞的光标对他是打扰。
                """,
            "inputSchema": ["type": "object", "properties": properties, "required": ["x", "y"]],
        ]
    }

    private static var drawDeclaration: [String: Any] {
        [
            "name": "draw",
            "description": """
                在屏幕上**画标记**：圈出一块、画个箭头、连一条线。\n\
                用户说「圈出来」「标一下」「画个箭头指过去」时用它。\n\
                坐标同样是 **0–1000 网格**。circle 要两个点（先给圆心，再给圆周上一点，\
                两点距离就是半径）；arrow / line 给两个点（起点、终点）。
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "kind": ["type": "string", "enum": ["circle", "arrow", "line", "curve"],
                             "description": "画什么形状。"],
                    "points": [
                        "type": "array",
                        "description": "形状的顶点，按顺序。每个是 {\"x\": 0-1000, \"y\": 0-1000}。",
                        "items": [
                            "type": "object",
                            "properties": [
                                "x": ["type": "number", "description": "网格横坐标 0–1000。"],
                                "y": ["type": "number", "description": "网格纵坐标 0–1000。"],
                            ],
                            "required": ["x", "y"],
                        ],
                    ],
                    "label": ["type": "string",
                              "description": "可选。写在图形旁边的小字，也是圈选时用来找控件的锚点。"],
                    "screen": ["type": "integer", "description": "第几块屏幕（1 起）。不传 = 鼠标那块。"],
                ],
                "required": ["kind", "points"],
            ],
        ]
    }

    @MainActor
    private static func point(arguments: [String: Any]) async throws -> [String: Any] {
        guard let manager = CompanionManager.sharedForMCPTools else {
            throw MCPToolError.failed("Wanna 还没准备好，光标没有动。")
        }
        let captures = try await currentScreens()
        let text = await manager.pointCursorForMCPTool(at: try coordinate(arguments), among: captures)
        return ["content": [["type": "text", "text": text]], "isError": false]
    }

    @MainActor
    private static func draw(arguments: [String: Any]) async throws -> [String: Any] {
        guard let manager = CompanionManager.sharedForMCPTools else {
            throw MCPToolError.failed("Wanna 还没准备好，没有画。")
        }
        let kindName = try string(arguments, "kind")
        guard let kind = AnnotationShapeKind(rawValue: kindName) else {
            throw MCPToolError.failed("不认识的形状「\(kindName)」（可用：circle / arrow / line / curve）")
        }
        guard let rawPoints = arguments["points"] as? [[String: Any]], !rawPoints.isEmpty else {
            throw MCPToolError.failed("points 是空的 —— 至少要一个点（坐标是 0–1000 网格）。")
        }
        let points: [CGPoint] = try rawPoints.map {
            CGPoint(x: try number($0, "x"), y: try number($0, "y"))
        }
        let request = AnnotationShapeRequest(
            kind: kind, points: points,
            label: (arguments["label"] as? String).flatMap { $0.isEmpty ? nil : $0 },
            displayLabel: nil,
            screenNumber: arguments["screen"] as? Int)
        let captures = try await currentScreens()
        let text = await manager.drawAnnotationsForMCPTool([request], among: captures)
        return ["content": [["type": "text", "text": text]], "isError": false]
    }

    // MARK: 参数取值（缺了就抛，别用默认值蒙混）

    private static func string(_ arguments: [String: Any], _ key: String) throws -> String {        guard let value = arguments[key] as? String, !value.isEmpty else {
            throw MCPToolError.failed("缺少参数「\(key)」")
        }
        return value
    }

    private static func number(_ arguments: [String: Any], _ key: String) throws -> Double {
        if let value = arguments[key] as? Double { return value }
        if let value = arguments[key] as? Int { return Double(value) }
        throw MCPToolError.failed("缺少参数「\(key)」（或它不是数字）")
    }

    /// 从参数里拼一个坐标 —— `click` 与三个原子动作共用。
    ///
    /// `label` 留着是有意义的：它让这个动作也走**按名字**那条解析链（三层里的第一层），
    /// 而不是只有坐标可走。少了它，这三个原子动作就永远落在"看图估坐标"那条最差的路上了。
    private static func coordinate(_ arguments: [String: Any]) throws -> ModelReportedCoordinate {
        ModelReportedCoordinate(
            normalizedCoordinate: CGPoint(x: try number(arguments, "x"),
                                          y: try number(arguments, "y")),
            elementLabel: (arguments["label"] as? String).flatMap { $0.isEmpty ? nil : $0 },
            screenNumber: arguments["screen"] as? Int)
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
