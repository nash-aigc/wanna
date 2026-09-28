import Foundation
import SwiftUI
import CoreGraphics
import ImageIO

// ============================================================================================
// 看板卡片轮廓的**几何探针** —— 把真源码 `Wanna/DirectionBoardShapes.swift` 连同本文件一起编译，
// 在像素上验那几件"用户前后指过六次"的事：
//
//   ① 凹口里**一个像素都不许画**（凹口是透明的，画上去就是桌面上凭空一条线）；
//   ② 凹口左上角**必须是圆角**（用户 2026-09-28：「能添加圆角吗」）；
//   ③ 横杠那一侧的左边缘、横杠下沿、凹口的右壁仍然要画到；
//   ④ 填充（底色）必须完整 —— 圆角切掉的那一角**必须跟着变透明**，否则描边圆角外侧
//      还会露出一角底色 ✗。
//
// 跑法（本文件不在 App 的 target 里，只被这条命令用）：
//   cd /Users/mjm/Documents/SuperAgent/Wanna
//   xcrun swiftc -O scripts/direction-board-corner-probe.swift Wanna/DirectionBoardShapes.swift \
//     -o /tmp/db-corner-probe && /tmp/db-corner-probe
//
// 退出码非 0 = 形状不对，**先改形状再谈别的** ✓（同 `scripts/recording-capture-probe.swift` 的规矩）。
// ============================================================================================

/// 只为了让 `DirectionBoardShapes.swift` 里那个默认参数（`AnswerCardView.cardCornerRadius`）编得过。
/// 值是 `AnswerCardView.swift` 里那个真常量（10）。
enum AnswerCardView {
    static let cardCornerRadius: CGFloat = 10
}

@main
struct DirectionBoardCornerProbe {

    // —— 与真机同一批数（读自 `NotchSupport` / `DirectionBoardView`）——
    /// 凹口顶 = 横杠的高（`NotchSupport.directionBoardBarHeight`）
    static let barHeight: CGFloat = 180
    /// 凹口右边界 = 问题列 250 + harness 列 140
    static let notchTrailingInset: CGFloat = 390
    /// 面板大小（横杠 360 + 竖条 390 = 750，高度取个够高的值）
    static let cardSize = CGSize(width: 750, height: 900)
    static let borderWidth: CGFloat = 1.5
    /// 渲染倍率：与真机那块 2× 屏一致，好让"1pt 的线"量得出 2~3 个像素
    static let scale: CGFloat = 2

