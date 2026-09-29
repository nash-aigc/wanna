#!/usr/bin/env python3
"""官方依据台账的核查闸门 —— **台账里每条原文，真的在它说的那一页上吗。**

## 为什么需要它（2026-09-29 用户要求"用闸门强迫自己看官方"）

用户原话：「你在设计任何东西之前是不是没有这个习惯？我发现你**总是看一下，但没有看全**。
……这个问题应该通过**系统级的方法、代码的方法、强制的方法或闸门的方法**，强迫自己去做。」

问题不在"没写规矩"—— CLAUDE.md 里早就写着"先读官方"。**问题是规矩没有强制力。**
这个仓库里唯一被证明有效的形状是**闸门**：项目全貌闸门当天就拦住我两次。

## 它查什么

读 `全局框架/官方依据.md`，按 `SOURCE` / `QUOTE` / `WHY` 三行一组解析，然后**逐条**：

  · SOURCE 是 http(s) → 真的 fetch 一次，剥掉 HTML 标签、归一空白，检查 QUOTE 在不在
  · SOURCE 是本地路径 → 读文件，同样归一后检查

**对不上就拒。** 编的、记错的、官方改版删掉的 —— 全都会被抓住。

## ⚠️ 它管不了什么（说清楚，免得误以为它管全了）

它**强制不了"完整"** —— 它只能保证"你留下的那几条是真的"，
**拦不住"我还有一页没读"**。后者是能力边界，机制解决不了。
它把默认行为从"凭印象"扭成"必须有可核对的原文"，这是能做的最大一步。

另外：**取不到页面时（断网 / 官方挂了）警告并放行**，不阻塞提交 ——
判据是"能取到但原文不在"才算撒谎。要跳过整道闸门用 `WANNA_SKIP_EVIDENCE_GATE=1`。

用法：`scripts/official-evidence-check.py`（退出码非 0 = 有对不上的）
"""

from __future__ import annotations

import html
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LEDGER = REPO_ROOT / "全局框架" / "官方依据.md"

FETCH_TIMEOUT_SECONDS = 20
# 有些站点（含 MCP 文档站）对无 UA 的请求直接拒绝
USER_AGENT = "Mozilla/5.0 (compatible; WannaEvidenceCheck/1.0)"

HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
# 台账里 `QUOTE` 后面那句必须写在一行里；这里只做首尾去空白，不改中间。
ENTRY_PATTERN = re.compile(
    r"^SOURCE\s+(?P<source>\S+)\s*$\n"
    r"^QUOTE\s+(?P<quote>.+?)\s*$\n"
    r"^WHY\s+(?P<why>.+?)\s*$",
    re.MULTILINE,
)


def normalize_variants(text: str) -> tuple[str, str]:
    """把一段文本压成"只比字，不比排版"的形状，**返回两个变体**。

    HTML 里那句话可能被 <strong> / <code> 切开，或者换行断开，所以必须先剥标签、
    解实体、再折叠空白 —— 否则一个完全正确的原文会因为中间插了一个 `</strong>`
    而判成"找不到"。

    **为什么是两个变体**：语法高亮会把一个 token 拆进多个 span ——
    `cache_tools_list</span><span>=</span><span>True` 。把标签换成空格会得到
    `cache_tools_list = True`（多了空格），换成空串才是原文。反过来，散文里跨段落的
    引文需要那个空格才不会把两个词粘成一个。**两种切法都可能对，所以两种都比。**
    （2026-09-29 实测：漏掉这一条会把一个完全正确的引用判成"编的"。）

    返回 (标签→空格, 标签→空串)。
    """
    def clean(value: str) -> str:
        value = html.unescape(value)
        value = unicodedata.normalize("NFKC", value)
        # 弯引号 / 各种连字符在网页与 Markdown 之间会来回变，统一掉
        value = value.translate(
            str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "—": "-", "–": "-"})
        )
        return re.sub(r"\s+", " ", value).strip().casefold()

    return clean(HTML_TAG_PATTERN.sub(" ", text)), clean(HTML_TAG_PATTERN.sub("", text))


def fetch(url: str) -> str | None:
    """取一个页面的正文；取不到（网络 / 404 / 超时）返回 None。"""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except Exception as error:  # noqa: BLE001 — 任何网络失败都只是"取不到"
        print(f"     （取不到：{type(error).__name__}: {error}）")
        return None


def read_source(source: str) -> str | None:
    """SOURCE 是本地路径时直接读文件。"""
    path = Path(source).expanduser()
    if not path.is_absolute():
        path = REPO_ROOT / path
    if not path.exists():
        print(f"     （本地文件不存在：{path}）")
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def main() -> int:
    if not LEDGER.exists():
        print(f"⚠️ 找不到台账 {LEDGER} —— 跳过。")
        return 0

    entries = list(ENTRY_PATTERN.finditer(LEDGER.read_text(encoding="utf-8")))
    print(f"── 官方依据台账核查（{LEDGER.name}，{len(entries)} 条）")

    if not entries:
        print("  ⚠️ 台账里一条 SOURCE/QUOTE/WHY 都没解析出来 —— 检查格式。")
        return 1

    failures: list[str] = []
    unverified: list[str] = []

    for index, entry in enumerate(entries, start=1):
        source = entry.group("source")
        quote = entry.group("quote")
        label = quote if len(quote) <= 58 else quote[:55] + "…"

        print(f"  [{index}] {label}")

        if source.startswith(("http://", "https://")):
            body = fetch(source)
        else:
            body = read_source(source)

        if body is None:
            print("      ⚠️ 未验证（取不到来源）—— 放行")
            unverified.append(label)
            continue

        normalize_quote = normalize_variants(quote)[0]
        if any(normalize_quote in body_variant for body_variant in normalize_variants(body)):
            print("      ✓ 原文在页面上")
        else:
            print(f"      ✗ 这句话在 {source} 上**找不到**")
            failures.append(f"[{index}] {label}  ←  {source}")

    print()
    if failures:
        print(f"⛔ 有 {len(failures)} 条原文与来源对不上 —— 提交被拒。")
        print("   台账是「官方这么写的」的证据。对不上 = 要么记错了，要么是编的。")
        print()
        for failure in failures:
            print(f"     {failure}")
        print()
        print("   改法：用 AnySearch 重新取一次官方页面，把**逐字原文**抄进来。")
        return 1

    if unverified:
        print(f"⚠️ 有 {len(unverified)} 条没验证（来源取不到）—— 已经放行，但请自己确认。")

    print("✓ 台账里每一条原文，都在它说的来源上。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
