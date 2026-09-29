//
//  SimpleFileTools.swift
//  Wanna
//
//  ⭐ **语音 / 视频模式的两个工具：读文件、写文件**（2026-09-29 用户定）。
//
//  用户的原话：「要让图文模式、语音模式、视频模式都支持工具调用……你看一下语音模式和
//  视频模式，这两个好像不能使用 PI Agent。那么你就自己写一个函数，让它能够支持文件的
//  读写就可以了，网络搜索删掉，就一个读取写入就完事了……比如我写完一篇文章，让它保存到
//  桌面上，其实也就这点需求，需求不大，就简单一个读写。文件夹位置可以在设置里面设置，
//  也可以在这个选项里面设置」。
//
//  ## 为什么只有两个
//
//  图文模式那套（Pi + 21 个 MCP 工具）对语音 / 视频这条管线**够不着** —— 那条路的
//  「理解」是一次普通的 chat/completions 调用（`CascadeVoiceEngine`），没有 Pi。
//  所以按官方 OpenAI function calling 的形状直接给模型两个工具。**极简**：
//  网络搜索不要（用户明说），就读写两个。
//
//  ## 写到哪
//
//  · 模型给的**绝对路径**照用（「保存到桌面上」就是绝对路径的场景）；
//  · **相对路径**（或只有文件名）落进 `AppSettings.voiceToolWriteFolder`
//    （设置 → Agent 里配，默认 `~/Desktop/Wanna`）。
//
//  ## 读到哪
//
//  读不限目录 —— 读的那个文件往往是用户自己点名的（「读一下桌面上 xx.md」），
//  限制目录只会让这个功能变成摆设。**写**同样接受绝对路径：用户点名写到哪就写到哪。
//

import Foundation

/// 纯逻辑 + Foundation 文件读写，不碰任何 UI / 引擎，所以能脱离 App 单独验证。
nonisolated enum SimpleFileTools {

    // MARK: - 工具定义（OpenAI function calling 形状）

    /// 喂给 chat/completions 的 `tools` 参数。**只在这里写一遍** —— 请求体与
    /// 「选项」面板里那两条说明读的是同一份。
    static func definitions() -> [[String: Any]] {
        [
            [
                "type": "function",
                "function": [
                    "name": "read_file",
                    "description": "读取一个文本文件的内容。传文件的路径（绝对路径，或者相对于工具文件夹的路径）。",
                    "parameters": [
                        "type": "object",
                        "properties": [
                            "path": [
                                "type": "string",
                                "description": "要读的文件路径"
                            ]
                        ],
                        "required": ["path"]
                    ]
                ]
            ],
            [
                "type": "function",
                "function": [
                    "name": "write_file",
                    "description": "把一段文字写进文件（文件不存在就创建，存在就覆盖）。用户说保存到哪里就传哪个路径；只说文件名时，会存到工具文件夹里。",
                    "parameters": [
                        "type": "object",
                        "properties": [
                            "path": [
                                "type": "string",
                                "description": "要写的文件路径（绝对路径，或者相对于工具文件夹）"
                            ],
                            "content": [
                                "type": "string",
                                "description": "要写入的完整内容"
                            ]
                        ],
                        "required": ["path", "content"]
                    ]
                ]
            ]
        ]
    }

    /// 工具名清单（选项面板显示用）。
    static var names: [String] { ["read_file", "write_file"] }

    // MARK: - 路径解析

    /// 写 / 读的基准文件夹（设置里配的；没配 = `~/Desktop/Wanna`）。
    static var baseFolder: String {
        if let configured = AppSettingsStore.snapshot().voiceToolWriteFolder,
           !configured.isEmpty {
            return configured
        }
        return defaultFolder
    }

    /// 默认文件夹 —— 用户的例子就是「保存到桌面上」。
    static var defaultFolder: String {
        let desktop = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop/Wanna")
        return desktop.path
    }

    /// 把模型给的路径变成可用的 URL：绝对路径照用；`~` 展开；相对路径落进基准文件夹。
    static func resolve(path: String) -> URL {
        var expanded = path
        if expanded.hasPrefix("~") {
            expanded = (expanded as NSString).expandingTildeInPath
        }
        if (expanded as NSString).isAbsolutePath {
            return URL(fileURLWithPath: expanded)
        }
        return URL(fileURLWithPath: baseFolder).appendingPathComponent(expanded)
    }

    // MARK: - 执行

    /// 执行一个工具调用，返回**给模型看的**结果文本（成功与失败都如实说）。
    /// 传不认识的工具名也如实回 —— 假成功比失败更坏。
    static func execute(name: String, argumentsJSON: String) -> String {
        let arguments = (try? JSONSerialization.jsonObject(with: Data(argumentsJSON.utf8)))
            as? [String: Any] ?? [:]

        switch name {
        case "read_file":
            guard let path = arguments["path"] as? String, !path.isEmpty else {
                return "错误：缺少 path 参数"
            }
            let url = resolve(path: path)
            guard FileManager.default.fileExists(atPath: url.path) else {
                return "错误：文件不存在（\(url.path)）"
            }
            do {
                let data = try Data(contentsOf: url)
                guard let text = String(data: data, encoding: .utf8) else {
                    return "错误：文件不是 UTF-8 文本，读不了（\(url.path)）"
                }
                // 太长的文件截断 —— 那是塞给模型的，回显一整本会顶爆上下文。
                let maximumCharacters = 20_000
                if text.count > maximumCharacters {
                    let head = String(text.prefix(maximumCharacters))
                    return head + "\n\n（文件很长，已截断 —— 只显示了前 \(maximumCharacters) 字符）"
                }
                return text.isEmpty ? "（文件是空的）" : text
            } catch {
                return "错误：读不出来（\(error.localizedDescription)）"
            }

        case "write_file":
            guard let path = arguments["path"] as? String, !path.isEmpty else {
                return "错误：缺少 path 参数"
            }
            guard let content = arguments["content"] as? String else {
                return "错误：缺少 content 参数"
            }
            let url = resolve(path: path)
            do {
                let folder = url.deletingLastPathComponent()
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try content.write(to: url, atomically: true, encoding: .utf8)
                return "已写入：\(url.path)（\(content.count) 字符）"
            } catch {
                return "错误：写不进去（\(error.localizedDescription)）"
            }

        default:
            return "错误：不认识这个工具（\(name)）"
        }
    }
}
