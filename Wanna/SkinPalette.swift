//
//  SkinPalette.swift
//  Wanna
//
//  **窗口皮肤**（2026-09-28 用户：「最好能做成皮肤切换的（设置页面里面能手动切换），
//  当前的风格先保留，增加一个风格」；并明确 **不要透明**）。
//
//  ## 为什么是这个形状
//
//  `DS.Colors.*` 被 **664 处**读。要能切换，token 必须变成运行时可变的，有两条路：
//    · 逐个调用点改成读主题对象 —— 664 处手改，而且以后每写一处都可能写回静态的 ✗；
//    · **token 保持同名，改成计算属性**，读 `SkinPalette.active` —— **调用点一行都不用改** ✓。
//  选了第二条。所以 `DS.Colors.surface1` 这个写法在全仓库一个字都没变。
//
//  ## 改的是"外壳"，不是"语义"
//
//  只把**地基/面板/边框/文字/强调色/气泡**这些"外壳"放进皮肤。
//  `success` / `warning` / `destructive` / `info` **不参与切换** —— 绿就是绿、红就是红，
//  它们表达的是状态，不该跟着皮肤变（这也是它们读得最多的原因：83 次）。
//
//  ## `current` 是逐字照抄的
//
//  用户要求「当前的风格先保留」。所以 `current` 里每一个值都是从原 `DS.Colors` 抄过来的，
//  **一个 bit 都没改** —— 默认皮肤与这次改动之前**像素级相同**，不是"看起来差不多"。
//
//  ## 玻璃皮肤为什么不透明也能像玻璃
//
//  参考页（`设计稿/Wanna窗口-30种风格.html`）的 `[data-theme="glass"]` 用的是
//  `rgba(255,255,255,.055)` 这类**半透明白**叠在一个深色底上 + `backdrop-filter`。
//  而**背后是平的深色底时，模糊等于没模糊** —— 所以那层 `backdrop-filter` 在这里是空的，
//  真正造出玻璃感的是"半透明白的分层 + 细白边"。于是把每一层**预先混成不透明等价色**
//  （脚本算的，不是估的），就得到了同样的观感而**窗口完全不透明** —— 这正是用户要的。
//
//  ⚠️ 玻璃皮肤里**卡片比底亮**，和 `current` 相反（current 是"卡片比底暗"，照参考页的
//  `--card` 来的）。这是参考页那套玻璃设计本身的方向，不是写错了。
//

import SwiftUI

nonisolated struct SkinPalette: Sendable {

    // 地基
    let background: Color
    let surface1: Color        // 窗口/面板底
    let surface2: Color        // 卡片底
    let surface3: Color        // 侧栏底 / 悬停地面
    let surface4: Color        // 按下态

    // 边框
    let borderSubtle: Color
    let borderStrong: Color

    // 文字
    let textPrimary: Color
    let textSecondary: Color
    let textTertiary: Color

    // 强调色
    let accent: Color
    let accentHover: Color
    let accentText: Color
    let accentSubtle: Color

    // 气泡
    let userBubbleFill: Color
    let assistantBubbleFill: Color
    let assistantBubbleBorder: Color

    /// **当前生效的皮肤。** 由 App 在启动时与设置变更时写入。
    ///
    /// `nonisolated(unsafe)`：写入只在主线程（保存设置那一条路），读取发生在 SwiftUI 求值
    /// 期间（也在主线程）。最坏的情况是某一帧读到半个旧调色板 —— 而切换是用户按一下才发生的
    /// 一次性动作，为此在每个 token 读取上挂锁不值得（664 处 × 每帧）。
    nonisolated(unsafe) static var active: SkinPalette = .current

    // MARK: - 当前风格（逐字照抄改动之前的值）

    static let current = SkinPalette(
        background: Color(hex: "#050506"),
        surface1: Color(hex: "#18181C"),
        surface2: Color(hex: "#0C0C0E"),
        surface3: Color(hex: "#101014"),
        surface4: Color(hex: "#1A1A1E"),
        borderSubtle: Color(hex: "#1D1D21"),
        borderStrong: Color(hex: "#2A2A2E"),
        textPrimary: Color(hex: "#F2F2F4"),
        textSecondary: Color(hex: "#B9B9C2"),
        textTertiary: Color(hex: "#8A8A93"),
        accent: Color(hex: "#0A84FF"),
        accentHover: Color(hex: "#0873DB"),
        accentText: Color(hex: "#3D9DFF"),
        accentSubtle: Color(hex: "#0A84FF").opacity(0.10),
        userBubbleFill: Color(hex: "#2E2E34"),
        assistantBubbleFill: Color(hex: "#242429"),
        assistantBubbleBorder: Color.white.opacity(0.12)
    )

    // MARK: - 玻璃拟态（参考页 C1）
    //
    // 每个值都注明它是参考页哪一行的不透明等价色。

    static let glass = SkinPalette(
        // 窗口底：CSS `#stage { rgba(24,26,34,.72) }` 的不透明等价（桌面在背后，取本色）。
        background: Color(hex: "#181A22"),
        // 面板底同上 —— 窗口本身保持不透明（用户 2026-09-28：「不要透明」）。
        surface1: Color(hex: "#181A22"),
        // `.sb-card` / `.msg .bubble` 的 `rgba(255,255,255,.06~.08)` 叠在窗口底上。
        surface2: Color(hex: "#26282F"),
        // `.sidebar` 的 `rgba(255,255,255,.055)`。
        surface3: Color(hex: "#25272E"),
        surface4: Color(hex: "#2D2F36"),
        // `.sidebar { border-right: 1px solid rgba(255,255,255,.14) }`。
        borderSubtle: Color(hex: "#36383F"),
        borderStrong: Color(hex: "#3D3F45"),
        // 文字沿用（参考页在玻璃皮肤下没有改文字色）。
        textPrimary: Color(hex: "#F2F2F4"),
        textSecondary: Color(hex: "#C3C3CC"),
        textTertiary: Color(hex: "#9494A0"),
        // `.mode-chip.active { rgba(10,132,255,.55) }` —— 蓝与 current 是同一个（10,132,255）。
        accent: Color(hex: "#0A84FF"),
        accentHover: Color(hex: "#2E97FF"),
        accentText: Color(hex: "#5FB0FF"),
        accentSubtle: Color(hex: "#0A84FF").opacity(0.18),
        // `.msg.user .bubble { rgba(10,132,255,.5) }` 叠在窗口底上。
        userBubbleFill: Color(hex: "#114F90"),
        assistantBubbleFill: Color(hex: "#2A2C34"),
        assistantBubbleBorder: Color.white.opacity(0.16)
    )
}

/// 用户能选的两个皮肤。**存成字符串**（认不出的值回落成 `current`，本仓 E1 规则）。
nonisolated enum WindowSkin: String, CaseIterable, Sendable {
    case current
    case glass

    var displayName: String {
        switch self {
        case .current: return "深色"
        case .glass: return "玻璃拟态"
        }
    }

    var palette: SkinPalette {
        switch self {
        case .current: return .current
        case .glass: return .glass
        }
    }
}
