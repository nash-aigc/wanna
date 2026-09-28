import SwiftUI

/// **看板卡片的轮廓 —— 纯几何，不碰任何 store / 网络 / UI 状态。**
///
/// 单独一个文件是**为了能脱离整个 App 单独编译**：`scripts/direction-board-corner-probe.swift`
/// 就是把它 + 一个 `AnswerCardView.cardCornerRadius` 的桩编译成命令行程序，直接在像素上验形状
///（凹口里不许有线、凹口左上角必须是圆角、左边缘与横杠下沿必须画到）。
/// 这条需求用户前后指过六次，所以判据要能自己跑，而不是每次靠截图眼看 ✓
///（同 `VolcengineASRFrame` / `NotionNoteDetector` 那几处的理由）。

/// **7 字形那条轮廓**：左上一条横杠 + 右侧一整条竖条（长出来的是那条竖条）。
///
/// 用户 2026-09-28 给的形状 —— 右下角那张 AI 回复卡就嵌进 **凹口** 里（横杠在上、竖条在右）。
/// 四个外角圆角；**凹口那两个内角都是直角** —— 脑图的左下角先是加了圆角，用户在真机上看过之后
/// 改回直角（2026-09-28：「右侧卡片的左下角，还是设置成**没有圆角**的形式吧」）。
///
/// ⚠️ **左上角那一段圆弧不能漏**（第一版漏了）：`closeSubpath()` 会从底左角直接连回起点，
/// 左边缘于是成了**斜线** —— 屏幕上看就是"整个左边是畸形的梯形"
///（用户 2026-09-28 截图圈出来的正是它）。
/// **卡片的轮廓：一个"口"去掉底边中段**（用户 2026-09-28 定的形状）。
///
/// 他说的是「卡片的形状不是 7，而是 **口** 字的形状」，随后又补一句
/// 「**口（最下面的一条线，删除）**」—— 也就是：
/// 外圈的上、左、右都在 ✓，**底边只保留左右两小段**，中间那段**不画** ✓，
/// 于是中间偏下那块是**敞开的**（洞一直开到底 ✓），透过它看到鼠标和回复卡 ✓。
///
/// ⚠️ 实现上必须是**一条连通的路径** ✗ —— 不能写成"外框 + 一个洞"两个子路径：
/// 那样描边时外框的**底边照样会画出来**（横跨洞的那一条 ✗），而用户要的正是把它删掉 ✓。
/// 单条路径还顺带绕开了填充规则那个坑（两个同向子路径时必须 even-odd 才挖得出洞）。
struct DirectionBoardHollowShape: Shape {
    /// 凹口的左边界（= 左列 harness 的宽度）
    var notchLeadingInset: CGFloat
    /// 凹口的右边界（= 右列"问题"的宽度）
    var notchTrailingInset: CGFloat
    /// 凹口的顶（= 中列"补充｜矛盾"那块的高度）—— 凹口从这一行一直敞到底 ✓
    var notchTopInset: CGFloat
    var cornerRadius: CGFloat = AnswerCardView.cardCornerRadius


    func path(in rect: CGRect) -> Path {
        let radius = max(0, min(cornerRadius, min(rect.width, rect.height) / 2))
        let notchLeft = rect.minX + notchLeadingInset
        let notchRight = max(notchLeft, rect.maxX - notchTrailingInset)
        let notchTop = rect.minY + notchTopInset

        // **一条路径，填充与描边共用** ✓（原来是两条：描边那条去掉"凹口左壁"，填充那条是闭合的
        // 完整轮廓）。2026-09-28 合成一条 —— 因为**老那条填充路径本身也在凹口里画东西**：
        // 它走到凹口左下角时还有"下行 + 底边那一小段 + 左下圆角"，那三个子路径在凹口里描出一块
        // **填充残角**（探针量到 y 891..897 那一小片，在桌面上是一个悬空的暗色小三角 ✗）。
        //
        // 形状的正确讲法只有一句：**卡片 = 横杠 ∪ 右边那条竖列，凹口那块根本不属于卡片** ——
        // 所以轮廓就是这圈边界本身，走到凹口左上角（圆角）就回到起点，中间**没有"左壁"这回事** ✓：
        // 填充自然不漏、描边自然不画、凹口里一个像素都不会有 ✓。
        var path = Path()
        // ① 凹口左上角 = **圆角**（用户 2026-09-28：「能添加圆角吗」，截图里红框圈的就是
        //    卡片左边缘转向横杠下沿的那个直角）—— 半径与卡片另外三个角是同一个数 ✓。
        //    圆心落在横杠里（`notchTop - radius`），圆弧朝角尖鼓出去，于是那一角被切掉 ✓。
        path.move(to: CGPoint(x: notchLeft + radius, y: notchTop))
        path.addArc(center: CGPoint(x: notchLeft + radius, y: notchTop - radius),
                    radius: radius, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        // ② 卡片的左边缘（在横杠那一侧，压在卡片自己的底色上 ✓）→ 左上圆角 → 上边 → 右上圆角
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addArc(center: CGPoint(x: rect.minX + radius, y: rect.minY + radius),
                    radius: radius, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
                    radius: radius, startAngle: .degrees(270), endAngle: .degrees(360), clockwise: false)
        // ③ 右边 → 右下圆角 → 下边（只到凹口右壁）→ 沿凹口右壁往上 → 沿横杠下沿往左回到起点
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
                    radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: notchRight, y: rect.maxY))
        path.addLine(to: CGPoint(x: notchRight, y: notchTop))
        path.addLine(to: CGPoint(x: notchLeft + radius, y: notchTop))
        // 闭合段是**零长度**（终点就是起点）✓ —— 填充分不出、描边画不出，两条路同一份几何 ✓。
        path.closeSubpath()
        return path

    }
}
