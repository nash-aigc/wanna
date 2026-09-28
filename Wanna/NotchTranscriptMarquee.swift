//
//  NotchTranscriptMarquee.swift
//  Wanna
//
//  刘海下面那一行**平滑滚动**的实时字幕。录音带用它，主 Agent 的 Listening 也用它
//  （用户 2026-09-27：「直接照搬这个代码就可以了，完整的复制过来」）。
//
//  同一天稍后，**展开之后的那个转写编辑窗**也抽到了这个文件里
//  （`NotchExpandedTranscriptPanel`）：用户对主 Agent 那条的要求是「整个的排版，整个的
//  效果，包括展开之后这个窗口…这个东西是完全照搬过来的」，所以它只能是同一份视图。
//
//  文件头不再重复它的实现细节 —— 那些都在这个结构自己的注释里，**照搬、别重写**。
//

import SwiftUI

/// **刘海下面那一行滚动字幕**（2026-09-27 从 `NotchRecordingOverlay.swift` 原样搬出来）。
///
/// 用户在大调整里点名要它：「直接照搬这个代码就可以了，完整的复制过来，因为它本质上就是一个
/// 语音识别、转换成文字发给 AI」—— 所以这里**一行逻辑都没改**，只是从私有改成 internal，
/// 让主 Agent 那条路（Listening 时的字幕）也能用同一个视图。
///
/// **它为什么难**（下面那些注释是十次失败换来的，读一遍再动）：位移是
/// `可用宽度 − 文字宽度`，所以文字一变短就往右跳；显示源必须只增不减、窗口上限必须带迟滞、
/// 窗口必须能长。**这些坑在 2026-09-28 那一版里被换掉了**（改成"字符索引做权威状态 +
/// 时钟驱动"），但结论仍在 `SmoothRevealedTranscriptText` 的注释里留着。
struct SmoothRevealedTranscriptText: View {
    let text: String
    /// 这一行能用多少宽度。
    let availableWidth: CGFloat
    var textColor: Color = .white

    private static let fontSize: CGFloat = 15

    // ── 这一版之前的那十次失败（留着：里面的实测数字还在被别处引用）──
    //
    // 旧实现是"事件驱动 + 调参"：文字一到就用 `withAnimation` 把位移挪到新位置，时长由
    // "距上一条结果的间隔"或"距离 ÷ 速度"算。它被用户否掉两次以上，最后一句是
    // 「必须完全等速」。三条实测结论**继续有效**：
    //   · 识别结果是**成批**到达的，实测间隔 300–400ms（每秒约 3 批），而"这一批要走多远"
    //     由本批字数决定 —— 两个量互相独立，所以速度结构上不可控；
    //   · 汉字 advance 恒为 **14.883268pt**（纯中文、等宽字体），半宽标点 7.587549pt。
    //     定长窗口满员之后宽度一个 bit 都不变 —— 那是「停住不动、然后突然跳一下」的根因；
    //   · 固定时长 0.6s / 0.1s 两版都更糟：前者"字永远在追"，后者把掉帧暴露成逐字台阶。
    //
    // 现在的做法把"位置"从事件里拿出来、交给时钟（见 `body` 上面那一段）。


