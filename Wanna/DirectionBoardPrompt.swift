//
//  DirectionBoardPrompt.swift
//  Wanna
//
//  **看板那段"AI 怎么理解"的提示词 + 提交时那几行**（2026-09-27 第三版）。
//
//  用户 2026-09-27 的判定很直接：
//  > 刚才说的是把整个主 agent 提示词全都发给 AI，来判断用户选择哪个方向，这对提示词消耗太大，
//  > 每三秒一次用不起，也没有必要……AI 理解的部分也要包含这个方向，所有方向，这个文件里的所有内容，
//  > **再加上用户的提示词**，让 AI 了解应该如何去理解用户的意图。也就是说**没有必要发送那么多提示词**，
//  > 这样即便是高频调用也不会花费很多 token。
//
//  所以这里只有两样东西：
//  1. **一段小提示词**（方向清单 + 用户的话 → 一两句理解）—— 约三百 token，不是五千；
//  2. 提交时加在用户提示词前面那几行的拼装（`decoration`）。
//
//  **方向判断本身不在这里** —— 那件事交给 Jev 决策模型（`JevDecisionClient`），用户点名要的。
//

import Foundation

nonisolated enum DirectionBoardPrompt {

    /// 说明最多留这么多字（看板那块地方面积固定，长了会顶掉其它内容）。
    static let maximumParagraphCharacters = 200

    /// **卡片上固定显示的四行，顺序也是固定的**（用户 2026-09-27 定）。
    ///
    /// 用户的原话：「把顺序调一下。结果肯定显示在这个位置上不变，然后下边这四行：第一行是
    /// **目标或问题**，就写「目标问题」；第二行是**类型**；第三行是**内容参考**，或者叫**参考**，
    /// 也就是左边这个标题，**它就是两个字**；最后一行是**细节**。」
    ///
    /// ⚠️ **为什么要固定**（同一句里说的）：「他回复结果的时候**总是跳、总是蹦**……因为他回复的
    /// 内容有时候有软件目标细节，有时候没有，就是突然间有、突然间没有……这几行固定在这，
    /// 而不是突然间有、突然间没有，这对体验影响太差了。」所以这四行**永远画出来**，
    /// 模型没给内容的那一行显示占位符，而不是整行消失 —— 卡片的每一段高度于是恒定。
    static let understandingLabels = ["目标", "细节", "疑问"]

    /// 每一行认哪些标签（**第一个是正式名字**，其余是模型爱写的同义说法，一并认）。
    ///
    /// 认老名字是刻意的：模型不一定会照新格式写（实测它经常把 `软件` / `文件` 写在「参考」的位置），
    /// 只认正式名会让那一行的内容掉进正文里 —— 屏幕上就是"这行空了、内容跑到别处"。
    static let understandingLabelAliases: [(label: String, aliases: [String])] = [
        ("目标", ["目标", "目标问题", "问题"]),
        ("细节", ["细节", "注意", "备注", "梳理"]),
        ("疑问", ["疑问", "问题", "歧义"]),
    ]

    /// 一行标签下面最多再吃几行续行（防模型跑题写成一大篇）。
    private static let maximumContinuationLines = 4

    /// 模型用来表示"这一行没有内容"的写法 —— 一律当成空（占位符由视图画）。
    private static let emptyValueMarkers: Set<String> = ["—", "-", "–", "无", "没有", "暂无", "n/a", "na", "无。"]

    /// **只截断、自己不成行**的标签 —— 它们各有各的去处（`parseAnswer` / `parseSelectionVerdict`），
    /// 但不属于"理解那四行"。少了它们，「细节」会把整句「…推断。 答案：选 A」吞进去。
    private static let boundaryLabels = [
        "任务结果", "答案", "选择",
        // ⚠️ 用户 2026-09-27 删掉的三个理解行（类型 / 参考 / 软件 / 文件）。
        // 它们**仍然要当边界**：模型一时改不过来还会写「类型：做题」，
        // 不当边界的话那一截会并进「细节」里，屏幕上就是一段莫名其妙的尾巴。
        "类型", "任务类型", "参考", "内容参考", "软件", "文件",
    ]

    /// 写"AI 怎么理解"用的系统提示词 —— **只给方向清单，不给主 Agent 提示词**。
    ///
    /// 它**不执行任何事**：只输出固定四行，说明"这段话看起来要做哪一类事"。
    static func understandingSystemPrompt(directions: [(id: String, keyword: String, detail: String)],
                                          looksAtTheScreen: Bool = true) -> String {
        var lines: [String] = []
        for direction in directions {
            lines.append("- \(direction.keyword)：\(direction.detail)")
        }
        return """
        你是一个任务方向识别器。用户正在对着一台 Mac 说话，你的任务是两件事：
        **① 用固定的四行说清你理解他这次要做什么；② 如果能立刻算出结果，就把结果直接给出来。**

        可能的方向（你可以从中挑，也可以都不挑）：
        \(lines.joined(separator: "\n"))

        **下面这两行必须每一行都写**（真的没有内容就写一个「—」，**不要整行省略** ——
        这几行在界面上是固定的位置，少写一行会让整块跳动）：

        目标：<**只看用户自己说的那句话**，一句话说清他这次要达成什么、在问什么（最多 3 行）。
              ⚠️ **屏幕上的内容是"参考"，不是"目标"**（用户 2026-09-27 的原话：「**最重要的一件事情是，
              目标应该重点关注用户的提示词**……屏幕上的内容是参考部分，**用户的提示词才是目标**。
              用大语言模型思考时，屏幕是作为一个参数、一个参考，重点要针对用户输入的内容，整理出
              用户的目标是什么」）。**不要复述屏幕**；只有当他真的在问屏幕上的东西
              （「这道题选哪个」「这个按钮在哪」）时，屏幕才进入目标。
              用户的话已经说清楚了，就照直写，**不要加解释、不要铺陈**>
        细节：<**把用户这段内容梳理成一张竖形的关系图**（像下面这样用树枝和缩进把层级与因果画出来，
              最多 **7 行**）。用户是用眼睛扫的，字太多他看不下去；画成关系图他既看得快，
              也能一眼看出你有没有真的理解：
              ├─ 第一层
              │  ├─ 第二层
              │  └─ 第二层
              └─ 第一层
              没有可梳理的就写「—」>
        疑问：<**只写逻辑矛盾** —— 他这句话自己前后对不上、和他前面刚明确说过的事实冲突、
              或者与下面「还没解决的疑问」里某一条直接抵触。**每一行一条**，格式
              「**一、关于〈什么内容〉的疑问： 〈和什么矛盾〉**」——
              **冒号后面留一个空格**，空格右边才是具体内容（用户 2026-09-27：「用"关于什么什么的疑问："
              的形式，**冒号后留一个空格，右侧显示具体的疑问内容**」）。
              序号用**一、二、三、四**，**不同的疑问各占一行**。

              ⚠️⚠️ **不要问澄清类的问题**（用户 2026-09-27 的原话：「现在这个疑问有点太墨迹了……
              我问他北京在哪，他就问**什么地方的北京**；我让他介绍一个人，他就问**介绍什么人**，
              这就太墨迹了。**你只需要关注逻辑矛盾，重点关注逻辑矛盾**，其他点以后再说。
              **用户的问题正常回答就好**」）。
              换句话说：**信息不全但前后不矛盾，就不写在这儿 —— 正常回答他就行**。
              少写、不写都是对的；为了凑而编一个问题是最糟的。
              ⚠️ **这一行不要用 Markdown**（不要 `**` 加粗、不要 `#` 标题、不要列表符号）——
              它是直接画在卡片上的纯文字。用户 2026-09-27：「**不要用 Markdown 格式**，
              用"关于什么什么的疑问："的形式」。
              没有矛盾就整行写「—」。>

        **答案**：<只在这一轮**包含一个可以当场回答的问题**时才写（「北京在哪」「杨幂是谁」
                  「左右两张图有什么区别」「这道题选 A 还是 B」），一到三句话，像回答用户一样自然；
                  不是问题、或者你要靠执行才能知道答案的，**整行不写**>
        （这一行会被直接显示在用户鼠标右下角，和最终结果的样式一模一样 —— 所以要像成品答案那样写，
          不要写"我可以帮你查"这种话。）

        **选择**：<只在这一轮**用户明确评论了上一轮看板上那些方向**时才写，用**上一轮给的编号**，
                  例如「1 对，3 不对」「取消 2」；没有就整行不写>

        规则：
        0. **「疑问」是接着上一轮说的**（用户 2026-09-27：「用户可能会关注某个疑问，并因此补充一些内容。
           如果发现这个疑问已经消除，或不再有疑问，就把这个疑问删掉……**疑问就是疑问，不能总是更换**」）：
           下面如果给了「还没解决的疑问」，那是**之前就提出来、现在仍然挂着的** ——
           你这一轮要做的是：① 他刚补的话有没有**解决了其中某一条**（解决了就别再写它）；
           ② 剩下的照抄过来（说法可以更准，但别换问题）；③ 只有真的读出新问题才加新的。
           **不许把上一轮的问题换一批新的重说一遍。**
        1. **只写理解与结果**，不要执行任何事、不要给操作步骤、不要写代码；
        1.5 **「以当前这一句为准」**（用户 2026-09-27）：「对于用户的问题，可能是连续性的，
           可能**跟当前屏幕完全没有任何关系**，可能**跟上一个问题也完全没有任何关系**。
           要让 AI 知道，**以当前问题为准**。」
           他的场景只有两个，判断依据也只有他刚说的这句话：
           · **同一件事在往下推**（针对一个问题连续追问、或一个需求连续表达）→ 目标与「细节」那张图
             接着上一轮往下长，把这件事的逻辑越理越顺（这是他要的"一路顺畅"）；
           · **换了一件事**（上一秒一个方向、下一秒另一个方向）→ **重开一张图**，
             不要硬把上一个话题的结构套上来。
           拿不准就看：他这句话跟上一句是不是在说同一件事。
        2. 「目标问题」一句话说不完就写「细节」那一行，**不要写成长篇**；
        3. 用中文写（他说英文就用英文）；
        4. 不要加任何别的标题、引号、Markdown 或代码块。
        """ + (looksAtTheScreen ? """

        \(labelLineInstruction)

        ⚠️ 每一轮都带了**当下的屏幕截图**：请**看图**再回答 ——
        「目标问题」「参考」「细节」都要基于你**真的看到的**内容写，
        「答案」那一行更是必须看图算（比如这道题选哪个、这几个人是哪几个）。
        **看不到就照实说**，不要编。
        """ : "")
    }

    /// 带**屏幕参考**时额外要的一样东西：一个不超过 7 个字的"这次是什么类型的任务"。
    ///
    /// 用户 2026-09-27 的数学题那个例子：「屏幕上有一道数学题，有 A、B、C、D 四个选项，用户说
    /// 「参考屏幕内容，分析一下这道题可能选哪一个」……**这个结果对应的预设类型就一个**，
    /// 因为结果是固定的，比如这道题应该选 A，那结果就是固定的。」
    /// —— 所以那个答案本身要变成一个能点选的"类型"。
    static let labelLineInstruction = "类型：<不超过 7 个字，这次是什么类型的任务；例如「选 A」「挑三个人」>"

    /// 从带屏幕参考的那次回复里把类型标签抽出来（没有就返回 nil）。
    ///
    /// ⚠️ **不能只认行首**：实测模型会把标签写在**同一行**上（
    /// `……并把结论记下来。 类型：做题`）—— 按行首判就永远抽不出来（第一版就是这样，
    /// 临时类型一直是空的）。所以全串搜 `类型：` / `任务类型：`，取**最后一个**（后面那个才是标签）。
    static func parseLabelLine(_ raw: String) -> String? {
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        for prefix in ["任务类型:", "类型:"] {
            guard let range = normalized.range(of: prefix, options: .backwards) else { continue }
            var value = String(normalized[range.upperBound...])
            // 取到行尾或句号为止（标签后面常常还有别的字）。
            for terminator in ["\n", "。", "，", "；", ";"] {
                if let end = value.range(of: terminator) { value = String(value[..<end.lowerBound]) }
            }
            value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            while let first = value.first, "#*`\"「」 ".contains(first) { value.removeFirst() }
            while let last = value.last, "#*`\"「」 ".contains(last) { value.removeLast() }
            value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty, value.count <= 12 else { continue }
            return value
        }
        return nil
    }

    /// 把标签那一截从**显示用的那段话**里去掉（它能读懂题目，但「类型：做题」不该出现在看板上）。
    static func paragraphWithoutLabelLine(_ raw: String) -> String {
        var text = raw
        for prefix in ["任务类型：", "类型：", "任务类型:", "类型:"] {
            if let range = text.range(of: prefix, options: .backwards) {
                text = String(text[..<range.lowerBound])
            }
        }
        return text
    }

    /// 用户消息：**用户说的话 + 上一轮显示的是什么 + 最近三轮的理解（带标签）**。
    ///
    /// 三块都是用户点名要的：
    /// · 「你必须要知道用户表达的是对**上一轮**（JEV）它的结果的一个选择」→ 上一轮的编号映射；
    /// · 「你要在发送给下一轮模型的时候要**保留前三轮**，然后你要标记一下……最早的那一轮和最近的
    ///   那一轮分别是什么，然后让它**重点参考最近一轮**」→ 带标签的三环历史。
    static func understandingUserPrompt(transcript: String,
                                        previousRoundItems: [DirectionBoardDisplayItem],
                                        recentReadings: [String],
                                        referenceMaterials: String? = nil,
                                        previousAnswers: String? = nil,
                                        previousQuestions: String? = nil) -> String {
        var sections: [String] = []
        // **参考材料**（屏幕 / 剪贴板 / 访达选中）—— 与主 Agent 那一轮读的是同一份。
        //
        // 为什么要给看板：用户 2026-09-27 的动机就是"网页太长，让它参考只能看到一部分；
        // 选中复制之后它就能看到所有内容" —— 那条路的价值有一半在**右下角那张答案卡片**
        //（他还在说话的时候就能看到总结），所以这一轮的请求必须也带上材料。
        if let referenceMaterials {
            let trimmed = referenceMaterials.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { sections.append(trimmed) }
        }
        if let previousQuestions {
            let trimmed = previousQuestions.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { sections.append(trimmed) }
        }
        // **你刚才在右下角回过的那几条**（用户 2026-09-27：「一定要带上刚才的结果」）——
        // 他对着这张卡片追问时（「用英文再说一遍」），模型必须知道"刚才那条"是什么。
        if let previousAnswers {
            let trimmed = previousAnswers.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { sections.append(trimmed) }
        }
        // ⚠️ **这一段是重点，标签要明说**（用户 2026-09-27：「虽然都是一次性发给 AI，但**在打标签上、
        // 在关注重点上，要告诉 AI 应该怎么去关注**」）。屏幕 / 剪贴板 / 访达那些材料排在它前面、
        // 标成"参考"；用户自己的话单独标成"**目标以这一段为准**" —— 因为「**用户的提示词才是目标**，
        // 屏幕上的内容是参考部分」。
        sections.append("""
        【用户的原话 —— **这是重点，目标以这一段为准；屏幕上的一切都只是参考材料**】
        \(transcript)
        """)

        if !previousRoundItems.isEmpty {
            let lines = previousRoundItems.map { item in
                let mark: String
                switch item.state {
                case .confirmed: mark = "（用户已确认是对的）"
                case .denied: mark = "（用户已否认）"
                case .pending: mark = ""
                }
                return "\(item.number). \(item.keyword)\(mark)"
            }
            sections.append("""
            上一轮你在看板上显示的是这几条（**编号是上一轮的**）：
            \(lines.joined(separator: "\n"))

            如果用户这一轮在评论这些方向（「第几个对 / 第几个不对 / 取消第几个」），
            请按**上面这套编号**理解，并写在「选择：」那一行里。
            """)
        }

        let readings = recentReadings
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !readings.isEmpty {
            // 最近的那一轮排在最前，标签也是照着这个顺序给的（用户要的重点参考最近一次）。
            let labels = ["最近一次", "倒数第二次", "倒数第三次"]
            let blocks = readings.enumerated().map { index, reading in
                let label = index < labels.count ? labels[index] : "更早"
                return "【\(label)】\n\(reading)"
            }
            sections.append("""
            你前面几轮的理解（**以「最近一次」为主**，其余供你保持连续）：
            \(blocks.joined(separator: "\n\n"))
            """)
        }
        return sections.joined(separator: "\n\n")
    }

    /// **固定的一段话**，追加在用户原话**后面**（发送执行时用）。
    ///
    /// 用户 2026-09-27：「必须要去再增加一个……系统提示词，来去备注到用户的刚才整段转写的文本的后面，
    /// 然后去让 AI 理解到其中用户关于……方向一方向 2、方向 3，他是关于这个某一个位置卡片的任务的
    /// 理解，然后这部分**不是真正的要去执行的任务**……**你帮我梳理出来一个这个提示词是固定的就可以，
    /// 不需要实时生成**」。
    ///
    /// 它解决的问题很具体：用户在说话时大量内容是在跟看板交互（「方向一 对，任务方向 3 不对」），
    /// 转写里于是出现一串**光秃秃的数字**，模型拿到只会当成任务的一部分。
    static let boardReferenceNote = """
    <board_reference>
    上面这段转写里出现的「方向一 / 任务方向 3 / 第 4 个」这类说法，是用户在跟屏幕上那块任务方向看板 \
    交互（确认或取消某一条方向），**不是**要你执行的任务本身 —— 请忽略这些片段，只按其余的话执行。
    </board_reference>
    """

    /// 结构化理解的**那四行** —— **永远返回四行、顺序固定**（没内容的行值是空串）。
    ///
    /// 用户 2026-09-27：「AI 对任务的理解是有格式的……换行显示，可以显示为多行」，加上后来的
    /// 「这几行固定在这，而不是突然间有、突然间没有」。所以这里的契约是**行的集合恒定**，
    /// 谁有没有内容由值决定 —— 视图据此画占位符，卡片的高度于是不再跳。
    static func parseUnderstandingLines(_ raw: String) -> [(label: String, value: String)] {
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        var found: [String: String] = [:]

        let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        for (lineIndex, line) in lines.enumerated() {
            for position in labelPositions(in: line) where !position.label.isEmpty {
                let valueStart = line.index(position.start, offsetBy: position.aliasLength + 1)
                let valueEnd = position.valueEnd
                guard valueStart <= valueEnd else { continue }
                let value = normalizedValue(String(line[valueStart..<valueEnd]))
                // ⚠️ **标签这一行可以是空的，值全在下面几行**（2026-09-27 实测：
                // 模型写脑图时就是「细节：」单独一行、树从下一行开始 —— 而原来的
                // `guard !value.isEmpty` 会把整块**直接丢掉**，屏幕上右栏一片空白，
                // 看起来就像"AI 没生成脑图"，其实生成得好好的）。
                guard found[position.label] == nil else { continue }
                // **续行也算这一行的内容**（用户 2026-09-27：「细节保留，但是要简要说明，
                // 不同类型的任务，换行显示说明」）—— 所以一行标签下面接着的那几行，
                // 直到下一个标签行或空行为止，都并进这一行的值里（用换行连起来，视图按行显示）。
                var collected = value.isEmpty ? [] : [value]
                var nextIndex = lineIndex + 1
                while nextIndex < lines.count {
                    let candidate = lines[nextIndex].trimmingCharacters(in: .whitespaces)
                    if candidate.isEmpty { break }
                    // 下一行如果是别的标签（含边界标签），就到此为止。
                    if !labelPositions(in: candidate).isEmpty { break }
                    collected.append(normalizedValue(candidate))
                    nextIndex += 1
                    if collected.count >= maximumContinuationLines { break }
                }
                let joined = collected.filter { !$0.isEmpty }.joined(separator: "\n")
                guard !joined.isEmpty else { continue }   // 真的一个字都没有 → 不记（视图画占位符）
                // 「疑问」那一行**在解析处统一形状**（用户 2026-09-27：「用"关于什么什么的疑问："的
                // 形式，**冒号后留一个空格**，右侧显示具体的疑问内容」）—— 提示词里写了，但模型
                // 不保证照做，而这一行是直接画给用户看的，所以这里再兜一次。
                found[position.label] = position.label == questionLabel
                    ? formattedQuestion(joined) : joined
            }
        }
        // 按用户定的顺序返回，**缺的那些留空串**（不是省略）。
        return understandingLabels.map { ($0, found[$0] ?? "") }
    }

    /// 一行里所有标签的位置，已经去过重叠。
    ///
    /// **「任务结果」也在这里，但它是个"边界标签"**（`label` 为空）：它只负责把前一个值截断，
    /// 自己不出现在四行里 —— 它有自己的那一行（绿框）。少了它，「细节」会把整句
    /// 「…推断。 任务结果：选 A」吞进去，同一句话在看板上出现两遍。
    ///
    /// 「去重叠」也是必须的：`目标问题:` 里同时含 `目标:` 与 `问题:` 两个别名的起点，
    /// 不处理的话那一行会被切出三段、值全是空的（第一版就是这样，那一行的内容整段消失）。
    /// 这个位置算不算"一个标签的开头"：**行首，或者前面是空白**（半角/全角空格、制表符）。
    ///
    /// 反例就是它的存在理由：「一、关于「记到哪里」的疑问：…」里的「疑问」前面是「的」，
    /// 那是句子里的一个词，不是标签 —— 不挡掉它，整行的值就在那里被切断。
    private static func isAtLabelBoundary(_ start: String.Index, in line: String) -> Bool {
        guard start > line.startIndex else { return true }
        return line[line.index(before: start)].isWhitespace
    }

    private static func labelPositions(in line: String)
        -> [(label: String, aliasLength: Int, start: String.Index, valueEnd: String.Index)] {
        var raw: [(label: String, aliasLength: Int, start: String.Index)] = []
        for (label, aliases) in understandingLabelAliases {
            for alias in aliases {
                var searchStart = line.startIndex
                while let range = line.range(of: alias + ":", range: searchStart..<line.endIndex) {
                    // ⚠️ **标签必须落在行首或空白之后**（2026-09-27 在真机上量到的截断）：
                    // 模型写「一、关于「记到哪里」的**疑问**：是要写进 Notion 某一页……」时，
                    // 值里面的「疑问」二字也被当成了一个新标签，于是**第一个值在它前面就被切断** ——
                    // 屏幕上量到的就是「疑问  一、关于「记到哪里」的」，后半句凭空消失
                    //（而同一轮里没有这个字样的「目标」折行完全正常，这正是指认它的证据）。
                    // 模型把几行挤在一行时会用空格分开（「目标：… 细节：…」），所以"行首或空白之后"
                    // 既挡掉这种误判，又不影响真正的一行多标签。
                    if !isAtLabelBoundary(range.lowerBound, in: line) {
                        searchStart = range.upperBound
                        continue
                    }
                    raw.append((label, alias.count, range.lowerBound))
                    searchStart = range.upperBound
                }
            }
        }
        for boundary in boundaryLabels {
            var searchStart = line.startIndex
            while let range = line.range(of: boundary + ":", range: searchStart..<line.endIndex) {
                if !isAtLabelBoundary(range.lowerBound, in: line) {
                    searchStart = range.upperBound
                    continue
                }
                raw.append(("", boundary.count, range.lowerBound))
                searchStart = range.upperBound
            }
        }
        // 位置相同或**落在前一个标签里面**的，只留最长的那个别名。
        var accepted: [(label: String, aliasLength: Int, start: String.Index)] = []
        for position in raw.sorted(by: { lhs, rhs in
            lhs.start == rhs.start ? lhs.aliasLength > rhs.aliasLength : lhs.start < rhs.start
        }) {
            if let last = accepted.last,
               position.start < line.index(last.start, offsetBy: last.aliasLength) { continue }
            accepted.append(position)
        }
        // 每一段的值 = 从标签后面到**下一个标签之前**（同一行里模型常把几行挤在一起）。
        return accepted.enumerated().map { index, position in
            let valueEnd = index + 1 < accepted.count ? accepted[index + 1].start : line.endIndex
            return (position.label, position.aliasLength, position.start, valueEnd)
        }
    }

    /// 「—」「无」这类占位一律当成空（占位符由视图统一画，模型写的不算内容）。
    /// 「疑问」那一行是**哪一行**（它与别的行形状不同，多一道整理）。
    static let questionLabel = "疑问"

    /// 把一条疑问整成用户定的形状：**`一、关于〈什么〉的疑问： 〈具体内容〉`**。
    ///
    /// 三件事，缺一不可：① **不带 Markdown**（模型爱把整行包进 `**`，屏幕上就是两个裸星号）；
    /// ② 冒号统一成全角；③ **冒号后面留一个空格**（用户 2026-09-27：「冒号后留一个空格，
    /// 右侧显示具体的疑问内容」）。只动**第一个**冒号 —— 内容里再出现冒号是内容自己的事。
    nonisolated static func formattedQuestion(_ raw: String) -> String {
        let withoutMarkdown = raw
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "＊", with: "")
        var text = withoutMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let colon = text.firstIndex(where: { $0 == ":" || $0 == "：" }) else { return text }
        let head = text[text.startIndex..<colon].trimmingCharacters(in: .whitespaces)
        let tail = text[text.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        return head + "： " + tail
    }

    private static func normalizedValue(_ raw: String) -> String {
        // ⚠️ **Markdown 的星号要剥掉**（2026-09-27 实测）：提示词里明写了「不要加 Markdown」，
        // 模型还是会把一整行包在 `**…**` 里（「**一、关于「这段」的疑问:…**」）——
        // 这行字是**直接画给用户看的**，屏幕上就是两个裸星号，看着像没渲染完。
        let withoutEmphasis = raw
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "＊", with: "")
        let trimmed = withoutEmphasis.trimmingCharacters(in: .whitespacesAndNewlines)
        return emptyValueMarkers.contains(trimmed.lowercased()) ? "" : trimmed
    }

    /// 结构化那几行**之外**的正文（模型在标签前后还写了别的话时，留在「细节」里展示）。
    ///
    /// 挖的范围是「标签 → 该行行尾」：一行的内容本来就归那个标签，剩下的才是正文。
    static func leftoverParagraphText(_ raw: String) -> String {
        let text = raw
        var ranges: [Range<String.Index>] = []
        for (_, aliases) in understandingLabelAliases {
            for alias in aliases {
                for colon in ["：", ":"] {
                    guard let range = text.range(of: alias + colon) else { continue }
                    let lineEnd = text[range.upperBound...].firstIndex(of: "\n") ?? text.endIndex
                    ranges.append(range.lowerBound..<lineEnd)
                }
            }
        }
        // **「任务结果」那一段整段挖掉**（它是四段里的第二段，已经有自己的绿框了）。
        for prefix in ["任务结果：", "任务结果:"] {
            guard let range = text.range(of: prefix) else { continue }
            let lineEnd = text[range.upperBound...].firstIndex(of: "\n") ?? text.endIndex
            ranges.append(range.lowerBound..<lineEnd)
        }
        // **按"保留没被覆盖的字"来拼，而不是删区间**：别名之间会互相嵌套
        //（`内容参考:` 里面就含 `参考:`），删区间时后一个会把前一个的终点带跑，
        // 拿着过期的上界去 `removeSubrange` 会**直接崩**（2026-09-27 真的把测试进程崩掉了）。
        var kept = ""
        var cursor = text.startIndex
        for range in ranges.sorted(by: { $0.lowerBound < $1.lowerBound }) {
            guard range.lowerBound >= cursor else { continue }   // 被前一段包住 → 跳过
            kept += text[cursor..<range.lowerBound]
            cursor = range.upperBound
        }
        kept += text[cursor...]
        return kept.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// **任务结果**那一行（模型能直接算出来才有）。
    ///
    /// 用户 2026-09-27：「如果用户的问题很明确，让他去判断哪一个选项，他不仅理解，不仅有任务方向，
    /// **答案**那一行（只在用户这一轮包含一个能当场回答的问题时才有）。
    ///
    /// 用户 2026-09-27：「鼠标右下角这部分显示的是对用户提示词回复的一个**结果**」——
    /// 所以这一行不是给看板看的，是**直接显示到右下角那张卡片上**的成品答案。
    ///
    /// ⚠️ 与"理解"的四行**互不影响**：这一行没有就返回 nil，右下角于是保持空
    ///（用户选的：「识别到「问题」才显示」）。
    static func parseAnswer(_ raw: String) -> String? {
        parseSection("答案", in: raw, maximumCharacters: maximumAnswerCharacters)
    }

    /// 答案最多这么长（右下角那张卡片的宽度是按一屏内可读定的）。
    static let maximumAnswerCharacters = 400

    /// 通用的一节：从「标签:」处取到行尾（或下一个标签处），最多续两行。
    ///
    /// 「答案」与「选择」都用它 —— 两处各写一遍必漂（这个文件已经因为"切法写两遍"踩过一次）。
    private static func parseSection(_ label: String,
                                     in raw: String,
                                     maximumCharacters: Int) -> String? {
        let normalized = raw.replacingOccurrences(of: "：", with: ":")
        guard let range = normalized.range(of: label + ":", options: .backwards) else { return nil }
        // 值可能**续到下一行**（实测模型写成「答案：这道题」+ 换行 +「选 A」）—— 取到空行、
        // 或下一个"标签行"为止，最多两行。
        var collected: [String] = []
        for rawLine in String(normalized[range.upperBound...]).split(separator: "\n",
                                                                    omittingEmptySubsequences: false) {
            let line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { break }
            let knownLabels = understandingLabels.flatMap { label in
                understandingLabelAliases.first { $0.label == label }?.aliases ?? [label]
            } + ["答案", "选择", "任务结果"]
            if !collected.isEmpty, knownLabels.contains(where: { line.hasPrefix($0 + ":") }) { break }
            collected.append(line)
            if collected.count >= 2 { break }
        }
        var value = collected.joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = value.first, "#*`\"「」 ".contains(first) { value.removeFirst() }
        while let last = value.last, "#*`\"「」".contains(last) { value.removeLast() }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty, cleaned.count <= maximumCharacters else { return nil }
        // 模型写「—」表示"这一行没有" —— 那是空，不是内容。
        return normalizedValue(cleaned).isEmpty ? nil : cleaned
    }

    /// 模型回的那段**原文**：只做必要的收拾，**不截断**。
    ///
    /// ⚠️ 这里原来是直接把 `cleanParagraph`（**200 字上限**）用在原文上，而那段"上限"是给
    /// **显示**用的 —— 于是解析（`parseUnderstandingLines` / `parseAnswer`）拿到的是一段
    /// **已经被砍掉尾巴**的文本：五行加起来很容易超过 200 字，屏幕上就是「细节」那行写到一半
    /// 突然断在「题目在屏幕右」（2026-09-27 实测截图，用户要的是完整的多行理解）。
    /// 所以截断只能发生在**显示那一步**（`self.paragraph`），原文一律留着 —— 四个上限
    /// （四行 + 答案）都得从完整文本里切。
    static func cleanRawResponse(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = text.first, "#*`\"' ".contains(first) { text.removeFirst() }
        while let last = text.last, "#*`\"'".contains(last) { text.removeLast() }
        // 只防病态长度（模型偶尔会绕圈子写上一大篇），不是显示上限。
        if text.count > maximumRawResponseCharacters {
            text = String(text.prefix(maximumRawResponseCharacters))
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 原文的兜底上限（远大于任何正常的五行理解）。
    static let maximumRawResponseCharacters = 4000

    /// 把模型回的那段收拾干净（去空白、去引号、限长）—— **只用于显示**。
    static func cleanParagraph(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = text.first, "#*`\"'「」 ".contains(first) { text.removeFirst() }
        while let last = text.last, "#*`\"'「」 ".contains(last) { text.removeLast() }
        text = text.replacingOccurrences(of: "\n", with: " ")
        if text.count > maximumParagraphCharacters {
            text = String(text.prefix(maximumParagraphCharacters))
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 提交时**加在用户提示词前面**的那几行；没有东西可加时返回 `nil`。
    ///
    /// 用户定的形状：「将记录内容作为标签追加到用户提示词的前一行，格式为
    /// 「用户真实意图的任务方向是：XXX」，下方再接用户原始提示词」。
    static func decoration(_ decision: DirectionBoardTurnDecision) -> String? {
        var lines: [String] = []
        // **用户明确确认过的方向**（关键词 + 描述一起给 —— 描述在文件里，是给模型看的判据）。
        for direction in decision.confirmedDirections {
            let keyword = direction.keyword.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !keyword.isEmpty else { continue }
            let detail = direction.detail.trimmingCharacters(in: .whitespacesAndNewlines)
            if detail.isEmpty || detail == keyword {
                lines.append("用户真实意图的任务方向是：\(keyword)")
            } else {
                lines.append("用户真实意图的任务方向是：\(keyword)（\(detail)）")
            }
        }
        // **大模型这一轮的理解** —— 用户：「这部分全部都作为一个参考」（不再需要他点一下确认）。
        let understanding = decision.understanding
            .map { "\($0.label)：\($0.value)" }
            .joined(separator: "；")
        if !understanding.isEmpty {
            lines.append("模型对这次任务的理解是：\(understanding)")
        }
        let trimmedInput = decision.typedInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedInput.isEmpty {
            lines.append("用户的补充说明是：\(trimmedInput)")
        }
        guard !lines.isEmpty else { return nil }
        return lines.joined(separator: "\n")
    }
}
