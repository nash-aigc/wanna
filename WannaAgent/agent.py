#!/usr/bin/env python3
"""阶段 0 · 第二步：Python agent（OpenAI Agents SDK）+ 已有的 MCP 那只手。

用法：
    .venv/bin/python agent.py "指令"

刻意与 Wanna 零关系：不 import 它的任何东西、不碰它的代码、不共用它的配置。
唯一共用的东西是**那只手**（mcp-server-macos-use），而它是独立进程。

模型：deepseek-flash（DeepSeek 官方端点）。
    走 chat_completions —— 已实测官方端点两条路由都在，但 Agents SDK 默认走
    Responses API，所以必须显式切。
"""

import asyncio
import os
import sys
from pathlib import Path

from agents import Agent, Runner, set_default_openai_api, set_default_openai_client
from agents.mcp import MCPServerStdio
from openai import AsyncOpenAI

HERE = Path(__file__).resolve().parent
MCP_SERVER = "/Users/mjm/Documents/SuperAgent/Agent/Mcp/mcp-server-macos-use/.build/debug/mcp-server-macos-use"
KEY_FILE = HERE / ".deepseek_key"
MODEL_NAME = "deepseek-flash"

INSTRUCTIONS = """你是 Wanna 的「执行层」原型。用户给你一句话，你要真的把它做出来。

规矩：
- 你有一组 macOS 桌面工具（打开应用 / 读界面树 / 点击 / 打字 / 按键 / 滚动）。
- **identifier 必须用 bundle id**（例如访达 com.apple.finder、计算器 com.apple.calculator），
  传英文名会返回 "Application not found"。
- 每次点击前，先用 open_application_and_traverse 或 refresh_traversal 拿到界面树，
  从树里读出元素的真实 x/y/w/h，**不要凭记忆猜坐标**。
- 点完之后要读一次界面树确认结果，确认不了就照实说。
- 做完给一句中文总结：你做了什么、结果如何。**不要编**。
"""


def load_api_key() -> str:
    if not KEY_FILE.exists():
        sys.exit(f"缺少 key 文件：{KEY_FILE}")
    return KEY_FILE.read_text().strip()


def describe_item(item) -> str | None:
    """把一次工具调用/返回压成一行，用于实测记录。"""
    kind = type(item).__name__
    if kind == "ToolCallItem":
        raw = getattr(item, "raw_item", None)
        name = getattr(raw, "name", "?")
        args = getattr(raw, "arguments", "")
        return f"→ 调用 {name}  参数 {str(args)[:200]}"
    if kind == "ToolCallOutputItem":
        out = str(getattr(item, "output", ""))[:300].replace("\n", " ⏎ ")
        return f"← 返回 {out}"
    if kind == "MessageOutputItem":
        raw = getattr(item, "raw_item", None)
        text = getattr(raw, "content", "")
        if isinstance(text, list):
            text = " ".join(getattr(c, "text", "") for c in text)
        return f"💬 {str(text)[:300]}"
    return None


async def main() -> int:
    instruction = sys.argv[1] if len(sys.argv) > 1 else "打开访达，告诉我它窗口里有哪些按钮。"

    print(f"模型   : {MODEL_NAME} @ https://api.deepseek.com")
    print(f"指令   : {instruction}")
    print("-" * 70)

    client = AsyncOpenAI(base_url="https://api.deepseek.com/v1", api_key=load_api_key())
    set_default_openai_client(client, use_for_tracing=False)
    set_default_openai_api("chat_completions")

    params = {
        "command": MCP_SERVER,
        "args": [],
        "env": dict(os.environ),
        "cwd": str(HERE),
        "encoding": "utf-8",
        "encoding_error_handler": "replace",
    }

    async with MCPServerStdio(params=params, cache_tools_list=True, client_session_timeout_seconds=60) as hand:
        tools = await hand.list_tools()
        print(f"MCP 工具: {len(tools)} 个已挂上")
        print("-" * 70)

        agent = Agent(
            name="Wanna执行层原型",
            instructions=INSTRUCTIONS,
            model=MODEL_NAME,
            mcp_servers=[hand],
        )

        step = 0
        result = await Runner.run(agent, instruction, max_turns=12)
        for item in result.new_items:
            line = describe_item(item)
            if line:
                step += 1
                print(f"[{step:02d}] {line}")

        print("-" * 70)
        print("最终回答：")
        print(result.final_output)
        print("-" * 70)
        print(f"共 {step} 条交互条目 · 最终 agent={result.last_agent.name}")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
