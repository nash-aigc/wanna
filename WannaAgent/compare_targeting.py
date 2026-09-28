#!/usr/bin/env python3
"""两种「瞄准方式」的准确率对比 —— 用户 2026-09-28 要的那个测试。

## 它在比什么

同一个目标（计算器的「7」键），用两条路各点 N 次：

  ① by_name       —— 把控件的**名字**交给 Wanna，它去界面树里找真实位置
                     （`mcp-server-macos-use` 走的就是这条路）
  ② by_coordinate —— 只看**截图**，让视觉模型估一个 0–1000 的坐标，直接按那个点
                     （这就是用户说的「截图说话 / 会截偏」那条）

判据是**客观的**：点完之后读界面树，看计算器显示屏上是不是「7」。
不是"看起来点了"，是"真的按对了"。

## ⚠️ 三条实测踩出来的坑（写在注释里，别再踩）

1. `deepseek-flash` 是**推理模型**，估坐标时推理长度没有上限：`max_tokens` 200 / 2000 /
   8000 **都被 reasoning token 全部吃光** —— 返回 HTTP 200 但 `content` 为空、
   `finish_reason="length"`。所以解法是**关掉推理**，不是加预算。
2. 关推理的开关实测**只有这两个真的有效**：`thinking={"type":"disabled"}` 与
   `reasoning_effort="none"`（用后 `completion_tokens_details` 直接变成 None）。
   `reasoning_effort="minimal"` **仍然推理**（实测 1786 tokens）——
   "看起来像"的开关不能信，要实测。
3. 早先一版把 `ClickTargeting` 的 rawValue 写成驼峰 `byName`，而工具 schema 声明的是
   `by_name` —— **参数静默失效、两次跑的都是 auto**，那轮数字看着挺像回事，其实整轮作废。
   所以下面 `call()` 里对"认不出来"直接抛错，不让它静默过去。

用法：
    .venv/bin/python compare_targeting.py            # 默认 5 轮
    .venv/bin/python compare_targeting.py 10         # 10 轮
"""

import asyncio
import re
import sys
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client
from openai import AsyncOpenAI

URL = "http://127.0.0.1:8765/mcp"
TOKEN = (Path.home() / "Library/Application Support/Wanna/mcp-token").read_text().strip()
KEY = (Path(__file__).resolve().parent / ".deepseek_key").read_text().strip()
CALC = "com.apple.calculator"
TARGET_LABEL = "7"

client = AsyncOpenAI(base_url="https://api.deepseek.com/v1", api_key=KEY)

PROMPT = ('这是 macOS 计算器。请给出数字键「7」中心的坐标，'
          '用 0–1000 的归一化网格（左上 0,0、右下 1000,1000）。'
          '只回一个 JSON：{"x": 数字, "y": 数字}')


def text_of(result) -> str:
    return "\n".join(getattr(i, "text", "") or "" for i in getattr(result, "content", []) or [])


def image_of(result) -> str | None:
    for item in getattr(result, "content", []) or []:
        if getattr(item, "type", "") == "image":
            return getattr(item, "data", None)
    return None


async def ask_for_coordinate(jpeg_b64: str) -> tuple[float, float, int]:
    """让视觉模型看图估一个 0–1000 的坐标 —— 这就是「截图说话」那一路。"""
    response = await client.chat.completions.create(
        model="deepseek-flash",
        max_tokens=32000,
        extra_body={"thinking": {"type": "disabled"}},
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url",
                 "image_url": {"url": f"data:image/jpeg;base64,{jpeg_b64}"}},
            ],
        }],
    )
    message = response.choices[0].message
    raw = (message.content or "").strip()

    details = getattr(response.usage, "completion_tokens_details", None)
    reasoning_tokens = (getattr(details, "reasoning_tokens", 0) or 0) if details else 0

    match = re.search(r'"x"\s*:\s*([\d.]+)[^}]*"y"\s*:\s*([\d.]+)', raw)
    if not match:
        match = re.search(r'\{\s*([\d.]+)\s*,\s*([\d.]+)\s*\}', raw)
    if not match:
        raise RuntimeError(f"模型没给出可用坐标（finish={response.choices[0].finish_reason}，"
                           f"raw={raw[-200:]!r}）")
    return float(match.group(1)), float(match.group(2)), reasoning_tokens


