//
//  TranscriptScrollScheduler.swift
//  Wanna
//
//  字幕滚动的**调度层**：把"速度"从常数变成**受控变量**（2026-09-28，按用户给的方案）。
//
//  ## 它解决的矛盾
//
//  用户要「必须完全等速」，但**等速与"及时显示"在数学上矛盾**：
//  识别结果是**成批**到达的（一次可能来 20 个字），而等速要求位置的导数是常数 ——
//  那么"说得比滚动快"时就只能一直落后，落后量无限累积（上一版就是这样把文字漂出屏幕的）。
//
//  这一层给出的重新表述是：**用户感知到的"稳"是"没有突变和抖动"，不是"示波器上的水平线"。**
//  所以速度不锁死成一个常数，而是：
//      · 有一个基速 `baseSpeed`（正常语速下追得上）；
//      · 排队越多、速度按比例往上抬一点（伺服项），**吸收突发**；
//      · 但每秒最多变化 `maximumSlewPerSecond` —— **加减速不可察觉**；
//      · 排队超过可视宽度的 `jumpThreshold` 倍时放弃连续、**直接跳尾**（延迟有硬上界）。
//
//  数学性质：只要说话有停顿，排队量就归零、速度回落到基速 → **延迟不跨句累积**。
//
//  纯值类型、不碰时间（时长由调用方按真实帧间隔传入），所以 `WannaTests` 能直接钉住。
//

import Foundation

nonisolated struct TranscriptScrollScheduler {

    /// 基速（pt/s）。**标定依据**：正常语速 4–6 汉字/秒，一个汉字实测 advance 14.883268pt，
    /// 取 5 字/秒 ≈ 74。也就是"正常说话时刚好跟得上，看不见落后"。
    var baseSpeed: CGFloat = 74

    /// 伺服增益：排队量占可视宽度的比例 × 它，叠加到基速上。
    ///
    /// 0.5 = 排队一整个屏宽时速度翻倍（74 → 111）。**不要调大**：它一大会让突发时
    /// 速度肉眼可见地变快，那正是用户报的"忽快忽慢"。
    var servoGain: CGFloat = 0.5

    /// 速度每秒最多变化多少比例。0.5 = 0.1 秒最多变 5%（对齐方案里"每帧 5%"的力度）。
    var maximumSlewPerSecond: CGFloat = 0.5

    /// 排队超过可视宽度的这么多倍就**放弃连续、直接跳尾**。
    ///
    /// 2 = 用户最多落后两屏。**这是兜底，不是常规路径** —— 它同时是"延迟有硬上界"的保证：
    /// 极端持续快说时不会无限落后，代价是牺牲一次连续性（渲染层用一次淡出掩盖）。
    var jumpThresholdInViewWidths: CGFloat = 2

    /// 当前速度（pt/s）。每 tick 更新一次。
    private(set) var currentSpeed: CGFloat = 74

    /// 上一 tick 的时长（秒）—— 用来做时间正确的限幅。
    private var lastElapsedSeconds: Double = 0.1

    init() {}

    enum Decision: Equatable {
        /// 按 `speed` 继续滚 `elapsedSeconds` 秒。
        case scroll(speed: CGFloat, points: CGFloat)
        /// 排队太多，直接跳尾。
        case jumpToEnd
        /// 没什么可滚的（已追上），停住。
        case idle
    }

    /// 一次调度：**每 0.1 秒（渲染层重设动画时）调一次**。
    ///
    /// - Parameters:
    ///   - pendingPoints: 还排在屏幕外、没滚出来的 pt 数
    ///   - viewWidth: 可视宽度
    ///   - elapsedSeconds: 距上一次调用的真实时长
    mutating func tick(pendingPoints: CGFloat, viewWidth: CGFloat,
                       elapsedSeconds: Double) -> Decision {
        lastElapsedSeconds = elapsedSeconds
        guard viewWidth > 0 else { return .idle }
        guard pendingPoints > 0 else {
            // 追上了：速度回落到基速（下一次突发从基速起步）。
            currentSpeed = baseSpeed
            return .idle
        }
        if pendingPoints > viewWidth * jumpThresholdInViewWidths {
            currentSpeed = baseSpeed
            return .jumpToEnd
        }

        // 一阶跟踪环：目标速度随排队量线性上抬。
        let target = baseSpeed * (1 + servoGain * pendingPoints / viewWidth)
        // **时间正确的限幅**：每秒最多变 maximumSlewPerSecond。
        let maximumDelta = currentSpeed * maximumSlewPerSecond * CGFloat(max(elapsedSeconds, 0.001))
        if target > currentSpeed + maximumDelta {
            currentSpeed += maximumDelta
        } else if target < currentSpeed - maximumDelta {
            currentSpeed -= maximumDelta
        } else {
            currentSpeed = target
        }

        // 本窗口内最多滚到"刚好追上"为止 —— 多出来的距离不留给下一窗口，
        // 否则动画会冲过头（回弹），那也是一眼能看出来的抖动。
        let points = min(currentSpeed * CGFloat(elapsedSeconds), pendingPoints)
        return .scroll(speed: currentSpeed, points: points)
    }

    mutating func reset() {
        currentSpeed = baseSpeed
    }
}
