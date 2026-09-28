#!/usr/bin/env python3
"""「看图估坐标」到底能不能用 —— 多软件通用测量。

## 为什么要有这个脚本

2026-09-28 只在**计算器的「7」键**上测了 5 次（按名字 5/5、按坐标 1/5），就差点据此
把坐标估算这条路删掉。用户当场纠正：

> 「你刚才只测了计算器，**有局限性，要通用、全面地测试**，才能知道这个东西到底有没有价值。
>   如果每一个软件都能操控，你再去删掉它；如果很多软件用之前的方案操控不了，
>   只能用截图来估计，你再去考虑用截图的方法」—— 并点名网易云音乐 / Safari / Recast / 豆包 / 百度网盘。

他是对的，而且理由比"样本少"更硬：**计算器的键是 48×48、间隙 6 点，是市面上最难的目标**。
拿最难的一类代表全部，方法本身就错了。

## 判据（对任何 App 都成立，不需要换算）

Wanna 的 `read_screen` 返回的坐标**就是 0–1000 网格**（和模型看图用的同一套）。
所以：**真值 = 界面树里那个元素的矩形；估算 = 视觉模型给的坐标；
命中 = 估算点落在矩形内。** 两边同一套坐标系，没有换算这一步，也就没有换算错的可能。

## 输出

每个 App 一张表：命中的目标数、以及估算点与真实中心的距离分布。
最后一节单独报**「按名字根本用不了」的 App** —— 那些地方坐标估算是唯一手段。

用法：
    .venv/bin/python survey_estimate_accuracy.py            # 每个 App 测 6 个目标
    .venv/bin/python survey_estimate_accuracy.py 10
"""

import asyncio
import math
import re
import sys
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client
from openai import AsyncOpenAI

URL = "http://127.0.0.1:8765/mcp"
TOKEN = (Path.home() / "Library/Application Support/Wanna/mcp-token").read_text().strip()
KEY = (Path(__file__).resolve().parent / ".deepseek_key").read_text().strip()
client = AsyncOpenAI(base_url="https://api.deepseek.com/v1", api_key=KEY)

APPS = [
    ("com.netease.163music", "网易云音乐"),
    ("com.apple.Safari", "Safari"),
    ("com.bot.pc.doubao", "豆包"),
    ("com.baidu.BaiduNetdisk-mac", "百度网盘"),
    ("notion.id", "Notion"),
]

# 界面树一行： - AXButton (按钮) "开关边栏" at 65,53 (screen 1), size 44x52
ELEMENT = re.compile(
    r'- (?P<role>AX\w+)[^"]*"(?P<label>[^"]*)"\s+at\s+(?P<x>\d+),(?P<y>\d+)\s+\(screen (?P<screen>\d+)\),'
    r'\s+size (?P<w>\d+)x(?P<h>\d+)'
)


def parse_elements(tree_text: str) -> list[dict]:
    out = []
    for match in ELEMENT.finditer(tree_text):
        item = match.groupdict()
        out.append({
            "role": item["role"], "label": item["label"],
            "x": int(item["x"]), "y": int(item["y"]),
            "w": int(item["w"]), "h": int(item["h"]),
        })
    return out


