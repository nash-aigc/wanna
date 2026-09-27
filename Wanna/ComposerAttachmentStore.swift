//
//  ComposerAttachmentStore.swift
//  Wanna
//
//  **哪张卡片上贴了哪些附件**（2026-09-28）。纯逻辑（怎么读粘贴板、怎么拼提示词）在
//  `ComposerAttachment.swift`，这里只负责"现在有哪些、加/删、上限"。
//
//  ## 为什么不是 `TurnReferenceMaterials`
//
//  长得像，但寿命不一样：那一份是**这一轮**的（`TurnReferenceCollector.beginTurn()` 每轮清空），
//  而用户 2026-09-28 对附件的原话是「**一直留着，直到手动删**」（他在两个选项里选的这一条）。
//  所以附件必须有自己的、跨轮的落点 —— 而"跨轮"正是它与参考材料唯一的、也是要害的差别。
//
//  ## 键是卡片 id，只在内存
//
//  与 `AppSettings.cardChatMode` / `cardVoiceRoleIDs` 同一个键（卡片 id = 背后那条会话 / 代理
//  记录的 uuidString）。**不落盘**：这是全 App 最大的一类数据（归一化后的图片字节），
//  而用户没有说"重启后还要留着"。反过来说，重启后输入框是空的，附件条也是空的。
//
//  ## 上限是刻意的，而且到顶会说话
//
//  一次粘贴 30 张图 = 一个几 MB 的请求。所以图片 ≤ 5 张（与
//  `TurnReferenceMaterials.maximumScreenshots` 同一个数，理由也一样）、总数 ≤ 20。
//  到顶时**拒绝并留一行日志**，不静默丢弃 —— 「贴了但没进去」和「贴了但模型没看到」
//  长得一模一样，只有日志能分开。
//

import AppKit
import Combine

@MainActor
final class ComposerAttachmentStore: ObservableObject {

    static let shared = ComposerAttachmentStore()
    private init() {}

    /// 每张卡片各自的附件，顺序就是用户粘贴的顺序（缩略图条从左到右按它画）。
    @Published private(set) var attachmentsByCardID: [String: [ComposerAttachment]] = [:]

    /// **正在预览哪一条**（点缩略图打开）。
    ///
    /// 放在这里而不是各页的 `@State`：预览面板要盖住整个内容列，而三个页面都得画它 ——
    /// 三份状态就是三条会分叉的路（`CardChatPreferenceModel.openRoleListCardID` 定过同一个规矩）。
    @Published var previewingAttachment: ComposerAttachment?

    /// 图片最多几张。到顶之后还可以继续贴**文件 / 文件夹**（它们只是路径，几乎不要钱）。
    static let maximumImages = 5
    /// 总条数上限。
    static let maximumTotal = 20

    // MARK: - 读

    func attachments(forCardID cardID: String) -> [ComposerAttachment] {
        attachmentsByCardID[cardID] ?? []
    }

    /// 这一轮要送出去的图片 —— 形状与 `analyzeImageStreaming(images:)` 要的一模一样
    /// （`(data, label)` 二元组），所以调用方直接 `append(contentsOf:)` 即可。
    /// 拼装本身在 `ComposerAttachment.imagePayloads(for:)`（纯逻辑，两个引擎共用一份）。
    func imagePayloads(forCardID cardID: String) -> [(data: Data, label: String)] {
        ComposerAttachment.imagePayloads(for: attachments(forCardID: cardID))
    }

    func promptBlock(forCardID cardID: String) -> String? {
        ComposerAttachment.promptBlock(for: attachments(forCardID: cardID))
    }

    /// 一行诊断（日志用）—— 「贴了但模型没看到」唯一可核对的判据。
    func logLine(forCardID cardID: String) -> String? {
        let items = attachments(forCardID: cardID)
        guard !items.isEmpty else { return nil }
        let images = items.filter { $0.kind == .image }.count
        let files = items.filter { $0.kind == .file }.count
        let folders = items.filter { $0.kind == .folder }.count
        return "📎 附件：图片 \(images) 张 · 文件 \(files) 个 · 文件夹 \(folders) 个"
    }

