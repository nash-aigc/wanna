#!/usr/bin/env python3
"""两个 MCP 对着同一批目标各点一遍 —— 比"哪个点得更准"。

## 为什么这么测

用户 2026-09-28：「你的感觉是之前那个比较好用……**最好你去测试多个元素，
你刚才还是去找到了元素，没有去分别点击**……**还是说你只要能够看到元素，就一定能点击？**」

所以这个脚本不做"能不能看到"，只做**真的点下去、然后验证**。

## 两个 MCP 怎么同时用

- Wanna：HTTP（`127.0.0.1:8765/mcp`）+ 令牌
- macos-use：**stdio**（它本来就是标准 MCP 服务端，用同一个 Python 客户端拉起来即可）

## 判据

对每个目标：点之前读一次界面树，点之后读一次 —— **界面变了 = 这一下真的作用到了**。
没变 = 点了个寂寞（点歪了，或者那个控件本来就点不动）。

这一条对两个 MCP 是**同一把尺子**，所以可以横向比。
"""

import asyncio
import re
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

WANNA_URL = "http://127.0.0.1:8765/mcp"
TOKEN = (Path.home() / "Library/Application Support/Wanna/mcp-token").read_text().strip()
MACOS_USE = ("/Users/mjm/Documents/SuperAgent/Agent/Mcp/"
             "mcp-server-macos-use/.build/debug/mcp-server-macos-use")

ELEMENT = re.compile(
    r'- (?P<role>AX\w+)[^"]*"(?P<label>[^"]*)"\s+at\s+(?P<x>\d+),(?P<y>\d+)\s+\(screen (?P<screen>\d+)\),'
    r'\s+size (?P<w>\d+)x(?P<h>\d+)')


def parse_elements(tree: str) -> list[dict]:
    return [{"role": m.group("role"), "label": m.group("label"),
             "x": int(m.group("x")), "y": int(m.group("y")),
             "w": int(m.group("w")), "h": int(m.group("h"))}
            for m in ELEMENT.finditer(tree)]


def pick_targets(elements: list[dict], count: int) -> list[dict]:
    """挑**按钮/可点控件**，且名字是人话（不是 base64、不是长句）。"""
    picked, seen = [], set()
    for element in elements:
        label = element["label"].strip()
        if element["role"].startswith("AXMenuBar"):
            continue
        if element["role"] not in ("AXButton", "AXRadioButton", "AXCheckBox", "AXLink"):
            continue
        if not label or len(label) > 20 or re.search(r"[+/=]{3,}|svg\+xml|^data:", label):
            continue
        if element["w"] < 20 or element["h"] < 20 or element["w"] > 400:
            continue
        key = (label, element["x"] // 40, element["y"] // 40)
        if key in seen:
            continue
        seen.add(key)
        picked.append(element)
        if len(picked) >= count:
            break
    return picked


async def main() -> int:
    app_bundle = sys.argv[1] if len(sys.argv) > 1 else "com.bot.pc.doubao"
    app_name = sys.argv[2] if len(sys.argv) > 2 else "豆包"
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 6

    results = {"wanna": [], "macos_use": []}

    # ── Wanna（HTTP）──
    http_client = create_mcp_http_client(headers={"Authorization": f"Bearer {TOKEN}"})
    async with streamable_http_client(WANNA_URL, http_client=http_client) as wstreams:
        async with ClientSession(wstreams[0], wstreams[1]) as wanna:
            await wanna.initialize()

            async def wanna_call(tool: str, args: dict) -> str:
                return "\n".join(getattr(i, "text", "") or ""
                                 for i in (await wanna.call_tool(tool, args)).content)

            await wanna_call("open_app", {"name": app_bundle})
            await asyncio.sleep(3.0)
            tree = await wanna_call("read_screen", {})
            targets = pick_targets(parse_elements(tree), count)
            if not targets:
                print("没挑到可点的目标")
                return 1
            print(f"### {app_name} · 目标 {len(targets)} 个（两个 MCP 各点一遍）\n")

            # ── macos-use（stdio）──
            params = StdioServerParameters(command=MACOS_USE, args=[], env=None)
            async with stdio_client(params) as mstreams:
                async with ClientSession(mstreams[0], mstreams[1]) as macos_use:
                    await macos_use.initialize()
                    # ⚠️ macos-use 的 pid 是**必填**（第一版传了 0，每次都报
                    # "Unexpected setup error executing tool"，6/6 全废）。
                    # 用它的 open_application_and_traverse 拿到真实 pid。
                    opened = await macos_use.call_tool(
                        "macos-use_open_application_and_traverse", {"identifier": app_bundle})
                    opener_text = "\n".join(getattr(i, "text", "") or ""
                                             for i in opened.content)
                    pid_match = re.search(r"pid:\s*(\d+)", opener_text)
                    app_pid = int(pid_match.group(1)) if pid_match else 0
                    print(f"macos-use 拿到 pid={app_pid}\n")

                    async def mu_call(tool: str, args: dict) -> str:
                        return "\n".join(getattr(i, "text", "") or ""
                                         for i in (await macos_use.call_tool(tool, args)).content)

                    for target in targets:
                        label = target["label"]
                        print(f"── 「{label}」")

                        # A. Wanna：按名字
                        before = await wanna_call("read_screen", {})
                        await wanna_call("click", {"x": target["x"] + target["w"] // 2,
                                                   "y": target["y"] + target["h"] // 2,
                                                   "label": label, "targeting": "by_name"})
                        await asyncio.sleep(1.2)
                        after = await wanna_call("read_screen", {})
                        wanna_hit = before != after
                        results["wanna"].append(wanna_hit)
                        print(f"    Wanna      {'✅ 界面变了' if wanna_hit else '❌ 没反应'}")

                        await asyncio.sleep(0.6)

                        # B. macos-use：按名字（它是**完全相等**匹配，所以先试原名）
                        before = await wanna_call("read_screen", {})
                        out = await mu_call("macos-use_click_and_traverse",
                                            {"pid": app_pid, "element": label})
                        # macos-use 的 pid 它自己解析；它回 "Clicked element 'X'. N added, M removed"
                        await asyncio.sleep(1.2)
                        after = await wanna_call("read_screen", {})
                        mu_hit = before != after
                        results["macos_use"].append(mu_hit)
                        summary = next((ln for ln in out.splitlines() if "Clicked" in ln or "error" in ln.lower()),
                                       out.splitlines()[0] if out else "")
                        print(f"    macos-use  {'✅ 界面变了' if mu_hit else '❌ 没反应'} · {summary[:70]}")

    await http_client.aclose()

    print("\n" + "=" * 68)
    print(f"结果（{app_name} · {len(targets)} 个目标，各点一次）")
    print("=" * 68)
    for name, hits in results.items():
        got = sum(1 for h in hits if h)
        print(f"  {name:<12} 生效 {got}/{len(hits)}  {'█' * got}{'·' * (len(hits) - got)}")
    print("\n  判据对两者相同：点前点后界面树有没有变。")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
