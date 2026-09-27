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
/// 窗口必须能长。改之前先读 `maximumWindowCharacters` 与 `trimHysteresisCharacters` 那两段。
struct SmoothRevealedTranscriptText: View {
    let text: String
    /// 这一行能用多少宽度。
    let availableWidth: CGFloat
    var textColor: Color = .white

    private static let fontSize: CGFloat = 15
    /// 一次位移用多久滑完。
    ///
    /// **必须大于服务端的到达间隔（实测 300–400ms）。** 这是实测结论：动画时长
    /// 0.35s 配 400ms 间隔时，每段动画都跑完了下一批还没到 —— 实测 **9.0% 的时间完全
    /// 静止**，单次停顿中位 38ms，表现成 2.5 次/秒的「走—停—走」方波，正是用户说的
    /// 「停住不动、然后突然向左移动一下」。
    ///
    /// 0.6s 让动画永远跑不完，被下一批**从当前呈现值**平滑接上（这一点也是实测的：
    /// 5 组配置 + 21 次真实重定目标，打断瞬间的位置跳变**全是 0.000pt**）—— 于是
    /// 连续说话时屏幕上的位移是连续的，没有静止段。
    /// **一个字的滑动用多久 —— 按"距上一条结果多久"自适应。**
    ///
    /// 两版都试过、都被用户当场否掉，这一条把两次教训都记下来：
    ///
    /// · **0.6 秒（固定）**：识别结果每 ~0.1 秒来一条（每秒约 10 次累积文本），
    ///   每一条都起一段 0.6 秒的动画、100ms 后就被下一条打断 —— 每小段只走完约 1/6 的距离，
    ///   目标又往前跑了，字**永远在追**（用户报「非常卡顿」）。
    /// · **0.1 秒（固定）**：动画刚好在下一条到达时结束，理论上连成匀速 ——
    ///   实测**更糟**：屏幕上是「**一个字一个字、一段一段地移动**」，而且**连录音那条也跟着卡了**
    ///   （用户 2026-09-27 第二次报，影响面比第一次更大）。说明瓶颈不在时长，而在**渲染跟不上**：
    ///   间隔取满只会把"渲染掉帧"暴露成看得见的台阶。
    ///
    /// 所以现在**不猜**：每一段动画的时长 = **距上一条结果的实际间隔**（0.06…0.6 之间夹住）。
    /// 结果来得密，动画就短（一次位移只有十几 pt，短动画看不出台阶）；来得疏就长。
    /// ⚠️ 真正的根因要等采样说话（见 `开发经验/19` 第五版"没验到"那一段）——
    /// 这一版只是先把"比原来更差"这个回归止住。
    private static let slideDurationLowerBound: Double = 0.06
    private static let slideDurationUpperBound: Double = 0.6
    @State private var lastUpdateAt: Date?
    /// 窗口的**基准**字数。
    private static let maximumWindowCharacters = 160
    /// 裁剪的迟滞：窗口再多长这么多字才裁一次。
    ///
    /// **没有这个迟滞，上限就等于把窗口变回了定长窗口 —— 而那正是最初的根因。**
    /// 原条件是「超过 160 就裁到 160」，于是文本一过 160 字，**每来一个字都裁一次**：
    /// `windowStart` 前进 1、窗口永远 160 字、**宽度恒定不变** → 位移不变 →
    /// `onChange` 不触发 → 动画再也不被调度。而窗口内容每来一个字就换一格，屏幕上
    /// 就是一个字一个字地瞬跳。160 字 ≈ 6–10 秒语音，正好是用户说的「过了几秒钟、
    /// 十几秒之后就不丝滑了」。
    ///
    /// 有了迟滞，窗口在 160↔220 之间**先长后裁**：长的那 60 个字宽度一直在增，动画
    /// 一直在跑；裁的那一下右边缘仍然钉着、可见内容逐字不变，所以看不出来。
    private static let trimHysteresisCharacters = 60

    /// 窗口左端在全文里的位置。
    ///
    /// **这是这一版的关键，也是前十次全错的根源。**
    ///
    /// 之前用的是 `text.suffix(64)` —— 一个**定长**窗口。窗口满了之后，「前面掉出一个
    /// 汉字、后面进来一个汉字」会让窗口的**宽度一个 bit 都不变**（实测：汉字 advance
    /// 恒为 14.883268pt，纯中文 64 字窗口恒为 952.53pt）。而位移是
    /// `availableWidth - 窗口宽度`，所以位移**再也不变**，`onChange` **一次都不触发**，
    /// `withAnimation` **从来没有被执行过**。
    ///
    /// 屏幕上之所以还有位移，是因为窗口的**内容**被整串换掉、瞬时生效 —— 那一跳和
    /// 位移量无关，所以不受任何动画保护。这就是「停住不动、然后突然向左跳一下」。
    /// 而唯一还能改变宽度的东西是**半宽的标点**（「，」「。」实测 7.587549pt，正好
    /// 半个汉字），于是屏幕上唯一还会动的步长就是半个字 —— 这就是「半个字半个字地蹦」。
    ///
    /// 换成「由这个游标控制的**变长**窗口」之后，每来一个字窗口就真的变宽 14.88pt，
    /// 位移随之变化，动画每一次都被调度。
    @State private var windowStart = 0
    @State private var slideOffset: CGFloat = 0

