//
//  WannaMCPServer.swift
//  Wanna
//
//  **Wanna 自己当 MCP 服务端** —— 把「手」（截图 / 点击 / 打字 / 读界面）用标准协议递出去。
//
//  ## 为什么是 Wanna 当服务端，而不是复用现成的 mcp-server-macos-use
//
//  见 `改造方案-Agent框架迁移.md` §四 阶段 1 与 §五：现成那只手用的是**元素坐标**
//  （从界面树读的 x/y/w/h），而 Wanna 这套是**归一化网格 → 截图像素 → 屏幕 → Quartz**。
//  **两套语义混用 = 点歪且不报错**，所以「手」只能有一双，而且必须在 Wanna 里 ——
//  因为截图要剔除本 App 自己的窗口、坐标换算要按每块屏幕自己的原点来算，这两件事
//  只有 Wanna 有。
//
//  ## 为什么不用官方 MCP Swift SDK（2026-09-28 实测决定）
//
//  `modelcontextprotocol/swift-sdk` 在 Xcode 下编不过：它自己是 `swift-tools-version:6.1`
//  → 按 Swift 6 语言模式编译 → 被 Swift 6.4 的 region-based isolation 判两处数据竞争
//  （`NetworkTransport.swift` 的 `Task { @MainActor in … }`）。查过全部发布版本，
//  凡是有 HTTP 服务端传输的版本都含这两行，换版本无解；而唯一有效的手段是全局
//  `SWIFT_VERSION=5.0`，那只对命令行有效、在 Xcode 里不生效。
//
//  所以这里按规范自己实现最小集。**只用三个方法**：
//  `initialize`（握手）/ `tools/list`（报菜单）/ `tools/call`（干活）。
//
//  ## 接线方式为什么是 HTTP 而不是 stdio
//
//  stdio 的语义是「客户端 spawn 服务端进程」。Wanna 是**已经在跑的 GUI App**，
//  客户端没法 spawn 它。HTTP（绑 127.0.0.1）正好对上「常驻进程 + 客户端来连」。
//
//  ## 鉴权
//
//  绑 127.0.0.1 只防外网，防不住**本机其他进程** —— 而本服务能点击、打字、读屏。
//  所以另加一个 token（用户 2026-09-28 拍板）：启动时读/生成
//  `~/Library/Application Support/Wanna/mcp-token`（0600），请求必须带
//  `Authorization: Bearer <token>`，否则一律 401。
//

import Foundation
import Network

// MARK: - 令牌

/// MCP 服务端的令牌：读不到就生成一个，落盘 0600。
///
/// 放在 Application Support 而不是 AppSettings：**它不是用户偏好，是凭证** ——
/// 而且导出设置那个功能会把 AppSettings 整个写出去，凭证不该跟着跑。
nonisolated enum WannaMCPToken {
    static var tokenFileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Wanna", isDirectory: true)
        return base.appendingPathComponent("mcp-token")
    }

    /// 读现有令牌；没有就生成一个 32 字节的随机串并落盘（0600）。
    static func loadOrCreate() -> String {
        let url = tokenFileURL
        if let existing = try? String(contentsOf: url, encoding: .utf8) {
            let trimmed = existing.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count >= 16 { return trimmed }
        }

        var bytes = [UInt8](repeating: 0, count: 32)
        for index in bytes.indices { bytes[index] = UInt8.random(in: 0...255) }
        let token = bytes.map { String(format: "%02x", $0) }.joined()

        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? token.write(to: url, atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        return token
    }
}

// MARK: - JSON-RPC 的小工具

/// 手写 JSON-RPC 需要的几个取字段动作。写完整 Codable 树不值得 —— 我们只认几个字段。
private enum JSONRPC {
    static func error(_ id: Any?, code: Int, message: String) -> [String: Any] {
        ["jsonrpc": "2.0", "id": id ?? NSNull(), "error": ["code": code, "message": message]]
    }

    static func result(_ id: Any?, _ payload: [String: Any]) -> [String: Any] {
        ["jsonrpc": "2.0", "id": id ?? NSNull(), "result": payload]
    }
}

// MARK: - 服务端

/// Wanna 的 MCP 服务端：本机 HTTP 监听 + 三个 JSON-RPC 方法。
///
/// 生命周期跟着 `CompanionManager`：启动时 `start()`，退出时 `stop()`。
@MainActor
final class WannaMCPServer {

    static let shared = WannaMCPServer()

    /// 默认端口。用一个不常见的号，避免和本机其他服务撞上。
    /// 标 `nonisolated` 才能当默认参数值用（默认参数在非隔离上下文求值）。
    nonisolated static let defaultPort: UInt16 = 8765
    /// MCP 端点的路径（规范里常见的就是 `/mcp`）。
    nonisolated static let endpointPath = "/mcp"

    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.nashaigc.wanna.mcp", attributes: .concurrent)
    private var connections: [ObjectIdentifier: MCPConnection] = [:]

    private(set) var token: String = ""
    private(set) var isRunning = false
    private(set) var boundPort: UInt16 = 0

