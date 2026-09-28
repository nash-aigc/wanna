#!/usr/bin/env python3
"""阶段 1 验收：独立的 Python MCP 客户端连 Wanna 的 MCP 服务端。

回答方案 §八 阶段 1 的两个验收问题：
  1. Wanna 的 MCP server 能被独立测通吗？
  2. 截图里看不到 Wanna 自己吗？

刻意不做任何"内部调用"—— 就是一个外部客户端，走 127.0.0.1 + 令牌，
和将来 Python agent 用的完全是同一条路。

⚠️ 这一版的 API 是按**实测**写的，不是照文档猜的（mcp 2.2.0）：
   - 函数叫 `streamable_http_client`（带下划线）
   - headers 不能直接传，要走 `create_mcp_http_client(headers=…)` 建一个 httpx2 客户端
   - 它 yield 的是 `TransportStreams`（一个元组），按位置取 read/write 最稳
"""

import asyncio
import sys
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

URL = "http://127.0.0.1:8765/mcp"
TOKEN_FILE = Path.home() / "Library/Application Support/Wanna/mcp-token"


def token() -> str:
    return TOKEN_FILE.read_text().strip()


async def probe(headers: dict, label: str) -> bool:
    print(f"\n=== {label} ===")
    http_client = create_mcp_http_client(headers=headers)
    try:
        async with streamable_http_client(URL, http_client=http_client) as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                init = await session.initialize()
                print(f"  ✓ 握手成功 · server={init.server_info.name} v{init.server_info.version}")
                print(f"    协议版本 {init.protocol_version}")

                tools = await session.list_tools()
                print(f"  ✓ tools/list · {len(tools.tools)} 个工具")
                for tool in tools.tools:
                    first = (tool.description or "").strip().splitlines()
                    print(f"     · {tool.name} — {first[0][:58] if first else ''}")

                print("  → 调 screenshot…")
                result = await session.call_tool("screenshot", {})
                print(f"    is_error = {getattr(result, 'is_error', None)}")
                for item in result.content:
                    kind = getattr(item, "type", "?")
                    if kind == "text":
                        for line in (item.text or "").splitlines():
                            print(f"    | {line}")
                    elif kind == "image":
                        raw = getattr(item, "data", "") or ""
                        print(f"    | [图片] mimeType={getattr(item, 'mimeType', '?')} "
                              f"base64 约 {len(raw) * 3 // 4 // 1024} KB")
                return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ✗ {type(exc).__name__}: {str(exc)[:240]}")
        return False
    finally:
        await http_client.aclose()


async def main() -> int:
    good = await probe({"Authorization": f"Bearer {token()}"}, "① 正确令牌")
    if not good:
        print("\n正确令牌都失败 —— 后面鉴权测试没有意义。")
        return 1

    print("\n=== ② 错误令牌（应当被拒）===")
    bad = await probe({"Authorization": "Bearer 0000000000000000"}, "错误令牌")
    print(f"  {'✓ 被拒 —— 鉴权生效' if not bad else '✗ 竟然连上了 —— 鉴权没生效！'}")

    print("\n" + "=" * 68)
    verdict = good and not bad
    print("阶段 1 验收：", "通过 ✓" if verdict else "未通过 ✗")
    return 0 if verdict else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
