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
import SQLite3

/// 工具声明与分发。声明是 `nonisolated` 的纯数据；执行要碰 App 内部，所以是 `@MainActor`。
nonisolated enum WannaMCPTools {

    // MARK: - 声明

    /// `tools/list` 的返回。形状照 MCP 规范：name / description / inputSchema。
    static func list() -> [[String: Any]] {
        [screenshotDeclaration, clickDeclaration, typeTextDeclaration,
         pressKeyDeclaration, scrollDeclaration, openAppDeclaration, readScreenDeclaration,
         setValueDeclaration, pressAXDeclaration, setSelectedDeclaration,
         pointDeclaration, drawDeclaration,
         drawFigureDeclaration, spawnAgentDeclaration, sendAgentDeclaration,
         listSkillsDeclaration, readFileDeclaration, writeFileDeclaration,
         createFolderDeclaration, listFolderDeclaration,
         searchHistoryDeclaration]
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
        case "list_skills": return try await listSkills()
        case "search_history": return try await searchHistory(arguments: arguments)
        case "read_file": return try await readFile(arguments: arguments)
        case "write_file": return try await writeFile(arguments: arguments)
        case "create_folder": return try await createFolder(arguments: arguments)
        case "list_folder": return try await listFolder(arguments: arguments)
        case "draw_figure": return try await run(.runFigureAgent(task: try string(arguments, "task")),
                                                 arguments)
        case "spawn_agent": return try await spawnAgent(arguments: arguments)
        case "send_agent": return try await sendAgent(arguments: arguments)
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

    // MARK: 画图 与 派 agent（2026-09-29 补，用户点名要的）

    // 这两样原来也是"模型写标签"触发的（`[SVG_AGENT:]` / `[AGENT_SPAWN:]`），
    // 换成 Python 之后静默失效 —— 用户问「还有其他的工具吗」时查出来的。
    //
    // 同样**没有另写一套**：画图直接走现成的 `CompanionAction.runFigureAgent`，
    // 派 agent 直接走 `AgentSessionManager` 那两个现成入口。

    private static var drawFigureDeclaration: [String: Any] {
        [
            "name": "draw_figure",
            "description": """
                画一张**精确的几何图**（落成一个 SVG 文件并在屏幕上打开）。\n\
                用户说「画个示意图」「画个几何图」「把这个图画出来」时用它。\n\
                **你只写任务描述，不用写坐标** —— 背后是一个几何编译器在算每一个点，
                所以画出来的比例是准的，不是估的。
                """,
            "inputSchema": [
                "type": "object",
                "properties": ["task": ["type": "string",
                    "description": "要画什么，尽量说清图形之间的关系（谁和谁相切、谁等于谁…）。"]],
                "required": ["task"],
            ],
        ]
    }

    private static var spawnAgentDeclaration: [String: Any] {
        [
            "name": "spawn_agent",
            "description": """
                **派一个 Claude Code agent 去后台做一件长活**（它能读写文件、跑命令、
                联网查、在项目里干活）。同名 agent 已存在就直接把任务交给它，不会重复创建。\n\
                用在"这件事要跑很久"或"要在某个文件夹里做一串事"的时候。\n\
                任务描述**必须自包含** —— agent 只看得到你写的这段字，看不到你和用户的对话。\n\
                ⚠️ 一次回复**最多派一个**。
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "name": ["type": "string", "description": "给它起个短名字（按名字复用/追问）。"],
                    "task": ["type": "string", "description": "要它做什么，自包含。"],
                ],
                "required": ["name", "task"],
            ],
        ]
    }

    private static var sendAgentDeclaration: [String: Any] {
        [
            "name": "send_agent",
            "description": "给一个**已经在跑的** agent 追加一句要求（按名字找它）。",
            "inputSchema": [
                "type": "object",
                "properties": [
                    "name": ["type": "string", "description": "那个 agent 的名字。"],
                    "message": ["type": "string", "description": "追加要求。"],
                ],
                "required": ["name", "message"],
            ],
        ]
    }

    @MainActor
    private static func spawnAgent(arguments: [String: Any]) async throws -> [String: Any] {
        guard let manager = CompanionManager.sharedForMCPTools else {
            throw MCPToolError.failed("Wanna 还没准备好，没有派出 agent。")
        }
        let text = manager.agentSessionManager.spawnAndSendFirstTurn(
            name: try string(arguments, "name"),
            firstTurnText: try string(arguments, "task"))
        return ["content": [["type": "text", "text": text]], "isError": false]
    }

    @MainActor
    private static func sendAgent(arguments: [String: Any]) async throws -> [String: Any] {
        guard let manager = CompanionManager.sharedForMCPTools else {
            throw MCPToolError.failed("Wanna 还没准备好，没有送出。")
        }
        let text = manager.agentSessionManager.dispatchFollowUp(
            named: try string(arguments, "name"),
            turnText: try string(arguments, "message"))
        return ["content": [["type": "text", "text": text]], "isError": false]
    }

    // MARK: 技能清单 + 文件读写（2026-09-29 加）

    // **为什么需要这三个**：那 11 个技能现在对 Python 是隐形的 ——
    // 它们是磁盘上的 markdown 文件，而 Python 手上没有任何读文件的工具，
    // 于是"这类事怎么做"的专业方法论它一份都用不上。
    //
    // ⚠️ 这里**没有照搬旧的 `[SKILL:]` 机制**（清单常驻提示词 + 用到时把正文拉进来）。
    // 那套是给"写标签的模型"设计的；Python 本来就能调工具，**读个文件再正常不过** ——
    // 同样的能力，两个工具就够，不用再造一套机制。

    private static var listSkillsDeclaration: [String: Any] {
        [
            "name": "list_skills",
            "description": """
                列出 Wanna 手上有哪些**技能**（每个技能是一份"这类事怎么做"的方法论）。\n\
                **动手做一件不熟的事之前先看一眼这个** —— 里面很可能有一份正好讲这件事怎么做。\n\
                看到合适的就用 `read_file` 把它的正文读出来照着做。
                """,
            "inputSchema": ["type": "object", "properties": [String: Any](), "required": [String]()],
        ]
    }

    private static var searchHistoryDeclaration: [String: Any] {
        [
            "name": "search_history",
            "description": """
                在**完整**的对话历史里翻找（不只最近那几轮）。\n\
                你默认只看到最近的若干轮；如果用户问的是更早说过的事、\n\
                而你在当前上下文里找不到，就用这个去翻。\n\
                参数 query 是关键词（留空 = 直接列最近若干条）。\n\
                返回命中的那几条原文，带时间。
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "query": ["type": "string", "description": "关键词；留空则返回最近若干条"],
                    "limit": ["type": "integer", "description": "最多返回几条，默认 20"],
                ],
                "required": [String](),
            ],
        ]
    }

    private static var readFileDeclaration: [String: Any] {
        [
            "name": "read_file",
            "description": """
                读一个文本文件。也可以**只读某一段**（给 offset 和 limit），
                用于读大文件时先看一部分。\n\
                路径要**绝对路径**（`~` 开头也行）。
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "path": ["type": "string", "description": "绝对路径（`~` 开头也可以）。"],
                    "offset": ["type": "integer", "description": "从第几行开始读（1 起）。不传 = 从头。"],
                    "limit": ["type": "integer", "description": "读多少行。不传 = 默认 400 行。"],
                ],
                "required": ["path"],
            ],
        ]
    }

    private static var writeFileDeclaration: [String: Any] {
        [
            "name": "write_file",
            "description": """
                把内容写进一个文件（**会覆盖原有内容**）。目录不存在会先建好。\n\
                用户明确要你写/改某个文件时才用 —— **不要自己顺手改他的文件**。
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "path": ["type": "string", "description": "绝对路径（`~` 开头也可以）。"],
                    "content": ["type": "string", "description": "写进去的完整内容。"],
                ],
                "required": ["path", "content"],
            ],
        ]
    }

    private static func expandPath(_ raw: String) -> String {
        (raw as NSString).expandingTildeInPath
    }

    private static func listSkills() async throws -> [String: Any] {
        // **每次现读，不吃缓存**（2026-09-29 实测修的一处静默陷阱）。
        //
        // `SkillCatalog` 把结果缓存在 `cachedSkills` 里，而 `invalidateCache()`
        // **一个调用点都没有** —— 所以它是"启动读一次、之后永远不变"。
        // 后果：**改了技能的描述，不重启 App 就看不到任何变化**，而屏幕和日志
        // 都完全正常（实测：改完跑 `list_skills`，返回的还是旧描述、字符数一个不差）。
        // 这正是本仓最忌讳的那类失败 —— 改了没反应，还不报错。
        //
        // 技能目录只有十来个文本文件，现读一次是毫秒级；而这个函数在整个流程里
        // 只在 Python 启动时调一次，缓存本来也省不下什么。
        SkillCatalog.invalidateCache()
        let skills = SkillCatalog.allSkills()
        let lines = skills.map { "· \($0.name) —— \($0.description)" }
        let text = skills.isEmpty
            ? "现在一个技能都没有（技能目录：\(SkillCatalog.skillsRootPath)）。"
            : "共 \(skills.count) 个技能（用 read_file 读正文）：\n" + lines.joined(separator: "\n")
        return ["content": [["type": "text", "text": text]], "isError": false]
    }


    /// **在完整对话历史里翻找**（2026-09-29 加）。
    ///
    /// ## 为什么需要它 —— 官方没有这个机制
    ///
    /// 官方的 `Session` 只有 `get_items(limit)`：**"最近 N 条"**，没有任何检索或翻页接口
    /// （源码 `agents/memory/session.py` 的 `Session` Protocol 就那四个方法）。
    /// 官方唯一带检索的是 `FileSearchTool`，但它是 **OpenAI 托管的 vector store**，
    /// 非 OpenAI provider 用不了。
    ///
    /// 所以"查更多"这件事**官方在这个 provider 上没有机制** —— 属应用层决定，
    /// 台账里记着这条判定。**形状照抄技能那套三级披露**：
    /// 常驻少量（最近 N 轮 → 官方 `SessionSettings(limit:)`），需要时**模型自己来翻**。
    ///
    /// ## 数据源为什么是 SQLite 而不是 ConversationSessions.json
    ///
    /// `ConversationSessions.json` 那份**已经被裁到最近 N 轮了**
    /// （`trimConversationHistory` 每轮把裁剪过的 entries 写回磁盘），
    /// 所以它里面**没有完整历史**。真正完整的是官方 Session 落的那张表 ——
    /// 它的 `limit` **只作用于读取**，不删数据。
    /// `SQLITE_TRANSIENT` 是 SQLite 的 C 宏，Swift 看不见 —— 官方推荐的做法是
    /// 把 -1 转成 `sqlite3_destructor_type`。用它绑定字符串，SQLite 会**自己复制**
    /// 一份（而不是持有我们那块内存的指针），所以绑完就可以放手。
    private static let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private static func searchHistory(arguments: [String: Any]) async throws -> [String: Any] {
        let query = ((arguments["query"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedLimit = (arguments["limit"] as? Int) ?? 20
        let maximumRows = min(max(requestedLimit, 1), 200)

        let databasePath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Wanna/agent-sessions.sqlite3").path
        guard FileManager.default.fileExists(atPath: databasePath) else {
            return ["content": [["type": "text",
                                 "text": "还没有历史记录（\(databasePath) 不存在）。"]], "isError": false]
        }

        var handle: OpaquePointer?
        guard sqlite3_open_v2(databasePath, &handle, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
              let database = handle else {
            let reason = handle.flatMap { sqlite3_errmsg($0) }.map { String(cString: $0) } ?? "未知"
            if let handle { sqlite3_close(handle) }
            return ["content": [["type": "text",
                                 "text": "打不开历史数据库：\(reason)（库：\(databasePath)）"]], "isError": false]
        }
        defer { sqlite3_close(database) }

        // 关键词为空 = 直接给最近若干条；否则在 message_data 里做包含匹配。
        // ⚠️ 用参数绑定（`?`）而不是拼字符串 —— message_data 里是模型原文，
        // 拼进去一个引号就会把 SQL 弄坏。
        let hasQuery = !query.isEmpty
        let sql = hasQuery
            ? """
              SELECT session_id, message_data, created_at FROM agent_messages
              WHERE message_data LIKE ? ORDER BY id DESC LIMIT ?
              """
            : """
              SELECT session_id, message_data, created_at FROM agent_messages
              ORDER BY id DESC LIMIT ?
              """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            let reason = sqlite3_errmsg(database).map { String(cString: $0) } ?? "未知"
            return ["content": [["type": "text",
                                 "text": "历史查询失败：\(reason)（库：\(databasePath)）"]], "isError": false]
        }
        defer { sqlite3_finalize(statement) }

        if hasQuery {
            // `%` 和 `_` 是 LIKE 的通配符，用户给的关键词里若有要转义掉，否则
            // 搜 "a_b" 会命中 "axb" —— 静默返回不相关的结果。
            let escaped = query
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "%", with: "\\%")
                .replacingOccurrences(of: "_", with: "\\_")
            sqlite3_bind_text(statement, 1, "%\(escaped)%", -1, sqliteTransient)
            sqlite3_bind_int(statement, 2, Int32(maximumRows))
        } else {
            sqlite3_bind_int(statement, 1, Int32(maximumRows))
        }

        var lines: [String] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            let sessionID = sqlite3_column_text(statement, 0).map { String(cString: $0) } ?? "?"
            let payload = sqlite3_column_text(statement, 1).map { String(cString: $0) } ?? ""
            let createdAt = sqlite3_column_text(statement, 2).map { String(cString: $0) } ?? ""
            // message_data 是 JSON（官方 `Session` 存的就是 TResponseInputItem）。
            // 只抽出说话的人 + 正文，别把整个 JSON 倒给模型 —— 里面还带 tool_call 之类。
            lines.append("· [\(createdAt)] 会话 \(sessionID.prefix(8)) — \(summarizeHistoryPayload(payload))")
        }

        let header = hasQuery
            ? "在完整历史里搜「\(query)」，命中 \(lines.count) 条（最多 \(maximumRows) 条）："
            : "完整历史里最近 \(lines.count) 条："
        let text = lines.isEmpty ? "没找到。（搜的是完整历史，含当前上下文里看不到的更早轮次。）"
                                 : header + "\n" + lines.joined(separator: "\n")
        return ["content": [["type": "text", "text": text]], "isError": false]
    }

    /// 把官方 `Session` 存的那条 JSON 压成一行「角色：正文」。
    ///
    /// 它是 `TResponseInputItem`，形状有好几种（message / function_call /
    /// function_call_output …）。这里**只挑有人话的那些**，其余用类型名带过 ——
    /// 目的是让模型看清"谁说过什么"，不是把原始结构倒给它。
    private static func summarizeHistoryPayload(_ payload: String) -> String {
        guard let data = payload.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return String(payload.prefix(200))
        }
        let role = (object["role"] as? String) ?? (object["type"] as? String) ?? "?"
        var text = ""
        if let content = object["content"] as? String {
            text = content
        } else if let parts = object["content"] as? [[String: Any]] {
            text = parts.compactMap { $0["text"] as? String }.joined(separator: " ")
        } else if let output = object["output"] as? String {
            text = output
        }
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? "<\(role)（非文本）>" : "\(role)：\(clean.prefix(400))"
    }

    private static var createFolderDeclaration: [String: Any] {
        [
            "name": "create_folder",
            "description": """
                新建一个文件夹（**父目录不存在会一起建好**，已存在不报错，建完回读核对）。\n\
                用户说「建一个文件夹 / 新建目录 / 在桌面建个 X」时用它 ——\n\
                **不要**去开终端打 mkdir、也别用 Finder 的 cmd+shift+n 点界面：\n\
                那两条路都要看界面当时是什么状态（终端里可能跑着别的东西、Finder 窗口可能不在前面），\n\
                实测就这么失败过。这一步不需要看屏幕，就一个工具调用的事。\n\
                （只想放一个空文件夹、没有内容要写，就用这个；要写文件用 write_file，它也会顺带建好目录。）
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "path": ["type": "string", "description": "文件夹的绝对路径（`~` 开头也可以）。"],
                ],
                "required": ["path"],
            ],
        ]
    }

    private static var listFolderDeclaration: [String: Any] {
        [
            "name": "list_folder",
            "description": """
                列出一个文件夹里有什么（名字 + 是文件还是文件夹 + 大小）。\n\
                **用于核对**：动手做完一件事、要说「做好了」之前，先用它（或 read_file）看一眼真的在。\n\
                看不到就说看不到 —— 没核对过就说完成，是用户最生气的那一种回答。
                """,
            "inputSchema": [
                "type": "object",
                "properties": [
                    "path": ["type": "string", "description": "文件夹的绝对路径（`~` 开头也可以）。"],
                ],
                "required": ["path"],
            ],
        ]
    }

    private static func createFolder(arguments: [String: Any]) async throws -> [String: Any] {
        let path = expandPath(try string(arguments, "path"))
        do {
            try FileManager.default.createDirectory(at: URL(fileURLWithPath: path),
                                                    withIntermediateDirectories: true)
        } catch {
            throw MCPToolError.failed("建不了文件夹：\(path) —— \(error.localizedDescription)")
        }
        // **回读核对**：`createDirectory` 返回成功也不等于它真的在那儿（权限、重定向都骗过人）。
        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        guard exists, isDirectory.boolValue else {
            throw MCPToolError.failed("建完却读不到：\(path)")
        }
        MainFlowDiagnostics.log("📁 MCP create_folder → \(path)")
        return ["content": [["type": "text", "text": "文件夹已就绪（回读确认过）：\(path)"]],
                "isError": false]
    }

    private static func listFolder(arguments: [String: Any]) async throws -> [String: Any] {
        let path = expandPath(try string(arguments, "path"))
        let entries: [URL]
        do {
            entries = try FileManager.default.contentsOfDirectory(
                at: URL(fileURLWithPath: path),
                includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey],
                options: [.skipsHiddenFiles])
        } catch {
            throw MCPToolError.failed("读不了这个文件夹：\(path) —— \(error.localizedDescription)")
        }
        let lines = entries
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { entry -> String in
                let values = try? entry.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
                if values?.isDirectory == true { return "[文件夹] \(entry.lastPathComponent)" }
                return "\(entry.lastPathComponent)（\(values?.fileSize ?? 0) B）"
            }
        MainFlowDiagnostics.log("📁 MCP list_folder → \(path)（\(entries.count) 项）")
        let body = lines.isEmpty ? "（空的）" : lines.joined(separator: "\n")
        return ["content": [["type": "text",
                             "text": "\(path) 里有 \(entries.count) 项：\n\(body)"]],
                "isError": false]
    }

    private static func readFile(arguments: [String: Any]) async throws -> [String: Any] {        let path = expandPath(try string(arguments, "path"))
        guard let data = FileManager.default.contents(atPath: path),
              let text = String(data: data, encoding: .utf8) else {
            throw MCPToolError.failed("读不了这个文件：\(path)（不存在，或者不是文本）")
        }
        let all = text.components(separatedBy: .newlines)
        let offset = max(1, (arguments["offset"] as? Int) ?? 1)
        let limit = (arguments["limit"] as? Int) ?? 400
        let slice = Array(all.dropFirst(offset - 1).prefix(limit))
        let header = "文件：\(path)（共 \(all.count) 行，这是第 \(offset) 行起 \(slice.count) 行）"
        return ["content": [["type": "text", "text": header + "\n\n" + slice.joined(separator: "\n")]],
                "isError": false]
    }

    private static func writeFile(arguments: [String: Any]) async throws -> [String: Any] {
        let path = expandPath(try string(arguments, "path"))
        let content = (arguments["content"] as? String) ?? ""
        let url = URL(fileURLWithPath: path)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                    withIntermediateDirectories: true)
            try content.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            throw MCPToolError.failed("写不进去：\(path) —— \(error.localizedDescription)")
        }
        MainFlowDiagnostics.log("📝 MCP write_file → \(path)")
        return ["content": [["type": "text", "text": "写好了：\(path)（\(content.count) 字）"]],
                "isError": false]
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