    // MARK: - 写

    /// **一次粘贴的入口**：认得出来就收下并返回 true，认不出来返回 false。
    ///
    /// 返回 false 是给 `ComposerNSTextView` 的信号：这次粘贴不是附件，**原样交回给
    /// NSTextView**（纯文本粘贴的行为一个字都不改）。
    @discardableResult
    func consumePasteboard(_ pasteboard: NSPasteboard, forCardID cardID: String) -> Bool {
        let read = ComposerAttachment.attachments(from: pasteboard)
        guard !read.isEmpty else {
            // **这一次"没认出来"要留痕**（2026-09-28）：认不出来是**静默**的 ——
            // 用户看到的是"粘了没反应"，而没有任何一行日志说得出是"这次粘贴根本没走到
            // 这里"还是"走到了但没认出来"。粘贴板上有哪些类型正是分辨这两者的唯一判据。
            MainFlowDiagnostics.log("📎 粘贴未被识别为附件（粘贴板类型："
                                    + "\((pasteboard.types ?? []).map(\.rawValue).joined(separator: ", "))）")
            return false
        }
        add(read, forCardID: cardID)
        return true
    }

    /// 收下几条。**超上限的会被挡掉**（图片按张数、总数按条数），挡掉的写一行日志。
    func add(_ newAttachments: [ComposerAttachment], forCardID cardID: String) {
        var current = attachments(forCardID: cardID)
        var accepted: [ComposerAttachment] = []
        var rejectedImages = 0
        var rejectedByTotal = 0

        var imageCount = current.filter { $0.kind == .image }.count
        for attachment in newAttachments {
            if current.count + accepted.count >= Self.maximumTotal {
                rejectedByTotal += 1
                continue
            }
            if attachment.kind == .image {
                guard imageCount < Self.maximumImages else {
                    rejectedImages += 1
                    continue
                }
                imageCount += 1
            }
            accepted.append(attachment)
        }

        guard !accepted.isEmpty else {
            if rejectedImages > 0 {
                print("📎 附件：图片已经有 \(Self.maximumImages) 张了，这次没加进去（先删掉几张再贴）")
            }
            if rejectedByTotal > 0 {
                print("📎 附件：条数已经到 \(Self.maximumTotal) 条上限，这次没加进去")
            }
            return
        }

        current.append(contentsOf: accepted)
        attachmentsByCardID[cardID] = current
        let logLine = "📎 附件：+\(accepted.count) → \(self.logLine(forCardID: cardID) ?? "")"
        print(logLine)
        // 同一行也进主流程诊断日志 —— 那是"贴了但模型没看到"唯一可核对的判据，
        // 而 `print` 只在从终端启动时才看得到（双击启动的 App 里它进不了任何地方）。
        MainFlowDiagnostics.log(logLine)
        if rejectedImages > 0 || rejectedByTotal > 0 {
            print("📎 附件：有 \(rejectedImages + rejectedByTotal) 条被上限挡掉"
                  + "（图片上限 \(Self.maximumImages) 张 / 总数上限 \(Self.maximumTotal) 条）")
        }
    }

    func remove(id attachmentID: String, forCardID cardID: String) {
        guard var current = attachmentsByCardID[cardID] else { return }
        current.removeAll { $0.id == attachmentID }
        attachmentsByCardID[cardID] = current
        // 正在预览的那一条被删了就把预览也收掉，否则会留一块指着不存在的东西的面板。
        if previewingAttachment?.id == attachmentID {
            previewingAttachment = nil
        }
        print("📎 附件：-1 → \(logLine(forCardID: cardID) ?? "空")")
    }

    func removeAll(forCardID cardID: String) {
        guard !attachments(forCardID: cardID).isEmpty else { return }
        attachmentsByCardID[cardID] = []
        previewingAttachment = nil
        print("📎 附件：清空")
    }
}
