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
    /// ⚠️ 2026-09-27 深夜改名（用户：「把左侧这个**目标**调整为**需求**，把**疑问**调整为**矛盾**，
    /// 因为左侧其实就是在**了解用户的需求**」）。改名只改**卡片上那两个字**与模型被要求写的标签；
    /// **老名字一律保留成别名**（见 `understandingLabelAliases`），否则模型写回「目标：」时
    /// 那一行会空、内容掉进正文里。
    /// ⚠️ 2026-09-27 深夜再改（用户：「把这个**左侧边**调整一下。左侧边现在就让它显示
    /// **参考、矛盾**。就再简化一点，**就只显示这几个**」）：左侧不再单列「需求」——
    /// 右侧那张脑图**就是**对用户需求的梳理（他的原话），再单列一行是重复的。
    static let understandingLabels = ["细节", "矛盾", "拼写错误"]

    /// 每一行认哪些标签（**第一个是正式名字**，其余是模型爱写的同义说法，一并认）。
    ///
    /// 认老名字是刻意的：模型不一定会照新格式写（实测它经常把 `软件` / `文件` 写在「参考」的位置），
    /// 只认正式名会让那一行的内容掉进正文里 —— 屏幕上就是"这行空了、内容跑到别处"。
    static let understandingLabelAliases: [(label: String, aliases: [String])] = [
        ("细节", ["细节", "注意", "备注", "梳理"]),
        ("矛盾", ["矛盾", "疑问"]),
        // ⚠️ 用户 2026-09-27 深夜把「歧义」改成了「**拼写错误**」—— 理由是他在用**语音输入法**：
        // 「考虑到用户使用的是语音输入法，让 AI 思考一下**哪些单词可能存在拼写错误**」。
        // 「歧义」当别名留着：模型一时改不过来时，那一行照样落得上。
        ("拼写错误", ["拼写错误", "拼写", "歧义", "可能听错", "听错"]),
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
        // 「需求 / 目标」2026-09-27 起不再是独立一行（它进了脑图）—— 但模型一时改不过来
        // 还会写它，所以当边界：**只截断、不成行**，那一截不会漏进「矛盾」或正文里。
        "需求", "目标", "目标问题",
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

        细节：<**把上面那份完整内容里他问过的每一件事，整理成一张竖形的关系图** ——
              这就是"他在关心什么"的全貌，**也是右侧那一栏存在的全部意义**。
              用树枝和缩进把层级与因果画出来（像下面这样）：
              ├─ 第一层
              │  ├─ 第二层
              │  └─ 第二层
              └─ 第一层
              四条要求：
              · **每一件事都要在图里**（不是只写这一轮那件）—— 同一件事在往下说的就归到一个分支下；
                跟他前面问的**没关系**的事，就**新开一个顶层分支**（不要挂在别的分支下面）；
              · **带上他自己的词**：用他说过的说法（「第 2 题」「剪贴板那段」「记到 Notion」），
                **不许压成抽象的几个字** —— 过度极简会让他觉得"我没说过这个"；
              · 一层一件事，能合就合，**最多 20 行**；
              · **不要写标题**：直接从 `├─` 开始（不要写"用户问过的问题"这类话）。
              没有可梳理的就写「—」>
        矛盾：<**只写逻辑矛盾** —— 他这句话自己前后对不上、和他前面刚明确说过的事实冲突、
              或者与下面「还没解决的疑问」里某一条直接抵触。**每一行一条**，格式
              「**一、关于〈什么内容〉的疑问： 〈和什么矛盾〉**」——
              **冒号后面留一个空格**，空格右边才是具体内容。
              序号用**一、二、三、四**，**不同的疑问各占一行**。

              ⚠️⚠️ **不要问澄清类的问题**（用户 2026-09-27：「我问他北京在哪，他就问
              **什么地方的北京**；我让他介绍一个人，他就问**介绍什么人**，这就太墨迹了。**你只需要关注逻辑矛盾**，
              其他点以后再说。**用户的问题正常回答就好**」）—— **信息不全但前后不矛盾，就不要写在这儿**。
              少写、不写都是对的；为了凑而编一个问题是最糟的。
              ⚠️ **进了「矛盾」不等于不用进那张图**：图是"他问过什么"的**全集**，
              矛盾只是其中一种标注（同一个问题，图上要有它，矛盾里也可以有它）。
              ⚠️ **不要用 Markdown**（不要 `**`、不要 `#`、不要列表符号）—— 它是直接画在卡片上的纯文字。
              没有矛盾就整行写「—」。>

        **答案**：<⚠️ **他这一问很可能是在"改/追问"上一条回复**（「重新换行列出」「用英文再说一遍」
                 「展开讲讲」这种）—— 那就**基于上面你回过的那一条来改**，
                 **绝对不要写"我看不到你上一轮的内容"**（那段内容就在上面）。
                 其余情况：只在这一轮**包含一个可以当场回答的问题**时才写（「北京在哪」「杨幂是谁」
                  「左右两张图有什么区别」「这道题选 A 还是 B」），一到三句话，像回答用户一样自然；
                  不是问题、或者你要靠执行才能知道答案的，**整行不写**>
        （这一行会被直接显示在用户鼠标右下角，和最终结果的样式一模一样 —— 所以要像成品答案那样写，
          不要写"我可以帮你查"这种话。）

        **选择**：<只在这一轮**用户明确评论了上一轮看板上那些方向**时才写，用**上一轮给的编号**，
                  例如「1 对，3 不对」「取消 2」；没有就整行不写>

        规则：
        0. **「矛盾」是接着上一轮说的**（用户 2026-09-27：「用户可能会关注某个疑问，并因此补充一些内容。
           如果发现这个疑问已经消除，或不再有疑问，就把这个疑问删掉……**疑问就是疑问，不能总是更换**」）：
           下面如果给了「还没解决的疑问」，那是**之前就提出来、现在仍然挂着的** ——
           你这一轮要做的是：① 他刚补的话有没有**解决了其中某一条**（解决了就别再写它）；
           ② 剩下的照抄过来（说法可以更准，但别换问题）；③ 只有真的读出新问题才加新的。
           **不许把上一轮的问题换一批新的重说一遍。**
        1. **只写理解与结果**，不要执行任何事、不要给操作步骤、不要写代码；
        1.35 **两张卡片分工不同，别把它们的判据搞混**（用户 2026-09-27 深夜）：
             · 「**细节**」那张图 = **统筹全部**：所有问过的问题、连续的和跳跃的，都整理进去，
               看的是"用户到底在做什么"；
             · 「**答案**」那一行 = **只答当前这一轮**（右下角那张卡片显示的就是它）。
             所以下面"没关系就别提之前"那条**只约束答案**，**不约束那张图** ——
             图永远要把之前的都收进来。
        1.4 **回答当前这个问题时，只看最近这一次；没关系就一个字都别提之前。**
           他每**停顿两秒**就是一轮，这一轮是**全新的问题**；前面几轮**全部只是参考**。
           你要做的判断只有一件 —— **它跟当前这一问有没有关系**：
           · **有关系** → 接着之前的内容答（「细节」那张图也沿着同一件事往下长）；
           · **没关系** → **只答当前这一问**，不要提之前的任何内容、也不要把两件事揉在一起。
           他的例子：「我一开始问的是**编程**……后来我又问**中国在哪**，那跟编程一点关系没有，
           那么第二个问题的时候，他就应该**只回复中国的问题**；**有关系的时候才参考，没关系是不参考**。」
           反过来：他连着说「北京在哪」「北京欢迎你」「北京是一个语言吗」都在讲**北京**，
           有关系 —— 那就接着往下答。
           ⚠️ 不管前面问过多少轮、多长，**当前这一问必须答**。
        1.5 **以当前这一句为准**：他的话可能**跟屏幕没关系**、**跟上一句也没关系** ——
           判断依据只有他刚说的这句。
           · **同一件事在往下推** → 「细节」那张图接着长；
           · **换了一件事** → 图上**新开一个分支**（这就是 1.4 里"没关系"的那种情况）。
        2. 只写上面要求的这几行，不要写解释、不要写操作步骤、不要写背景铺垫；
        3. 用中文写（他说英文就用英文）；
        4. 不要加任何别的标题、引号、Markdown 或代码块。
        """ + (looksAtTheScreen ? """

        \(labelLineInstruction)

        ⚠️ 每一轮都带了**当下的屏幕截图**：请**看图**再回答 ——
        「需求」「参考」「细节」都要基于你**真的看到的**内容写，
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
    /// - Parameters:
    ///   - newQuestion: **他这一次的新问题**（他自己说的那段，不是整段累积转写）——
    ///     用户 2026-09-27：「用户说话之后，要把用户的问题当作一个**全新的问题**，同时把之前用户说的话
    ///     和 AI 回复的结果，**取前五轮**发给 AI 当作参考内容，让 AI **重点关注最近这一次**」。
    ///   - previousTurnsText: 前面几轮（用户说的 + 你回的）拼好的一段，**只是参考**。
    // MARK: - 第一次调用：只看那份文本（没有任何上下文）

    /// **第一次 API 调用**：把"他这次会话说过的全部内容"整份丢给它，做三件事 ——
    /// ① 梳理出一张关系图（他问过的每一件事）；② 找出文本内部的**矛盾**；
    /// ③ 找出可能**听错/写错**的词（歧义）。
    ///
    /// 用户 2026-09-27 深夜的设计（他给的理由就是它为什么必须拆开）：
    /// 「第一次 API 就是把用户刚才整个说的话、转写的内容文本那个文件发给 AI，让 AI 去做两件事情：
    /// 第一，**输出脑图**，它们的逻辑关系；第二，**找到用户内容之间的矛盾点**……
    /// 包括那些**单词、软件发音**这些可能会出现歧义的点。然后你把右上角这个卡片再增加一个，
    /// 叫**歧义**，一个是矛盾，一个是歧义……**这个东西应该非常简单，它没有任何上下文**，
    /// 不需要任何上下文，就是把这个文件放给他」。
    ///
    /// ⚠️ **它不带截图、不带历史、不带方向清单** —— "没有任何上下文"正是它的定义。
    /// 之前那一版把"回答最近的问题（要**忽略**之前）"和"总结所有问题（要**参考**之前）"
    /// 塞进**同一次调用**里，两个要求互相打架，所以两边都做不好（他："每一个 AI 调用，
    /// 都是在回复**一个方向**的问题"）。
    static func transcriptAnalysisSystemPrompt() -> String {
        """
        你是一个文本分析器。别人给你**一段连续的实时语音转写**（同一个人断断续续说的），
        你只做三件事，不要做别的。

        **第一件：把他说过的每一件事梳理成一张关系图。**
        · 用树枝和缩进画（`├─` / `│  └─`），一层一件事；
        · **每一件事都要在图里** —— 同一件事在往下说的就归到一个分支下，
          换了另一件事就**新开一个顶层分支**（不要挂在别的分支下面）；
        · **带上他自己的词**（他说「第 2 题」就写「第 2 题」），不要压成抽象的几个字 ——
          压得太狠他会觉得"我没说过这个"；
        · **最多 20 行**；**不要写标题**，直接从 `├─` 开始。

        **第二件：找出这段文本里"前后对不上"的地方。**
        · 同一件事他自己给了两个不一样的数 / 两个不一样的结论 → 写进「矛盾」；
        · 只有他自己前后**真的冲突**才算；**信息不全不算** —— 不要问澄清类的问题
          （他明确说过那叫"墨迹"：「我问他北京在哪，他就问什么地方的北京」）。

        **第三件：找出"可能被听错 / 拼错"的词，写进「拼写错误」。**
        · ⚠️ **他是在用语音输入法说话**，所以这段文本里的英文单词、软件名、人名、专有名词
          都可能是**识别听错**的产物 —— 想一想：**哪些词听起来像另一个词**？
        · 尤其注意：**英文单词、代码/命令、软件名、品牌名**（这一类最容易错，而且错了最影响下游）；
        · 每一条写清「听到的是 X，可能是 Y」，让他自己判断 ——
          **不是让你去改他说的，也不要指出他"拼错了"**（他没错，是机器听的）。

        输出格式（**三行都必须写**，没有内容就写一个「—」，不要整行省略）：

        细节：<那张关系图>
        矛盾：<`一、关于〈什么〉的矛盾： 〈前后哪里对不上〉`，冒号后留一个空格，一条一行；没有写「—」>
        拼写错误：<`一、〈听到的词〉：可能是〈另一个词〉`，一条一行；没有写「—」>
        """
    }

    /// 第一次调用的用户消息：**只有那份文本**。
    static func transcriptAnalysisUserPrompt(transcript: String) -> String {
        """
        【他到目前为止说过的全部内容（连续的实时转写，按时间顺序）】
        \(transcript)

        请只做三件事：**把他说过的每一件事画成一张关系图**、**找出前后矛盾的地方**、
        **找出可能被听错 / 拼错的词**（他用的语音输入法）。不要回答问题、不要给建议。
        """
    }

    static func understandingUserPrompt(newQuestion: String,
                                        previousRoundItems: [DirectionBoardDisplayItem],
                                        previousTurnsText: String? = nil,
                                        previousAnswers: String? = nil,
                                        spokenTranscript: [String] = [],
                                        referenceMaterials: String? = nil,
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
        // **前面几轮（用户说的 + 你回的）—— 只是参考**（用户 2026-09-27：「把之前用户说的话
        // 和 AI 回复的结果，取前五轮发给 AI 当作参考内容，让 AI 重点关注最近这一次」）。
        //
        // ⚠️ 它排在**新问题之前**、而且标题里就写明"参考"：这一轮要做的事只有一件 ——
        // 处理下面那个新问题。之前几轮是用来判断"这件事是不是接着上一件在说"的。
        if let previousTurnsText {
            let trimmed = previousTurnsText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { sections.append(trimmed) }
        }
        // **你刚才在右下角那张卡片上回过的那几条**（原文，最近的在前）。
        //
        // ⚠️ 用户 2026-09-27 深夜：「我追问之前的问题，我发现他**无法知道我上一次回复了什么**，
        // 这是不可以的。**上一次回复的结果必须追加到全新的调用里面**」。他追问时说的常常很短
        //（「重新换行列出」「用英文再说一遍」），**全部信息都在上一条回复里** ——
        // 所以这一段是"改写类追问"唯一的信息源，必须在。
        if let previousAnswers {
            let trimmed = previousAnswers.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { sections.append(trimmed) }
        }
        // ⚠️ **他说的全部内容，整份发下去**（用户 2026-09-27 深夜定的形状）：
        // 「用户实时模式下他的录音是**连续的**……所以说你是有一个**完整的**……**都是所有用户问题
        // 的一个文件的**。那么你**让 AI 根据这个文件来提炼出所有的问题**，然后整理出脑图不就行了吗？」
        //
        // 这一版之前错在**给模型的信息不全**：请求里只有"前五轮"，却要它写"到目前为止所有问题"
        // 的图 —— 它手里没有全部信息，只能靠"记住上一张图"，于是每次都丢几块。
        // 现在把这份**完整文本**给它，**提炼交给 AI**（代码只负责攒文本与切"最新那一问"）。
        if !spokenTranscript.isEmpty {
            sections.append("""
            【他到目前为止说过的**全部内容**（连续的实时转写，按时间顺序）】
            \(spokenTranscript.joined(separator: "\n"))
            """)
        }

        // ⚠️ **这一段是重点，标签要明说**（用户 2026-09-27：「虽然都是一次性发给 AI，但**在打标签上、
        // 在关注重点上，要告诉 AI 应该怎么去关注**」）。屏幕 / 剪贴板 / 访达那些材料排在它前面、
        // 标成"参考"；用户自己的话单独标成"**目标以这一段为准**" —— 因为「**用户的提示词才是目标**，
        // 屏幕上的内容是参考部分」。
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

        // **新问题排在整段请求的最后**（用户 2026-09-27：「让 AI **重点关注最近这一次**」）——
        // 模型最后读到的就是这一轮要做的那件事，上面全是背景。
        sections.append("""
        【用户这一次的新问题 —— **重点只看这一段**，上面的全是参考】
        \(newQuestion)
        """)

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
                if position.label == questionLabel {
                    found[position.label] = formattedQuestion(joined)
                } else if position.label == mindMapLabel {
                    // 脑图那一行去掉模型抄进来的标题（见 `mindMapWithoutEchoedTitle`）。
                    let map = mindMapWithoutEchoedTitle(joined)
                    if !map.isEmpty { found[position.label] = map }
                } else {
                    found[position.label] = joined
                }
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
    /// 「矛盾」那一行是**哪一行**（它与别的行形状不同，多一道整理）。
    static let questionLabel = "矛盾"
    /// 那张脑图是**哪一行**（它要去掉模型抄进来的标题）。
    static let mindMapLabel = "细节"

    /// 那张脑图**第一行如果是标题就丢掉**（不是图的内容）。
    ///
    /// 2026-09-27 实测：模型把提示词里那句"用户到目前为止问过的所有问题，整合成关系图"
    /// **原样抄成了图的第一行**，屏幕上就是 `<用户到目前为止问过的所有问题，整合成关系图:`。
    /// 判据刻意写得很窄 —— **不含树枝符号（├ │ └）且以「：」或「:」结尾**才算标题，
    /// 免得把真正的一行内容误删。
    nonisolated static func mindMapWithoutEchoedTitle(_ raw: String) -> String {
        var lines = raw.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        while let first = lines.first {
            let trimmed = first.trimmingCharacters(in: .whitespaces)
            let hasBranchGlyph = trimmed.contains("├") || trimmed.contains("│") || trimmed.contains("└")
            let looksLikeTitle = !hasBranchGlyph
                && (trimmed.hasSuffix("：") || trimmed.hasSuffix(":"))
            guard looksLikeTitle else { break }
            lines.removeFirst()
        }
        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 把一条疑问整成用户定的形状    /// 把一条疑问整成用户定的形状：**`一、关于〈什么〉的疑问： 〈具体内容〉`**。
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
        // **实时模式最终要交给 agent 的那两样**（用户 2026-09-27 深夜点名）：
        // ① 到目前为止那张需求图 —— 「实时模式最终的这个结果就是要发给 agent 的」；
        // ② **怎么看最后一次** ——「如果最后一次的内容跟之前没关系，就按最后一次当做一个真正的
        //    需求来执行；如果有关系，就让 AI **整体来执行**……**这个直接写入提示词**」。
        let mindMap = decision.accumulatedMindMap.trimmingCharacters(in: .whitespacesAndNewlines)
        if !mindMap.isEmpty {
            lines.append("""
            用户到目前为止问过的所有问题（他自己看到的那张图，**只是背景**）：
            \(mindMap)
            """)
        }
        guard !lines.isEmpty else { return nil }
        return lines.joined(separator: "\n") + "\n\n" + Self.lastTurnRelationRule
    }

    /// **交给执行 agent 时，怎么看"最后这一轮"** —— 固定一段，每轮都带。
    ///
    /// 用户 2026-09-27 深夜的原话（这就是它的规格）：
    /// 「如果说最后的这一次回复的内容**跟之前的没关系**，那就按照最后一次的内容当做一个真正的
    /// 需求，让 AI 来执行；如果**跟之前有关系**，就让 AI 来**整体来执行**。比如说用户一开始问了
    /// 很多关于景点的信息、旅游的信息，然后最后一个问题是……**在桌面上创建一个文件夹**，
    /// 那么这种情况就是最后一个问题跟之前的内容没有关系，那就按照最后一个问题来执行；
    /// 如果跟之前有关系，就是让 AI 来**综合、全盘考虑**。**这个直接写入提示词**，
    /// 让 AI 知道应该怎么去看待最后一个问题就可以了。」
    static let lastTurnRelationRule = """
    <how_to_read_the_last_turn>
    上面那些是**背景**。你要先判断：**他最后说的这件事，跟前面那些有没有关系**？
    · **没关系**（前面一直在问旅游景点，最后一句是「在桌面上创建一个文件夹」）→
      **只按最后这一件当真正的需求去执行**，前面那些不要混进来；
    · **有关系** → 把前面的**一起综合、全盘考虑**（他是在同一件事上连续往下说）。
    </how_to_read_the_last_turn>
    """
}
