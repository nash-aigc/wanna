#!/usr/bin/env python3
"""阶段 0 · 第三项交付：9 个 MCP 工具逐个"能不能调通"的实测。

原则：
- 每个工具调**一次**，动作尽可能可逆（打字不保存、按键用 Escape、滚动滚回来）。
- 只记录：调通了没有、返回什么形状、报什么错。
- 不评价"好不好用" —— 那是阶段 1 的事。
"""

import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MCP_SERVER = "/Users/mjm/Documents/SuperAgent/Agent/Mcp/mcp-server-macos-use/.build/debug/mcp-server-macos-use"

results: list[tuple[str, bool, str]] = []


def brief(result, limit: int = 150) -> str:
    """把返回压成一行：先看 status，再看有没有 error。"""
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", "") or ""
        if not text:
            continue
        head = {}
        for line in text.splitlines()[:6]:
            if ":" in line:
                k, _, v = line.partition(":")
                head[k.strip()] = v.strip()
        status = head.get("status", "?")
        err = head.get("error", "")
        size = head.get("file_size", "")
        return f"status={status} {('ERROR: ' + err) if err else size}".strip()[:limit]
    return "(无文本返回)"


async def call(session, label: str, tool: str, args: dict) -> dict:
    try:
        result = await session.call_tool(tool, args)
        ok = not getattr(result, "is_error", False)
        text = brief(result)
        # is_error 为 False 但 status=error 的，也算失败（那只手会这么报）
        if "status=error" in text:
            ok = False
        results.append((f"{label} · {tool}", ok, text))
        print(f"  {'✓' if ok else '✗'} {label:<22} {tool:<45} {text}")
        return {"ok": ok, "result": result}
    except Exception as exc:  # noqa: BLE001
        results.append((f"{label} · {tool}", False, f"抛异常 {type(exc).__name__}: {exc}"))
        print(f"  ✗ {label:<22} {tool:<45} 抛异常 {type(exc).__name__}: {exc}")
        return {"ok": False, "result": None}


async def main() -> int:
    params = StdioServerParameters(command=MCP_SERVER, args=[], env=None)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            print("逐个工具实测（9 个）：\n")

            # 1. open_application_and_traverse  —— 开计算器
            r1 = await call(s, "打开应用", "macos-use_open_application_and_traverse",
                            {"identifier": "com.apple.calculator"})
            pid = None
            if r1["result"]:
                for item in r1["result"].content:
                    for line in (getattr(item, "text", "") or "").splitlines():
                        if line.startswith("pid:"):
                            pid = int(line.split(":")[1].strip())

            if pid is None:
                print("\n拿不到 pid，后面依赖 pid 的项没法测，停。")
                return 1
            print(f"  （计算器 pid={pid}）\n")

            # 2. click_and_traverse —— 按名字点「8」
            await call(s, "点击(按名字)", "macos-use_click_and_traverse",
                       {"pid": pid, "element": "8", "role": "AXButton"})

            # 3. refresh_traversal —— 重读
            await call(s, "重读界面树", "macos-use_refresh_traversal", {"pid": pid})

            # 4. press_key_and_traverse —— Escape（计算器里 = 清屏，可逆）
            await call(s, "按键", "macos-use_press_key_and_traverse",
                       {"pid": pid, "keyName": "Escape"})

            # 5. scroll_and_traverse —— 在计算器窗口中间滚一格，再滚回来
            await call(s, "滚动", "macos-use_scroll_and_traverse",
                       {"pid": pid, "x": 400, "y": 700, "deltaY": -3})
            await call(s, "滚动(还原)", "macos-use_scroll_and_traverse",
                       {"pid": pid, "x": 400, "y": 700, "deltaY": 3})

            # 6. press_ax_and_traverse —— 对「8」键发 AXPress
            await call(s, "AX 动作点击", "macos-use_press_ax_and_traverse",
                       {"pid": pid, "x": 194, "y": 833, "width": 48, "height": 48})

            # 7. set_selected_and_traverse —— 计算器没有可选列表，如实记为未覆盖
            results.append(("选中(未覆盖) · set_selected", False,
                            "计算器没有带 AXSelected 的控件 —— 本机未覆盖，如实记"))
            print("  – 选中                    macos-use_set_selected_and_traverse      "
                  "计算器无 AXSelected 控件，本机未覆盖")

            # 8. set_value_and_traverse —— 计算器没有可写文本框，如实记为未覆盖
            results.append(("写值(未覆盖) · set_value", False,
                            "计算器无可写 AXValue 文本框 —— 本机未覆盖，如实记"))
            print("  – 写值                    macos-use_set_value_and_traverse         "
                  "计算器无可写文本框，本机未覆盖")

            # 9. type_and_traverse —— 计算器不接受打字，用 TextEdit 单独测
            print()
            r9 = await call(s, "打字(TextEdit)", "macos-use_open_application_and_traverse",
                            {"identifier": "com.apple.TextEdit"})
            tpid = None
            if r9["result"]:
                for item in r9["result"].content:
                    for line in (getattr(item, "text", "") or "").splitlines():
                        if line.startswith("pid:"):
                            tpid = int(line.split(":")[1].strip())
            if tpid:
                await call(s, "打字", "macos-use_type_and_traverse",
                           {"pid": tpid, "text": "阶段0 打字测试（不保存）"})

    print("\n" + "=" * 78)
    ok = sum(1 for _, o, _ in results if o)
    print(f"合计：{ok}/{len(results)} 项通过")
    print("=" * 78)
    for name, passed, note in results:
        print(f"  {'✓' if passed else '✗'} {name:<32} {note[:70]}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