def pick_targets(elements: list[dict], count: int) -> list[dict]:
    """挑**人真的会开口点的**那种控件，并按大小分层取样。

    ## 为什么这么挑（第一版挑错了，记在这里）

    第一版按"面积从小到大"挑 —— 于是挑中的全是 12×12、13×16 的图标，
    还有一个标签直接是 base64 数据串。**那等于专挑最难、最不像目标的东西测**，
    和"只测计算器 48×48 按键"是同一类错误，只是方向相反。

    规则：
    - 排除菜单栏（那不算"软件里的控件"）
    - **排除没有名字、或名字不像给人看的东西**（base64、超长说明句）
    - **排除容器**（窗口/网页那种整块，点它等于点空白）
    - 排除过小的图标（< 24 单位）—— 人不会说"点那个 13×13 的箭头"
    - **按大小分三层各取几个**，因为准头是随目标大小变的，只测一层等于没测
    """
    candidates = []
    for element in elements:
        if element["role"].startswith("AXMenuBar"):
            continue
        label = element["label"].strip()
        if not label:
            continue
        if len(label) > 24:                    # 长句/说明，不是控件名
            continue
        if re.search(r"[+/=]{2,}|svg\+xml|^data:", label):   # base64 串混进来了
            continue
        if element["w"] > 600 or element["h"] > 600:         # 容器
            continue
        if element["w"] < 24 or element["h"] < 24:           # 小图标
            continue
        area = element["w"] * element["h"]
        candidates.append({**element, "area": area})

    # 去重
    seen: set[tuple] = set()
    unique = []
    for element in candidates:
        key = (element["label"], element["x"] // 40, element["y"] // 40)
        if key in seen:
            continue
        seen.add(key)
        unique.append(element)
    if not unique:
        return []

    # 按面积分三层，每层取几个 —— 这样才看得出"准头随大小怎么变"
    unique.sort(key=lambda e: e["area"])
    third = max(1, len(unique) // 3)
    buckets = [unique[:third], unique[third:2 * third], unique[2 * third:]]
    picked: list[dict] = []
    per_bucket = max(1, count // 3)
    for bucket in buckets:
        step = max(1, len(bucket) // per_bucket)
        picked.extend(bucket[::step][:per_bucket])
    return picked


PROMPT = ('这是 macOS 的「{app}」截图。请给出控件「{label}」中心的坐标，'
          '用 0–1000 的归一化网格（左上角 0,0、右下角 1000,1000）。'
          '只回一个 JSON：{{"x": 数字, "y": 数字}}')


async def estimate(label: str, app_name: str, jpeg_b64: str) -> tuple[float, float]:
    response = await client.chat.completions.create(
        model="deepseek-flash",
        max_tokens=32000,
        extra_body={"thinking": {"type": "disabled"}},   # 实测有效；不关会烧光预算
        messages=[{"role": "user", "content": [
            {"type": "text", "text": PROMPT.format(app=app_name, label=label)},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{jpeg_b64}"}},
        ]}],
    )
    raw = (response.choices[0].message.content or "").strip()
    match = re.search(r'"x"\s*:\s*([\d.]+)[^}]*"y"\s*:\s*([\d.]+)', raw)
    if not match:
        match = re.search(r'\{\s*([\d.]+)\s*,\s*([\d.]+)\s*\}', raw)
    if not match:
        raise RuntimeError(f"没给出坐标（finish={response.choices[0].finish_reason}, raw={raw[-120:]!r}）")
    return float(match.group(1)), float(match.group(2))


async def main() -> int:
    per_app = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    summary: list[dict] = []

    http_client = create_mcp_http_client(headers={"Authorization": f"Bearer {TOKEN}"})
    async with streamable_http_client(URL, http_client=http_client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            async def call(tool: str, args: dict) -> str:
                return "\n".join(getattr(i, "text", "") or ""
                                 for i in (await session.call_tool(tool, args)).content)

            for bundle_id, app_name in APPS:
                print("=" * 72)
                print(f"### {app_name}")
                await call("open_app", {"name": bundle_id})
                await asyncio.sleep(3.0)

                elements = parse_elements(await call("read_screen", {}))
                content = [e for e in elements if not e["role"].startswith("AXMenuBar")]

                if not content:
                    print(f"  ⚠️ 窗口内容**一个元素都没有**（总共只读到 {len(elements)} 个，全是菜单栏）")
                    print("  → 「按名字」对它无从下手：界面树里没有任何名字可查。")
                    summary.append({"app": app_name, "total": 0, "hits": 0,
                                    "distances": [], "blocked": True})
                    continue

                targets = pick_targets(elements, per_app)
                shot = await session.call_tool("screenshot", {})
                jpeg = next((getattr(i, "data", None) for i in shot.content
                             if getattr(i, "type", "") == "image"), None)

                hits, distances = 0, []
                print(f"  窗口内容 {len(content)} 个元素 · 测 {len(targets)} 个目标")
                for target in targets:
                    try:
                        ex, ey = await estimate(target["label"], app_name, jpeg)
                    except Exception as exc:      # noqa: BLE001
                        print(f"    ✗ 「{target['label']}」 估不出来：{str(exc)[:70]}")
                        continue

                    inside = (target["x"] <= ex <= target["x"] + target["w"]
                              and target["y"] <= ey <= target["y"] + target["h"])
                    center_x = target["x"] + target["w"] / 2
                    center_y = target["y"] + target["h"] / 2
                    distance = math.hypot(ex - center_x, ey - center_y)
                    size = min(target["w"], target["h"])
                    distances.append((distance, size, inside))
                    hits += 1 if inside else 0
                    print(f"    {'✅' if inside else '❌'} 「{target['label'][:22]}」"
                          f" 真值({target['x']},{target['y']} {target['w']}×{target['h']})"
                          f" 估算({ex:.0f},{ey:.0f}) 距中心 {distance:.0f}")

                summary.append({"app": app_name, "total": len(distances), "hits": hits,
                                "distances": distances, "blocked": False})
                print()

    await http_client.aclose()

    print("=" * 72)
    print("总结（坐标估算「能不能用」）")
    print("=" * 72)
    print(f"  {'App':<12} {'命中':<9} {'距中心 中位/最小/最大'}")
    for row in summary:
        if row["blocked"]:
            print(f"  {row['app']:<12} {'—':<9} 按名字不可用（界面树里没有内容）")
            continue
        if not row["total"]:
            print(f"  {row['app']:<12} 没测到（界面里没有像样的目标）")
            continue
        ordered = sorted(d for d, _, _ in row["distances"])
        median = ordered[len(ordered) // 2]
        print(f"  {row['app']:<12} {row['hits']}/{row['total']:<7} "
              f"{median:.0f} / {ordered[0]:.0f} / {ordered[-1]:.0f}")

    # ⭐ 按**目标大小**分层 —— 这才是能回答"能不能用"的那张表
    everything = [(d, s, h, row["app"])
                  for row in summary if not row["blocked"]
                  for d, s, h in row["distances"]]
    if everything:
        print("\n  ⭐ 按目标大小分层（准头是随目标大小变的，混在一起看没有意义）")
        print(f"  {'目标短边':<14} {'命中':<9} {'距中心 中位'}")
        for low, high, name in [(0, 40, "24–40（小图标）"),
                                (40, 80, "40–80（小按钮）"),
                                (80, 1000, "80+（大按钮/行）")]:
            group = [e for e in everything if low <= e[1] < high]
            if not group:
                continue
            group_hits = sum(1 for e in group if e[2])
            group_distances = sorted(e[0] for e in group)
            median = group_distances[len(group_distances) // 2]
            print(f"  {name:<14} {group_hits}/{len(group):<7} {median:.0f}")

    print("\n  注：坐标是 0–1000 网格（1000 = 整块屏幕的宽/高）。")
    print("  命中 = 估算点落在该控件的矩形内。「距中心」= 估算点离真中心的距离。")
    print("  所以「距中心 30」的意思是：偏了整屏的 3% —— 对 200 单位宽的按钮是正中，")
    print("  对 30 单位宽的图标就是完全错。**同一个数字，大小不同结论相反。**")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
