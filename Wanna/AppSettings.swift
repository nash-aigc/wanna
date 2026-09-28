//
//  AppSettings.swift
//  Wanna
//
//  The user-facing app settings — every switch and slider the settings window's
//  通用 / 对话与记忆 / 听 / 说 / 看与截图 / 操作 / 快捷键 pages edit, as one value type.
//
//  Pure data + clamping, no I/O: persistence lives in `AppSettingsStore`, which
//  mirrors `ModelConfigurationStore`. Every type here is `nonisolated` for the
//  same reason the types in `ModelConfiguration.swift` are — the target builds
//  with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, so an unannotated type
//  would silently become main-actor-isolated and a settings read from a
//  background-safe context would fail to compile.
//
//  Decoding is deliberately tolerant: every field falls back to its default when
//  missing, so a settings file written by an older build still loads after a new
//  field is added (the same `Bool?`-style reasoning that keeps
//  `ProviderProfile.visionReasoningEnabled` decodable).
//

import Foundation

/// How long the model is told its spoken answers should be.
///
/// This is prompt text, not a parameter: length is controlled by the sentence in
/// the system prompt, so the setting rewrites that sentence.
nonisolated enum AnswerLengthStyle: String, Codable, CaseIterable, Sendable {
    case oneOrTwoSentences
    case threeToFiveSentences
    case detailed

    var displayName: String {
        switch self {
        case .oneOrTwoSentences: return "一两句"
        case .threeToFiveSentences: return "三到五句"
        case .detailed: return "详细"
        }
    }

    /// The sentence spliced into the vision system prompt in place of the old
    /// hardcoded length instruction.
    var promptSentence: String {
        switch self {
        case .oneOrTwoSentences: return "请用一到两句话回答。"
        case .threeToFiveSentences: return "请用三到五句话回答。"
        case .detailed: return "请尽可能详细地回答，但不要空谈。"
        }
    }
}

/// The visual style of the card that renders the assistant's reply in the
/// conversation view. Values, borders and default follow the user-supplied
/// reference spec (「clip 卡片样式」): blue card #0B57D0 with a 30% white border,
/// black card #000 with a 16% white border, paper card #F7F2E7 with an 18%
/// black border and ink text — blue is the default.
nonisolated enum AnswerCardStyle: String, Codable, CaseIterable, Sendable {
    case blue
    case black
    case paper

    var displayName: String {
        switch self {
        case .blue: return "蓝色"
        case .black: return "黑色"
        case .paper: return "宣纸"
        }
    }
}

/// How the notch sheet opens.
///
/// 用户 2026-09-23：「参考我提供的 HTML 页面，分析它的展开方式和动画效果。它的动画
/// 非常流畅，是从中心弹开的效果；当前项目是从上到下逐个展开显示。我希望增加一个弹开
/// 的效果。」随后定了这一页的形状：「把设置页面的"卡片样式"页面调整为"交互样式"，
/// 里面包含两个选项：卡片样式 / 窗口样式……同时把我刚才提供的中心缩放样式也作为
/// 一个选项，并将中心缩放样式设为默认样式。」
///
nonisolated enum WindowExpansionStyle: String, Codable, CaseIterable, Sendable {    /// 01 中心缩放（2026-09-23 重设计）：内容层被一个**从刘海那一个点向外长开的
    /// 遮罩**揭开——顶边中点全程钉在刘海底边，左上角向左、右上角向右、底边向下，
    /// 三个方向同一时刻同一节奏。旧的 transform 顶边锚定实现（`centerPop`）被整体
    /// 删除：它的锚点依赖拼接顺序和翻转坐标系两个都不报错的约定，修了两轮用户实测
    /// 仍与边缘缩放无异。rawValue 换成 `notchBloom`；老配置文件里的 `"centerPop"`
    /// 由解码处迁移到这个 case（见 `AppSettings.init(from:)`）。默认（用户指定）。
    case notchBloom
    /// 边缘缩放：内容层从 8% 缩放弹到 100%，锚在面板**底边**的中点，所以面板是
    /// 从下往上长开的。这是先前当作中心缩放实现时实际画出来的效果——补偿平移算在
    /// 了错的坐标系里。用户看到后觉得这个效果本身可以留，于是保留为独立选项。
    case edgeScale
    /// 02 幕布垂落：内容层被一个从顶边向下长开的遮罩揭开，宽度从第一帧就是最终值。
    case curtain

    var displayName: String {
        switch self {
        case .notchBloom: return "中心缩放"
        case .edgeScale: return "边缘缩放"
        case .curtain: return "幕布垂落"
        }
    }

    var explanation: String {
        switch self {
        case .notchBloom:
            return "面板从刘海那一个点同时向下、向左、向右展开。"
        case .edgeScale:
            return "面板从底部向上弹开、放大到整块。"
        case .curtain:
            return "面板宽度先到位，内容从上往下垂落展开。"
        }
    }
}

/// 输入框里哪个按键把写好的字发出去 —— 交互页的「发送方式」一行。
///
/// 用户 2026-09-23：「增加一个选项，即输入方式，或叫发送方法：1. 按 Enter 键发送，
/// 这是默认方法。2. 按 Command 加 Enter 发送。提供两种发送方法，供用户根据个人习惯
/// 选择」。
///
/// 两个值各自对应一种真实的键盘习惯：`.returnKey` 适合一行一句话的短提问，回车即发；
/// `.commandReturn` 适合经常要写好几段、写的时候还得空行的人 —— 回车留给换行，
/// 想发的时候顺手带一个 Command。两种都保留**另一个键仍然换行**（回车发送时
/// Shift+回车换行，Command+回车发送时回车换行），所以哪一种都能写出多行的输入。
/// **看板上那两下回车分别做什么** —— 用户 2026-09-27 深夜定的：
/// **⌥⏎ = 执行（转到 agent 模式）**，**⌘⏎ = 粘贴并退出**。
nonisolated enum BoardPasteShortcut: String, Codable, CaseIterable, Sendable {
    /// ⌘⏎ 粘贴（默认）—— 那么 ⌥⏎ 就是执行。
    case commandReturn
    /// ⌥⏎ 粘贴 —— 那么 ⌘⏎ 就是执行。
    case optionReturn

    var displayName: String {
        switch self {
        case .commandReturn: return "Command + Enter"
        case .optionReturn: return "Option + Enter"
        }
    }

    /// 这一下回车要做什么。
    ///
    /// **纯函数**，两个入口（那条会吞事件的全局 tap、以及兜底的本地监听）共用同一份判断 ——
    /// 两处各写一遍必然漂。返回值决定了要不要把这一下**吞掉**（`passThrough` 就是不吞）。
    func action(isCommand: Bool, isOption: Bool) -> BoardReturnKeyAction {
        // 两个修饰键同时按着：说不清他想干哪件事，**放行**，不做任何猜测。
        guard !(isCommand && isOption) else { return .passThrough }
        if isCommand { return self == .commandReturn ? .paste : .execute }
        if isOption { return self == .optionReturn ? .paste : .execute }
        // 裸回车：两个动作都不是它 —— 原样放行（放行 = 不吞，见 `DirectionBoardPanelController`）。
        return .passThrough
    }
}

/// 一下回车的结果（见 `BoardPasteShortcut.action`）。
nonisolated enum BoardReturnKeyAction: Equatable {
    /// 把右下角那段回复粘到光标处，然后结束这一轮。
    case paste
    /// 把当前这一轮交给主 Agent 执行（＝转到 agent 模式）。
    case execute
    /// 不是这两个动作之一 —— **原样放行给前台 App，不吞**。
    case passThrough
}

nonisolated enum ComposerSendShortcut: String, Codable, CaseIterable, Sendable {
    /// 按 Enter 发送（默认）。换行是 Shift + Enter。
    case returnKey
    /// 按 Command + Enter 发送。换行就是裸的 Enter。
    case commandReturn

    var displayName: String {
        switch self {
        case .returnKey: return "按 Enter 发送"
        case .commandReturn: return "按 Command + Enter 发送"
        }
    }

    var explanation: String {
        switch self {
        case .returnKey:
            return "在输入框里按回车就把内容发出去，换行按 Shift + 回车。"
        case .commandReturn:
            return "回车用来换行，按 Command + 回车才发送 —— 适合经常要写好几段的人。"
        }
    }
}

/// Which language the streaming transcription is told to expect.
nonisolated enum TranscriptionLanguage: String, Codable, CaseIterable, Sendable {
    case chinese
    case english
    case mixed
    case followSystem

    var displayName: String {
        switch self {
        case .chinese: return "中文"
        case .english: return "英文"
        case .mixed: return "中英混合"
        case .followSystem: return "自动跟随系统"
        }
    }

    /// The value sent as `input_audio_transcription.language` in `session.update`.
    ///
    /// `mixed` returns `nil`, which means the field is omitted from the request
    /// and the service auto-detects. `followSystem` reads the user's preferred
    /// app language rather than asking the user to set the same thing twice.
    var languageCodeForRequest: String? {
        switch self {
        case .chinese: return "zh"
        case .english: return "en"
        case .mixed: return nil
        case .followSystem:
            let preferredLanguage = Locale.preferredLanguages.first ?? "zh"
            return preferredLanguage.hasPrefix("zh") ? "zh" : "en"
        }
    }
}

/// When the blue cursor companion is on screen.
///
/// The companion used to follow the mouse permanently with no way to hide it:
/// the only switch that could have stopped it had its UI commented out, so the
/// "fade in on hotkey, fade out when idle" machinery below it never ran even
/// once. This is that switch, spelled out as three honest choices instead of a
/// hidden boolean.
nonisolated enum CursorPresenceMode: String, Codable, CaseIterable, Sendable {
    /// The companion is always on screen. This is what the app did before the
    /// setting existed, which is why it is the default — an upgrade changes
    /// nothing until the user asks for it.
    case alwaysVisible
    /// The companion fades in on the push-to-talk hotkey and fades out once the
    /// answer has been spoken, pointing is finished, and the bubble is gone.
    case duringConversation
    /// Only while the companion is actually flying to and pointing at something.
    /// Between questions the screen has no cursor at all; the answer bubble still
    /// appears next to the mouse, because a bubble does not need a cursor to be
    /// drawn under it.
    case onlyWhenPointing

    /// Kept to four characters or fewer: these are rendered as side-by-side
    /// segmented buttons, and a longer label wraps onto two lines and then
    /// overflows the settings card. The row's description carries the meaning.
    var displayName: String {
        switch self {
        case .alwaysVisible: return "一直显示"
        case .duringConversation: return "对话时"
        case .onlyWhenPointing: return "指位置时"
        }
    }

    /// Whether the companion stays on screen with nothing happening. Only the
    /// first mode does.
    var showsBuddyWhileIdle: Bool {
        self == .alwaysVisible
    }

    /// Whether the "fade in on the hotkey, schedule a fade-out when the
    /// interaction ends" machinery applies. It is the exact inverse of
    /// `showsBuddyWhileIdle`, but named separately because the schedule and the
    /// idle state are different questions at the two call sites that ask.
    var hidesWhenIdle: Bool {
        !showsBuddyWhileIdle
    }
}

/// What the blue cursor is drawn as.
nonisolated enum CursorShapeStyle: String, Codable, CaseIterable, Sendable {
    /// The original filled triangle, pointing up-right at the mouse.
    case triangle
    /// A macOS-style pointer outline, for users who want the companion to read
    /// as a cursor rather than as a separate character.
    case arrow

    var displayName: String {
        switch self {
        case .triangle: return "三角箭头"
        case .arrow: return "标准指针"
        }
    }

    /// The shape's frame. The pointer is drawn larger because its outline is
    /// thinner than the triangle's filled body, so it needs the extra size to
    /// carry the same visual weight.
    var frameSizeInPoints: CGFloat {
        switch self {
        case .triangle: return 16
        case .arrow: return 20
        }
    }
}

/// How far the companion sits from the mouse pointer.
///
/// The companion used to be pinned 35 points right and 25 below the mouse at
/// all times, which reads as a tail that never stops trailing you. This is that
/// offset, made adjustable.
nonisolated enum CursorFollowDistance: String, Codable, CaseIterable, Sendable {
    /// Directly on top of the mouse.
    case overlapping
    /// Nudged just clear of the mouse's own pointer.
    case closeBeside
    /// Down and to the right, the way the app has always drawn it.
    case farBehind

    /// Short for the same reason as `CursorPresenceMode.displayName` — the row's
    /// description spells out what each one does.
    var displayName: String {
        switch self {
        case .overlapping: return "重叠"
        case .closeBeside: return "紧贴"
        case .farBehind: return "稍远"
        }
    }

    /// Where the companion's frame centre sits relative to the mouse, in screen
    /// points. Added to the mouse position, so these are right-and-down offsets.
    var offsetFromMouse: CGSize {
        switch self {
        case .overlapping: return CGSize(width: 0, height: 0)
        case .closeBeside: return CGSize(width: 6, height: 6)
        case .farBehind: return CGSize(width: 35, height: 25)
        }
    }
}

/// How the companion delivers a `[TYPE:…]`'s text into whatever app has focus.
///
/// Typing posts every character as its own key event, which lands in any app but
/// cannot carry a line break — editors only answer a real Return press, so
/// multi-line text has to be split and joined with Return presses. Pasting puts
/// the whole text on the clipboard and presses cmd+v, which carries newlines in
/// one step and is much faster for long text — at the cost of borrowing the
/// user's clipboard for a moment. Typing stays the default because it never
/// touches anything outside the focused text field.
nonisolated enum TextEntryMethod: String, Codable, CaseIterable, Sendable {
    /// One key event per character, line breaks as real Return presses.
    case typeCharacters
    /// The whole text on the clipboard, delivered with one cmd+v.
    case pasteClipboard

    var displayName: String {
        switch self {
        case .typeCharacters: return "打字"
        case .pasteClipboard: return "粘贴"
        }
    }
}

/// A keyboard shortcut as the user actually pressed it: which modifier keys
/// were held, plus the one ordinary key that was struck (nil for a
/// modifier-only combo like ctrl + option).
///
/// `modifierFlagsRawValue` is an `NSEvent.ModifierFlags` raw value filtered
/// down to the five modifiers a shortcut can meaningfully use (control,
/// option, shift, command, function) — capsLock and the rest are noise a
/// stray keypress could otherwise smuggle in.
nonisolated struct RecordedKeyboardShortcut: Codable, Equatable, Sendable {
    var modifierFlagsRawValue: UInt
    var keyCode: UInt16?
}

/// How the push-to-talk shortcut behaves: hold-to-talk (press, speak, release
/// to send) or double-tap (press to start recording, press again to finalize
/// and send) — the latter for long utterances that are uncomfortable to hold
/// a key through.
nonisolated enum ShortcutTriggerMode: String, Codable, CaseIterable, Sendable {
    case holdToTalk
    case doubleTapToTalk

    var displayName: String {
        switch self {
        case .holdToTalk: return "按住说话"
        case .doubleTapToTalk: return "点两下说话"
        }
    }
}

