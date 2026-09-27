//
//  TaskDirectionStore.swift
//  Wanna
//
//  **「任务方向」的清单 —— 整个功能只有这一个文件**（2026-09-27 用户的设计）。
//
//  用户的原话：
//  > 最好的方法是：没有必要把所有提示词发进去，而是**提前把整个主 agent 的所有提示词理解一遍**，
//  > 看它能实现哪些功能、任务类型、意图类型，**提前准备好放到一个文件里当备选项**。发送时把这个
//  > 备选项作为提示词，让 AI 去选择其中一些选项即可，选项固定。这是第一种选项来源。
//  > 第二种来源是**用户口述**任务方向或某一类型任务时，识别到这样的词语，也要让 AI 把它作为
//  > 任务方向卡片显示在上面。
//  > 再增加第三点：……**每天中午 12 点**，由复盘 agent 去识别用户的历史记录或历史对话，提炼出用户
//  > 主要的或高频的任务方向、任务类型、使用的工具类型，然后**追加**到之前设定好的任务方向里面，
//  > **并标注日期**。注意是追加，而且**只允许修改这个文件**，其他文件不可以修改。修改方法必须是
//  > 追加方式，**一定要去重**，用关键词形式显示，也可以在关键词右侧添加描述，方便 AI 理解。
//  > 整个方向现在就是一个文件，**一个关键词加一些描述**，让 AI 知道是否能根据这几个描述匹配
//  > 用户意图，然后去显示，用关键词形式显示。
//
//  所以这里只有三件事：**读这个文件**、**追加（去重）**、**从主 Agent 提示词里带出来的出厂那份**。
//  文件在 `~/Library/Application Support/Wanna/TaskDirections.json`（0600，仓库外）——
//  与 `AppSettings.json` / `ModelConfiguration.json` 同一个形状（`nonisolated` + `NSLock` +
//  原子写后补 0600 + 变更通知）。
//

import Foundation

/// 一条任务方向：**一个关键词 + 一句描述**。
nonisolated struct TaskDirection: Codable, Identifiable, Equatable {
    /// 稳定 id（slug）—— 显示、去重、状态字典都用它。
    var id: String
    /// **关键词**（显示在卡片上的那 3~7 个字）。
    var keyword: String
    /// 一句话描述 —— 给判断用的判据（JEV 的 `criteria`、或模型的提示词）。
    var detail: String
    /// **本地匹配用的同义说法**（可选）：用户嘴里不一定说出那个关键词本身，也可能说「在哪」「点一下」。
    ///
    /// 这一列**只影响"免费那条路"**（识别文本里出现了就立刻点亮），不参与 JEV 的判据。
    /// 可选是为了老文件仍能解（`decodeIfPresent`，仓规 E1）。
    var matchKeywords: [String]?
    /// 它是哪来的：`builtin`（出厂，从主 Agent 提示词里带出来的）/ `user`（用户口述过）/
    /// `review`（每天中午复盘追加）。
    var source: String
    /// 追加时间。
    var addedAt: Date?

    enum Source: String {
        case builtin, user, review
    }
}

