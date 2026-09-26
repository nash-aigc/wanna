//
//  NotchTranscriptMarquee.swift
//  Wanna
//
//  刘海下面那一行**平滑滚动**的实时字幕。录音带用它，主 Agent 的 Listening 也用它
//  （用户 2026-09-27：「直接照搬这个代码就可以了，完整的复制过来」）。
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
    private static let slideDuration: Double = 0.6
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
        let targetOffset = availableWidth - Self.width(of: shown)

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
                slideOffset = availableWidth - Self.width(of: String(text.dropFirst(windowStart)))
            }
            .onChange(of: text) { _, newText in
                let total = newText.count
                // 窗口太长时把左端推近。**裁掉的是屏幕外面那部分**，而右边缘仍然钉住，
                // 所以屏幕上**看不出任何变化** —— 这一步不带动画是安全的。
                let truncated = total - windowStart
                    > Self.maximumWindowCharacters + Self.trimHysteresisCharacters
                if truncated {
                    windowStart = total - Self.maximumWindowCharacters
                    slideOffset = availableWidth - Self.width(of: String(newText.dropFirst(windowStart)))
                    return
                }
                let shownNow = String(newText.dropFirst(windowStart))
                withAnimation(.linear(duration: Self.slideDuration)) {
                    slideOffset = availableWidth - Self.width(of: shownNow)
                }
            }
    }

    /// 用同一个字体直接量文字宽度。批判者实测过：SwiftUI 自己渲染的宽度 =
    /// `ceil(NSString 量出来的)` ±1pt，两者一致，所以拿它算位移是可靠的。
    private static func width(of string: String) -> CGFloat {
        guard !string.isEmpty else { return 0 }
        let font = NSFont.systemFont(ofSize: fontSize, weight: .medium)
        return (string as NSString).size(withAttributes: [.font: font]).width
    }
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
