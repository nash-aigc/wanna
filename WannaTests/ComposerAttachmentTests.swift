//
//  ComposerAttachmentTests.swift
//  WannaTests
//
//  「输入框附件」的纯逻辑断言（2026-09-28）。
//
//  为什么值得留在仓库里：这一套的失败方式**全是静默的** ——
//    · 粘贴板认错了类别 → 用户粘一张图，输入框里凭空多出一串文件路径文本（而不是缩略图）；
//    · 上限算错 → 一次贴 20 张，一个几 MB 的请求打出去，用户只看到"变慢了"；
//    · 图片归一化漏掉 → 5MB 的原图原样发出去，token 账单与延迟一起涨；
//    · `promptBlock` 形状变了 → 文件路径不再进提示词，而模型不会报错，它只是开始瞎猜文件内容。
//  所以边界都钉死。
//
//  粘贴板用的是**自己的具名粘贴板**，不碰用户的 `NSPasteboard.general`。
//

import AppKit
import Foundation
import Testing
@testable import Wanna

@MainActor
struct ComposerAttachmentTests {

    /// 一个只属于测试的粘贴板 —— 绝不碰用户真实的那份。
    private func makePasteboard() -> NSPasteboard {
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("WannaTestsComposerAttachment"))
        pasteboard.clearContents()
        return pasteboard
    }

    /// 造一张指定像素尺寸的图（不依赖窗口服务器，直接走 CoreGraphics）。
    private func makeImage(width: Int, height: Int) -> NSImage {
        let context = CGContext(data: nil,
                                width: width,
                                height: height,
                                bitsPerComponent: 8,
                                bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        context.setFillColor(NSColor.systemTeal.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let cgImage = context.makeImage()!
        let image = NSImage(size: NSSize(width: width, height: height))
        image.addRepresentation(NSBitmapImageRep(cgImage: cgImage))
        return image
    }

    // MARK: - 粘贴板分类

    @Test func aPlainTextPasteIsNotAnAttachment() throws {
        let pasteboard = makePasteboard()
        pasteboard.setString("这就是一句普通的话，不是附件", forType: .string)

        // **空 = "这次粘贴不是附件"**，调用方要把这次粘贴原样交回给 NSTextView。
        #expect(ComposerAttachment.attachments(from: pasteboard).isEmpty)
    }

    @Test func pastedFilePathBecomesAFileAttachment() throws {
        let pasteboard = makePasteboard()
        // /etc/hosts 一定存在，而且是文件不是目录。
        pasteboard.writeObjects([URL(fileURLWithPath: "/etc/hosts") as NSURL])

        let attachments = ComposerAttachment.attachments(from: pasteboard)
        #expect(attachments.count == 1)
        #expect(attachments.first?.kind == .file)
        #expect(attachments.first?.absolutePath == "/etc/hosts")
        #expect(attachments.first?.hasImage == false)
    }

    @Test func pastedDirectoryBecomesAFolderAttachmentWithAChildCount() throws {
        let pasteboard = makePasteboard()
        // 临时目录里放两个文件，保证"里面有几项"这个数是可断言的。
        let folder = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("wanna-attachment-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        for name in ["a.txt", "b.txt"] {
            try "x".write(to: folder.appendingPathComponent(name), atomically: true, encoding: .utf8)
        }
        pasteboard.writeObjects([folder as NSURL])

        let attachments = ComposerAttachment.attachments(from: pasteboard)
        #expect(attachments.first?.kind == .folder)
        #expect(attachments.first?.childCount == 2)
        // 文件夹不进提示词正文，只给路径 —— 这正是用户 2026-09-27 对「参考文件夹」定的规矩。
        #expect(attachments.first?.promptLine().contains(folder.path) == true)
    }

    @Test func aPastedImageWithoutAnyFileBecomesAnImageAttachment() throws {
        let pasteboard = makePasteboard()
        pasteboard.writeObjects([makeImage(width: 400, height: 300)])

        let attachments = ComposerAttachment.attachments(from: pasteboard)
        #expect(attachments.count == 1)
        #expect(attachments.first?.kind == .image)
        #expect(attachments.first?.hasImage == true)
        // 从浏览器复制的图没有磁盘路径 —— 它只以图片的身份存在。
        #expect(attachments.first?.absolutePath == nil)
    }

    @Test func anImageFileOnDiskCarriesBothThePictureAndItsPath() throws {
        // 从访达复制一个 png 走的是"文件 URL"那条分支，但它同时是图片：
        // 模型该直接看到画面，带工具的 agent 该能拿到原文件路径。
        let fileURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("wanna-attachment-\(UUID().uuidString).png")
        let pngData = NSBitmapImageRep(cgImage: makeImage(width: 120, height: 80)
            .cgImage(forProposedRect: nil, context: nil, hints: nil)!)
            .representation(using: .png, properties: [:])!
        try pngData.write(to: fileURL)
        defer { try? FileManager.default.removeItem(at: fileURL) }

        let pasteboard = makePasteboard()
        pasteboard.writeObjects([fileURL as NSURL])

        let attachment = try #require(ComposerAttachment.attachments(from: pasteboard).first)
        #expect(attachment.kind == .image)
        #expect(attachment.hasImage)
        #expect(attachment.absolutePath == fileURL.path)
    }

    // MARK: - 图片归一化

    @Test func largeImagesAreDownscaledToTheLongEdgeCeiling() throws {
        let normalized = try #require(ComposerAttachment.normalizedJPEG(from: makeImage(width: 2400, height: 1200)))
        #expect(normalized.pixelSize.width == 1280)
        #expect(normalized.pixelSize.height == 640)
        #expect(normalized.data.count > 0)
    }

    @Test func smallImagesAreNotUpscaled() throws {
        // 放大只会更糊、还更费 token —— 用户贴一张 200×200 的小图，它就该原样发出去。
        let normalized = try #require(ComposerAttachment.normalizedJPEG(from: makeImage(width: 200, height: 150)))
        #expect(normalized.pixelSize == CGSize(width: 200, height: 150))
    }

    // MARK: - 提示词块

    @Test func emptyAttachmentsProduceNoPromptBlock() throws {
        // 这条快路径很重要：绝大多数轮次没有附件，提示词必须与从前**一字不差**。
        #expect(ComposerAttachment.promptBlock(for: []) == nil)
    }

    @Test func promptBlockListsPathsAndSaysItIsMaterialNotInstructions() throws {
        let folder = ComposerAttachment(id: "f1", kind: .folder, displayName: "资料",
                                        absolutePath: "/tmp/资料", imageData: nil,
                                        pixelSize: nil, childCount: 12)
        let file = ComposerAttachment(id: "f2", kind: .file, displayName: "b.pdf",
                                      absolutePath: "/tmp/b.pdf", imageData: nil,
                                      pixelSize: nil, childCount: nil)
        let block = try #require(ComposerAttachment.promptBlock(for: [folder, file]))

        #expect(block.contains("<attachments>"))
        #expect(block.contains("</attachments>"))
        #expect(block.contains("/tmp/资料"))
        #expect(block.contains("12 项"))
        #expect(block.contains("/tmp/b.pdf"))
        // 权威级别：这是**材料**，不是指令（与 <screen_contents> 同一条口径）。
        #expect(block.contains("不是指令"))
        // 有文件类附件时才提"自己去读"，纯图片的一轮不该出现这句。
        #expect(block.contains("不要猜"))
        #expect(ComposerAttachment.promptBlock(for: [folder])?.contains("不是指令") == true)
    }

    @Test func claudeCodePreamblePairsEachImageWithItsWrittenPath() throws {
        let image = ComposerAttachment(id: "i1", kind: .image, displayName: "shot.png",
                                       absolutePath: "/Users/x/shot.png",
                                       imageData: Data([0x01]), pixelSize: CGSize(width: 10, height: 10),
                                       childCount: nil)
        let file = ComposerAttachment(id: "i2", kind: .file, displayName: "notes.md",
                                      absolutePath: "/Users/x/notes.md", imageData: nil,
                                      pixelSize: nil, childCount: nil)

        let preamble = try #require(ComposerAttachment.claudeCodePreamble(
            for: [image, file],
            writtenImagePaths: ["/App/AgentAttachments/附件-1-shot.jpg"]
        ))

        // 图片走**落盘路径**（那是这一轮新写的、一定在），文件走它自己的绝对路径。
        #expect(preamble.contains("/App/AgentAttachments/附件-1-shot.jpg"))
        #expect(preamble.contains("/Users/x/notes.md"))
        #expect(preamble.contains("不要猜"))
    }

    // MARK: - 上限

    @Test func imageCountAndTotalCountAreCapped() throws {
        let store = ComposerAttachmentStore.shared
        let cardID = "test-card-\(UUID().uuidString)"
        defer { store.removeAll(forCardID: cardID) }

        let images = (0..<8).map { index in
            ComposerAttachment(id: "img-\(index)", kind: .image, displayName: "p\(index).png",
                               absolutePath: nil, imageData: Data([0x01]),
                               pixelSize: CGSize(width: 4, height: 4), childCount: nil)
        }
        store.add(images, forCardID: cardID)
        #expect(store.attachments(forCardID: cardID).count == ComposerAttachmentStore.maximumImages)

        // 到顶之后**文件仍然进得来** —— 它只是一条路径，几乎不要钱。
        let file = ComposerAttachment(id: "file-1", kind: .file, displayName: "a.txt",
                                      absolutePath: "/tmp/a.txt", imageData: nil,
                                      pixelSize: nil, childCount: nil)
        store.add([file], forCardID: cardID)
        #expect(store.attachments(forCardID: cardID).count == ComposerAttachmentStore.maximumImages + 1)

        // 总数上限对"全是文件"的情况同样生效。
        let manyFiles = (0..<40).map { index in
            ComposerAttachment(id: "many-\(index)", kind: .file, displayName: "f\(index)",
                               absolutePath: "/tmp/f\(index)", imageData: nil,
                               pixelSize: nil, childCount: nil)
        }
        store.add(manyFiles, forCardID: cardID)
        #expect(store.attachments(forCardID: cardID).count == ComposerAttachmentStore.maximumTotal)
    }

    @Test func removingOneAttachmentLeavesTheRestInOrder() throws {
        let store = ComposerAttachmentStore.shared
        let cardID = "test-card-\(UUID().uuidString)"
        defer { store.removeAll(forCardID: cardID) }

        let items = (0..<3).map { index in
            ComposerAttachment(id: "item-\(index)", kind: .file, displayName: "f\(index)",
                               absolutePath: "/tmp/f\(index)", imageData: nil,
                               pixelSize: nil, childCount: nil)
        }
        store.add(items, forCardID: cardID)
        store.remove(id: "item-1", forCardID: cardID)

        // 顺序就是粘贴顺序（缩略图条从左到右按它画），删一条不该打乱它。
        #expect(store.attachments(forCardID: cardID).map(\.id) == ["item-0", "item-2"])
    }

    // MARK: - 送给模型的图片载荷

    @Test func imagePayloadsCarryOnlyImagesAndLabelThemForTheModel() throws {
        let image = ComposerAttachment(id: "i1", kind: .image, displayName: "a.png",
                                       absolutePath: "/Users/x/a.png", imageData: Data([0x09]),
                                       pixelSize: CGSize(width: 1280, height: 720), childCount: nil)
        let folder = ComposerAttachment(id: "i2", kind: .folder, displayName: "资料",
                                        absolutePath: "/tmp/资料", imageData: nil,
                                        pixelSize: nil, childCount: 3)

        let payloads = ComposerAttachment.imagePayloads(for: [image, folder])
        #expect(payloads.count == 1)
        #expect(payloads.first?.data == Data([0x09]))
        // label 是给模型看的一句话：它要能分辨"这张是哪来的"。
        #expect(payloads.first?.label.contains("a.png") == true)
        #expect(payloads.first?.label.contains("1280×720") == true)
    }
}