    private init() {}

    // MARK: 起停

    /// 起监听。失败只记日志，**不抛出去** —— 它不该拖垮整个 App 的启动。
    func start(port: UInt16 = WannaMCPServer.defaultPort) {
        guard !isRunning else { return }
        token = WannaMCPToken.loadOrCreate()

        do {
            let parameters = NWParameters.tcp
            // ⚠️ 只绑回环地址。绑 0.0.0.0 会让同局域网的机器也能点用户的电脑。
            parameters.requiredLocalEndpoint = NWEndpoint.hostPort(
                host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port) ?? 8765)
            parameters.allowLocalEndpointReuse = true

            let listener = try NWListener(using: parameters)
            listener.newConnectionHandler = { [weak self] connection in
                Task { @MainActor in self?.accept(connection) }
            }
            listener.stateUpdateHandler = { [weak self] state in
                Task { @MainActor in
                    switch state {
                    case .ready:
                        self?.isRunning = true
                        self?.boundPort = listener.port?.rawValue ?? port
                        Self.note("✅ MCP 服务端已监听 127.0.0.1:\(self?.boundPort ?? port)\(Self.endpointPath)")
                    case .failed(let error):
                        self?.isRunning = false
                        Self.note("⚠️ MCP 服务端启动失败：\(error)")
                    default:
                        break
                    }
                }
            }
            listener.start(queue: queue)
            self.listener = listener
            Self.note("MCP 服务端正在启动（端口 \(port)）· 令牌文件 \(WannaMCPToken.tokenFileURL.path)")
        } catch {
            Self.note("⚠️ MCP 服务端建不起来：\(error)")
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        isRunning = false
        let all = connections.values
        connections.removeAll()
        for connection in all { connection.close() }
        Self.note("MCP 服务端已停止")
    }

    // MARK: 连接

    private func accept(_ connection: NWConnection) {
        let box = MCPConnection(connection: connection, queue: queue) { [weak self] request in
            await self?.handle(request) ?? .notFound()
        } onClose: { [weak self] identifier in
            Task { @MainActor in self?.connections.removeValue(forKey: identifier) }
        }
        connections[ObjectIdentifier(connection)] = box
        box.start()
    }

    // MARK: 请求分发

    private func handle(_ request: HTTPRequest) async -> HTTPResponse {
        // 路径不对 → 404。规范里 MCP 端点是一个固定路径。
        guard request.path == Self.endpointPath else {
            return .json(status: 404, body: ["error": "not found, try \(Self.endpointPath)"])
        }

        // 鉴权。**先查 token 再解析 body** —— 别把没授权的东西解析进来。
        guard let presented = request.header("authorization"),
              presented == "Bearer \(token)" else {
            Self.note("MCP 请求被拒：令牌不对或缺失（来自本机）")
            return .json(status: 401, body: ["error": "unauthorized"])
        }

        guard request.method == "POST" else {
            return .json(status: 405, body: ["error": "only POST is supported"])
        }

        guard let object = try? JSONSerialization.jsonObject(with: request.body) as? [String: Any] else {
            return .json(status: 400, body: JSONRPC.error(nil, code: -32700, message: "parse error"))
        }

        let method = object["method"] as? String ?? ""
        let id = object["id"]
        let params = object["params"] as? [String: Any] ?? [:]

        // 通知（没有 id）：按规范回 202、无 body。
        if id == nil {
            return .accepted()
        }

        switch method {
        case "initialize":
            return .json(status: 200, body: JSONRPC.result(id, initializeResult(params: params)))

        case "tools/list":
            return .json(status: 200, body: JSONRPC.result(id, ["tools": WannaMCPTools.list()]))

        case "tools/call":
            let name = params["name"] as? String ?? ""
            let arguments = params["arguments"] as? [String: Any] ?? [:]
            return await callTool(named: name, arguments: arguments, id: id)

        default:
            return .json(status: 200,
                         body: JSONRPC.error(id, code: -32601, message: "method not found: \(method)"))
        }
    }

    /// 握手。**协议版本按客户端说的回** —— 我们只用最小集，不依赖版本差异。
    private func initializeResult(params: [String: Any]) -> [String: Any] {
        let requested = params["protocolVersion"] as? String ?? "2025-06-18"
        return [
            "protocolVersion": requested,
            "capabilities": ["tools": [String: Any]()],
            "serverInfo": ["name": "wanna", "version": "1.0.0"],
        ]
    }

    private func callTool(named name: String,
                          arguments: [String: Any],
                          id: Any?) async -> HTTPResponse {
        do {
            let payload = try await WannaMCPTools.call(name: name, arguments: arguments)
            return .json(status: 200, body: JSONRPC.result(id, payload))
        } catch {
            // 工具自己报错也走 result（isError），不是 JSON-RPC 错误 —— 规范这么要求的：
            // 协议层没出错，是"干活"这一步失败了。
            return .json(status: 200, body: JSONRPC.result(id, [
                "content": [["type": "text", "text": "\(error)"]],
                "isError": true,
            ]))
        }
    }

