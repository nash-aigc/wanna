#!/usr/bin/env python3
"""阶段 0 · 补测两个在计算器上覆盖不到的工具（修正版）。

- set_value    需要可写的 AXValue 控件 → TextEdit 的正文区（**必须带 pid**）
- set_selected 需要带 AXSelected 的控件 → 访达列表里一行可见的 AXRow

修正了第一版的两个错：
  1. 界面树的行首是 **tab**；而且 AXRow/AXCell **没有 `"文字"` 字段** ——
     第一版正则强制要求引号字段，所以一个都匹配不到（不是"没有可选中行"）。
  2. set_value 的 `pid` 是**必填**，第一版传了 None，报 -32602。
"""

import asyncio
import re
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MCP_SERVER = "/Users/mjm/Documents/SuperAgent/Agent/Mcp/mcp-server-macos-use/.build/debug/mcp-server-macos-use"

# 行首可能是空白；文字字段**可选**（行/单元格就没有）
LINE = re.compile(
    r'\[(?P<role>AX\w+)[^\]]*\]\s*'
    r'(?:"(?P<text>[^"]*)")?\s*'
    r'x:(?P<x>-?\d+)\s*y:(?P<y>-?\d+)\s*w:(?P<w>-?\d+)\s*h:(?P<h>-?\d+)'
)


def text_of(result) -> str:
    return "\n".join(getattr(i, "text", "") or "" for i in getattr(result, "content", []) or [])


def tree_path_of(body: str) -> str | None:
    for line in body.splitlines():
        if line.startswith("file:"):
            return line.split(":", 1)[1].strip()
    return None


def pid_of(body: str) -> int | None:
    for line in body.splitlines():
        if line.startswith("pid:"):
            try:
                return int(line.split(":", 1)[1].strip())
            except ValueError:
                return None
    return None


def parse_tree(body: str, role: str, only_visible_in_screen: bool = False) -> list[dict]:
    path = tree_path_of(body)
    if not path:
        return []
    found = []
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                m = LINE.search(raw)
                if not m or m.group("role") != role:
                    continue
                item = {
                    "text": m.group("text") or "",
                    **{k: int(m.group(k)) for k in ("x", "y", "w", "h")},
                }
                if only_visible_in_screen and (item["y"] < 0 or "visible" not in raw):
                    continue
                found.append(item)
    except OSError as exc:
        print(f"     读树失败 {path}: {exc}")
    return found


async def main() -> int:
    params = StdioServerParameters(command=MCP_SERVER, args=[], env=None)
    failures: list[str] = []

    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()

            # ── A. set_value：TextEdit 正文区 ────────────────────────────
            print("A. set_value —— 往 TextEdit 正文区写一个字串")
            res = await s.call_tool("macos-use_open_application_and_traverse",
                                    {"identifier": "com.apple.TextEdit"})
            body = text_of(res)
            tpid = pid_of(body)
            areas = parse_tree(body, "AXTextArea")
            print(f"     TextEdit pid={tpid}，找到 AXTextArea {len(areas)} 个")
            if not tpid or not areas:
                failures.append("set_value: 拿不到 pid 或 AXTextArea")
            else:
                a = areas[0]
                print(f"     定位 x:{a['x']} y:{a['y']} w:{a['w']} h:{a['h']}")
                res = await s.call_tool("macos-use_set_value_and_traverse",
                                        {"pid": tpid, "x": a["x"], "y": a["y"],
                                         "width": a["w"], "height": a["h"],
                                         "value": "阶段0 · set_value 实测"})
                out = text_of(res)
                ok = "status: success" in out and not getattr(res, "is_error", False)
                print(f"     {'✓' if ok else '✗'} {out.splitlines()[:3]}")
                if not ok:
                    failures.append(f"set_value: {out[:200]}")

            # ── B. set_selected：访达列表里一行可见的行 ──────────────────
            print("\nB. set_selected —— 选中访达列表里的一行")
            res = await s.call_tool("macos-use_open_application_and_traverse",
                                    {"identifier": "com.apple.finder"})
            body = text_of(res)
            fpid = pid_of(body)
            rows = parse_tree(body, "AXRow", only_visible_in_screen=True)
            print(f"     Finder pid={fpid}，屏内可见 AXRow {len(rows)} 行")
            if not rows:
                failures.append("set_selected: 没有屏内可见的 AXRow")
            else:
                row = rows[0]
                print(f"     定位 x:{row['x']} y:{row['y']} w:{row['w']} h:{row['h']}")
                res = await s.call_tool("macos-use_set_selected_and_traverse",
                                        {"pid": fpid,
                                         "x": row["x"], "y": row["y"],
                                         "width": row["w"], "height": row["h"],
                                         "selected": True})
                out = text_of(res)
                ok = "status: success" in out and not getattr(res, "is_error", False)
                print(f"     {'✓' if ok else '✗'} {out.splitlines()[:3]}")
                if not ok:
                    failures.append(f"set_selected: {out[:200]}")

    print("\n" + "=" * 70)
    if failures:
        print("未通过：")
        for f in failures:
            print("  ✗", f)
        return 1
    print("✓ set_value 与 set_selected 都调通了 —— 9 个工具全部覆盖。")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