    static func main() {
        let rect = CGRect(origin: .zero, size: cardSize)
        // 填充与描边**共用同一个形状**（凹口不属于卡片，所以一条轮廓两边都对 ✓）
        let shape = DirectionBoardHollowShape(
            notchLeadingInset: 0, notchTrailingInset: notchTrailingInset, notchTopInset: barHeight)

        let bitmap = render(fillPath: shape.path(in: rect).cgPath,
                            strokePath: shape.path(in: rect).cgPath)
        var failures: [String] = []
        // ① 凹口里一个像素都不许画（留 1pt 边缘余量，避免和边框的抗锯齿像素打架）
        // ⚠️ 上下各让开 2pt：边界上那 1~2 个抗锯齿像素属于**边框**，不是"凹口里的线" ✓。
        // 让开 2pt 仍然拦得住原来那条 2.5pt 宽的"盖住"色块（它从边界一直贯到卡片下沿 ✓）。
        // 右边界让开 4pt：凹口**右壁**（x=360 那条描边）的抗锯齿像素会落在 359~360 上，
        // 那是墙本身、不是"凹口里的线" ✗（第一版没让，它报了 2864 个像素，全是墙 ✓）。
        let notchInterior = (x: CGFloat(0), y: barHeight + 2,
                             w: CGFloat(360 - 4), h: cardSize.height - barHeight - 4)
        let paintedInNotch = paintedPixels(in: bitmap, region: notchInterior, scale: scale)
        check(paintedInNotch == 0,
              "凹口是透明的，里面一个像素都不该画（实测画了 \(paintedInNotch) 个；"
              + "分布：\(notchArtifactProfile(bitmap, region: notchInterior))）", &failures)

        // ② 凹口左上角是圆角：角尖（离两边的距离都小于半径）必须是空的
        let cornerTipIsEmpty = !isPainted(bitmap, point: CGPoint(x: 2, y: barHeight - 2), scale: scale)
        check(cornerTipIsEmpty, "凹口左上角没圆上（角尖 (2, barHeight-2) 还有东西）", &failures)
        let arcIsStroked = isStroke(bitmap,
                                    point: CGPoint(x: 10 - 10 * 0.7071, y: barHeight - 10 + 10 * 0.7071),
                                    scale: scale)
        check(arcIsStroked, "凹口左上角那条圆弧没画出来（弧上取样点没有描边色）", &failures)

        // ③ 该画到的三处：左边缘（横杠那一侧）、横杠下沿、凹口右壁
        check(isStroke(bitmap, point: CGPoint(x: 0.25, y: barHeight - 40), scale: scale),
              "横杠那一侧的左边缘没画到", &failures)
        check(isStroke(bitmap, point: CGPoint(x: 120, y: barHeight - 0.75), scale: scale),
              "横杠下沿没画到", &failures)
        check(isStroke(bitmap, point: CGPoint(x: 360 - 0.75, y: 500), scale: scale),
              "凹口的右壁没画到", &failures)

        // ④ 填充完整：横杠内部、竖条内部都要有底色；而圆角切掉的那一角**必须没有**
        check(isFill(bitmap, point: CGPoint(x: 200, y: 90), scale: scale),
              "横杠里没有底色（实测 \(describe(bitmap, CGPoint(x: 200, y: 90), scale))", &failures)
        check(isFill(bitmap, point: CGPoint(x: 500, y: 500), scale: scale),
              "竖条里没有底色（实测 \(describe(bitmap, CGPoint(x: 500, y: 500), scale))", &failures)
        check(!isFill(bitmap, point: CGPoint(x: 2, y: barHeight - 2), scale: scale),
              "圆角切掉的那一角里还留着底色（描边圆角外侧会露出一个角）", &failures)

        if failures.isEmpty {
            print("✅ 看板轮廓：凹口干净、左上角圆角、该画的都画到了、填充完整（\(Int(cardSize.width))×\(Int(cardSize.height)) @\(Int(scale))×）")
            exit(0)
        }
        // 失败时把渲染结果落一张图，肉眼能直接看出是形状错了还是探针取像素取错了
        //（这张是给探针调试用的中间产物，不是交付物 ✓）。
        dumpPNG(bitmap)
        for line in failures { print("❌ " + line) }
        print("—— 形状不对，先改 `Wanna/DirectionBoardShapes.swift` 再谈别的 ——")
        exit(1)
    }