    var body: some View {
        let shown = String(text.dropFirst(windowStart))
        // **文字右边缘永远钉在这一行的右端**，随着字变多向左长 ——
        // 用户的要求：「无论是第一个字还是第二个字，永远都是从右向左移动」。
        let measuredWidth = widthCache.width(of: shown)
        let targetOffset = availableWidth - measuredWidth

        Text(shown.isEmpty ? " " : shown)
            .font(.system(size: Self.fontSize, weight: .medium))
            .foregroundColor(textColor)
            .lineLimit(1)
            .fixedSize()
            // **文字不进动画事务**（动画只挂在 `slideOffset` 上）。否则 SwiftUI 会把
            // 「旧文字→新文字」也当成可动画的变化，两个版本同时画 = 叠影。
            .offset(x: slideOffset)
            .frame(width: availableWidth, alignment: .leading)
            .clipped()
            .onAppear {
                windowStart = max(0, text.count - Self.maximumWindowCharacters)
                slideOffset = availableWidth - widthCache.width(of: String(text.dropFirst(windowStart)))
            }
            // **这一行的宽度变了也要重新钉右边缘**（2026-09-27）。
            //
            // 它以前只跟着 `text` 变：Listening 那条字幕的宽度现在是**动画**的
            //（展开时从刘海那么宽长到整条），而 `onAppear` 是在**宽度还很小**的时候算的
            // `slideOffset` —— 于是文字先画在**左边**，等第一句转写到达再"跳"到右边、
            // 然后才向左走（用户 2026-09-27：「文字从左边出现，先跳到最右边，再从右到左移动」）。
            // 录音带那条没有这个现象，是因为它的宽度从第一帧就是最终的宽度。
            // 宽度变了就**不带动画**地重新钉一次右边缘 —— 那正是"文字右边缘永远钉在右端"的定义。
            .onChange(of: availableWidth) { _, newWidth in
                slideOffset = newWidth - widthCache.width(of: String(text.dropFirst(windowStart)))
            }
            .onChange(of: text) { _, newText in
                let duration = adaptiveSlideDuration()
                let total = newText.count
                // 窗口太长时把左端推近。**裁掉的是屏幕外面那部分**，而右边缘仍然钉住，
                // 所以屏幕上**看不出任何变化** —— 这一步不带动画是安全的。
                let truncated = total - windowStart
                    > Self.maximumWindowCharacters + Self.trimHysteresisCharacters
                if truncated {
                    windowStart = total - Self.maximumWindowCharacters
                    slideOffset = availableWidth - widthCache.width(of: String(newText.dropFirst(windowStart)))
                    return
                }
                let shownNow = String(newText.dropFirst(windowStart))
                withAnimation(.linear(duration: duration)) {
                    slideOffset = availableWidth - widthCache.width(of: shownNow)
                }
            }
    }

    /// 这一段的动画时长 = **距上一条结果的实际间隔**（夹在 0.06…0.6 之间）。
    ///
    /// 顺带把"上一条是什么时候"记下来（`lastUpdateAt`），下一次就用它算间隔。
    private func adaptiveSlideDuration() -> Double {
        let now = Date()
        let interval = lastUpdateAt.map { now.timeIntervalSince($0) } ?? Self.slideDurationUpperBound
        lastUpdateAt = now
        return min(max(interval, Self.slideDurationLowerBound), Self.slideDurationUpperBound)
    }

    /// 用同一个字体直接量文字宽度。批判者实测过：SwiftUI 自己渲染的宽度 =
    /// `ceil(NSString 量出来的)` ±1pt，两者一致，所以拿它算位移是可靠的。
    private static func width(of string: String) -> CGFloat {
        guard !string.isEmpty else { return 0 }
        let font = NSFont.systemFont(ofSize: fontSize, weight: .medium)
        return (string as NSString).size(withAttributes: [.font: font]).width
    }

    /// **带上"上次量过的那一串 + 它的宽度"的量化器** —— 卡顿的根因就在这里。
    ///
    /// 2026-09-27 用 `sample` 量出来的事实（自检按 12 字/秒喂假文本、相位钉在 Listening）：
    /// `body` 的 44 个样本里 **40 个**在 `width(of:)` 上 —— 也就是这一行每次重画的时间
    /// **约 91% 花在"拿整串去问 NSString 有多宽"**。而它每次 body 求值量两遍（body 里算一次
    /// 位移、`onChange` 里再算一次），识别结果每秒来约 10 次、串最长 160 字
    ///（`NSString.size(withAttributes:)` 在中文长串上并不便宜）—— 于是掉帧、看起来就是卡。
    ///
    /// 修法是**增量**：识别器给的是**累积**文本，所以新串 = 旧串 + 新增的几个字，
    /// 宽度也就是「上次的宽度 + 新增那几个字的宽度」。汉字 advance 恒定（本仓实测 14.883268pt），
    /// 加法成立。于是每次只量 1~2 个字，而不是 160 个。
    /// 串不是"旧串 + 新字"时（换了新句子、被修剪过）**老老实实整串重量** —— 缓存绝不能猜。
    private struct TextWidthCache {
        var measuredText: String = ""
        var measuredWidth: CGFloat = 0

        mutating func width(of text: String) -> CGFloat {
            if text.isEmpty { measuredText = ""; measuredWidth = 0; return 0 }
            if text == measuredText { return measuredWidth }
            if text.hasPrefix(measuredText), !measuredText.isEmpty {
                let appended = String(text.dropFirst(measuredText.count))
                measuredWidth += SmoothRevealedTranscriptText.width(of: appended)
                measuredText = text
                return measuredWidth
            }
            measuredWidth = SmoothRevealedTranscriptText.width(of: text)
            measuredText = text
            return measuredWidth
        }
    }

    @State private var widthCache = TextWidthCache()
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

