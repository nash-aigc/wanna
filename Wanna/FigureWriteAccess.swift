//
//  FigureWriteAccess.swift
//  Wanna
//
//  **画图脚本写盘的唯一那条规则。**
//
//  这个文件在 2026-09-28 之前叫 `SubAgentRole.swift` —— 那时它装的是三个 sub agent 的
//  角色定义、能力面、目录文案。那一天三个 sub agent 各自变成了一个技能
//  （`Wanna/SkillCatalog.swift` + `skills/<名字>/SKILL.md`），角色那一层整个删掉了；
//  留下来的只有一样东西**不是**子 agent：**画图脚本 `[SVG_AGENT:]` 的写盘闸门**
//  （`MacosUseController` 在起那个脚本之前调它）。所以文件名跟着改成了它真正的职责。
//

import Foundation

/// 画图脚本（`[SVG_AGENT:]` / `[SVG_BOARD:]`）产出目录。
///
/// **这是一条角色自带的授权，不走用户白名单**：白名单是用户配的，而这是"一个被派去画图的
/// 程序，没有任何理由写别的地方"。如果接进白名单 —— 而白名单默认是空的 —— **画图这个功能
/// 会在任何人配过白名单之前直接坏掉**，用户看到的只是"画图不工作了"，而他没动过任何跟画图
/// 有关的开关。功能藏在一个跟它无关的开关后面，是最难查的一类故障。
nonisolated let figureOutputRootPath = WorkspaceDirectory.figuresURL.path

/// 画图脚本写文件前的判定：**只允许写它自己的产出目录**。
///
/// ## 它为什么在这里，而不是一个通用的权限函数（2026-09-28）
///
/// 这一天把三个 sub agent 删掉了（图形 / 执行 / 文本各自变成一个技能，见 `SkillCatalog`），
/// 所以原来那套「按角色分能力面 + 再查白名单」的 `fileAccessDecision(for role:…)` 没有
/// 第二个调用者了 —— 全仓唯一的调用点就是画图这一条。
///
/// 与其留一个只有一种输入的角色枚举，不如把它收成**一条说得清的规则**：画图脚本写盘，
/// 只准落在 `figureOutputRootPath` 里面。等将来工具库（`[RUN:]`）里出现别的写操作，
/// 再按那时的需要长第二条规则 —— 而不是现在替它猜一套。
nonisolated func figureWriteDecision(path: String,
                                      policy: FileAccessPolicy) -> FileAccessDecision {
    let graphicsRoot = URL(fileURLWithPath: figureOutputRootPath).standardizedFileURL.path
    let target = URL(fileURLWithPath: path).standardizedFileURL.path
    guard target == graphicsRoot || target.hasPrefix(graphicsRoot + "/") else {
        // 出了这个目录就**直接拒**，不再落到白名单 —— 要的就是"画图脚本写非图形文件被拒"，
        // 而不是"除非用户放行"。
        return FileAccessDecision(
            isAllowed: false,
            reason: "画图脚本只能写 \(graphicsRoot) 里面的文件，而这条路径在外面：\(target)",
            matchedEntry: nil)
    }
    return FileAccessDecision(isAllowed: true, reason: "画图脚本自己的产出目录",
                              matchedEntry: FileAccessEntry(path: graphicsRoot, allowsWrite: true))
}
