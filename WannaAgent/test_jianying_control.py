#!/usr/bin/env python3
"""剪映（com.lemon.lvpro）能不能**真的操控** —— 不是"能不能看到元素"。

## 用户 2026-09-28 的要求

> 「你能看到的元素和你能精准控制的不是一回事，**不能只是识别，还要分别点击一下，
>   看它能不能正常使用**。别点删除就行，正常点击应该没有问题。」

所以这个脚本把两件事**分开量**：

  A. **点得中吗** —— Wanna 的解析日志里写清了「按名字查到(frame) · 落在(x,y)」。
     查到的矩形 == 那个元素自己的矩形 → 说明点确实落在目标身上，而不是落歪了。
  B. **点了有用吗** —— 点前点后各读一次界面树，看**内容有没有变**。
     点中了但界面没变 = 那个控件是死的（或点了没反应）。

A 和 B 必须分开：一个控件可能"每次都点中，但点了没反应"（禁用的按钮），
也可能"点歪了但恰好碰到了别的东西"。

## 安全

只点**顶部素材面板的分页**（素材 / 音频 / 文本 / 贴纸 / 特效 / 转场 / 字幕 / 滤镜 / 调节…）
—— 它们是纯导航，点错也只是换个面板，随时点回来。
**不碰任何带"删除"的东西。**
"""

import asyncio
import re
import sys
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

URL = "http://127.0.0.1:8765/mcp"
TOKEN = (Path.home() / "Library/Application Support/Wanna/mcp-token").read_text().strip()
LOG = Path.home() / "Library/Application Support/Wanna/录音诊断.log"
APP = "com.lemon.lvpro"

ELEMENT = re.compile(
    r'- (?P<role>AX\w+)[^"]*"(?P<label>[^"]*)"\s+at\s+(?P<x>\d+),(?P<y>\d+)\s+\(screen (?P<screen>\d+)\),'
    r'\s+size (?P<w>\d+)x(?P<h>\d+)')
# 点击解析 「7」 · 按名字 · 估算(1047,888) · 查到(1012,856 48×48) · 落在(1036,880)
RESOLUTION = re.compile(
    r'点击解析 (?P<label>[^·]+) · (?P<via>[^·]+) · 估算\((?P<ex>-?\d+),(?P<ey>-?\d+)\) · '
    r'查到(?P<found>没查到|\((?P<fx>-?\d+),(?P<fy>-?\d+) (?P<fw>\d+)×(?P<fh>\d+)\)) · '
    r'落在\((?P<lx>-?\d+),(?P<ly>-?\d+)\)')

# 只点这些 —— 顶部素材分页，纯导航
SAFE_PREFIX = "root_"


DISPLAY = re.compile(r'逻辑尺寸 (\d+)×(\d+) 点')


def parse_display_size(shot_text: str) -> tuple[int, int]:
    """从 screenshot 工具的说明里取屏幕逻辑尺寸 —— **日志里的坐标是像素，不是网格**。

    ⚠️ 第一版就是在这里判错的：拿 `read_screen` 的 0–1000 网格去跟日志里的像素比，
    结果「点得中 0/12」而「UI 变了 12/12」—— 自相矛盾，因为 12 次点击**全都生效了**。
    网格 → 像素：`px = 网格 / 1000 × 屏幕宽`。"""
    match = DISPLAY.search(shot_text)
    return (int(match.group(1)), int(match.group(2))) if match else (0, 0)


def parse_elements(tree: str) -> list[dict]:
    return [{"role": m.group("role"), "label": m.group("label"),
             "x": int(m.group("x")), "y": int(m.group("y")),
             "w": int(m.group("w")), "h": int(m.group("h"))}
            for m in ELEMENT.finditer(tree)]


def log_size() -> int:
    return LOG.stat().st_size if LOG.exists() else 0


def read_new_resolution(start_offset: int) -> dict | None:
    """读日志里新增的「点击解析」行（最后一次）。"""
    try:
        with LOG.open(encoding="utf-8", errors="replace") as handle:
            handle.seek(start_offset)
            fresh = handle.read()
    except OSError:
        return None
    matches = [RESOLUTION.search(line) for line in fresh.splitlines()]
    matches = [m for m in matches if m]
    return matches[-1].groupdict() if matches else None