    static func dumpPNG(_ buf: [UInt8]) {
        let w = Int(cardSize.width * scale), h = Int(cardSize.height * scale)
        buf.withUnsafeBytes { raw in
            guard let base = raw.baseAddress,
                  let ctx = CGContext(data: UnsafeMutableRawPointer(mutating: base), width: w, height: h,
                                      bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
                  let image = ctx.makeImage(),
                  let dest = CGImageDestinationCreateWithURL(
                      URL(fileURLWithPath: "/tmp/db-corner-probe.png") as CFURL,
                      "public.png" as CFString, 1, nil)
            else { return }
            CGImageDestinationAddImage(dest, image, nil)
            CGImageDestinationFinalize(dest)
            print("（渲染结果已存 /tmp/db-corner-probe.png，可直观看形状）")
        }
    }

    // MARK: - 渲染（复刻视图那两步：clipShape(eoFill) 画底色 + overlay 描边）

    static func render(fillPath: CGPath, strokePath: CGPath) -> [UInt8] {
        let w = Int(cardSize.width * scale), h = Int(cardSize.height * scale)
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        // ⚠️ CGContext 的原点在**左下**、y 向上，而 SwiftUI 的 `Path` 是**左上原点、y 向下** ✗ ——
        // 少了这一翻转，整张图上下镜像，取像素就全取错（第一次跑就是这么扑空的）。
        // 平移量必须是**像素**高（`h`），不是点数高：`translateBy` 写在 `scaleBy` **前面**，
        // 于是它对点生效时已经被 scale 乘过了 ✓。
        ctx.translateBy(x: 0, y: CGFloat(h))
        ctx.scaleBy(x: scale, y: -scale)
        // 底色（对应 `.clipShape(shape, style: FillStyle(eoFill: true))` 里那一层背景）
        ctx.addPath(fillPath)
        // ⚠️ 颜色必须显式建在 **DeviceRGB** 上：`CGColor(red:green:blue:)` 落在 generic RGB（gamma 1.8），
        // 在 DeviceRGB 的位图里会被换算成明显更亮的值 ✗（第一次跑就是它让"底色找不到"）。
        let deviceRGB = CGColorSpaceCreateDeviceRGB()
        ctx.setFillColor(CGColor(colorSpace: deviceRGB, components: [0.15, 0.15, 0.17, 1])!)
        ctx.fillPath(using: .evenOdd)
        // 描边（对应 `.overlay(shape.stroke(...))`：开口路径 + 默认 butt 端点）
        ctx.addPath(strokePath)
        ctx.setStrokeColor(CGColor(colorSpace: deviceRGB, components: [0.8, 0.8, 0.8, 1])!)
        ctx.setLineWidth(borderWidth)
        ctx.strokePath()
        return buf
    }

    // MARK: - 取像素（都按"点"给坐标，内部乘倍率）

    static func rgb(_ buf: [UInt8], point: CGPoint, scale: CGFloat) -> (Int, Int, Int, Int) {
        let w = Int(cardSize.width * scale)
        let x = Int((point.x * scale).rounded()), y = Int((point.y * scale).rounded())
        guard x >= 0, y >= 0, x < w else { return (0, 0, 0, 0) }
        let i = (y * w + x) * 4
        guard i + 3 < buf.count else { return (0, 0, 0, 0) }
        return (Int(buf[i]), Int(buf[i + 1]), Int(buf[i + 2]), Int(buf[i + 3]))
    }

    static func isFill(_ buf: [UInt8], point: CGPoint, scale: CGFloat) -> Bool {
        let c = rgb(buf, point: point, scale: scale)
        return c.3 > 200 && abs(c.0 - 38) < 12 && abs(c.1 - 38) < 12 && abs(c.2 - 43) < 14
    }

    static func describe(_ buf: [UInt8], _ point: CGPoint, _ scale: CGFloat) -> String {
        let c = rgb(buf, point: point, scale: scale)
        return "rgba(\(c.0),\(c.1),\(c.2),\(c.3))"
    }

    /// 描边像素：**明显比底色亮** ✓ —— 不能要求"纯描边色"：描边的心落在形状边界上，
    /// 边界外侧半个线宽画在位图外，所以贴边那一列没有一个像素是满覆盖的 ✗（第一版就是这么误判的）。
    static func isStroke(_ buf: [UInt8], point: CGPoint, scale: CGFloat) -> Bool {
        let c = rgb(buf, point: point, scale: scale)
        return c.3 > 200 && c.0 > 120 && c.1 > 120 && c.2 > 120
    }

    static func isPainted(_ buf: [UInt8], point: CGPoint, scale: CGFloat) -> Bool {
        rgb(buf, point: point, scale: scale).3 > 40
    }

    static func paintedPixels(in buf: [UInt8], region: (x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat),
                              scale: CGFloat) -> Int {
        var count = 0
        var y = region.y
        while y < region.y + region.h {
            var x = region.x
            while x < region.x + region.w {
                if isPainted(buf, point: CGPoint(x: x, y: y), scale: scale) { count += 1 }
                x += 0.5
            }
            y += 0.5
        }
        return count
    }

    /// 凹口里那些"不该有的像素"落在哪几列、最亮多少 —— 报错时直接看得出是"一条线"还是"边界抗锯齿"。
    static func notchArtifactProfile(_ buf: [UInt8], region: (x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat)) -> String {
        var byColumn: [Int: (count: Int, maxAlpha: Int)] = [:]
        var colYRange: [Int: (CGFloat, CGFloat)] = [:]
        var y = region.y
        while y < region.y + region.h {
            var x = region.x
            while x < region.x + region.w {
                let c = rgb(buf, point: CGPoint(x: x, y: y), scale: scale)
                if c.3 > 40 {
                    let col = Int(x * scale)
                    let old = byColumn[col] ?? (0, 0)
                    byColumn[col] = (old.count + 1, max(old.maxAlpha, c.3))
                    colYRange[col] = (min(colYRange[col]?.0 ?? y, y), max(colYRange[col]?.1 ?? y, y))
                }
                x += 0.5
            }
            y += 0.5
        }
        if byColumn.isEmpty { return "无" }
        return byColumn.keys.sorted().prefix(5)
            .map { "第\($0)列×\(byColumn[$0]!.count)(alpha\(byColumn[$0]!.maxAlpha), y \(colYRange[$0]!.0)..\(colYRange[$0]!.1))" }
            .joined(separator: " , ")
    }

    static func check(_ passed: Bool, _ message: String, _ failures: inout [String]) {
        if !passed { failures.append(message) }
    }
}