/// How a reply is turned into speech — the 「播报方式」 row on the 说（播报） page.
///
/// Ported from the voice-web reference project's `tts_speak_mode` (sentence /
/// whole). The measured case for the default is written up in that project's
/// 实现方案/11 doc: synthesis runs ~20× faster than playback, so speaking the
/// first ~15-character segment while the rest is still being generated gets
/// the first word out at the floor of what the pipeline allows — waiting for
/// the whole reply first (whole) costs a 300-character answer about 17 extra
/// seconds of silence, in exchange for more连贯 intonation across the answer.
nonisolated enum SpeechSpeakMode: String, Codable, CaseIterable, Sendable {
    /// 逐句快答 (default): speak sentence-sized segments as the reply streams
    /// in, each merged to at least 15 characters and cut at 60 when the model
    /// writes none. The first segment is audible while the model is still
    /// writing the rest of the answer.
    case sentenceFastReply
    /// 整段合成: wait for the model to finish the whole reply, then synthesize
    /// and play it. Slower to first word, more even intonation.
    case wholeReply

    var displayName: String {
        switch self {
        case .sentenceFastReply: return "逐句快答"
        case .wholeReply: return "整段合成"
        }
    }

    var descriptionText: String {
        switch self {
        case .sentenceFastReply: return "边生成边合成边播，第一声最快。"
        case .wholeReply: return "等全文生成完再合成再播，语调更连贯，长回答等得久。"
        }
    }
}

/// How much authority a spawned agent subprocess carries, expressed as the
/// claude CLI permission arguments it is launched with.
///
/// The three levels are the approval policy (plan / auto-edit / full). The
/// vocabulary — which flags mean what on the CLI — is
/// held only here, so the process bridge never re-derives it.
nonisolated enum AgentPermissionMode: String, Codable, CaseIterable, Sendable {
    /// 只读规划: the agent may read and think but changes nothing. The safest
    /// level, for "what would you do" questions.
    case readOnlyPlan
    /// 自动改文件 (default): file edits inside the project folder are accepted
    /// automatically and the common working tools are pre-approved, so a
    /// headless agent (nobody to answer approval prompts) keeps working instead
    /// of stalling on every command.
    case autoEdit
    /// 完全授权: every tool auto-approved, including anything destructive. The
    /// settings row's description states the risk outright.
    case fullAccess

    var displayName: String {
        switch self {
        case .readOnlyPlan: return "只读规划"
        case .autoEdit: return "自动改文件"
        case .fullAccess: return "完全授权"
        }
    }

    var descriptionText: String {
        switch self {
        case .readOnlyPlan: return "Agent 只能看和想，不改任何文件。"
        case .autoEdit: return "自动接受项目内的文件修改，常用工具直接放行。"
        case .fullAccess: return "所有操作免确认，包括删除和覆盖——请只在可信任的文件夹上使用。"
        }
    }

    /// The permission arguments appended to the claude launch command.
    var cliArguments: [String] {
        switch self {
        case .readOnlyPlan:
            return ["--permission-mode", "plan"]
        case .autoEdit:
            // acceptEdits alone would still stall on tool approval prompts, and a
            // headless `-p` run has nobody to answer them — the pre-approved set
            // is what makes the default level actually usable unattended.
            return ["--permission-mode", "acceptEdits",
                    "--allowedTools", "Read Edit Write Glob Grep Bash WebSearch WebFetch Task NotebookEdit"]
        case .fullAccess:
            return ["--dangerously-skip-permissions"]
        }
    }
}

/// 豆包流式语音识别的资源档位，也就是请求头 `X-Api-Resource-Id` 的值。
///
/// 这个字符串就是用户说的「模型」—— 豆包这套接口的请求体里 `model_name` 恒为
/// `"bigmodel"`，真正决定用哪一代、哪一档模型的是这个头。所以设置页把它做成
/// 下拉，而不是让用户去猜一个 model 名字。
///
/// 2.0 的两档按**计费方式**分，这一点对长录音很关键：
/// - `duration` 小时版按**音频时长**计费。3 小时的录音就买 3 小时，
///   中间断线重连、主动轮换连接都不额外花钱 —— 所以长录音用它。
/// - `concurrent` 并发版按**同时在跑的连接数**计费。适合同时开很多路，
///   单路长跑反而更贵。
nonisolated enum VolcengineASRResource: String, Codable, CaseIterable, Sendable {
    case seedDurationV2 = "volc.seedasr.sauc.duration"
    case seedConcurrentV2 = "volc.seedasr.sauc.concurrent"
    case bigDurationV1 = "volc.bigasr.sauc.duration"
    case bigConcurrentV1 = "volc.bigasr.sauc.concurrent"

    var displayName: String {
        switch self {
        case .seedDurationV2: return "豆包 2.0 · 小时版"
        case .seedConcurrentV2: return "豆包 2.0 · 并发版"
        case .bigDurationV1: return "豆包 1.0 · 小时版"
        case .bigConcurrentV1: return "豆包 1.0 · 并发版"
        }
    }

    var explanation: String {
        switch self {
        case .seedDurationV2: return "按音频时长计费，长录音首选。断线重连、换连接都不额外花钱。"
        case .seedConcurrentV2: return "按同时进行的路数计费，适合很多路一起跑。单路长录音会比小时版贵。"
        case .bigDurationV1: return "上一代模型的小时版。新接入建议先用 2.0。"
        case .bigConcurrentV1: return "上一代模型的并发版。新接入建议先用 2.0。"
        }
    }
}

/// 说话时用哪个识别服务（按住 ⌃⌥ 说话 / 持续追问 / 卡片通话那条路）。
///
/// **为什么要有这一项**：同一台机器上现在有两个都能跑的识别后端 —— 火山引擎的
/// 豆包流式识别（长录音那一条路用的）和百炼的实时识别。用户的原话是「这两个
/// 快捷键用的都是同一个语音模型来识别的……豆包的，然后正常的那个使用的是阿里的」，
/// 所以「主 Agent 那条走豆包」是一个**用户要选的事实**，不是代码里的默认值 ——
/// 写死一个默认值意味着以后想换回来要改代码。
///
/// 语音聊天里**角色指定了识别模型**的那条路不受它影响：那里的模型名是百炼的，
/// 角色编辑器里也是按百炼的模型清单选的（见 `BuddyTranscriptionProviderFactory`）。
nonisolated enum VoiceTranscriptionService: String, Codable, CaseIterable, Sendable {
    /// 火山引擎豆包流式识别。配置是「录音」页那一套（同一个账号、同一份密钥）。
    case volcengine
    /// 阿里云百炼的实时识别。配置是「模型」页 👂 那个角色。
    case bailian

    var displayName: String {
        switch self {
        case .volcengine: return "豆包流式识别（火山引擎）"
        case .bailian: return "阿里百炼实时识别"
        }
    }

    var explanation: String {
        switch self {
        case .volcengine:
            return "用「录音」页里配好的那套豆包参数（API Key、档位、识别语言、热词）。与录音快捷键同一个识别服务。"
        case .bailian:
            return "用「模型」页里 👂 那个角色的模型与密钥。识别语言与热词用本页上面的两项。"
        }
    }
}