async def main() -> int:
    http_client = create_mcp_http_client(headers={"Authorization": f"Bearer {TOKEN}"})
    rows = []
    async with streamable_http_client(URL, http_client=http_client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            async def call(tool: str, args: dict) -> str:
                return "\n".join(getattr(i, "text", "") or ""
                                 for i in (await session.call_tool(tool, args)).content)

            print(f"打开剪映（{APP}）…")
            await call("open_app", {"name": APP})
            await asyncio.sleep(3.5)

            shot_text = await call("screenshot", {})
            display_w, display_h = parse_display_size(shot_text)
            print(f"屏幕逻辑尺寸 {display_w}×{display_h} 点（日志里的坐标是像素，按它换算）")

            tree = await call("read_screen", {})
            elements = parse_elements(tree)
            content = [e for e in elements if not e["role"].startswith("AXMenuBar")]
            print(f"读到 {len(elements)} 个元素 · 窗口内容 {len(content)} 个\n")

            # 目标：顶部素材分页（root_ 开头），名字取 root_ 后面那段当搜索词
            targets = []
            seen = set()
            for element in content:
                label = element["label"]
                if not label.startswith(SAFE_PREFIX):
                    continue
                search = label[len(SAFE_PREFIX):]
                if not search or search in seen:
                    continue
                seen.add(search)
                targets.append({**element, "search": search})

            if not targets:
                print("⚠️ 没找到 root_ 开头的分页元素")
                return 1
            print(f"将测试 {len(targets)} 个顶部素材分页："
                  f"{'、'.join(t['search'] for t in targets)}\n")

            for target in targets:
                before = await call("read_screen", {})
                started = log_size()

                await call("click", {"x": target["x"] + target["w"] // 2,
                                     "y": target["y"] + target["h"] // 2,
                                     "label": target["search"], "targeting": "by_name"})
                await asyncio.sleep(1.4)

                resolution = read_new_resolution(started)
                after = await call("read_screen", {})

                # A. 点得中吗 —— 查到的矩形是不是就是目标自己那个
                # ⚠️ **不要拿日志里的像素去跟网格比** —— 第一版就是这么判错的，
                # 得出「点得中 0/12」而「UI 变了 12/12」这种自相矛盾的结果。
                # 日志记的是**像素**（屏幕 1728 宽），网格是 0–1000，两者还差一个
                # 约 11 网格单位的原点偏移（来源未查清，如实记）。
                #
                # 换成**不依赖换算**的结构判据：尺寸必须逐点相等。全部 12 个分页
                # 尺寸都是 40×42，所以尺寸本身不足以区分同名控件 —— 但**顺序**可以：
                # 每个名字查到的 x 必须互不相同、且随目标顺序单调递增。
                hit = False
                if resolution and resolution["found"] != "没查到":
                    hit = (int(resolution["fw"]), int(resolution["fh"])) == (target["w"], target["h"])

                # B. 点了有用吗 —— 界面树变了没有
                changed = before != after

                rows.append({"name": target["search"], "hit": hit, "changed": changed,
                             "grid_x": target["x"],
                             "found_x": int(resolution["fx"]) if resolution and resolution["found"] != "没查到" else None,
                             "via": resolution["via"].strip() if resolution else "（没记到日志）"})
                print(f"  {'✅' if hit else '❌'} 「{target['search']}」"
                      f" · 方式={rows[-1]['via'][:12]:<12}"
                      f" · UI{'变了' if changed else '没变'}")

    await http_client.aclose()

    print("\n" + "=" * 70)
    print("剪映：能看见 ≠ 能控制（分开量）")
    print("=" * 70)
    print(f"  {'分页':<10} {'尺寸对上':<10} {'点了有用'}")
    for row in rows:
        print(f"  {row['name']:<10} {'✅' if row['hit'] else '❌':<10} "
              f"{'✅ 界面变了' if row['changed'] else '❌ 没反应'}")
    hits = sum(1 for r in rows if r["hit"])
    effects = sum(1 for r in rows if r["changed"])
    print(f"\n  尺寸对上 {hits}/{len(rows)} · 点了有用 {effects}/{len(rows)}")

    # 结构判据：每个名字查到的矩形必须互不相同、且随目标顺序单调递增
    xs = [r["found_x"] for r in rows if r.get("found_x") is not None]
    if len(xs) == len(rows) and len(set(xs)) == len(xs):
        increasing = all(b > a for a, b in zip(xs, xs[1:]))
        print(f"  查到的位置：{'单调递增 ✅' if increasing else '顺序乱 ❌'} "
              f"· {len(set(xs))} 个互不相同 → 每个名字命中不同的元素")
        print(f"    实际像素 x: {xs}")
        print(f"    界面树网格 x: {[r['grid_x'] for r in rows]}")
        if len(xs) >= 2:
            pixel_step = (xs[-1] - xs[0]) / (len(xs) - 1)
            grid_step = ([r["grid_x"] for r in rows][-1] - [r["grid_x"] for r in rows][0]) / (len(rows) - 1)
            print(f"    间距：像素 {pixel_step:.1f} / 网格 {grid_step:.1f} = 比值 "
                  f"{pixel_step / grid_step:.3f}（屏幕宽/1000 = {display_w / 1000:.3f}）")
    print("  两个数字要分开看：尺寸对上但没反应 = 控件是死的；尺寸不对 = 名字找错了元素。")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