    /// **滚动的权威状态在 `TranscriptMarqueeFeed` 里，像素永远现算、从不累积。**
    ///
    /// 这一版换掉了整套"事件驱动 + 调参"的做法（`adaptiveSlideDuration` /
    /// `cappedSlideDuration` / 宽度缓存 / 窗口裁剪那一大套），原因是它们在结构上
    /// 不可能等速：位置由"来了一批字"这个**事件**推着走，而每次走多远、用多久是两个
    /// 控制不了的量，比值就是速度。用户的原话是「必须完全等速」——
    /// 那要求位置的导数是常数，只有**时钟**能给，事件给不了。
    ///
    /// 现在是三层（用户 2026-09-28 给的方案）：
    ///   · 数据层 `TranscriptScrollState`：权威状态 = 已消费字数 + 字内相位；
    ///   · 调度层 `TranscriptScrollScheduler`：速度是受控变量（基速 + 伺服 + 限幅 + 跳尾兜底）；
    ///   · 渲染层 `TranscriptMarqueeLayer`：位移交给 Core Animation，主线程卡住也不掉速。
    var body: some View {
        TranscriptMarqueeView(feed: feed)
            .frame(width: availableWidth, alignment: .leading)
            .onAppear {
                feed.font = .systemFont(ofSize: Self.fontSize, weight: .medium)
                feed.update(text: text)
            }
            // 文本到达 → 交给 feed（它会钳回公共前缀、必要时滑动窗口、并通知渲染层重设动画）。
            .onChange(of: text) { _, newText in
                feed.update(text: newText)
            }
    }

    @StateObject private var feed = TranscriptMarqueeFeed()

}

/// **那一条字幕的外壳**：黑底、两端渐隐、内容按"可用宽度 − 文字宽度"平滑左移。
///
/// 从录音带的 `transcriptRibbon` 原样抽出来（2026-09-27），因为主 Agent 的 Listening
/// 要**一模一样**的那一条（用户：「整个的排版，整个的效果…完全照搬过来」）。抽出来之后
/// 两处共用同一份宽度、内边距、渐隐位置与遮罩 —— 各写一份必然漂。
///
/// - Parameters:
///   - cornerRadius: 圆角。录音带收起时是 22（下圆角，与刘海拼在一起），展开时由面板那一层裁；
///     主 Agent 那条按同一套传 22 即可。
///   - isAttachedToNotch: true = 上边是方的（与刘海那条黑带无缝拼接）。
struct NotchTranscriptLine: View {

    let text: String
    /// 整条外框的宽度。
    let width: CGFloat
    /// 内容区左右各留多少（录音带是 12）。
    var horizontalInset: CGFloat = 12
    var height: CGFloat = 32
    var textColor: Color = .white
    /// 圆角；`isAttachedToNotch` 为真时只圆下面两个角。
    var cornerRadius: CGFloat = 22
    var isAttachedToNotch: Bool = true

    var body: some View {
        SmoothRevealedTranscriptText(text: text,
                                     availableWidth: width - horizontalInset * 2,
                                     textColor: textColor)
            .frame(width: width - horizontalInset * 2, height: height, alignment: .trailing)
            .clipped()
            .mask(
                // 左右渐出渐隐，两端各 13%。
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: .black, location: 0.13),
                        .init(color: .black, location: 0.87),
                        .init(color: .clear, location: 1.0),
                    ],
                    startPoint: .leading, endPoint: .trailing
                )
            )
            // 先撑回整条的宽度，再铺黑底、按形状裁剪 —— 顺序不能换：
            // 反过来的话圆角会被外层内容盖掉。
            .frame(width: width, height: height)
            .background(Color.black)
            .clipShape(isAttachedToNotch
                       ? AnyShape(Rectangle())
                       : AnyShape(RecordingRibbonShape(cornerRadius: cornerRadius)))
    }
}

