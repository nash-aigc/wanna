#!/usr/bin/env python3
"""阶段 0 · 第一步：只验 MCP 这条链，不花任何模型额度。

回答两个问题：
  1. 那只「手」（mcp-server-macos-use）能不能被独立拉起来、握手、列出工具？
  2. 调一个**只读**工具（读界面树）能不能真的返回东西？

只读：这一步不点、不打字、不改变机器状态。
"""

import asyncio
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MCP_SERVER = "/Users/mjm/Documents/SuperAgent/Agent/Mcp/mcp-server-macos-use/.build/debug/mcp-server-macos-use"


def _text_of(result) -> str:
    """把 MCP 的 content 数组拼成纯文本。"""
    parts = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts)


async def main() -> int:
    params = StdioServerParameters(command=MCP_SERVER, args=[], env=None)

    print("① 拉起 MCP server（stdio）…")
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            init = await session.initialize()
            # 注意：Python SDK 是 snake_case（server_info / protocol_version），
            # 不是 MCP 规范 JSON 里的 camelCase —— 写错会抛 AttributeError，
            # 而握手其实已经成功了（这个坑先记下）。
            print(f"   ✓ 握手成功 · server={init.server_info.name} v{init.server_info.version}")
            print(f"   ✓ 协议版本 {init.protocol_version}")

            print("\n② tools/list —— 这只「手」有什么：")
            tools = await session.list_tools()
            for tool in tools.tools:
                first_line = (tool.description or "").strip().splitlines()
                summary = first_line[0] if first_line else ""
                print(f"   · {tool.name}")
                print(f"       {summary[:100]}")
            print(f"   共 {len(tools.tools)} 个工具")

            print("\n③ 调一个**只读**工具：读「访达」的界面树")
            # 只读：open_application_and_traverse 只激活 App + 读树，不点不动。
            # ⚠️ 实测：identifier 传英文名 "Finder" 会返回
            #    error: Application not found for identifier: 'Finder'
            #    所以要用 **bundle id**（或系统语言下的 App 名）。这条要写进记录。
            result = await session.call_tool(
                "macos-use_open_application_and_traverse",
                {"identifier": "com.apple.finder"},
            )
            body = _text_of(result)
            print(f"   is_error = {getattr(result, 'is_error', None)}")
            print(f"   返回 {len(body)} 字符，前 400 字符：")
            for line in body[:400].splitlines():
                print(f"     | {line}")

    print("\n✓ 结论：MCP 这条链（起进程 → 握手 → 列工具 → 调工具）整条通了。")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
