#!/usr/bin/env python3
"""交互标准闸门 —— **改了交互，就必须说清"动了标准里的哪一节、标准原文是什么"，
而且那句原文会被拿去标准文件里逐字比对。**

## 为什么需要它（2026-09-30 用户要求）

用户原话：

> 「提交代码或进入测试之前，必须先检查当前设置是在文档中的哪一个环节、做了哪一个功能上的修改，
> 文档到底是怎么规定的。**不要让 AI 只是参考文档、对照文档，否则它根本不知道要看什么。**
> 一定要让 AI 明确知道自己刚才在哪个环节的哪个点、做了哪个交互上的调整；
> **如果它不知道，就永远无法真正把文档用起来。**」

> 「通过 claude.md 限制，通过 github 里代码的方式强制限制，**做一个闸门，可能才能真正约束 AI 的行为**。」

## 它查什么

① **碰了交互相关的文件 → 必须同一次提交带上 `开发经验/交互变更记录.md`**（否则拒）。
② **那份记录最新的那一条，四项必须齐全**：
   `动了哪一节` / `标准原文` / `改了什么` / `有没有冲突`。
③ ⭐ **`标准原文` 那一行，拿去 `需求/00-交互标准（锁死·只读）.md` 里逐字找** ——
   **找不到就拒**。和台账闸门 fetch URL 核对原文是同一个形状：
   **能被机器对上的，才管得住。**
④ **改标准文件本身 → 默认拒**（只读）。用户明确要求时用
   `WANNA_AMEND_INTERACTION_STANDARD=1` 提交。

## 它管不了什么（说清楚，免得误以为它管全了）

- 它**验不了"你理解对了"** —— 它只能验"你引用的那句原文确实在标准里"。
  理解错、引对了一句不相干的原文，它抓不住。
- 它**验不了"代码真的符合标准"** —— 那是人（和真机判据）的事。

用法：`scripts/interaction-standard-check.py`（退出码非 0 = 拒）。
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
STANDARD = REPO_ROOT / "需求" / "00-交互标准（锁死·只读）.md"
CHANGE_LOG = REPO_ROOT / "开发经验" / "交互变更记录.md"

# 碰了这些文件 = 动了交互。加文件时**加在这里**（一处，不散落）。
INTERACTION_PATTERNS = [
    r"^Wanna/CompanionManager\.swift$",
    r"^Wanna/DirectionBoardSession\.swift$",
    r"^Wanna/RealtimeWindow\.swift$",
    r"^Wanna/NotchWindowController\.swift$",
    r"^Wanna/BuddyDictationManager\.swift$",
    r"^Wanna/VoicePlaybackEngine\.swift$",
    r"^Wanna/NotchListeningTranscript\.swift$",
    r"^Wanna/OverlayWindow\.swift$",
    r"^Wanna/PiAgentRunner\.swift$",
    r"^Wanna/NotchActivityView\.swift$",
]

# 记录里那四行的标签（改这里 = 改模板，模板在文件头有说明）
FIELDS = {
    "sections": "动了哪一节",
    "quote": "标准原文",
    "change": "改了什么",
    "conflict": "有没有冲突",
}


def staged_files() -> list[str]:
    """暂存区里的文件（关掉 quotepath，否则中文路径会变成转义串 —— 闸门二的教训）。"""
    out = subprocess.run(
        ["git", "-c", "core.quotepath=false", "diff", "--cached", "--name-only"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout
    return [line.strip() for line in out.splitlines() if line.strip()]


def staged_standard_action() -> str | None:
    """《交互标准》这次被 git 做了什么。

    ⚠️ **只拦"改"，不拦"第一次加进来"** —— 否则这道闸门自己的第一笔提交都过不去
    （2026-09-30 实测：我把标准建好、第一次提交就被它自己拦了）。所以：
    · `A`（新增）→ 放行（标准第一次入库）
    · `M` / `D` / `T` / `R` → 拦（改动 / 删除 / 类型变更 / 改名都算动它）
    """
    out = subprocess.run(
        ["git", "-c", "core.quotepath=false", "diff", "--cached", "--name-status"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout
    rel = str(STANDARD.relative_to(REPO_ROOT))
    for line in out.splitlines():
        parts = line.split("\t")
        if parts and parts[-1].strip() == rel:
            return parts[0][:1]      # A / M / D / T / R
    return None


def normalize(text: str) -> str:
    """只比字，不比排版：折叠空白、统一几种标点、剥掉 Markdown 强调符号。

    标准是 Markdown 写的（**加粗** / `代码`），引用的人不应该因为少抄两个星号被拒。
    剥掉的只有装饰符号，字与标点仍然必须逐字一致。
    """
    text = text.translate(str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "—": "-", "–": "-"}))
    text = text.replace("*", "").replace("`", "")
    return re.sub(r"\s+", " ", text).strip()


def newest_entry(log_text: str) -> dict[str, str] | None:
    """取那份记录里**最新的那一条**。

    一条 = 从 `## ` 开头的那一行，到下一个 `## ` 之前。
    模板长这样（模板本身写在 `开发经验/交互变更记录.md` 的文件头）：

        ## 2026-09-30 一句话
        - 动了哪一节：§3
        - 标准原文：<逐字引用>
        - 改了什么：……
        - 有没有冲突：否
    """
    blocks = re.split(r"^## ", log_text, flags=re.MULTILINE)
    for block in blocks[1:]:            # blocks[0] 是文件头
        if block.lstrip().startswith("模板"):   # 文件头里演示用的那个块跳过
            continue
        entry: dict[str, str] = {}
        for key, label in FIELDS.items():
            match = re.search(rf"^[-*]\s*{re.escape(label)}[：:]\s*(.*)$", block, re.MULTILINE)
            if match:
                entry[key] = match.group(1).strip()
        if entry:
            return entry
    return None


def main() -> int:
    staged = staged_files()
    touched = [f for f in staged if any(re.match(p, f) for p in INTERACTION_PATTERNS)]

    # ── ④ 标准文件本身：默认不许改（**新增除外** —— 标准第一次入库不算改）
    standard_action = staged_standard_action()
    if standard_action is not None and standard_action != "A":
        if os.environ.get("WANNA_AMEND_INTERACTION_STANDARD") == "1":
            print("⚠️ 正在修改《交互标准》—— 你显式设了 WANNA_AMEND_INTERACTION_STANDARD=1。")
            print("   请确认：**用户明确要求改标准了吗？** 改的是他说的那一句吗？")
        else:
            print()
            print("⛔ 提交被拒：《交互标准》是**只读**的。")
            print()
            print("   它是「实时模式 / Agent 模式」交互的唯一标准，用户要求只读、不可写。")
            print("   想改它：**先读它，再问用户**；用户确认之后才动，而且只动他说的那一句。")
            print()
            print("   用户确实要求改：WANNA_AMEND_INTERACTION_STANDARD=1 git commit ...")
            print()
            return 1

    if not touched:
        return 0

    print("── 交互标准闸门（动了交互的文件）")
    for name in touched:
        print(f"   · {name}")

    if not CHANGE_LOG.exists():
        print()
        print("⛔ 提交被拒：找不到 开发经验/交互变更记录.md。")
        print("   它是「改了交互就必须回答那四个问题」的落点。")
        print()
        return 1

    if "开发经验/交互变更记录.md" not in staged:
        print()
        print("⛔ 提交被拒：改了交互，但没带上《交互变更记录》。")
        print()
        print("   为什么拦：用户原话 ——「**不要让 AI 只是参考文档、对照文档，")
        print("   否则它根本不知道要看什么。**」光「参考」不算数，必须写出来：")
        print("     · 我刚才动的是标准里的**哪一节**")
        print("     · 标准**原文怎么规定的**（逐字引用，会被机器核对）")
        print("     · 我**改了什么**")
        print("     · **有没有冲突**")
        print()
        print("   怎么过：先读 需求/00-交互标准（锁死·只读）.md 的对应那一节，")
        print("           再往 开发经验/交互变更记录.md 顶部加一条，然后一起 git add。")
        print()
        return 1

    if not STANDARD.exists():
        print("⚠️ 找不到《交互标准》—— 跳过逐字核对。")
        return 0

    log_text = CHANGE_LOG.read_text(encoding="utf-8", errors="replace")
    entry = newest_entry(log_text)
    if entry is None:
        print()
        print("⛔ 提交被拒：《交互变更记录》里读不出最新那一条（格式不对？）。")
        print("   照文件头的模板写：## 日期 一句话 / 四行 `- 标签：值`。")
        print()
        return 1

    problems: list[str] = []
    for key, label in FIELDS.items():
        if not entry.get(key):
            problems.append(f"「{label}」是空的")

    # ── ③ 标准原文必须真的在标准里
    quote = entry.get("quote", "")
    if quote and not problems:
        body = normalize(STANDARD.read_text(encoding="utf-8", errors="replace"))
        if normalize(quote) not in body:
            problems.append(
                "「标准原文」在《交互标准》里**找不到** —— 是记错了，还是引用了一句标准里没有的话？"
            )

    # ── ① 节号必须真的存在
    sections = entry.get("sections", "")
    if sections and not problems:
        body_raw = STANDARD.read_text(encoding="utf-8", errors="replace")
        found = re.findall(r"§\s*([0-9]+(?:\.[0-9]+)?)", sections)
        if found:
            missing = [
                s for s in found
                if not re.search(rf"^#+\s*{re.escape(s)}[\.\s]", body_raw, re.MULTILINE)
            ]
            if missing:
                problems.append("标准里没有这几节：" + "、".join("§" + s for s in missing))

    if problems:
        print()
        print("⛔ 提交被拒：交互变更记录里那条对不上（见下）。")
        for problem in problems:
            print(f"   ✗ {problem}")
        print()
        print("   最新那一条现在是：")
        for key, label in FIELDS.items():
            print(f"     {label}：{entry.get(key) or '（空）'}")
        print()
        return 1

    print(f"   ✓ 最新一条：{entry['sections']} · 标准原文逐字对上了 · 冲突：{entry['conflict']}")
    print("── 通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