DISPLAY = re.compile(r'AXStaticText[^\n]*"([^"]*)"')
DIGITS = re.compile(r'^(-?\d[\d,.]*)$')


def display_shows(screen_text: str, wanted: str) -> bool:
    """读界面树，看计算器**显示屏**上是不是 wanted。

    显示屏是 AXStaticText；按钮虽然也叫「7」但角色是 AXButton ——
    按角色区分才不会把「键上印着 7」误判成「屏上显示了 7」。
    """
    for line in screen_text.splitlines():
        if "AXStaticText" not in line:
            continue
        match = re.search(r'"([^"]*)"', line)
        if not match:
            continue
        value = match.group(1)
        cleaned = DIGITS.match(value)
        if cleaned and cleaned.group(1).lstrip("-").replace(",", "") == wanted:
            return True
        if value.startswith(wanted + " ") and "编辑字段" in value:
            return True
    return False


async def main() -> int:
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    results = {"by_name": [], "by_coordinate": []}
    estimates: list[tuple[float, float]] = []
    reasoning_seen: list[int] = []

    http_client = create_mcp_http_client(headers={"Authorization": f"Bearer {TOKEN}"})
    async with streamable_http_client(URL, http_client=http_client) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            async def call(tool: str, args: dict) -> str:
                text = text_of(await session.call_tool(tool, args))
                if "认不出来" in text:
                    raise RuntimeError(f"工具说参数没认出来：{text.splitlines()[0]}")
                return text

            print(f"目标：计算器的「{TARGET_LABEL}」键 · 共 {rounds} 轮\n")
            await call("open_app", {"name": CALC})
            await asyncio.sleep(1.5)

            for round_index in range(1, rounds + 1):
                print(f"── 第 {round_index} 轮 " + "─" * 46)
                await call("press_key", {"key": "escape"})
                await asyncio.sleep(0.4)

                shot = await session.call_tool("screenshot", {})
                estimate_x, estimate_y, reasoning = await ask_for_coordinate(image_of(shot))
                estimates.append((estimate_x, estimate_y))
                reasoning_seen.append(reasoning)
                print(f"  视觉模型估的坐标：({estimate_x:.0f}, {estimate_y:.0f}) · 推理 {reasoning} tok")

                await call("click", {"x": estimate_x, "y": estimate_y,
                                     "targeting": "by_coordinate"})
                await asyncio.sleep(0.7)
                hit = display_shows(await call("read_screen", {}), TARGET_LABEL)
                results["by_coordinate"].append(hit)
                print(f"  ② by_coordinate ：{'✅ 命中' if hit else '❌ 没中'}")

                await call("press_key", {"key": "escape"})
                await asyncio.sleep(0.4)

                await call("click", {"x": estimate_x, "y": estimate_y,
                                     "label": TARGET_LABEL, "targeting": "by_name"})
                await asyncio.sleep(0.7)
                hit = display_shows(await call("read_screen", {}), TARGET_LABEL)
                results["by_name"].append(hit)
                print(f"  ① by_name       ：{'✅ 命中' if hit else '❌ 没中'}")

                await call("press_key", {"key": "escape"})
                await asyncio.sleep(0.4)

    await http_client.aclose()

    print("\n" + "=" * 68)
    print(f"结果（{rounds} 轮 · 目标「{TARGET_LABEL}」）")
    print("=" * 68)
    for name, hits in results.items():
        count = sum(1 for h in hits if h)
        print(f"  {name:<16} {count}/{len(hits)}  {'█' * count}{'·' * (len(hits) - count)}")
    if estimates:
        xs = [e[0] for e in estimates]
        ys = [e[1] for e in estimates]
        print(f"\n  视觉模型估的坐标：x {min(xs):.0f}–{max(xs):.0f}（跨度 {max(xs) - min(xs):.0f}）"
              f" · y {min(ys):.0f}–{max(ys):.0f}（跨度 {max(ys) - min(ys):.0f}）")
        print(f"  推理 token：{reasoning_seen}（应当全是 0 —— 非 0 说明关推理没生效）")
        print("  跨度越大 = 同一个目标每次估的都不一样，这正是「方向随机」的样子。")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