nonisolated final class TaskDirectionStore {

    static let shared = TaskDirectionStore()
    static let didChangeNotification = Notification.Name("wannaTaskDirectionsDidChange")

    private let lock = NSLock()
    private var cached: [TaskDirection]?

    private init() {}

    /// 文件位置：与其它几个 store 一样放在 Application Support（仓库外，0600）。
    static var fileURL: URL {
        supportDirectory.appendingPathComponent("TaskDirections.json")
    }

    /// **临时类型**的文件，与固定那份**同级目录**（用户 2026-09-27：
    /// 「在文件的同级目录创建一个叫"临时类型"的文件。一个是固定类型的文件，一个是临时类型的文件」）。
    ///
    /// 它装的只有"用户这一轮口述出来的类型"（以及带屏幕参考时模型给出的那个答案），
    /// **每一大轮结束就清掉** —— 所以它是临时的，不进那份固定清单。
    static var temporaryFileURL: URL {
        supportDirectory.appendingPathComponent("TaskDirectionsTemporary.json")
    }

    private static var supportDirectory: URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Wanna", isDirectory: true)
    }

    // MARK: - 读

    /// **全部方向**（出厂那份在最前，后面按追加顺序）。
    func allDirections() -> [TaskDirection] {
        lock.lock()
        defer { lock.unlock() }
        if let cached { return cached }
        // ⚠️ **只在这里锁一次**，下面两个都是 `…Locked`（假定已持锁）。
        // 2026-09-27：这里原来是 `loadFromDisk` + 里面的 `write`，两个都自己 `lock()` ——
        // `NSLock` 不可重入，于是**第一次读清单就死锁**，App 卡死在 Listening（用户当场报「卡死」）。
        let loaded = loadFromDiskLocked(at: Self.fileURL) + loadFromDiskLocked(at: Self.temporaryFileURL)
        cached = loaded
        return loaded
    }

    /// **固定那份**（不含临时）—— 设置页分别显示两个文件的条数用。
    func fixedDirections() -> [TaskDirection] {
        lock.lock()
        defer { lock.unlock() }
        return loadFromDiskLocked(at: Self.fileURL)
    }

    /// **临时那份**（这一轮口述出来的）。
    func temporaryDirections() -> [TaskDirection] {
        lock.lock()
        defer { lock.unlock() }
        return loadFromDiskLocked(at: Self.temporaryFileURL)
    }

    /// 只读关键词与描述（给判断用）。
    func keywordsAndDetails() -> [(id: String, keyword: String, detail: String)] {
        allDirections().map { ($0.id, $0.keyword, $0.detail) }
    }

    func contains(keyword: String) -> Bool {
        let needle = Self.normalizedKeyword(keyword)
        return allDirections().contains { Self.normalizedKeyword($0.keyword) == needle }
    }

    // MARK: - 内部（**都假定调用方已经持锁**）
    //
    // 命名带 `Locked` 是硬规矩：这个类型的每一处加锁都只发生在**公开入口的第一行**，
    // 内部函数一个都不许再 `lock()` —— `NSLock` 不可重入，重复加锁就是死锁（已经踩过一次）。

    // MARK: - 写（只允许追加与删除单条；没有"整份替换"之外的第三种）

    /// **追加一条**（去重：关键词归一化之后相同就不加）。返回是否真的加进去了。
    /// **追加一条**。`source == .user`（用户口述）写进**临时**那份；其余写进固定那份。
    @discardableResult
    func append(keyword: String, detail: String, source: TaskDirection.Source) -> Bool {
        let trimmedKeyword = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedKeyword.isEmpty else { return false }
        guard !contains(keyword: trimmedKeyword) else { return false }

        lock.lock()
        defer { lock.unlock() }
        let target = source == .user ? Self.temporaryFileURL : Self.fileURL
        var directions = loadFromDiskLocked(at: target)
        directions.append(TaskDirection(id: Self.slug(for: trimmedKeyword),
                                        keyword: trimmedKeyword,
                                        detail: trimmedDetail.isEmpty ? trimmedKeyword : trimmedDetail,
                                        source: source.rawValue,
                                        addedAt: Date()))
        writeLocked(directions, to: target)
        print("🧭 任务方向：追加了一条（\(source.rawValue)\(source == .user ? "，临时文件" : "")）—— \(trimmedKeyword)")
        return true
    }

    /// **清掉临时那份**（每一大轮结束时调）。
    ///
    /// 用户 2026-09-27：「临时文件在每一轮对话结束时清掉。是每一**大**轮，就是一整个大轮，
    /// 中间可能有打断、有些东西，这算一个轮，不算两轮，算一轮，然后自动清掉。」
    func clearTemporaryDirections() {
        lock.lock()
        defer { lock.unlock() }
        let existing = loadFromDiskLocked(at: Self.temporaryFileURL)
        guard !existing.isEmpty else { return }
        writeLocked([], to: Self.temporaryFileURL)
        print("🧭 任务方向：临时文件已清（\(existing.count) 条）")
    }

    func remove(id: String) {
        lock.lock()
        defer { lock.unlock() }
        // 两处都找一遍：它可能在固定那份，也可能在临时那份。
        for url in [Self.fileURL, Self.temporaryFileURL] {
            let remaining = loadFromDiskLocked(at: url).filter { $0.id != id }
            writeLocked(remaining, to: url)
        }
    }

    /// 把用户改过的清单**恢复成出厂那份**（设置页那颗按钮；只动固定那份）。
    func restoreBuiltinDefaults() {
        lock.lock()
        defer { lock.unlock() }
        writeLocked(Self.builtinDirections, to: Self.fileURL)
    }

    // MARK: - 内部

    private func writeLocked(_ directions: [TaskDirection], to url: URL) {
        cached = nil   // 两份拼在一起的结果变了，缓存作废

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(directions) else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
        // `.atomic` 写下去是 0644，而这份文件是用户自己的东西（与其它几个 store 同一条规矩）。
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        NotificationCenter.default.post(name: Self.didChangeNotification, object: nil)
    }

    private func loadFromDiskLocked(at url: URL) -> [TaskDirection] {
        guard let data = try? Data(contentsOf: url) else {
            // 固定那份第一次跑：把出厂那份写下去（**从此这个文件就是真相**，代码里那份只是种子）。
            // 临时那份**不种子** —— 空的就该是空的。
            guard url == Self.fileURL else { return [] }
            writeLocked(Self.builtinDirections, to: url)
            return Self.builtinDirections
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let directions = try? decoder.decode([TaskDirection].self, from: data) else { return [] }
        return directions
    }

    private static func normalizedKeyword(_ keyword: String) -> String {
        keyword.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    private static func slug(for keyword: String) -> String {
        let base = keyword.lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }
        return base.isEmpty ? UUID().uuidString : base
    }

    // MARK: - 出厂那份（**从主 Agent 提示词里理解出来的**）

    /// 用户说的第一种来源：「提前把整个主 agent 的所有提示词理解一遍，看它能实现哪些功能、
    /// 任务类型、意图类型，提前准备好放到一个文件里当备选项」。
    ///
    /// 这一份是我读 `CompanionManager.mainAgentBasePrompt` + 图形/执行两个技能段 + 那些动作标签
    /// （`[POINT:]` / `[SHAPE:]` / `[CLICK:]` / `[TYPE:]` / `[OPEN:]` / `[AGENT_SPAWN:]` /
    /// `[SVG_AGENT:]` / `[SVG_BOARD:]` / Notion 笔记 / 录音）之后提炼的 —— **只写它真的会做的事**，
    /// 不写漂亮话。用户可以在设置页改、也可以口述新增，之后由复盘每天中午追加。
    static let builtinDirections: [TaskDirection] = [
        TaskDirection(id: "note.notion", keyword: "保存到 Notion",
                      detail: "把内容整理成一条 Notion 笔记写进用户指定的那一页（含大纲与排版两段）",
                      matchKeywords: ["notion", "笔记", "记下来", "记一条", "存到笔记", "存一下"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "note.recording", keyword: "存成一条录音",
                      detail: "把这次说的话连同音频存成一条本地录音（设置 → 录音 里能回听、重新转写）",
                      matchKeywords: ["录音", "记录下来", "存成录音", "录下来", "录一条"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "show.point", keyword: "指给我看",
                      detail: "在屏幕上指出某个东西的位置，蓝色光标会飞过去停在它上面",
                      matchKeywords: ["指给", "指一下", "哪里", "在哪", "标出来"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "show.circle", keyword: "圈出来",
                      detail: "在屏幕上画绿圈/箭头/框，把某个区域标出来给用户看（不碰任何东西）",
                      matchKeywords: ["圈出", "圈一下", "圈起来", "框出来"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "act.computer", keyword: "操作电脑",
                      detail: "真的去点击、滚动、打字、按快捷键、打开应用 —— 会改动屏幕上的东西",
                      matchKeywords: ["点一下", "点击", "按一下", "打开", "操作", "打字", "输入", "滚动"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "act.agent", keyword: "派个 Agent 去做",
                      detail: "把这件事交给一个后台子 Agent 去做（不需要看着屏幕就能干完的活）",
                      matchKeywords: ["派个", "派给", "让 agent", "帮我做", "去做", "后台"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "text.write", keyword: "写成文字",
                      detail: "生成或整理一段文字内容：写文案、润色、改写、翻译、总结、列提纲",
                      matchKeywords: ["写成文字", "文案", "润色", "改写", "翻译", "总结成", "列个提纲"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "text.chat", keyword: "只跟我聊",
                      detail: "纯聊天/讨论/出主意，不执行任何操作、不动屏幕",
                      matchKeywords: ["跟我聊", "聊一聊", "讨论", "问问你", "帮我分析", "出个主意", "解释一下"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "vision.look", keyword: "看图说话",
                      detail: "看屏幕或某张图，描述/识别里面有什么（读屏幕上的字、认界面元素）",
                      matchKeywords: ["看图", "这张图", "图里", "截图里", "屏幕上是", "画的是什么"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "vision.make", keyword: "画一张图",
                      detail: "生成一张图：插图、流程图、思维导图、海报 —— 落在桌面的 Wanna图形 文件夹",
                      matchKeywords: ["画一张", "画个图", "生成图", "插图", "海报", "配图", "流程图", "思维导图"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "text.search", keyword: "查一下资料",
                      detail: "上网查资料、核实事实、找文档或开源项目，再用一两句话告诉用户结论",
                      matchKeywords: ["查一下", "搜一下", "搜索", "查资料", "核实一下", "找找"],
                      source: "builtin",
                      addedAt: nil),
        TaskDirection(id: "act.remind", keyword: "稍后提醒我",
                      detail: "记下一件稍后要提醒用户的事（时间到了由 Wanna 说出来）",
                      matchKeywords: ["提醒我", "记得", "稍后提醒", "提醒一下"],
                      source: "builtin",
                      addedAt: nil),
    ]
}
