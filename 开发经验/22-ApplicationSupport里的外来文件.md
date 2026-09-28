# 22 · Wanna 的 Application Support 目录里躺着前身 App 的东西（2026-09-28 清掉）

## 一句话

`~/Library/Application Support/Wanna/` 里那几样**不属于这个 App** 的文件，是**前身/上游产品
HeyClicky** 留下的（这个仓库原名 **Clicky**，提交 `5937afd Rename Clicky to Wanna`）。
2026-09-28 已清掉，从 Wanna 的角度它们**从头到尾是惰性的**。

## 怎么认出来的（这条方法可复用）

三处一起查，缺一处都可能误判：

| 查什么 | 命令 | 判据 |
|---|---|---|
| Swift 源码里有没有读写方 | `grep -rn "<文件名>" --include='*.swift' Wanna/` | 0 = 这个 App 不认识它 |
| **装着的那个二进制**里有没有 | `strings -a /Applications/Wanna.app/Contents/MacOS/Wanna.debug.dylib \| grep -c "<关键词>"` | 0 = 从来没编进去过 |
| **全部 git 历史**里有没有 | `git log --all --oneline -S "<关键词>"` | 空 = 从来没进过这个仓库 |

⚠️ **只看第一处不够**：`cua-driver` 这个词在 `Wanna/NotchSupport.swift:1321` **有一处命中**，
但那是**一行注释**（说"这台机器上常驻的 cua-driver 覆盖层"），不是读写方。所以命中之后要看
**那是代码还是注释**。

## 清掉的四样（都在 `~/Library/Application Support/Wanna/` 下）

| 文件 | 是什么 | 大小 | 出现时间 |
|---|---|---|---|
| `SkillLibraryCache.json` | HeyClicky 的**技能市场缓存**（201 条技能 / 119 作者 / 27 分类，supabase 后端） | 2.1 MB | 09-26 08:47:46 |
| `cua-driver-policy.yaml` + `cua-driver-managed-policy.rego` | 它的**电脑操作守护进程策略**（逐条工具白名单） | 各 4 KB | 09-26 08:47:46 |
| `CodexHome/` | 它的 Codex 集成（`clicky-model-instructions.md`、`auth.json`、会话归档…） | **133 MB** | 09-21 21:52 |
| `HomeSpaceCache/` | 它那个时代的对话记录 `transcript-*.json` | 412 KB | 09-21 21:52 |

**来源是自证的，不用猜**：`cua-driver-policy.yaml` 的文件头写着

```
# Written by HeyClicky (ClickyCuaDriverDaemonController) on each daemon
# ensure pass. Do not edit: changes are overwritten ...
```

处理方式：**移到废纸篓**（`~/.Trash/wanna-外来文件-20260928/`），不是 `rm` —— 效果一样但可回退。

**没查清的一点（如实记）**：当时具体是哪个构建写进去的。`Wanna` 这个目录从 **09-21 20:25**
就存在（比 09-26 的改名提交早），而 HeyClicky 现在这台机器上**装都没装**（`/Applications`、
`~/Applications`、用户目录都没有，也没有它的守护进程在跑）。最可能是那几天跑的构建沿用了
同一个 Application Support 目录，但没有直接证据。

## 顺带发现：还有一个「代码已经不要了」的自家遗留

`TaskDirectionsTemporary.json`（4 字节，内容是空数组 `[]`）—— 它是**第六版**方向看板的设计
（"临时方向"单独一个文件），**第七版把整个文件砍掉了**（用户：「就是一个固定的文件……这都不要」），
于是代码里 `TaskDirectionsTemporary` 的出现次数是 **0**，只剩这个空壳躺在磁盘上。
**它和上面四样不是一回事**（它是自家的历史遗留，不是别人写的），所以这一轮没动它。

## 给下次的判据

在 Application Support 里看到一个"没人认识"的文件时，先跑上面那三处检查，再看**同一分钟里
还有谁一起出现**（这次四个东西都落在 09-26 08:47–08:48 / 09-21 21:52 这几个时刻上，指向同一个
写入者）。**动手之前先给用户确认** —— 其中 `HomeSpaceCache/` 里是真实对话记录，删了就没了。