nonisolated struct AppSettings: Codable, Sendable, Equatable {

    // MARK: - 通用 · 启动

    /// Register/unregister the app as a macOS login item. The app used to force
    /// this on with no switch at all.
    var launchesAtLogin: Bool = true

    /// Open the menu bar panel every launch, not just when permissions are
    /// missing. Off keeps the old behavior (panel only when something needs fixing).
    var opensPanelOnLaunch: Bool = false

    // MARK: - 通用 · 回答的呈现

    /// Stream the answer's text into a bubble next to the cursor while it is
    /// being generated. The app previously never showed text at all.
    var showsResponseText: Bool = false

    /// **主 Agent 说话时的「任务方向看板」**（2026-09-27）：鼠标右上角那块板的总开关。
    ///
    /// 关掉之后：面板不出现、3 秒一次那次请求也不发 —— 一行都不做（不是"只是不显示"）。
    var directionBoardEnabled: Bool = true

    /// **看板每隔 3 秒问一次模型的门槛：新增多少个字才值得问**（标点不算）。
    ///
    /// 用户 2026-09-27：「如果 3 秒之内用户新增的内容少于 10 个字，也不发送，因为相当于这句话
    /// 还没说完。标点符号不算字数」，随后在我问"要不要做成可调"时回「**需要在设置中可以调整**」。
    /// 范围 5…20（`clamped()` 兜住手改的 JSON）。
    // ⚠️ 2026-09-28：`directionBoardMinimumAddedCharacters`（"每隔 3 秒问一次的门槛"）已删 ——
    // 实时那条链改成"他停下来了就刷"，不再有字数门槛，那个设置存了也不生效。
    // 旧文件里多出来的这个键被**忽略**（解码器只取它认识的键），不会让整份设置解不出来。

    /// **Jev 给的 P(是) 到多少才显示这一格**（默认 0.5）。
    ///
    /// 用户 2026-09-27：「让它根据用户的意图来判断出来，然后做一个类似于**概率估计**的东西，
    /// 把高概率的内容显示出来。」—— 阈值就是"多高算高"，夹在 0.3…0.9。
    /// 方向相关性门槛（Jev 那条路的概率）。
    ///
    /// ⚠️ 2026-09-27 深夜 **0.5 → 0.8**（用户：「我发现用户问**北京在哪**，它也显示**保存到 Notion**，
    /// 这跟保存 Notion 有什么关系？**没有阈值的话，相当于相关性 0.1 也放进去，相关性 99 也放进去。
    /// 一定要是非常高的相关性**，而且必须是高相关才可以」）。
    /// 0.5 的含义只是"比瞎猜更像"，那正是"一堆跟我当前提示词毫无关系的东西"的来源。
    var directionBoardProbabilityThreshold: Double = 0.8

    /// **看板的宽度 = 结果卡片宽度（340）的几倍**（默认 2 倍）。
    ///
    /// 用户 2026-09-27：「卡片的宽度需要固定……不能超过它的两倍，不能太高，要么一倍，要么两倍……
    /// 让它固定显示为两倍宽度，**这个宽度可以让用户去设定**，设置页面里可以设定，但**默认固定两倍宽度**，
    /// 以便显示更多内容。」夹在 1…2（`clamped()` 兜住手改的 JSON）。
    // ⚠️ 2026-09-28：`directionBoardWidthMultiplier`（看板宽度倍数）已删 —— 7 字形的宽度是形状
    // 定死的（横杠 360 / 竖条 340），那个设置存了也不生效，留着就是骗人。旧文件里多出来的这个键
    // 现在被**忽略**（`decodeIfPresent` 的解码器只取它认识的键），不会让整份设置解不出来。

    /// ⚠️ **第一版留下的字段，今天没有任何界面读它**（方向早已改成 `TaskDirectionStore` 那份清单：
    /// 出厂 12 条 + 口述 + 每天中午复盘追加，见 `开发经验/19`）。保留只是为了老文件仍能解
    /// （`decodeIfPresent` 那条规矩）—— 它不再是"设了不生效"，而是**没有任何地方设它**。
    /// 真要清掉得连同 `AppSettings` 的 `CodingKeys` 与 `init(from:)` 一起动，属于另一件事。
    var directionBoard: DirectionBoardConfiguration = .default

    /// How long the answer bubble stays up *after* the spoken answer finishes
    /// playing, before it is cleared.
    ///
    /// The reading time itself is not a duration the user picks — the text stays
    /// for as long as the voice is still going, however long that is. This is
    /// only the tail after the voice stops, so a short answer and a long one both
    /// leave the same amount of time to glance back.
    var answerBubbleLingerSeconds: Double = 3.0

    // MARK: - 通用 · 蓝色光标

    /// When the blue cursor companion is on screen.
    var cursorPresenceMode: CursorPresenceMode = .alwaysVisible

    /// What the companion is drawn as.
    var cursorShapeStyle: CursorShapeStyle = .triangle

    /// How far the companion sits from the mouse pointer.
    var cursorFollowDistance: CursorFollowDistance = .farBehind

    /// How long the companion lingers after the interaction ends before fading
    /// out. Only the two modes that hide when idle have anything to schedule, so
    /// the settings row is disabled under 「一直显示」. Was hardcoded to 1 second.
    var transientCursorHideDelaySeconds: Double = 1.0

    // MARK: - 对话与记忆

    /// How many recent question/answer rounds are sent with each request.
    /// Older rounds are dropped. Was hardcoded to 10.
    var rememberedConversationRounds: Int = 10

    /// Write conversation history to disk so it survives a relaunch. Off keeps
    /// history purely in memory. The history file is plaintext — the settings
    /// description must keep saying so.
    var persistsConversationHistory: Bool = false

    /// Before dropping the oldest rounds, summarize them into a compact note and
    /// keep that note in the prompt, so long conversations don't lose their start.
    var autoCompressesHistory: Bool = false

    /// Store each round's cursor-screen screenshot and send it back with the
    /// history, so "刚才那个按钮" can be answered. Substantially larger payloads.
    var includesScreenshotsInHistory: Bool = false

    /// Prompt-side answer length control.
    var answerLengthStyle: AnswerLengthStyle = .oneOrTwoSentences

    /// The card theme that renders the assistant's reply in the conversation
    /// view. 黑 is the default since 2026-09-23 — the user asked for the
    /// bubbles to be dark and to match the panel's ground (「气泡调成暗色…
    /// 主题应该跟背景颜色一致」), so the blue reference default became the
    /// option rather than the starting point. 蓝 and 宣纸 are still there for
    /// whoever wants them, in 设置 → 交互样式 (the page was called 卡片样式
    /// until 2026-09-23, when the window style joined it).
    var answerCardStyle: AnswerCardStyle = .black

    /// How the notch sheet opens — 中心缩放 (`notchBloom`, a mask expanding out
    /// of the notch's own point: down, left and right at once), 边缘缩放 (a
    /// scale about the bottom edge) or 幕布垂落 (the curtain reveal).
    /// `.notchBloom` is the default — the user asked for 中心缩放 as the default
    /// (「并将中心缩放样式设为默认样式」, 2026-09-23) and the 2026-09-23 redesign
    /// replaced that style's implementation, not its name or default status.
    ///
    /// Lives beside `answerCardStyle` rather than in its own section because
    /// the two are one settings page (交互) — see `WindowExpansionStyle`
    /// for what each value means and why none of them is a per-frame window
    /// resize.
    var windowExpansionStyle: WindowExpansionStyle = .notchBloom


    /// 输入框里哪个键发送 —— 交互页的「发送方式」。两个内容页的输入框
    /// （`MessageComposerField`）都读它，所以改完立刻生效，不用重启。
    var composerSendShortcut: ComposerSendShortcut = .returnKey

    /// Free-form instructions appended verbatim to the system prompt.
    var extraSystemPromptInstructions: String = ""

    /// The whole base system prompt, when the user has replaced it.
    ///
    /// `nil` means "follow the built-in", which is not the same as "empty": a build
    /// that improves the default prompt has to reach a user who never opened the
    /// editor. Storing the built-in text as this property's default value instead
    /// would freeze every existing install on whatever wording happened to ship the
    /// day it first ran, and the only way out would be to ask the user to rewrite it
    /// by hand. The length line and 补充指令 still append on top of this, so the
    /// editor stays about the base prompt and those two settings keep working.
    var customSystemPrompt: String?

    /// **「设为默认」的目标会话。** 屏幕快捷键发出去的问题进这一条主循环会话
    ///（用户 2026-09-26：「卡片右侧增加『设为默认』按钮，点击后将该主对话设为默认，
    /// 屏幕快捷键发送的问题自动进入该默认会话」）。
    ///
    /// 存的是**会话 id 的字符串**（不是 UUID）—— 与 `EphemeralAgent.cardID` 同一个形状，
    /// 卡片区拿它跟 `ConversationSession.id.uuidString` 直接比，不需要中途转换。
    /// nil = 用户没设过：那就还用「当前活动会话」，与今天的行为一致。
    var defaultSessionID: String?

    // MARK: - 复盘 agent 的权限（2026-09-26）

    /// **指令文件夹权限**：复盘 agent 自己的项目文件夹（`Wanna复盘/`）。
    /// 它是这个 agent 存在的意义，所以**固定开着、用户改不了** —— 用户的原话是
    /// 「第一个权限就是指令文件夹权限，这个是默认的，然后也是不可以被修改的，
    /// 它就是一直是勾选的状态」。因此它不存成设置，只有一个常量（见
    /// `AgentCardModel.reviewAgentFolderPath`）。

    /// **Wanna 权限：能不能读当前这个项目**（用户：「另外一个权限叫 Wanna 权限，
    /// 就是当前这个软件或者这个项目的整个路径」）。默认**关闭** —— 涉及整个软件，
    /// 必须用户手动开。nil = 没设过 = 关。
    var reviewAgentReadsProject: Bool?

    /// **Wanna 权限：能不能改当前这个项目**。默认**关闭**，而且**只有读了才能写**
    /// （用户：「默认呢，勾选是读，另外一个写入权限需要用户勾选才能写入，就是为了防止
    /// 用户的不经意操作或者是误操作，导致一些文件的错误删除或者错误备份」）。
    var reviewAgentWritesProject: Bool?

    /// 读得到这个项目吗。
    var reviewAgentCanReadProject: Bool { reviewAgentReadsProject ?? false }
    /// 改得了这个项目吗 —— **写必然包含读**（代码里保证，不靠 UI 记得同时勾两个）。
    var reviewAgentCanWriteProject: Bool { reviewAgentCanReadProject && (reviewAgentWritesProject ?? false) }

    /// 改权限的唯一入口：把「写」当成「读」的子集来维护。
    mutating func setReviewAgentProjectAccess(canRead: Bool, canWrite: Bool) {
        reviewAgentReadsProject = canRead
        reviewAgentWritesProject = canRead ? canWrite : false
    }

    /// 复制一份、只换默认会话 —— `AppSettingsStore.save` 收的是整份值，
    /// 调用方不该在手上去拼一份新的（漏字段就是把设置悄悄改回默认）。
    func withDefaultSessionID(_ sessionID: String?) -> AppSettings {
        var copy = self
        copy.defaultSessionID = sessionID
        return copy
    }

    // MARK: - 每张卡片的聊天模式与角色（2026-09-26）

    /// **每张卡片各自记住「用哪种方式跟它对话」**：文本 / 图文 / 语音 / 视频。
    ///
    /// key 是卡片 id（= 背后那条 `ConversationSession` / `AgentSession` 的 uuidString，
    /// 与 `defaultSessionID` 同一个形状），值是 `CardChatMode` 的 rawValue。存**原始字符串**
    /// 而不是枚举：将来多一个模式、或者读到不认识的值时降级成默认模式，而不是让整份
    /// 设置解不出来（与 `agentPermissionModeRawValue`、`windowExpansionStyle` 同一条规矩）。
    ///
    /// 没存过的卡片走 `CardChatMode.defaultMode(for:)` —— 主循环默认图文（就是今天的行为），
    /// Claude Code / 复盘默认文本。
    ///
    /// **已归档卡片留下来的条目不清理**：一条 uuid + 一个 rawValue ≈ 45 字节，而清理它
    /// 需要设置层知道"哪些卡片还在"（那是 `AgentCardModel` 的事）。为这点空间把两层的
    /// 依赖反过来不值当。
    var cardChatModeRawValues: [String: String]?

    /// **语音 / 视频模式下「声音」开着吗**（2026-09-26）。
    ///
    /// 关掉 = **语音模型只出文字**（用户的原话：「如果声音按钮关闭，相当于语音模型只输出
    /// 文本就可以了。注意是调整语音模型的输出，不是调整系统的扬声器」）。所以它落到两个引擎上：
    /// 三段式那一侧是"不合成、不播放"，全双工那一侧是 `modalities: ["text"]`。
    ///
    /// 默认开 —— 语音聊天的默认形态就是说话。
    var voiceChatSpeaksReplies: Bool = true

    /// **每张卡片各自记住选了哪个语音角色**（只在语音 / 视频模式下有意义）。
    /// 存的是 `VoiceChatRole.id`；nil = 没选过 = 该模式下的第一个可用角色。
    var cardVoiceRoleIDs: [String: String]?

    /// 这张卡片现在用哪种聊天模式。
    func cardChatMode(forCardID cardID: String, kind: CardKind) -> CardChatMode {
        guard let rawValue = cardChatModeRawValues?[cardID],
              let mode = CardChatMode(rawValue: rawValue) else {
            return CardChatMode.defaultMode(for: kind)
        }
        return mode
    }

    /// **每张卡片各自用哪个「AI」**（用户 2026-09-26：「让用户……选择哪一个 AI」）。
    ///
    /// 值就是 `ModelConfiguration.VisionModelChoice.id` —— `"服务商UUID||模型名"`，
    /// 存**原始字符串**、不存枚举，理由与上面那几个字典一样：服务商被删掉、模型名被改掉
    /// 之后，这里读出来是个解析不了的值，那就回落到全局配置，而不是让整份设置解不出来。
    var cardVisionModelOverrides: [String: String]?

    /// 这张卡片自己选的那个 AI（没选过 = nil = 用设置里全局那份）。
    func cardVisionModelOverride(forCardID cardID: String) -> String? {
        cardVisionModelOverrides?[cardID]
    }

    /// 复制一份、只换某张卡片的 AI。传 nil = 回到"跟全局"。
    func withCardVisionModelOverride(_ overrideValue: String?, forCardID cardID: String) -> AppSettings {
        var copy = self
        var overrides = copy.cardVisionModelOverrides ?? [:]
        if let overrideValue {
            overrides[cardID] = overrideValue
        } else {
            overrides.removeValue(forKey: cardID)
        }
        copy.cardVisionModelOverrides = overrides
        return copy
    }

    /// 这张卡片在语音 / 视频模式下选中的角色 id（没选过是 nil）。
    func cardVoiceRoleID(forCardID cardID: String) -> String? {
        cardVoiceRoleIDs?[cardID]
    }

    /// 复制一份、只换某张卡片的聊天模式。
    func withCardChatMode(_ mode: CardChatMode, forCardID cardID: String) -> AppSettings {
        var copy = self
        var modes = copy.cardChatModeRawValues ?? [:]
        modes[cardID] = mode.rawValue
        copy.cardChatModeRawValues = modes
        return copy
    }

    /// 复制一份、只换某张卡片的语音角色。传 nil = 回到"没选过"。
    func withCardVoiceRoleID(_ roleID: String?, forCardID cardID: String) -> AppSettings {
        var copy = self
        var roles = copy.cardVoiceRoleIDs ?? [:]
        if let roleID {
            roles[cardID] = roleID
        } else {
            roles.removeValue(forKey: cardID)
        }
        copy.cardVoiceRoleIDs = roles
        return copy
    }

    // MARK: - 听（语音识别）

    /// 说话用哪个识别服务。存 rawValue 而不是枚举本身 —— 与这个文件里其他枚举
    /// 同一个理由：读到不认识的值时退化成默认，而不是让整份设置解不出来。
    var voiceTranscriptionServiceRawValue: String = VoiceTranscriptionService.volcengine.rawValue

    var voiceTranscriptionService: VoiceTranscriptionService {
        get { VoiceTranscriptionService(rawValue: voiceTranscriptionServiceRawValue) ?? .volcengine }
        set { voiceTranscriptionServiceRawValue = newValue.rawValue }
    }

    var transcriptionLanguage: TranscriptionLanguage = .chinese

    /// One term per line, appended to the built-in keyterm list as a
    /// recognition bias for proper nouns.
    var extraTranscriptionKeyterms: String = ""

    /// How long the transcription session waits for the server's final transcript
    /// after key-up before falling back to the best interim text. Was hardcoded
    /// to 1.4 seconds.
    var finalTranscriptGracePeriodSeconds: Double = 1.4

    /// Server-side VAD: the service auto-commits when the user pauses, so short
    /// utterances don't need the key held to the very end. Off keeps the manual
    /// commit mode the pipeline was built around.
    var usesAutomaticSpeechSegmentation: Bool = false

    /// 「回答时持续监听」: while the answer is being spoken (and for the window
    /// that follows it), keep the microphone listening so a follow-up question
    /// needs no shortcut at all — speaking up interrupts the TTS and the
    /// finished utterance is sent as a brand-new question.
    var continuousListeningEnabled: Bool = false

    /// 「持续监听时间」: how long, in seconds, the microphone stays open after the
    /// answer's playback starts, so a follow-up can be asked hands-free.
    ///
    /// `0` is a real value, not a floor (2026-09-24, the user's request): the
    /// microphone closes when the answer finishes and the only way in is the talk
    /// shortcut. That is a different thing from releasing the engine — the engine
    /// is held for `audioEngineIdleReleaseMinutes` either way, so a press after
    /// minutes of silence still gets a warm, fast reply. The two settings answer
    /// "is the microphone open?" and "is the engine warm?", and the user can mix
    /// them however they like.
    ///
    /// Clamped to 0...120.
    var continuousListeningWindowSeconds: Int = 30

    /// 「静音多久自动发送」: during the continuous-listening window, how long
    /// the microphone must stay quiet after the user stops speaking before the
    /// utterance is auto-sent as a new question. Human thinking pauses are
    /// unbounded (the user's framing, 2026-09-23), so the shortcut press is the
    /// reliable send marker and this wait is only the auto path — surfaced in
    /// the 听 page so it can be pushed out of the way of the user's own pauses.
    /// Clamped to 1...5.
    /// **说完停下后等多久没声音就自动发送**（用户 2026-09-28：「我说完话之后 **1.5 秒之内**没有说话，
    /// 自动发送」——原来是 2.0）。
    ///
    /// ⚠️ 这个数**只决定"等多久"**，与"说了几个字"**没有任何关系**：短句被丢掉是另一道闸门
    /// （`minimumContentCharacters`，主 Agent 那条已经降到 1 = 只挡"一个字都没有"）。
    var continuousListeningSilenceSendSeconds: Double = 1.5

    /// **上一版的默认值（2.0 秒）** —— 用户存的是它（= 从没改过）就一次性换成 1.5
    /// （仓规：改默认值必须配一次迁移，否则老用户设置文件里存着旧值、新默认值永远不生效）。
    static let legacyContinuousListeningSilenceSendSeconds: Double = 2.0

    /// 「引擎保持时间」: how long the shared audio engine stays up after the last
    /// activity before it is released.
    ///
    /// The engine's bring-up is not cheap — enabling voice processing
    /// reconfigures the whole IO (44.1 kHz / 1 ch → 48 kHz / 9 ch, measured in
    /// `VoicePlaybackEngine`) and takes ~2 s, of which the first `start()`
    /// usually fails and the rebuild succeeds in ~90 ms. That cost is meant to
    /// be paid ONCE; releasing the engine between replies made every new
    /// question pay it again, which the user measured as ~3 s from the reply
    /// card appearing to the first sound, against ~1.1 s on a follow-up inside
    /// an open listening window.
    ///
    /// The price of holding it is the one the second engine used to exist to
    /// avoid: while voice processing is enabled this app is in macOS's
    /// "communication app" class and every other application's audio is ducked,
    /// at the mildest level macOS offers. So the hold is a trade the user asked
    /// for explicitly (2026-09-24) and it is theirs to set:
    ///
    ///   · `1` / `3` / `5` minutes — release that long after the last activity;
    ///   · `0` — 「永久」: never release on a timer. Warm and instantly
    ///     responsive at all times; other audio stays ducked until the release
    ///     shortcut is pressed.
    ///
    /// Reset by any activity: a press, a recording, a barge-in, a transcript, a
    /// reply starting. Clamped to 0...60.
    /// 「弹出速度」: how fast the notch sheet's expansion plays, as a multiplier
    /// applied to every style's duration (and to the content entrance delays,
    /// which are fractions of the same window). `1.0` is 参考页's
    /// own timing; `2.0` — the default, the user's choice 2026-09-24 — is twice
    /// as fast. Clamped to 1...4: below 1 the panel would feel sluggish again,
    /// and above 4 the reveal stops reading as a bloom and starts reading as a
    /// flash.
    ///
    /// The constants in `NotchSupport` stay at 参考页's own values;
    /// this divides at read time, so 参考页's numbers remain the documented
    /// baseline and a future style added to `NotchSupport` inherits the speed
    /// automatically.
    var notchExpansionSpeedMultiplier: Double = 2.0

    /// The expansion duration in force for `style`, with the user's speed
    /// multiplier applied. THE single entry point for "how long does the reveal
    /// take" — see the `expansionRevealDuration` comment for why there must be
    /// exactly one.
    var expansionRevealDurationInForce: (Double) -> (WindowExpansionStyle) -> TimeInterval {
        { multiplier in
            { style in
                NotchSupport.expansionRevealDuration(for: style) / multiplier
            }
        }
    }

    /// The content entrance delay in force, with the user's speed multiplier
    /// applied — the delay is paired to its window animation and must scale with
    /// it, or the content draws in full while the panel is still half-grown.
    var expansionContentEntranceDelayInForce: (Double) -> (WindowExpansionStyle) -> TimeInterval {
        { multiplier in
            { style in
                NotchSupport.expansionContentEntranceDelay(for: style) / multiplier
            }
        }
    }

    var audioEngineIdleReleaseMinutes: Int = 3

    /// 「释放引擎」: the shortcut that puts the machine's audio back to normal on
    /// demand — engine stopped, voice processing off, ducking lifted — for the
    /// times the user is doing something else while 「引擎保持时间」 is 永久.
    /// `nil` = not recorded, so nothing is bound until the user sets one.
    // MARK: - 打开窗口的快捷键

    /// 「打开窗口」那一组，四格：
    ///   0 = 打开面板（落在上次那一栏）
    ///   1/2/3 = 直接打开到 Screen / Agent / Call
    ///
    /// **全部默认 nil（不绑定）**，而不是像说话快捷键那样给个预设 —— 预设按键会
    /// 在别人的应用里抢键，而这个功能是"想用才录"的。
    /// 用户 2026-09-25：「在设置页面增加一个快捷键，用于打开窗口……还能自动打开
    /// Screen、Agent、Call 这三个窗口，一共三类，因此可以分别为每一个设置快捷键」。
    /// **「任务列表」的快捷键** —— 按一下在**鼠标左下角**弹出任务面板。
    ///
    /// 用户 2026-09-26：「要新增一个快捷键…就是在鼠标左下角显示这个窗口。点这个快捷键之后，
    /// 它就不变了，但是任务的卡片是可以变化的，可以展开的，也可以停止什么的」——
    /// 为什么要快捷键：刘海在屏幕左上角，「鼠标移过去需要时间和距离，体验下来不太好」。
    /// 默认 ⌃⌥T（keyCode 17 = t）。
    var taskListShortcut: RecordedKeyboardShortcut?

    /// 解析：录过就用录的，没录就用预设 —— 和 `pushToTalkShortcutBinding` 同一个形状。
    var taskListShortcutBinding: RecordedKeyboardShortcut {
        taskListShortcut ?? Self.defaultTaskListShortcutBinding
    }
    /// ⌃⌥T = control(262144) + option(524288)，keyCode 17 = t。
    static let defaultTaskListShortcutBinding = RecordedKeyboardShortcut(
        modifierFlagsRawValue: 262144 + 524288,
        keyCode: 17)

    var openSheetShortcut: RecordedKeyboardShortcut?
    var openSheetScreenShortcut: RecordedKeyboardShortcut?
    var openSheetAgentShortcut: RecordedKeyboardShortcut?
    var openSheetCallShortcut: RecordedKeyboardShortcut?

    /// 这一组按**下标**取，与监视器那边的匹配表一一对应。
    /// nil 的格子不进匹配（没录就是没快捷键）。
    var openSheetShortcutBindings: [RecordedKeyboardShortcut?] {
        [openSheetShortcut, openSheetScreenShortcut, openSheetAgentShortcut, openSheetCallShortcut]
    }

    var releaseAudioEngineShortcut: RecordedKeyboardShortcut?

    /// 「回声消除」: whether Apple's voice processing (the system AEC) runs on
    /// the shared playback engine, cancelling the app's OWN spoken answer out
    /// of the microphone before the recognizer ever sees it.
    ///
    /// This is the structural half of the barge-in fix (2026-09-23). The
    /// text-level echo filter below it cannot hold on a mixed signal: with the
    /// answer audible in the microphone the recognizer transcribes our own
    /// words, and a filter then errs in BOTH directions — refusing a real
    /// interruption when it reads our words as echo (the answer talks over the
    /// user for sentences), and self-interrupting when it mis-hears one
    /// character (the AI cutting itself off). Un-mixing the signal is the only
    /// fix that holds, and AEC is what un-mixes it.
    ///
    /// Why it is a setting at all: while voice processing runs, macOS ducks
    /// every other application's audio (the FaceTime behaviour), which is what
    /// made this app remove AEC earlier on 2026-09-23. The ducking level is
    /// configurable from macOS 14 on — the app asks for the mildest one and
    /// never the activity-driven extra — and this switch is the user's way back
    /// out if their music still dips. Turning it off restores the old
    /// behaviour exactly: the text echo filter is still in place underneath.
    var echoCancellationEnabled: Bool = true

    /// 「录制期间自动静音系统扬声器，避免录入系统声音」: while the microphone
    /// is recording (push-to-talk or continuous listening) and no answer is
    /// being played back, the system's default output device is muted — music,
    /// video and every other application's audio stay out of the transcript —
    /// and un-muted again when the recording ends or playback starts. Never
    /// silences the app's own spoken replies. The echo defence while an answer
    /// IS playing is 「回声消除」 (echoCancellationEnabled, the shared engine's
    /// voice processing); this mute is what covers every other window.
    var mutesSystemSpeakersDuringRecording: Bool = true

    /// 「追问时自动截屏」: when a follow-up speaker is detected during the
    /// continuous-listening window, capture one screenshot of the screen at
    /// that instant (not continuously) and send it with the follow-up.
    var autoScreenshotOnFollowUpSpeech: Bool = true

    /// 「说到"屏幕"立即截屏」: whenever the recognized speech contains the
    /// word 屏幕 (or "screen"), capture one screenshot the moment the word is
    /// heard — before the sentence finishes — and use it for the question.
    /// Applies to every question, shortcut-triggered ones included.
    var autoScreenshotOnScreenKeyword: Bool = true

    // MARK: - 说（语音播报）

    /// AVAudioPlayer playback rate for the spoken answer. 1.0 = normal.
    var speechPlaybackRate: Double = 1.0

    /// AVAudioPlayer playback volume, 0–100 percent. Only affects this app's
    /// speech, not the system volume.
    var speechPlaybackVolumePercent: Double = 100

    /// When a new question starts while an answer is still being spoken, cut the
    /// speech off immediately (barge-in). Off lets the current answer finish.
    var interruptsPlaybackOnNewQuestion: Bool = true

    /// Characters per TTS synthesis request. The documented service cap is 600.
    var maximumSpeechChunkCharacters: Int = 500

    /// 「播报方式」: whether the reply is spoken as it streams in (逐句快答,
    /// the default) or held until the model has finished the whole answer
    /// (整段合成). See `SpeechSpeakMode` for the measured trade-off.
    var speechSpeakMode: SpeechSpeakMode = .sentenceFastReply

    // MARK: - 看与截图

    /// Longest edge of the captured screenshot in pixels. 0 means no rescaling
    /// (capture at the display's native size).
    var screenshotMaxDimension: Int = 1280

    /// JPEG compression factor for the screenshot.
    var screenshotCompressionQuality: Double = 0.8

    /// Send one screenshot per connected display (true) or only the display the
    /// cursor is on (false).
    var capturesAllDisplays: Bool = true

    /// When the answer embeds a `[POINT:…]` tag, fly the cursor to that element.
    var pointsAtReferencedElements: Bool = true

    /// 「圈选提问」: while holding the talk shortcut, the user can draw a circle
    /// around something on screen with the mouse, and that region rides along
    /// with the question as extra context — the human's own marking is what
    /// makes the subject pixel-exact. Gated separately from 「回答里的位置自动飞过去指」
    /// because the two travel in opposite directions: this is the human
    /// marking the model's subject, not the model marking the user's screen.
    var allowsCircleToAsk: Bool = true

    /// 「刘海屏音效」: short one-shot chimes at conversation state transitions
    /// (recording started, transcript sent, answer arriving, an error) and when
    /// the notch sheet expands. Off means every sound effect is silent —
    /// spoken answers are unaffected either way.
    var playsNotchSoundEffects: Bool = true

    /// 连接成功之后，**先让 AI 说第一句话**（默认开）。
    ///
    /// 用户 2026-09-24 的观察很准：「刘海左右两侧显示的是连接成功，但我跟它说话它
    /// 没有反应，等了很长时间它才有反应」—— 原来的「已连接」只是**我们自己**把
    /// 状态标志翻了，它并不代表对方真的活着、真的听得到。让 AI 先出声，是把
    /// 「连接成功」这件事**变成一件用户能听见的事实**。
    ///
    /// 配合 `VoiceChatController` 里那条规则：刘海切到「Chatting」的时刻就是
    /// **第一段音频真的开始播**的时刻，而不是连接调用返回的时刻。
    var voiceChatGreetsOnConnect: Bool = true

    /// **静音回复**（用户 2026-09-25）：Ask 页右上角的静音开关 —— 开（默认）
    /// 时回复照常朗读；关时回复只显示文字、不合成不播放。它只作用于
    /// CompanionManager 的回复管线（按住说话 / Ask 打字）；Chatting 的会话
    /// 与它无关（那边有自己的音频流）。
    var voiceReplyMuted: Bool = false

    /// 第一句话说什么。留空就是用内置的那句。
    var voiceChatGreetingText: String = ""

    /// 内置打招呼语。
    ///
    /// **2026-09-25 改成一句"指令"而不是一句问候**（用户的原话：「你需要通过发一些
    /// 内容让 AI 说话，提示词应该是：请说你好，请不要回复其他内容，请只说你好。
    /// 就是让它第一句话只说"你好"这两个字，不要说其他内容，这样我能知道它回复我了、
    /// 连接上了、能正常回复了。你只需要修改提示词，其他的不需要安排」）。
    ///
    /// 关键在于**这句话本来就是当用户消息发给模型的**，不是读出来的问候：
    ///   · 全双工 —— `DuplexVoiceEngine.speakGreeting` 发
    ///     `conversation.item.create`（role=user）+ `response.create`；
    ///   · 三段式 —— `startTurn(utterance: greeting, announcesUserBubble: false)`。
    /// 所以写一句指令，模型就会照着回。**换掉的只是文本，接线一个字没动。**
    ///
    /// 附带的好处：回复只有两个字，首段合成的成本降到最低（合成 ≈ 固定 ~590ms +
    /// 每字 ~19–25ms，实测见 `开发经验/09-实测数据.md`），所以这一声"你好"来得
    /// 比原来那句 12 字的问候更早 —— 而它要回答的正是"连上了没有"。
    static let defaultVoiceChatGreetingText = "请说你好，请不要回复其他内容，请只说你好。"

    /// 「刘海屏入口」: whether the notch-area pill is built at all on MacBooks
    /// with a hardware notch. The menu-bar panel is the permanent backup entry,
    /// so turning this off returns the app to a menu-bar-only life. On machines
    /// without a notch the subsystem idles regardless of this setting.
    var enablesNotchPresence: Bool = true

    // MARK: - 操作

    /// Master switch for acting on the machine — clicking, scrolling, typing,
    /// pressing keys, opening apps, reading the accessibility tree.
    ///
    /// On by default. Off means the tags are still parsed and then discarded, so
    /// the companion can point at things but cannot touch them.
    var allowsComputerControl: Bool = true

    /// Whether `[TYPE:…]` and `[PRESS:…]` are allowed, separately from everything
    /// else.
    ///
    /// Typing and key presses are the two that can reach any part of the system
    /// through whatever app happens to have focus, which is why they have their
    /// own gate rather than riding on the master switch. Clicking and scrolling
    /// are unaffected by it.
    var allowsKeyboardControl: Bool = true

    /// How `[TYPE:…]` gets its text into the focused app — one key event per
    /// character, or a clipboard paste (`cmd+v`). See `TextEntryMethod` for the
    /// trade-off; typing is the default so the clipboard is untouched unless the
    /// user asks for paste.
    var textEntryMethod: TextEntryMethod = .typeCharacters

    /// 「允许调用工具库」—— 让模型跑 `tools/manifest.json` 里那些工具（`[RUN:工具名:参数]`）。
    ///
    /// **和「允许操作电脑」分开，这是刻意的**（用户 2026-09-24 定的，见
    /// `开发经验/Agent施工/细节/06-工具库与MCP.md` §九）：点鼠标是"在用户眼前动他的机器"，
    /// 而跑一个写好的脚本是"让机器算点东西"——风险模型不同，所以闸门不同。
    ///
    /// 关掉时 `[RUN:]` 仍然被解析，然后**被丢弃并回一句话**（同 `allowsComputerControl`
    /// 的规矩：不能静默什么都不做 —— 那和"标签没被认出来"长得一模一样）。
    ///
    /// `Bool?` 按本仓 E1 规矩：**加这一条之前写下的设置文件仍然要能解码**
    /// （合成的 `Codable` 遇到缺键会抛，于是老文件会整个读不出来）。nil 当开。
    var allowsToolLibrary: Bool? = true

    // MARK: - 快捷键

    /// Raw value of a `BuddyPushToTalkShortcut.ShortcutOption`. Stored as a
    /// string so an unknown value from a future/older build degrades to the
    /// default instead of failing the whole decode.
    var pushToTalkShortcutRawValue: String = BuddyPushToTalkShortcut.ShortcutOption.controlOption.rawValue

    /// The shortcut the user recorded by pressing keys in the settings window,
    /// or nil to follow the preset named by `pushToTalkShortcutRawValue`.
    /// A recorded shortcut always wins over the preset — the recorder is the
    /// more specific expression of the same one row.
    var customPushToTalkShortcut: RecordedKeyboardShortcut?

    /// How the shortcut is used: hold-to-talk (press, speak, release to send)
    /// or double-tap (press to start, press again to finalize and send) — the
    /// latter for long utterances that are uncomfortable to hold a key through.
    var pushToTalkTriggerModeRawValue: String = ShortcutTriggerMode.holdToTalk.rawValue

    var pushToTalkTriggerMode: ShortcutTriggerMode {
        get { ShortcutTriggerMode(rawValue: pushToTalkTriggerModeRawValue) ?? .holdToTalk }
        set { pushToTalkTriggerModeRawValue = newValue.rawValue }
    }

    /// The shortcut actually in effect: the user's recorded one when present,
    /// otherwise the chosen preset. Everything that matches events or displays
    /// the keys reads this, never the two stored halves directly, so a recorded
    /// shortcut and a preset can never disagree about which one is live.
    var pushToTalkShortcutBinding: RecordedKeyboardShortcut {
        if let customPushToTalkShortcut { return customPushToTalkShortcut }
        if let preset = BuddyPushToTalkShortcut.ShortcutOption(rawValue: pushToTalkShortcutRawValue) {
            return preset.defaultShortcutBinding
        }
        // Unknown preset string from a future/older build — same fallback the
        // `pushToTalkShortcutOption` accessor uses.
        return BuddyPushToTalkShortcut.ShortcutOption.controlOption.defaultShortcutBinding
    }

    /// Send the transcript the moment the key is released (current behavior).
    /// Off holds the transcript for confirmation — a quick tap of the shortcut
    /// sends it, holding the key again re-records over it.
    var sendsTranscriptImmediatelyOnRelease: Bool = true

    // MARK: - 语音聊天模式

    /// The three voice-chat mode shortcuts' factory defaults: ⌃⌥1 / ⌃⌥2 / ⌃⌥3
    /// (key codes 18/19/20 are the top number row's 1/2/3). The modifier raw
    /// value is control (0x40000) + option (0x80000) — the same two modifiers
    /// the talk shortcut's preset uses, so the whole family sits under one
    /// hand. Indexed by mode (0 = 三段式, 1 = 全双工语音, 2 = 全双工全模态).
    static let voiceWebDefaultShortcutBindings: [RecordedKeyboardShortcut] = [
        RecordedKeyboardShortcut(modifierFlagsRawValue: 786432, keyCode: 18),
        RecordedKeyboardShortcut(modifierFlagsRawValue: 786432, keyCode: 19),
        RecordedKeyboardShortcut(modifierFlagsRawValue: 786432, keyCode: 20),
    ]

    /// The factory default for 「释放引擎」: ⌃⌥4, the next key along from the
    /// three voice-chat mode shortcuts above (the only other ⌃⌥ bindings in the
    /// app), so the release shortcut works out of the box rather than needing to
    /// be recorded before it can be used.
    static let defaultReleaseAudioEngineShortcut = RecordedKeyboardShortcut(
        modifierFlagsRawValue: 786432,
        keyCode: 21
    )

    /// The release shortcut in force — the user's recorded one when present,
    /// otherwise the ⌃⌥4 preset. The same resolve-once shape as
    /// `pushToTalkShortcutBinding`, and for the same reason: what the settings
    /// page shows and what the event tap matches must be one value.
    var releaseAudioEngineShortcutBinding: RecordedKeyboardShortcut {
        releaseAudioEngineShortcut ?? Self.defaultReleaseAudioEngineShortcut
    }

    /// The shortcut that connects/disconnects the 三段式 (pipeline) voice mode.
    /// `nil` means the factory default ⌃⌥1 — same nil-means-preset shape as
    /// `customPushToTalkShortcut`.
    var voiceWebThreeStageShortcut: RecordedKeyboardShortcut?

    /// The shortcut for the 全双工语音 (duplex) voice mode. `nil` means ⌃⌥2.
    var voiceWebDuplexShortcut: RecordedKeyboardShortcut?

    /// The shortcut for the 全双工全模态 (omni) mode. `nil` means ⌃⌥3.
    var voiceWebOmniShortcut: RecordedKeyboardShortcut?

    /// 三段式: send screen content along with the conversation (the
    /// role-level screen recognition). Off = voice only. Written into the
    /// active role's `screen_vision_enabled` at connect time.
    var voiceWebThreeStageSendsScreen: Bool = false

    /// 全双工全模态: whether voice participates. Voice is the point of the
    /// mode, so it defaults on; the two toggles below are the optional extras.
    var voiceWebOmniVoiceEnabled: Bool = true

    /// 全双工全模态: open the camera after connecting. Off by default — the
    /// camera light coming on uninvited would be the wrong default.
    var voiceWebOmniCameraEnabled: Bool = false

    /// 全双工全模态: ask for screen sharing after connecting. The macOS
    /// picker always needs one human click; the row's
    /// description says so.
    var voiceWebOmniScreenEnabled: Bool = false

    /// The shortcut actually in effect for voice-chat mode `modeIndex`
    /// (0 = 三段式, 1 = 全双工语音, 2 = 全双工全模态): the user's recorded
    /// one when present, otherwise the factory default — the same
    /// recorded-wins-over-preset rule as `pushToTalkShortcutBinding`.
    func voiceWebShortcutBinding(modeIndex: Int) -> RecordedKeyboardShortcut {
        let storedShortcuts = [voiceWebThreeStageShortcut, voiceWebDuplexShortcut, voiceWebOmniShortcut]
        let index = max(0, min(modeIndex, storedShortcuts.count - 1))
        return storedShortcuts[index] ?? Self.voiceWebDefaultShortcutBindings[index]
    }

    // MARK: - Agent

    /// Master switch for the agent subsystem — spawning claude subprocesses
    /// that work on a project folder in the background. Off means 「新建 Agent」
    /// and send are refused with an explanation rather than silently doing
    /// nothing (the same "don't act, but say so" rule as `allowsComputerControl`).
    var allowsAgentSubsystem: Bool = true

    /// Path to the claude CLI executable. `nil` means auto-detect (`which
    /// claude`, then the Homebrew locations) at spawn time, so a user who never
    /// opens settings still works; the settings row exists for installs where
    /// the CLI lives somewhere unusual.
    var agentClaudeExecutablePath: String?

    /// Folder pre-selected when a new agent is created. `nil` means the folder
    /// picker starts at the user's home directory.
    var agentDefaultProjectFolder: String?

    /// Raw value of `AgentPermissionMode`, stored as a string so an unknown
    /// value from a future/older build degrades to the default instead of
    /// failing the whole decode.
    var agentPermissionModeRawValue: String = AgentPermissionMode.autoEdit.rawValue

    var agentPermissionMode: AgentPermissionMode {
        get { AgentPermissionMode(rawValue: agentPermissionModeRawValue) ?? .autoEdit }
        set { agentPermissionModeRawValue = newValue.rawValue }
    }

    /// How many agent subprocesses may run at once. Each one is an independent
    /// claude process billing the user's own Claude login, so the ceiling is
    /// deliberately low.
    var maximumConcurrentAgents: Int = 3

    /// Whether agents with a non-idle status show up as floating chips in the
    /// screen's top-right corner. Off hides the controller's panels entirely —
    /// the roster in the notch sheet still works.
    var allowsAgentDesktopHUD: Bool = true

    /// Whether a finished agent turn is read aloud through the speech role.
    /// Announcements only fire while the voice companion is idle, so this can
    /// never cut into an answer the user is listening to.
    var announcesAgentCompletion: Bool = true

    // MARK: - 模型

    /// `max_completion_tokens` sent with every vision request. Shared by every
    /// provider, so the stored value is clamped to 32768 — Bailian's ceiling,
    /// which is an order of magnitude below DeepSeek's.
    var visionMaxCompletionTokens: Int = 32768

    // MARK: - 长录音

    /// 长录音的触发快捷键。**没有出厂预设**，`nil` 就是「还没录过」。
    ///
    /// 这是这个功能里唯一一处刻意的例外：语音聊天占了 ⌃⌥1–3、释放引擎占了
    /// ⌃⌥4，再硬塞一个预设进去就会和它们抢。所以录音这件事必须由用户自己录
    /// 一条才会生效（`recordingShortcutBinding`）。没录快捷键时功能不启动，
    /// 设置页那一行也会把「录一条才会生效」写出来 —— 静默不生效比没有更糟。
    var recordingShortcut: RecordedKeyboardShortcut?

    /// 豆包流式语音识别的 API Key（请求头 `X-Api-Key`）。
    ///
    /// 按用户的要求，它存在 App 自己的设置文件里
    /// （`~/Library/Application Support/Wanna/AppSettings.json`，`0600`，
    /// **在仓库外**），不建 env 文件、不建仓库内配置文件 —— 所以它不会、也
    /// 不可能被推到 GitHub。这个文件是唯一存放处，`BailianSecrets.plist`
    /// 那种「首次启动的种子」模式这里不需要，因为它不是启动时就必须要的东西：
    /// 没配就是按不了录音，不是整个 App 跑不起来。
    var recordingServiceAPIKey: String = ""

    /// 档位选择，存 rawValue 而不是枚举本身 —— 和 `agentPermissionModeRawValue`
    /// 同一个理由：将来增删档位时，一个读不出来的旧值应该退化成默认，
    /// 而不是让整个 `AppSettings.json` 解不出来。
    var recordingResourceIDRawValue: String = VolcengineASRResource.seedDurationV2.rawValue

    var recordingResourceID: VolcengineASRResource {
        get { VolcengineASRResource(rawValue: recordingResourceIDRawValue) ?? .seedDurationV2 }
        set { recordingResourceIDRawValue = newValue.rawValue }
    }

    /// 自定义资源 ID。非空时**覆盖**上面的档位选择。
    ///
    /// 存在的理由：火山控制台里可以建自定义模型，它的 ID 不在上面那四个内置
    /// 档位里。留一个填的地方，比让用户去改代码强。
    var recordingCustomResourceID: String = ""

    /// 真正发出去的 `X-Api-Resource-Id`：自定义非空就用自定义，否则用档位。
    var recordingEffectiveResourceID: String {
        let trimmed = recordingCustomResourceID.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? recordingResourceID.rawValue : trimmed
    }

    /// 识别语言，直接作为 `request.language` 发出去。空字符串 = 让服务自己判断。
    var recordingLanguage: String = "zh-CN"

    /// 热词，逗号或换行分隔。专有名词偏置 —— 人名、地名、项目代号全靠它。
    var recordingHotwords: String = ""

    /// 录音与转录的落盘目录。空 = 用默认的 `Wanna录音/`。
    ///
    /// 默认落桌面而不是 Application Support：那是隐藏目录，用户在访达里
    /// 根本找不到。这个项目里已经有 `Wanna图形/` 这个先例，
    /// 录音沿用同一个约定 —— 录完的文件是要给人看、给人拖走的。
    var recordingSaveFolderPath: String = ""

    // MARK: - 录音 → Notion（2026-09-27）

    /// 总闸。关掉时：不检测关键词、不显示那两颗按钮、一切与从前完全一样。
    var notionNoteEnabled: Bool = false

    /// 要写进哪一页（用户在 Notion 里复制的那条链接或页面 id）。
    var notionNotePageID: String = ""

    /// 打开的链接 —— 保存成功后点「已保存笔记」跳的就是它。留空时用 `notionNotePageID` 拼。
    var notionNoteOpenURL: String = ""

    /// Notion 集成令牌（`ntn_…` 或旧的 `secret_…`）。
    ///
    /// **它住在 `AppSettings.json`（0600、仓库外）** —— 与这一族其他设置同一处，
    /// 不写进仓库、不进导出文件之外的任何地方（导出文件里也是明文，那一页有说明）。
    var notionNoteToken: String = ""

    /// 整理内容那次调用用的服务商（与「录音 → 自定义风格」同一套字段形状）。
    ///
    /// 用户要求「转写部分使用另一套提示词，独立使用 DeepSeek Flash 设计的提示词整理，
    /// 不使用录音润色提示词」—— 所以它有**自己**的地址 / Key / 模型，与录音润色那套分开。
    var notionNoteBaseURL: String = ""
    var notionNoteAPIKey: String = ""
    var notionNoteModelID: String = "deepseek-flash"

    /// 那次整理用的提示词（要它输出两块：大纲 + 排版后的 Markdown）。
    var notionNotePrompt: String = AppSettings.defaultNotionNotePrompt

    /// 触发关键词（一行一个）—— **总开关**那一组（「保存笔记」这类）。
    ///
    /// 检测窗口在**开头与末尾各 100 字**里做（用户 2026-09-27 放宽后的话：
    /// 「开头可能是前 100 个字…就是前这么 10 句话，或者前 15 秒钟」）。
    var notionNoteKeywords: String = AppSettings.defaultNotionNoteKeywords

    /// **「参考剪贴板」那一组**：说了这些词（「复制内容」「选中内容」…）就把剪贴板当成参考材料，
    /// 而不是把转写当笔记本身（用户 2026-09-27 第 2 阶段）。
    var notionClipboardKeywords: String = AppSettings.defaultNotionClipboardKeywords

    /// **「参考屏幕」那一组**：说到就**当场**截一张图（说几次截几张），作为参考材料。
    ///
    /// ⚠️ 这三组关键词**两条路共用**：录音→Notion 那条，以及主 Agent 的参考材料
    ///（`TurnReferenceCollector`）。用户 2026-09-27 说参考材料要「贯穿全局」，
    /// 而"屏幕词 / 剪贴板词"本来就是同一件事 —— 两份清单必然漂。
    var notionScreenKeywords: String = AppSettings.defaultNotionScreenKeywords

    /// **看板上哪个键用来"粘贴"**（另一个键就是"执行"）。用户 2026-09-27：
    /// **看板显示着的时候，哪两个键分别管"粘贴"和"执行"**。
    ///
    /// ⚠️ 2026-09-27 深夜改（用户）：「关于（实时对话）**转到 agent 模式**（快捷键替换成
    /// **option+enter**），和**粘贴**的快捷键（替换成 **com+enter**）」。
    ///
    /// 所以现在这一字段表达的是「**粘贴**用哪个键」：
    /// · `.commandReturn`（**默认**）→ **⌘⏎ 粘贴**、**⌥⏎ 执行**；
    /// · `.optionReturn` → 反过来。
    /// **裸回车两个都不是** —— 它原样放行（见 `BoardPasteShortcut.action` 的 `.passThrough`），
    /// 因为那两个动作现在都带修饰键，再吞掉裸回车就只是白白吃掉用户在他自己 App 里的回车。
    ///
    /// ⚠️ 它原来是复用对话输入框那个 `ComposerSendShortcut`（Enter / Command+Enter）——
    /// 那两个动作现在都换成了**带修饰键**的回车，形状不再一样，所以改成自己的小枚举；
    /// 旧文件里存的 `"commandReturn"` 仍然解得出（同一个 rawValue，含义也一样），
    /// 存的 `"returnKey"` 则落到新默认上 —— 走 **String 优先**的解码，不能直接解枚举
    ///（直接解会在 rawValue 对不上时抛错，把整份 `AppSettings.json` 带走，见规则 E1）。
    var boardPasteShortcut: BoardPasteShortcut = .commandReturn

    /// **「文件 / 文件夹」那一组**（只看主 Agent 那条路用）。
    ///
    /// ⚠️ **2026-09-27 改道**：原来这组是"去访达取当前选中的绝对路径"，整块删掉了
    ///（用户：「把识别选中文件和选中文件夹的逻辑删掉……**我发现这个东西很难实现**」）。
    /// 现在说到这些词 → **去看剪贴板里是不是绝对路径**，是就带上（只给路径、不给内容）。
    /// 用户点名的那两个说法（「参考文件」「参考文件夹」）在最前面。
    var selectedItemKeywords: String = AppSettings.defaultSelectedItemKeywords

    static let defaultSelectedItemKeywords = """
    参考文件
    参考文件夹
    参考这个文件
    参考这个文件夹
    选中文件
    选中的文件
    选中文件夹
    选中的文件夹
    这个文件
    这个文件夹
    """
    /// **上一版的默认值** —— 用户存的是它的话，一次性换成新的（仓规：改默认值得配一次迁移，
    /// 否则老用户设置文件里存着旧值，新加的「参考文件」永远不生效）。
    static let legacySelectedItemKeywords = """
    选中文件
    选中的文件
    选中文件夹
    选中的文件夹
    这个文件
    这个文件夹
    选中的这个
    """

    /// ⚠️ 2026-09-27 补：用户实际说的是「根据剪贴板」「粘贴板」这种**光一个词**的说法，
    /// 而原来那组只有「参考剪贴板 / 参考复制」—— 他按自己的说法说，一个都不命中。
    /// 现在把他点名的几种说法都列进来（`剪贴板` / `粘贴板` 只要出现就算）。
    /// **上一版的默认值**（只有它该被迁移掉 —— 与它不同就说明用户改过，一个字都不动）。
    static let legacyNotionClipboardKeywords = """
    复制内容
    复制的内容
    选中内容
    选中的内容
    参考复制
    参考剪贴板
    """

    static let defaultNotionClipboardKeywords = """
    剪贴板
    粘贴板
    剪贴板内容
    剪贴板复制内容
    复制内容
    复制的内容
    选中内容
    选中的内容
    参考复制
    参考剪贴板
    """

    static let defaultNotionScreenKeywords = """
    参考屏幕
    屏幕内容
    参考屏幕内容
    """

    static let defaultNotionNoteKeywords = """
    保存笔记
    保存 notion
    保存一条笔记
    保存一条内容
    保存到 notion
    添加一条笔记
    创建一条笔记
    """

    /// 出厂提示词。要求模型**只整理、不扩写**，并给出三段固定结构的输出，
    /// 这样客户端可以按分隔符切开、分别放成两个块。
    static let defaultNotionNotePrompt = """
    你是文本整理器。下面是一段录音的转写原文。请**只整理排版，不要扩写、不要补内容**，
    并严格按下面的三段格式输出（分隔符原样保留）：

    【总结】
    一句话总结（不超过 30 字）。

    【大纲】
    用缩进与短横线把内容整理成树状大纲，像文件目录或脑图那样分层。

    【排版】
    用 Markdown 重新排版：可以用 # 标题、**加粗**、> 引用、- 列表、表格，
    并把关键的词句用后置标记标出颜色，例如「重要内容{红}」「补充{蓝}」。
    原文里没有的信息一个字都不要加。
    """

    /// 断线后自动重连并接着录。关掉的话断了就停，已录的部分照常保住。
    var recordingAutoReconnects: Bool = true

    /// 主动轮换连接的间隔（分钟）。0 = 不主动轮换，只在断了才重连。
    ///
    /// 为什么要有这个：单次连接能活多久官方没有给明确上限，所以设计上不能
    /// 依赖它。轮换发生在**静音处**，接缝上没有词可丢；小时版按时长计费，
    /// 轮换本身不花钱。所以这是「把未知的上限变成已知的小块」，不是补丁。
    var recordingRotationMinutes: Int = 20

    /// 停止后把全文放进剪贴板。
    var recordingCopiesToClipboard: Bool = true

    /// 音频保留几天。**0 = 永久保存。**
    ///
    /// 用户：「录音文件很占空间」—— 3 小时一场就是 345MB。默认只留最近一天。
    var recordingAudioRetentionDays: Int = 1

    /// 文本保留几天。**0 = 永久保存。** 默认 30 天。
    ///
    /// 文本比音频小好几个数量级（3 小时约 6 万字 = 180KB），所以留得久得多 ——
    /// 用户会回头看的是文字，不是那段录音。
    var recordingTextRetentionDays: Int = 30

    /// 「自定义风格」总开关。**默认开启**（用户要求）。
    ///
    /// 关掉它 = 不做任何后处理，转写原文直接就是最终内容 —— 也就是这一版之前的行为。
    /// 它和每一条风格自己的开关是**与**的关系：总开关关掉，所有风格一律不生效。
    var recordingPolishEnabled: Bool = true

    /// 停止录音那一刻自动抓一张当前屏幕，作为提示词的一部分一起发给模型。
    ///
    /// **默认不勾选**（用户要求）。勾上之后，「停止」那一秒的屏幕会跟转写内容一起
    /// 送给模型参考 —— 用于「我刚才指着屏幕说的那段话」这类场景。
    var recordingPolishCapturesScreenshot: Bool = false

    /// 摄像头抓帧的**总开关**。
    ///
    /// **默认关闭。** 打开之后，转写文本里出现 `recordingCameraTriggerKeywords` 里
    /// 任意一个词，才会开始抓帧 —— 判据在**代码**里，不靠模型猜；一句话都没提到
    /// 摄像头时，摄像头根本不会启动（用户 2026-09-26 的备注）。
    ///
    /// 名字里的 `Polish` 是历史：这个开关最早的意思是「润色时捎带一帧」，后来长成
    /// 了一整条按关键词触发的抓帧链路。没改名是因为改名要同时动设置文件的键和界面，
    /// 而收益只是一个更好听的名字 —— 抓来的帧最终仍然是给润色那一步用的，这一点没变。
    var recordingPolishCapturesCamera: Bool = false

    /// 摄像头小窗上**显示**的帧率。这是眼睛在看的东西，低了就知道卡。
    ///
    /// 用户 2026-09-26：「送模型的一秒 1 帧不需要那么快，**因为人类的动作不会那么快，
    /// 摄像头拍的就是人**」；而预览「要加就直接加 30 帧」。
    ///
    /// **这个值要真的能到。** 它同时是采集设备的帧率上限（见
    /// `RecordingCameraSession`）：设备被压到 10 帧时，这里填 30 也拿不到第 11 帧。
    var recordingCameraPreviewFramesPerSecond: Double = 30

    /// 真正**送进模型**的帧率。
    ///
    /// 比预览低一个数量级是故意的：模型要的是「这一段时间里镜头对着什么」，
    /// 一秒一张就够；而每多一帧就多一份 token。
    var recordingCameraModelFramesPerSecond: Double = 1

    /// 采集用不用 1080p。关掉是 720p。
    ///
    /// 用户 2026-09-26：「720P 吧，可以低清，但是……换成 1080」—— 小窗收成一条时
    /// 720p 够用，画面铺满宽度、人在仔细看的时候才值得花那份像素。小窗现在是常驻
    /// 满宽的，所以默认 1080p。
    var recordingCameraUsesHighResolution: Bool = true

    /// 一次最多带几帧去问模型。超过就丢最早的。
    ///
    /// 一段话说了几分钟时，前面那些帧跟最后的提问已经没关系了，而每多一帧就多一份
    /// token。1 帧/秒 × 24 = **覆盖最近 24 秒**。
    var recordingCameraMaximumFrameCount: Int = 24

    /// 说什么话才触发抓帧。**逗号分隔**，中英文逗号、顿号、分号、换行都算分隔符。
    ///
    /// 用户 2026-09-26：「必须把这个词变成'123摄像头'或者'打开摄像头'，必须是非常
    /// 精准的这几个字」—— 所以判据是**精确子串**，不是「摄像头」这三个字。
    /// 光说「摄像头」不抓：日常对话里太容易带出来，而抓帧是有成本的。
    var recordingCameraTriggerKeywords: String = "123摄像头，打开摄像头"

    /// `recordingCameraTriggerKeywords` 的解析结果：小写、去空白、去掉空项。
    ///
    /// 放在 `AppSettings` 上而不是散在调用处，是因为**界面回显和引擎判定必须读同一份**
    /// —— 用户在设置里看到的那几个词，就是真正会触发抓帧的那几个词。
    var recordingCameraTriggerKeywordList: [String] {
        recordingCameraTriggerKeywords
            .components(separatedBy: CharacterSet(charactersIn: ",，、;；\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
    }

    /// 长录音用哪个输入设备。**空 = 跟系统默认。**
    ///
    /// 用户 2026-09-26：「让用户可以自己设置一个默认驱动设备，让用户可以看到」。
    ///
    /// 存的是 CoreAudio 的 **UID 不是 id**：`AudioDeviceID` 是会话内的临时编号，
    /// 重启或重新插拔之后会变，UID 才是那个设备的身份。
    ///
    /// **它存在的理由是「默认本身可能是指错的」。** 录音已经改成绑具体设备而不是
    /// 那个会变的聚合体（那才是 2026-09-26 那次全静音的根因），但系统默认输入可以被
    /// 切到任何一个设备上 —— 包括录屏软件的虚拟声道。切到那里，Wanna 会忠实地
    /// 绑上去、然后录到静音。所以用户要能自己指定。
    var recordingInputDeviceUID: String = ""

    /// 鼠标旁边要不要显示 agent 的状态（对号 + 一句话）。
    ///
    /// 用户 2026-09-26：「这个东西应该设置成一个开关…让用户可以选择这个 agent 的状态
    /// 是不是应该显示在鼠标的右下角，**然后默认是选择**」。
    ///
    /// 为什么需要一个开关：后台任务。用户的原话是「用户有一个需求，让 agent 后台来执行，
    /// 然后他一直把这个任务状态显示在鼠标的左侧，其实也会影响用户的体验」—— 鼠标旁边
    /// 是注意力所在，长任务会把那块地方一直占着。
    ///
    /// **屏幕右上角那一排不受它影响。** 那是「去别处看」的东西，用户不看就不占地方；
    /// 鼠标旁边是「推到你眼前」，两者该分开。所以关掉这个开关 = 只关推给你的那一份。
    var showsAgentStatusAtCursor: Bool = true

    /// **文件访问白名单**（方案 `06-权限模型.md` §二）。
    ///
    /// 每一条是一个路径加两个开关，**读和写互不蕴含**；嵌套取最长匹配。
    /// **空数组 = 文件能力全关** —— 不是「默认给桌面」。一个没配过的 Wanna
    /// 不碰用户的任何文件。
    ///
    /// 它和另外两道闸门（`allowsComputerControl` / `allowsKeyboardControl`）
    /// **互相独立**：可以「允许点击但禁止碰文件」，也可以反过来。
    ///
    /// 判定逻辑不在这个文件里 —— 它是纯数据；匹配、四条逃逸防线、最长匹配都在
    /// `FileAccessPolicy`，那个类型能脱离 App 单独跑测试。
    /// **高速通道**：复盘从真实使用里统计出来、经用户批准后写进提示词的那几条。
    ///
    /// 它是**唯一**往主 agent 提示词里加东西的地方（方案 §08 §一），也是这套架构里
    /// 唯一会自己长大的部分 —— 所以三条防退化规则全在 `FastPathCatalog` 里：
    /// 20 行 / 800 字符的预算、超了按频率淘汰、60 天没命中自动撤出。
    ///
    /// **批准才生效**（方案 §5.2）：一条统计错的条目不是「没用」，是**每次遇到都会
    /// 被错误地执行**。所以这张表里只放用户点过头的，候选另外存。
    var fastPathEntries: [FastPathEntry] = []

    var fileAccessEntries: [FileAccessEntry] = []

    /// 润色用的模型。留空 = 用「模型」页里 🧠 那个角色配置的服务商。
    ///
    /// 用户的原话：「模型可以在录音设置页面由用户添加 URL、API key 和大模型 ID，
    /// 默认使用当前的 DeepSeek Flash，直接填进去即可」。所以模型 ID 默认就是它，
    /// 而 URL / Key 留空时**回落到 🧠 的服务商** —— 用户在「模型」页配过一次的
    /// 东西，不该在这里再填一遍。
    var recordingPolishBaseURL: String = ""
    var recordingPolishAPIKey: String = ""
    var recordingPolishModelID: String = "deepseek-flash"

    /// 停止后自动粘贴到当时最前面的那个 App 的光标处。
    ///
    /// 它需要辅助功能权限（和「操作」页要的是同一个），且会把焦点切回去 ——
    /// 所以做成一档可关的偏好，而不是默认行为里的硬编码。
    var recordingPastesAfterStop: Bool = true

    // MARK: - Clamping

    /// A copy of these settings with every numeric value forced back inside the
    /// range its UI offers. Called on the way into the store so a hand-edited
    /// JSON file can't smuggle in an out-of-range value.
    func clamped() -> AppSettings {
        var settings = self
        settings.transientCursorHideDelaySeconds = min(max(settings.transientCursorHideDelaySeconds, 0.5), 5)
        // 看板门槛：5…20 字（用户要求可在设置里调，范围是我们替他定的 —— 太小等于没门槛，
        // 太大他要等很久才看到一次理解）。
        // 看板宽度：1×~2×（用户说"要么一倍，要么两倍"，所以范围就夹在这里）。
        // 门槛的可调范围也跟着抬起来：低于 0.5 等于没门槛（用户明确要"非常高"）。
        settings.directionBoardProbabilityThreshold =
            min(max(settings.directionBoardProbabilityThreshold, 0.5), 0.95)
        settings.answerBubbleLingerSeconds = min(max(settings.answerBubbleLingerSeconds, 0), 15)
        settings.rememberedConversationRounds = min(max(settings.rememberedConversationRounds, 0), 30)
        settings.finalTranscriptGracePeriodSeconds = min(max(settings.finalTranscriptGracePeriodSeconds, 0.5), 3)
        settings.speechPlaybackRate = min(max(settings.speechPlaybackRate, 0.75), 1.5)
        settings.speechPlaybackVolumePercent = min(max(settings.speechPlaybackVolumePercent, 0), 100)
        settings.maximumSpeechChunkCharacters = min(max(settings.maximumSpeechChunkCharacters, 200), 600)
        settings.screenshotCompressionQuality = min(max(settings.screenshotCompressionQuality, 0.5), 0.95)
        settings.visionMaxCompletionTokens = min(max(settings.visionMaxCompletionTokens, 256), 32768)
        settings.maximumConcurrentAgents = min(max(settings.maximumConcurrentAgents, 1), 6)
        settings.continuousListeningWindowSeconds = min(max(settings.continuousListeningWindowSeconds, 0), 120)
        settings.continuousListeningSilenceSendSeconds = min(max(settings.continuousListeningSilenceSendSeconds, 1.0), 5.0)
        settings.audioEngineIdleReleaseMinutes = min(max(settings.audioEngineIdleReleaseMinutes, 0), 60)
        settings.notchExpansionSpeedMultiplier = min(max(settings.notchExpansionSpeedMultiplier, 1.0), 4.0)
        settings.recordingRotationMinutes = min(max(settings.recordingRotationMinutes, 0), 120)
        settings.recordingAudioRetentionDays = min(max(settings.recordingAudioRetentionDays, 0), 365)
        settings.recordingCameraPreviewFramesPerSecond = min(max(settings.recordingCameraPreviewFramesPerSecond, 5), 60)
        settings.recordingCameraModelFramesPerSecond = min(max(settings.recordingCameraModelFramesPerSecond, 0.2), 10)
        settings.recordingCameraMaximumFrameCount = min(max(settings.recordingCameraMaximumFrameCount, 1), 120)
        settings.recordingTextRetentionDays = min(max(settings.recordingTextRetentionDays, 0), 3650)
        return settings
    }
}

// MARK: - Tolerant decoding

/// Hand-written so a settings file missing a field decodes with the field's
/// default instead of throwing. The synthesized `Codable` would refuse any file
/// written before a newly added field existed, which would silently reset every
/// setting on the first launch after an upgrade.
nonisolated extension AppSettings {
    private enum CodingKeys: String, CodingKey {
        case launchesAtLogin
        case opensPanelOnLaunch
        case showsResponseText
        case directionBoardEnabled
        case directionBoard
        case directionBoardProbabilityThreshold
        case answerBubbleLingerSeconds
        case cursorPresenceMode
        case cursorShapeStyle
        case cursorFollowDistance
        case transientCursorHideDelaySeconds
        case rememberedConversationRounds
        case persistsConversationHistory
        case autoCompressesHistory
        case includesScreenshotsInHistory
        case answerLengthStyle
        case answerCardStyle
        case windowExpansionStyle
        case composerSendShortcut
        case extraSystemPromptInstructions
        case customSystemPrompt
        case defaultSessionID
        case cardChatModeRawValues
        case cardVoiceRoleIDs
        case cardVisionModelOverrides
        case voiceChatSpeaksReplies
        case reviewAgentReadsProject
        case reviewAgentWritesProject
        case transcriptionLanguage
        case voiceTranscriptionServiceRawValue
        case extraTranscriptionKeyterms
        case finalTranscriptGracePeriodSeconds
        case usesAutomaticSpeechSegmentation
        case continuousListeningEnabled
        case continuousListeningWindowSeconds
        case continuousListeningSilenceSendSeconds
        case audioEngineIdleReleaseMinutes
        case releaseAudioEngineShortcut
        case taskListShortcut
        case openSheetShortcut
        case openSheetScreenShortcut
        case openSheetAgentShortcut
        case openSheetCallShortcut
        case notchExpansionSpeedMultiplier
        case echoCancellationEnabled
        case mutesSystemSpeakersDuringRecording
        case autoScreenshotOnFollowUpSpeech
        case autoScreenshotOnScreenKeyword
        case speechPlaybackRate
        case speechPlaybackVolumePercent
        case interruptsPlaybackOnNewQuestion
        case maximumSpeechChunkCharacters
        case speechSpeakMode
        case screenshotMaxDimension
        case screenshotCompressionQuality
        case capturesAllDisplays
        case pointsAtReferencedElements
        case allowsCircleToAsk
        case playsNotchSoundEffects
        case voiceChatGreetsOnConnect
        case voiceReplyMuted
        case voiceChatGreetingText
        case enablesNotchPresence
        case allowsComputerControl
        case allowsKeyboardControl
        case allowsToolLibrary
        case textEntryMethod
        case pushToTalkShortcutRawValue
        case customPushToTalkShortcut
        case pushToTalkTriggerModeRawValue
        case sendsTranscriptImmediatelyOnRelease
        case voiceWebThreeStageShortcut
        case voiceWebDuplexShortcut
        case voiceWebOmniShortcut
        case voiceWebThreeStageSendsScreen
        case voiceWebOmniVoiceEnabled
        case voiceWebOmniCameraEnabled
        case voiceWebOmniScreenEnabled
        case visionMaxCompletionTokens
        case allowsAgentSubsystem
        case agentClaudeExecutablePath
        case agentDefaultProjectFolder
        case agentPermissionModeRawValue
        case maximumConcurrentAgents
        case allowsAgentDesktopHUD
        case announcesAgentCompletion
        case recordingShortcut
        case recordingServiceAPIKey
        case recordingResourceIDRawValue
        case recordingCustomResourceID
        case recordingLanguage
        case recordingHotwords
        case recordingSaveFolderPath
        case notionNoteEnabled
        case notionNotePageID
        case notionNoteOpenURL
        case notionNoteToken
        case notionNoteBaseURL
        case notionNoteAPIKey
        case notionNoteModelID
        case notionNotePrompt
        case notionNoteKeywords
        case notionClipboardKeywords
        case notionScreenKeywords
        case selectedItemKeywords
        case boardPasteShortcut
        case recordingAutoReconnects
        case recordingRotationMinutes
        case recordingCopiesToClipboard
        case recordingPastesAfterStop
        case recordingAudioRetentionDays
        case recordingTextRetentionDays
        case fastPathEntries
        case recordingInputDeviceUID
        case showsAgentStatusAtCursor
        case fileAccessEntries
        case recordingPolishEnabled
        case recordingPolishCapturesScreenshot
        case recordingPolishCapturesCamera
        case recordingCameraPreviewFramesPerSecond
        case recordingCameraModelFramesPerSecond
        case recordingCameraUsesHighResolution
        case recordingCameraMaximumFrameCount
        case recordingCameraTriggerKeywords
        case recordingPolishBaseURL
        case recordingPolishAPIKey
        case recordingPolishModelID
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let defaults = AppSettings()

        self.init()

        launchesAtLogin = try container.decodeIfPresent(Bool.self, forKey: .launchesAtLogin) ?? defaults.launchesAtLogin
        opensPanelOnLaunch = try container.decodeIfPresent(Bool.self, forKey: .opensPanelOnLaunch) ?? defaults.opensPanelOnLaunch
        showsResponseText = try container.decodeIfPresent(Bool.self, forKey: .showsResponseText) ?? defaults.showsResponseText
        directionBoardEnabled = try container.decodeIfPresent(Bool.self, forKey: .directionBoardEnabled) ?? defaults.directionBoardEnabled
        directionBoardProbabilityThreshold = try container.decodeIfPresent(
            Double.self, forKey: .directionBoardProbabilityThreshold) ?? defaults.directionBoardProbabilityThreshold
        directionBoard = DirectionBoardConfiguration.validated(
            try container.decodeIfPresent(DirectionBoardConfiguration.self, forKey: .directionBoard)
                ?? defaults.directionBoard)
        answerBubbleLingerSeconds = try container.decodeIfPresent(Double.self, forKey: .answerBubbleLingerSeconds) ?? defaults.answerBubbleLingerSeconds
        cursorPresenceMode = try container.decodeIfPresent(CursorPresenceMode.self, forKey: .cursorPresenceMode) ?? defaults.cursorPresenceMode
        cursorShapeStyle = try container.decodeIfPresent(CursorShapeStyle.self, forKey: .cursorShapeStyle) ?? defaults.cursorShapeStyle
        cursorFollowDistance = try container.decodeIfPresent(CursorFollowDistance.self, forKey: .cursorFollowDistance) ?? defaults.cursorFollowDistance
        transientCursorHideDelaySeconds = try container.decodeIfPresent(Double.self, forKey: .transientCursorHideDelaySeconds) ?? defaults.transientCursorHideDelaySeconds
        rememberedConversationRounds = try container.decodeIfPresent(Int.self, forKey: .rememberedConversationRounds) ?? defaults.rememberedConversationRounds
        persistsConversationHistory = try container.decodeIfPresent(Bool.self, forKey: .persistsConversationHistory) ?? defaults.persistsConversationHistory
        autoCompressesHistory = try container.decodeIfPresent(Bool.self, forKey: .autoCompressesHistory) ?? defaults.autoCompressesHistory
        includesScreenshotsInHistory = try container.decodeIfPresent(Bool.self, forKey: .includesScreenshotsInHistory) ?? defaults.includesScreenshotsInHistory
        answerLengthStyle = try container.decodeIfPresent(AnswerLengthStyle.self, forKey: .answerLengthStyle) ?? defaults.answerLengthStyle
        answerCardStyle = try container.decodeIfPresent(AnswerCardStyle.self, forKey: .answerCardStyle) ?? defaults.answerCardStyle
        // `decodeIfPresent` is what lets a file written before this setting
        // existed still load: `WindowExpansionStyle` is an enum, so a plain
        // `decode` would throw on a missing key and every older AppSettings.json
        // would fail to load. It is read as a STRING and matched by rawValue
        // rather than decoded as the enum directly, because the 2026-09-23
        // redesign renamed the 中心缩放 case `centerPop` → `notchBloom`: a file
        // holding the old value would make `decodeIfPresent(WindowExpansionStyle…)`
        // throw and take the whole AppSettings.json down with it. Unknown and
        // legacy values — `"centerPop"` included — read as the new 中心缩放.
        if let rawExpansionStyle = try container.decodeIfPresent(String.self, forKey: .windowExpansionStyle) {
        windowExpansionStyle = WindowExpansionStyle(rawValue: rawExpansionStyle) ?? .notchBloom
        } else {
            windowExpansionStyle = defaults.windowExpansionStyle
        }
        // 同一个理由：`ComposerSendShortcut` 也是枚举，普通 `decode` 会在缺键时
        // 抛错，把加这一项之前写下的每个 AppSettings.json 都变成读不进来。读不到
        // 就是默认的「按 Enter 发送」——那也是用户要的默认行为。
        composerSendShortcut = try container.decodeIfPresent(ComposerSendShortcut.self, forKey: .composerSendShortcut) ?? defaults.composerSendShortcut
        extraSystemPromptInstructions = try container.decodeIfPresent(String.self, forKey: .extraSystemPromptInstructions) ?? defaults.extraSystemPromptInstructions
        // Optional on purpose, and no `?? defaults` fallback: "no key" and "key set
        // to null" both have to land on nil, because nil is the value that means
        // "use the built-in prompt". A fallback here would turn every existing
        // settings file into one that ships a frozen copy of today's prompt.
        customSystemPrompt = try container.decodeIfPresent(String.self, forKey: .customSystemPrompt)
        // 老文件没有这个键 = 用户没设过默认会话 —— 与 nil 同义，不是错误。
        defaultSessionID = try container.decodeIfPresent(String.self, forKey: .defaultSessionID)
        // **这两个必须在 CodingKeys 之外再单独解一次**（2026-09-26 踩到）：`init(from:)` 是
        // 手写的，编码器是合成的 —— 所以只把字段加进 `CodingKeys` 会**写得进、读不出**：
        // 磁盘上明明有值，每次启动却回落成空表，表现就是「模式改了、重启又变回去」。
        // 判据在一行日志上（`🎛 [settings] 读盘成功 模式表=…`），不是猜出来的。
        cardChatModeRawValues = try container.decodeIfPresent([String: String].self,
                                                             forKey: .cardChatModeRawValues)
        cardVoiceRoleIDs = try container.decodeIfPresent([String: String].self,
                                                        forKey: .cardVoiceRoleIDs)
        cardVisionModelOverrides = try container.decodeIfPresent([String: String].self,
                                                                 forKey: .cardVisionModelOverrides)
        voiceChatSpeaksReplies = try container.decodeIfPresent(Bool.self,
                                                              forKey: .voiceChatSpeaksReplies) ?? defaults.voiceChatSpeaksReplies
        // 两个都是"没设过 = 关"（仓规 E1：`Bool?` + `decodeIfPresent`）。
        reviewAgentReadsProject = try container.decodeIfPresent(Bool.self, forKey: .reviewAgentReadsProject)
        reviewAgentWritesProject = try container.decodeIfPresent(Bool.self, forKey: .reviewAgentWritesProject)
        transcriptionLanguage = try container.decodeIfPresent(TranscriptionLanguage.self, forKey: .transcriptionLanguage) ?? defaults.transcriptionLanguage
        voiceTranscriptionServiceRawValue = try container.decodeIfPresent(String.self, forKey: .voiceTranscriptionServiceRawValue) ?? defaults.voiceTranscriptionServiceRawValue
        extraTranscriptionKeyterms = try container.decodeIfPresent(String.self, forKey: .extraTranscriptionKeyterms) ?? defaults.extraTranscriptionKeyterms
        finalTranscriptGracePeriodSeconds = try container.decodeIfPresent(Double.self, forKey: .finalTranscriptGracePeriodSeconds) ?? defaults.finalTranscriptGracePeriodSeconds
        usesAutomaticSpeechSegmentation = try container.decodeIfPresent(Bool.self, forKey: .usesAutomaticSpeechSegmentation) ?? defaults.usesAutomaticSpeechSegmentation
        continuousListeningEnabled = try container.decodeIfPresent(Bool.self, forKey: .continuousListeningEnabled) ?? defaults.continuousListeningEnabled
        continuousListeningWindowSeconds = try container.decodeIfPresent(Int.self, forKey: .continuousListeningWindowSeconds) ?? defaults.continuousListeningWindowSeconds
        // 存的正好是上一版默认值（2.0）＝ 他从没动过这一项 → 换成新的 1.5（用户 2026-09-28 点名改的）。
        let storedSilenceSendSeconds = try container.decodeIfPresent(
            Double.self, forKey: .continuousListeningSilenceSendSeconds)
        if let storedSilenceSendSeconds,
           abs(storedSilenceSendSeconds - Self.legacyContinuousListeningSilenceSendSeconds) < 0.001 {
            continuousListeningSilenceSendSeconds = defaults.continuousListeningSilenceSendSeconds
        } else {
            continuousListeningSilenceSendSeconds =
                storedSilenceSendSeconds ?? defaults.continuousListeningSilenceSendSeconds
        }
        audioEngineIdleReleaseMinutes = try container.decodeIfPresent(Int.self, forKey: .audioEngineIdleReleaseMinutes) ?? defaults.audioEngineIdleReleaseMinutes
        releaseAudioEngineShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .releaseAudioEngineShortcut)
        taskListShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .taskListShortcut)
        openSheetShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .openSheetShortcut)
        openSheetScreenShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .openSheetScreenShortcut)
        openSheetAgentShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .openSheetAgentShortcut)
        openSheetCallShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .openSheetCallShortcut)
        notchExpansionSpeedMultiplier = try container.decodeIfPresent(Double.self, forKey: .notchExpansionSpeedMultiplier) ?? defaults.notchExpansionSpeedMultiplier
        echoCancellationEnabled = try container.decodeIfPresent(Bool.self, forKey: .echoCancellationEnabled) ?? defaults.echoCancellationEnabled
        mutesSystemSpeakersDuringRecording = try container.decodeIfPresent(Bool.self, forKey: .mutesSystemSpeakersDuringRecording) ?? defaults.mutesSystemSpeakersDuringRecording
        autoScreenshotOnFollowUpSpeech = try container.decodeIfPresent(Bool.self, forKey: .autoScreenshotOnFollowUpSpeech) ?? defaults.autoScreenshotOnFollowUpSpeech
        autoScreenshotOnScreenKeyword = try container.decodeIfPresent(Bool.self, forKey: .autoScreenshotOnScreenKeyword) ?? defaults.autoScreenshotOnScreenKeyword
        speechPlaybackRate = try container.decodeIfPresent(Double.self, forKey: .speechPlaybackRate) ?? defaults.speechPlaybackRate
        speechPlaybackVolumePercent = try container.decodeIfPresent(Double.self, forKey: .speechPlaybackVolumePercent) ?? defaults.speechPlaybackVolumePercent
        interruptsPlaybackOnNewQuestion = try container.decodeIfPresent(Bool.self, forKey: .interruptsPlaybackOnNewQuestion) ?? defaults.interruptsPlaybackOnNewQuestion
        maximumSpeechChunkCharacters = try container.decodeIfPresent(Int.self, forKey: .maximumSpeechChunkCharacters) ?? defaults.maximumSpeechChunkCharacters
        speechSpeakMode = try container.decodeIfPresent(SpeechSpeakMode.self, forKey: .speechSpeakMode) ?? defaults.speechSpeakMode
        screenshotMaxDimension = try container.decodeIfPresent(Int.self, forKey: .screenshotMaxDimension) ?? defaults.screenshotMaxDimension
        screenshotCompressionQuality = try container.decodeIfPresent(Double.self, forKey: .screenshotCompressionQuality) ?? defaults.screenshotCompressionQuality
        capturesAllDisplays = try container.decodeIfPresent(Bool.self, forKey: .capturesAllDisplays) ?? defaults.capturesAllDisplays
        pointsAtReferencedElements = try container.decodeIfPresent(Bool.self, forKey: .pointsAtReferencedElements) ?? defaults.pointsAtReferencedElements
        allowsCircleToAsk = try container.decodeIfPresent(Bool.self, forKey: .allowsCircleToAsk) ?? defaults.allowsCircleToAsk
        playsNotchSoundEffects = try container.decodeIfPresent(Bool.self, forKey: .playsNotchSoundEffects) ?? defaults.playsNotchSoundEffects
        voiceChatGreetsOnConnect = try container.decodeIfPresent(Bool.self, forKey: .voiceChatGreetsOnConnect) ?? defaults.voiceChatGreetsOnConnect
        voiceReplyMuted = try container.decodeIfPresent(Bool.self, forKey: .voiceReplyMuted) ?? defaults.voiceReplyMuted
        voiceChatGreetingText = try container.decodeIfPresent(String.self, forKey: .voiceChatGreetingText) ?? defaults.voiceChatGreetingText
        enablesNotchPresence = try container.decodeIfPresent(Bool.self, forKey: .enablesNotchPresence) ?? defaults.enablesNotchPresence
        // `decodeIfPresent` is not optional politeness here: a synthesized `Codable`
        // throws on a missing key, so a plain `Bool` added today would make every
        // settings file written before today fail to load — and the store would
        // silently fall back to defaults for the user's entire configuration.
        allowsComputerControl = try container.decodeIfPresent(Bool.self, forKey: .allowsComputerControl) ?? defaults.allowsComputerControl
        allowsKeyboardControl = try container.decodeIfPresent(Bool.self, forKey: .allowsKeyboardControl) ?? defaults.allowsKeyboardControl
        allowsToolLibrary = try container.decodeIfPresent(Bool.self, forKey: .allowsToolLibrary) ?? defaults.allowsToolLibrary
        textEntryMethod = try container.decodeIfPresent(TextEntryMethod.self, forKey: .textEntryMethod) ?? defaults.textEntryMethod
        pushToTalkShortcutRawValue = try container.decodeIfPresent(String.self, forKey: .pushToTalkShortcutRawValue) ?? defaults.pushToTalkShortcutRawValue
        customPushToTalkShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .customPushToTalkShortcut) ?? defaults.customPushToTalkShortcut
        pushToTalkTriggerModeRawValue = try container.decodeIfPresent(String.self, forKey: .pushToTalkTriggerModeRawValue) ?? defaults.pushToTalkTriggerModeRawValue
        sendsTranscriptImmediatelyOnRelease = try container.decodeIfPresent(Bool.self, forKey: .sendsTranscriptImmediatelyOnRelease) ?? defaults.sendsTranscriptImmediatelyOnRelease
        voiceWebThreeStageShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .voiceWebThreeStageShortcut) ?? defaults.voiceWebThreeStageShortcut
        voiceWebDuplexShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .voiceWebDuplexShortcut) ?? defaults.voiceWebDuplexShortcut
        voiceWebOmniShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .voiceWebOmniShortcut) ?? defaults.voiceWebOmniShortcut
        voiceWebThreeStageSendsScreen = try container.decodeIfPresent(Bool.self, forKey: .voiceWebThreeStageSendsScreen) ?? defaults.voiceWebThreeStageSendsScreen
        voiceWebOmniVoiceEnabled = try container.decodeIfPresent(Bool.self, forKey: .voiceWebOmniVoiceEnabled) ?? defaults.voiceWebOmniVoiceEnabled
        voiceWebOmniCameraEnabled = try container.decodeIfPresent(Bool.self, forKey: .voiceWebOmniCameraEnabled) ?? defaults.voiceWebOmniCameraEnabled
        voiceWebOmniScreenEnabled = try container.decodeIfPresent(Bool.self, forKey: .voiceWebOmniScreenEnabled) ?? defaults.voiceWebOmniScreenEnabled
        visionMaxCompletionTokens = try container.decodeIfPresent(Int.self, forKey: .visionMaxCompletionTokens) ?? defaults.visionMaxCompletionTokens
        allowsAgentSubsystem = try container.decodeIfPresent(Bool.self, forKey: .allowsAgentSubsystem) ?? defaults.allowsAgentSubsystem
        agentClaudeExecutablePath = try container.decodeIfPresent(String.self, forKey: .agentClaudeExecutablePath) ?? defaults.agentClaudeExecutablePath
        agentDefaultProjectFolder = try container.decodeIfPresent(String.self, forKey: .agentDefaultProjectFolder) ?? defaults.agentDefaultProjectFolder
        agentPermissionModeRawValue = try container.decodeIfPresent(String.self, forKey: .agentPermissionModeRawValue) ?? defaults.agentPermissionModeRawValue
        maximumConcurrentAgents = try container.decodeIfPresent(Int.self, forKey: .maximumConcurrentAgents) ?? defaults.maximumConcurrentAgents
        allowsAgentDesktopHUD = try container.decodeIfPresent(Bool.self, forKey: .allowsAgentDesktopHUD) ?? defaults.allowsAgentDesktopHUD
        announcesAgentCompletion = try container.decodeIfPresent(Bool.self, forKey: .announcesAgentCompletion) ?? defaults.announcesAgentCompletion
        // 长录音。档位存 rawValue 字符串而不是枚举本身，理由同
        // `agentPermissionModeRawValue`：旧文件里一个读不出来的档位值应当退回
        // 默认，而不是让整个设置文件解不出来。
        // `recordingShortcut` 是 Optional 且**不给 `?? defaults` 兜底** ——
        // 「没有这个键」和「键是 null」都必须落到 nil，因为 nil 正是「用户还
        // 没录过快捷键」这个有意义的状态，兜一个默认值进去等于替用户按了一下录音键。
        recordingShortcut = try container.decodeIfPresent(RecordedKeyboardShortcut.self, forKey: .recordingShortcut)
        recordingServiceAPIKey = try container.decodeIfPresent(String.self, forKey: .recordingServiceAPIKey) ?? defaults.recordingServiceAPIKey
        recordingResourceIDRawValue = try container.decodeIfPresent(String.self, forKey: .recordingResourceIDRawValue) ?? defaults.recordingResourceIDRawValue
        recordingCustomResourceID = try container.decodeIfPresent(String.self, forKey: .recordingCustomResourceID) ?? defaults.recordingCustomResourceID
        recordingLanguage = try container.decodeIfPresent(String.self, forKey: .recordingLanguage) ?? defaults.recordingLanguage
        recordingHotwords = try container.decodeIfPresent(String.self, forKey: .recordingHotwords) ?? defaults.recordingHotwords
        recordingSaveFolderPath = try container.decodeIfPresent(String.self, forKey: .recordingSaveFolderPath) ?? defaults.recordingSaveFolderPath
        notionNoteEnabled = try container.decodeIfPresent(Bool.self, forKey: .notionNoteEnabled) ?? defaults.notionNoteEnabled
        notionNotePageID = try container.decodeIfPresent(String.self, forKey: .notionNotePageID) ?? defaults.notionNotePageID
        notionNoteOpenURL = try container.decodeIfPresent(String.self, forKey: .notionNoteOpenURL) ?? defaults.notionNoteOpenURL
        notionNoteToken = try container.decodeIfPresent(String.self, forKey: .notionNoteToken) ?? defaults.notionNoteToken
        notionNoteBaseURL = try container.decodeIfPresent(String.self, forKey: .notionNoteBaseURL) ?? defaults.notionNoteBaseURL
        notionNoteAPIKey = try container.decodeIfPresent(String.self, forKey: .notionNoteAPIKey) ?? defaults.notionNoteAPIKey
        notionNoteModelID = try container.decodeIfPresent(String.self, forKey: .notionNoteModelID) ?? defaults.notionNoteModelID
        notionNotePrompt = try container.decodeIfPresent(String.self, forKey: .notionNotePrompt) ?? defaults.notionNotePrompt
        notionNoteKeywords = try container.decodeIfPresent(String.self, forKey: .notionNoteKeywords) ?? defaults.notionNoteKeywords
        // ⚠️ **老默认值要迁移**：这一组在 2026-09-27 补了「剪贴板 / 粘贴板」两条 ——
        // 而设置文件里**已经把老默认值存下来了**（用户保存过一次设置就会写），
        // 于是"改了默认值"对老用户**完全无效**（他按自己的说法说「根据剪贴板」，一个词都不命中）。
        // 判据是"存的正好是老默认值"＝他从没改过 → 换成新的；改过的人一个字都不动。
        let storedClipboardKeywords = try container.decodeIfPresent(String.self,
                                                                    forKey: .notionClipboardKeywords)
        if let storedClipboardKeywords, storedClipboardKeywords != defaults.notionClipboardKeywords,
           storedClipboardKeywords.trimmingCharacters(in: .whitespacesAndNewlines)
            == Self.legacyNotionClipboardKeywords.trimmingCharacters(in: .whitespacesAndNewlines) {
            notionClipboardKeywords = defaults.notionClipboardKeywords
        } else {
            notionClipboardKeywords = storedClipboardKeywords ?? defaults.notionClipboardKeywords
        }
        notionScreenKeywords = try container.decodeIfPresent(String.self, forKey: .notionScreenKeywords) ?? defaults.notionScreenKeywords
        // ⚠️ 同一类迁移：这一组 2026-09-27 换成了**从剪贴板取绝对路径**，默认词里补了
        // 用户点名的「参考文件 / 参考文件夹」—— 存的正好是老默认值（＝他从没改过）就换新的。
        let storedSelectedItemKeywords = try container.decodeIfPresent(String.self, forKey: .selectedItemKeywords)
        if let storedSelectedItemKeywords, storedSelectedItemKeywords != defaults.selectedItemKeywords,
           storedSelectedItemKeywords.trimmingCharacters(in: .whitespacesAndNewlines)
            == Self.legacySelectedItemKeywords.trimmingCharacters(in: .whitespacesAndNewlines) {
            selectedItemKeywords = defaults.selectedItemKeywords
        } else {
            selectedItemKeywords = storedSelectedItemKeywords ?? defaults.selectedItemKeywords
        }
        // ⚠️ **String 优先**：存的是旧值（`returnKey`）时直接解枚举会**抛错**，
        // 而一处抛错会把整份 `AppSettings.json` 带走（规则 E1）。见 `boardPasteShortcut` 的注释。
        let storedBoardPasteShortcut = try container.decodeIfPresent(String.self, forKey: .boardPasteShortcut)
        boardPasteShortcut = storedBoardPasteShortcut
            .flatMap(BoardPasteShortcut.init(rawValue:)) ?? defaults.boardPasteShortcut
        recordingAutoReconnects = try container.decodeIfPresent(Bool.self, forKey: .recordingAutoReconnects) ?? defaults.recordingAutoReconnects
        recordingRotationMinutes = try container.decodeIfPresent(Int.self, forKey: .recordingRotationMinutes) ?? defaults.recordingRotationMinutes
        recordingCopiesToClipboard = try container.decodeIfPresent(Bool.self, forKey: .recordingCopiesToClipboard) ?? defaults.recordingCopiesToClipboard
        recordingPastesAfterStop = try container.decodeIfPresent(Bool.self, forKey: .recordingPastesAfterStop) ?? defaults.recordingPastesAfterStop
        recordingAudioRetentionDays = try container.decodeIfPresent(Int.self, forKey: .recordingAudioRetentionDays) ?? defaults.recordingAudioRetentionDays
        recordingTextRetentionDays = try container.decodeIfPresent(Int.self, forKey: .recordingTextRetentionDays) ?? defaults.recordingTextRetentionDays
        fastPathEntries = try container.decodeIfPresent([FastPathEntry].self, forKey: .fastPathEntries) ?? defaults.fastPathEntries
        recordingInputDeviceUID = try container.decodeIfPresent(String.self, forKey: .recordingInputDeviceUID) ?? defaults.recordingInputDeviceUID
        showsAgentStatusAtCursor = try container.decodeIfPresent(Bool.self, forKey: .showsAgentStatusAtCursor) ?? defaults.showsAgentStatusAtCursor
        fileAccessEntries = try container.decodeIfPresent([FileAccessEntry].self, forKey: .fileAccessEntries) ?? defaults.fileAccessEntries
        recordingPolishEnabled = try container.decodeIfPresent(Bool.self, forKey: .recordingPolishEnabled) ?? defaults.recordingPolishEnabled
        recordingPolishCapturesScreenshot = try container.decodeIfPresent(Bool.self, forKey: .recordingPolishCapturesScreenshot) ?? defaults.recordingPolishCapturesScreenshot
        recordingPolishCapturesCamera = try container.decodeIfPresent(Bool.self, forKey: .recordingPolishCapturesCamera) ?? defaults.recordingPolishCapturesCamera
        recordingCameraPreviewFramesPerSecond = try container.decodeIfPresent(Double.self, forKey: .recordingCameraPreviewFramesPerSecond) ?? defaults.recordingCameraPreviewFramesPerSecond
        recordingCameraModelFramesPerSecond = try container.decodeIfPresent(Double.self, forKey: .recordingCameraModelFramesPerSecond) ?? defaults.recordingCameraModelFramesPerSecond
        recordingCameraUsesHighResolution = try container.decodeIfPresent(Bool.self, forKey: .recordingCameraUsesHighResolution) ?? defaults.recordingCameraUsesHighResolution
        recordingCameraMaximumFrameCount = try container.decodeIfPresent(Int.self, forKey: .recordingCameraMaximumFrameCount) ?? defaults.recordingCameraMaximumFrameCount
        recordingCameraTriggerKeywords = try container.decodeIfPresent(String.self, forKey: .recordingCameraTriggerKeywords) ?? defaults.recordingCameraTriggerKeywords
        recordingPolishBaseURL = try container.decodeIfPresent(String.self, forKey: .recordingPolishBaseURL) ?? defaults.recordingPolishBaseURL
        recordingPolishAPIKey = try container.decodeIfPresent(String.self, forKey: .recordingPolishAPIKey) ?? defaults.recordingPolishAPIKey
        recordingPolishModelID = try container.decodeIfPresent(String.self, forKey: .recordingPolishModelID) ?? defaults.recordingPolishModelID
    }
}