    // MARK: 日志

    /// 与主 Agent 诊断日志同一条路（双击启动的 App 里 `print` 进不了任何地方）。
    static func note(_ message: String) {
        MainFlowDiagnostics.log("🧩 MCP · \(message)")
    }
}

// MARK: - HTTP 的最小实现

/// 一条解析出来的请求。只认我们要用的那几个字段。
nonisolated struct HTTPRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data

    func header(_ name: String) -> String? { headers[name.lowercased()] }
}

/// 一条要写回去的响应。
nonisolated struct HTTPResponse {
    let status: Int
    let headers: [String: String]
    let body: Data
    let isEmptyBody: Bool

    static func json(status: Int, body: [String: Any]) -> HTTPResponse {
        let data = (try? JSONSerialization.data(withJSONObject: body)) ?? Data()
        return HTTPResponse(status: status,
                            headers: ["Content-Type": "application/json"],
                            body: data, isEmptyBody: false)
    }

    /// 通知的回应：202 + 空 body。
    static func accepted() -> HTTPResponse {
        HTTPResponse(status: 202, headers: [:], body: Data(), isEmptyBody: true)
    }

    static func notFound() -> HTTPResponse {
        .json(status: 404, body: ["error": "not found"])
    }

    func serialized() -> Data {
        var head = "HTTP/1.1 \(status) \(HTTPResponse.reason(status))\r\n"
        var allHeaders = headers
        allHeaders["Content-Length"] = String(body.count)
        allHeaders["Connection"] = "close"
        for (key, value) in allHeaders { head += "\(key): \(value)\r\n" }
        head += "\r\n"
        var out = Data(head.utf8)
        out.append(body)
        return out
    }

    static func reason(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 202: return "Accepted"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 404: return "Not Found"
        case 405: return "Method Not Allowed"
        default: return "OK"
        }
    }
}

/// 一条 TCP 连接：攒够一个完整请求 → 交给 handler → 写回响应 → 关闭。
///
/// 刻意**不做 keep-alive**（响应里带 `Connection: close`）：MCP 客户端每次调用
/// 一条连接完全够用，少一个状态机就少一类 bug。
///
/// `@unchecked Sendable` 的理由：这个类的全部可变状态（`buffer` / `finished`）
/// 只在 `queue` 上被碰，`finish()` 额外用 `finished` 做一次幂等；`NWConnection.send`
/// 的完成回调是唯一一处跨线程读，而它只读一个 `let`。不是为了绕过检查才标的 ——
/// 是这里的并发确实由那条串行队列负责。
private final class MCPConnection: @unchecked Sendable {
    private let connection: NWConnection
    private let queue: DispatchQueue
    private let handler: (HTTPRequest) async -> HTTPResponse
    private let onClose: (ObjectIdentifier) -> Void
    private var buffer = Data()
    private var finished = false

    init(connection: NWConnection, queue: DispatchQueue,
         handler: @escaping (HTTPRequest) async -> HTTPResponse,
         onClose: @escaping (ObjectIdentifier) -> Void) {
        self.connection = connection
        self.queue = queue
        self.handler = handler
        self.onClose = onClose
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .failed, .cancelled:
                self.finish()
            default:
                break
            }
        }
        connection.start(queue: queue)
        receive()
    }

    func close() { connection.cancel() }

    private func finish() {
        guard !finished else { return }
        finished = true
        onClose(ObjectIdentifier(connection))
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                if let request = self.parseIfComplete() {
                    Task { await self.respond(to: request) }
                    return
                }
            }
            if error != nil || isComplete {
                self.finish()
                return
            }
            self.receive()
        }
    }

    /// 攒够「头 + Content-Length 指定的 body」才算一个完整请求。
    private func parseIfComplete() -> HTTPRequest? {
        guard let separator = buffer.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let headData = buffer[buffer.startIndex..<separator.lowerBound]
        guard let headText = String(data: headData, encoding: .utf8) else { return nil }

        var lines = headText.components(separatedBy: "\r\n")
        guard !lines.isEmpty else { return nil }
        let requestLine = lines.removeFirst().split(separator: " ")
        guard requestLine.count >= 2 else { return nil }

        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            headers[key] = value
        }

        let contentLength = Int(headers["content-length"] ?? "0") ?? 0
        let bodyStart = separator.upperBound
        let available = buffer.distance(from: bodyStart, to: buffer.endIndex)
        guard available >= contentLength else { return nil }   // body 还没到齐

        let body = Data(buffer[bodyStart..<buffer.index(bodyStart, offsetBy: contentLength)])
        return HTTPRequest(method: String(requestLine[0]),
                           path: String(requestLine[1]),
                           headers: headers,
                           body: body)
    }

    private func respond(to request: HTTPRequest) async {
        let response = await handler(request)
        connection.send(content: response.serialized(), completion: .contentProcessed { [weak self] _ in
            self?.connection.cancel()
            self?.finish()
        })
    }
}