/// 展开之后的**转写编辑窗**：顶上一行实时转写（黑底、绿字），下面是一整块可编辑正文。
///
/// 2026-09-27 从录音带的 `NotchRecordingOverlay.expandedTranscriptPanel` **原样抽出来**，
/// 两处共用：录音带用它（正文是 `recorder.transcriptDisplayText`，⌘S 存草稿、⌘Enter 复制并
/// 结束这一场），**主 Agent 说话时的 Listening 也用它** —— 用户的原话是
/// 「我让 listening 可以被点击，点击之后展开，展开的是录音，可以让用户编辑录音里面的内容，
/// 整个的排版、整个的效果，包括展开之后这个窗口，它最上面是一行是转写的内容，然后下面是正文，
/// 这个东西是**完全照搬过来**的」。
///
/// **抽出来而不是抄一份**：抄一份就意味着两边会各自漂（这个仓库为「两处各写一遍」付过的代价
/// 写在 `开发经验/10-踩过的坑.md`），而用户要的恰恰是**一模一样**。
///
/// 几何：整块面板 `panelWidth × notchTranscriptEditorBodyHeight`，顶行 46pt 是纯黑
///（它和上面的刘海黑带连成一片），再往下的正文区才是软浮雕底；底角 22 圆角、上边方 ——
/// 上边与屏幕顶边相接，圆了会在接缝处露出桌面。
///
/// 两处传的都是「带子宽 × 2」：录音带展开时这块比黑带**宽一倍**（用户要求「宽度再增加两倍，
/// 然后居中对齐」），主 Agent 那条照抄同一个比例。**面板最下面不再多出一条黑边** ——
/// 那一行已经搬到顶行、和黑带连成一片了（用户报过「弹出窗口的最下面应该没有黑色，现在还有黑色」）。
struct NotchExpandedTranscriptPanel: View {

    /// 顶行那一行实时转写的内容。
    let topLineText: String
    /// 整块面板的宽度（两处都传「带子宽 × 2」）。
    let panelWidth: CGFloat
    /// 正文，可编辑。
    @Binding var bodyText: String

    /// ⌘S。录音那条是「保存草稿」；主 Agent 那条**没有草稿可存**（改的字在这一句提交时
    /// 自动生效，见 `NotchListeningTranscriptModel`），所以传 nil —— 那一颗不画，
    /// 免得留一个按下去什么都不做的快捷键。
    var savesDraft: (() -> Void)?
    /// ESC / 收起。
    let onCollapse: () -> Void
    /// ⌘Enter：复制全部 + 收起（录音那条还多一步「结束这场录音」，由调用方在闭包里带上）。
    let onCopyAllAndCollapse: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // 顶行 = 实时转写那一行，**整整一行都给它**（复制按钮从这一行删掉了，
            // 用户：「把整个第一行右侧的复制按钮删掉，让第一行全部显示转写的内容」）。
            SmoothRevealedTranscriptText(text: topLineText,
                                         availableWidth: panelWidth - 32,
                                         textColor: DS.Colors.success)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: 46)
                .background(Color.black)

            TextEditor(text: $bodyText)
                .font(.system(size: 17))
                .foregroundColor(EmbossMaterial.textPrimary)
                // 用户要求「行间距稍微再增大一点」。
                .lineSpacing(9)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                // 正文**左右两边的边框删掉** —— 用户：「展开后显示红色方框的内容，
                // 左右两边的边框删掉」。正文直接铺在窗口底上、占满整宽。
                .background(
                    Group {
                        if let savesDraft {
                            // ⌘S。不按也会在折叠时自动保存（用户要求），这个快捷键只是
                            // 给一个「我确认过了」的显式动作。
                            Button("") { savesDraft() }
                                .keyboardShortcut("s", modifiers: .command)
                                .opacity(0)
                        }
                    }
                )
                // ESC 折叠（用户要求：「用户点击 ESC 自动折叠刚才展开的部分」）。
                .onExitCommand { onCollapse() }
                .padding(.bottom, 16)

            // ⌘Enter：复制全部 + 关窗（录音那条再多一步结束转写）。
            Button {
                onCopyAllAndCollapse()
            } label: {
                EmptyView()
            }
            .keyboardShortcut(.return, modifiers: .command)
            .opacity(0)
            .frame(width: 0, height: 0)
        }
        .frame(width: panelWidth,
               height: NotchSupport.notchTranscriptEditorBodyHeight,
               alignment: .bottom)
        // 风格 01 · 软浮雕：窗口底 #26262b，比面板 #2e2e34 暗一档。
        // 上面那条黑带仍是纯黑 —— 它要和硬件刘海熔成一体，不参与材质。
        .background(EmbossMaterial.page)
        .clipShape(RecordingRibbonShape(cornerRadius: 22, roundsTopCorners: true))
    }
}

