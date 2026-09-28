#!/usr/bin/env python3
"""Wanna 的决策大脑 —— OpenAI Agents SDK 那一侧。

## 它在整个系统里的位置

```
用户按住快捷键说话
      ↓
Wanna（Swift）：转写 → 起一个本进程 → 把任务用参数传进来
      ↓
【本脚本】用 OpenAI Agents SDK 决策
      ↓ 通过 MCP（HTTP + 令牌）
Wanna 的 MCP 服务端：截图 / 点击 / 打字 / 读界面…（10 个工具）
      ↓
每一步的结果回到这里 → 继续决策 → 直到做完
      ↓
把最终答复打到 stdout
```

## 为什么 python 不需要任何系统权限

**所有真正碰系统的动作都在 Wanna 里**（截图、点击、打字），本脚本只是"做决定"。
所以它**不需要录屏/辅助功能/麦克风权限** —— 这也意味着它可以先用任意 Python 跑，
不必等"打包进 .app"那一步（打包是为了分发，不是为了权限）。

## 输出约定（给 Swift 那边读）

- **stdout**：最后一行是 `{"type":"final","text":"…"}`；中途每步是 `{"type":"step",…}`
- **stderr**：给人看的日志（Wanna 收进诊断日志）
- 退出码非 0 = 这一轮失败

用法：
    python wanna_agent.py "打开计算器按 7"
    python wanna_agent.py --task "…" --max-steps 20
"""

import argparse
import asyncio
import json
import os
import sys
from contextlib import AsyncExitStack
from pathlib import Path

from agents import Agent, Runner, set_default_openai_api, set_default_openai_client
from agents.mcp import MCPServerStdio, MCPServerStreamableHttp
from openai import AsyncOpenAI

HERE = Path(__file__).resolve().parent
WANNA_TOKEN = Path.home() / "Library/Application Support/Wanna/mcp-token"
WANNA_MCP_URL = "http://127.0.0.1:8765/mcp"

MODEL = os.environ.get("WANNA_AGENT_MODEL", "deepseek-flash")
BASE_URL = os.environ.get("WANNA_AGENT_BASE_URL", "https://api.deepseek.com/v1")
KEY_FILE = HERE / ".deepseek_key"
FIRECRAWL_KEY_FILE = HERE / ".firecrawl_key"

INSTRUCTIONS = """你是 Wanna —— 住在用户 Mac 刘海里的助手。用户用语音给你一句任务，你要**真的做出来**。

你怎么做事：
- 你有一组 mac 桌面工具（截图 / 点击 / 打字 / 按键 / 滚动 / 打开应用 / 读界面 / 写值 / 无障碍按下 / 设置选中）。
- **先看清楚再动手**：不确定界面上有什么，就先 read_screen 或 screenshot。
- **点击时一定要带 `label`（控件原文名字）**：写了它 Wanna 会去界面树里按名字找那个控件的
  真实位置，比只给坐标准得多。不写就只能用你估的坐标 —— 那条路实测只有约 17% 准。
- **动作做完看返回里的「界面变了…」**：如果写的是「界面没有任何变化」，说明那一下**没生效**，
  别当成成功，换个办法再试或如实说没做到。
- 点不动的按钮，换 `press_ax` 试试（它让目标 App 自己执行动作，合成点击有时会被吞掉）。
- 输入框里打字优先用 `type_text`；如果它没写进去，换 `set_value`。
- 列表里选中某一行要用 `set_selected`（普通点击选不中）。

**你的系统提示词最后一段就是「你有哪些技能」的清单**（Wanna 自动追加的）。
动手做一件不熟的事之前先扫一眼那里 —— 看到正合适的就用 `read_file` 把那份技能的正文
读出来**照着做**，别自己硬来。清单里没有、或者你想确认有没有新加的，可以再调 `list_skills`。

**两件用户"看得见"的事，他说是刚需，别漏：**
- **`point`** —— 让屏幕上那个**蓝色光标飞过去指**某个东西。用户说「在哪里」「哪个按钮」
  「指给我看」「怎么找到设置」这类话时**一定要用它** —— 他要的是看见，不是听你描述。
- **`draw`** —— 在屏幕上**圈出来 / 画箭头 / 画线**。用户说「圈出来」「标一下」
  「画个箭头指过去」时用它。
这两个都**不要无缘无故做**：他没要求定位或标注就别调，乱飞的光标和乱画的圈是打扰。

最后：
- 用**一句中文**说清楚你做了什么、结果如何。
- **做不到就如实说做不到**，不要编。编一个没发生的结果比说"没做到"坏得多。
"""


def load_key() -> str:
    if KEY_FILE.exists():
        return KEY_FILE.read_text().strip()
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        return key
    sys.exit("找不到 API key（既没有 .deepseek_key，也没有 DEEPSEEK_API_KEY）")


def emit(payload: dict) -> None:
    """给 Swift 那边读的一行 JSON。"""
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def log(message: str) -> None:
    print(f"[wanna-agent] {message}", file=sys.stderr, flush=True)


def describe(item) -> dict | None:
    kind = type(item).__name__
    if kind == "ToolCallItem":
        raw = getattr(item, "raw_item", None)
        return {"type": "step", "tool": getattr(raw, "name", "?"),
                "arguments": str(getattr(raw, "arguments", ""))[:300]}
    if kind == "ToolCallOutputItem":
        return {"type": "step", "result": str(getattr(item, "output", ""))[:400]}
    return None


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task", nargs="?", default="")
    parser.add_argument("--task", dest="task_opt", default="")
    parser.add_argument("--max-steps", type=int, default=20)
    args = parser.parse_args()
    task = (args.task_opt or args.task).strip()
    if not task:
        sys.exit("没有任务")

    if not WANNA_TOKEN.exists():
        sys.exit(f"Wanna 的令牌文件不存在：{WANNA_TOKEN}（Wanna 在跑吗？）")
    token = WANNA_TOKEN.read_text().strip()

    log(f"任务：{task}")

    client = AsyncOpenAI(base_url=BASE_URL, api_key=load_key())
    set_default_openai_client(client, use_for_tracing=False)
    set_default_openai_api("chat_completions")

    # **firecrawl 用官方的 MCP 服务器**（用户 2026-09-29：「firecrawl 有官方的 mcp，
    # 装那个」）—— 不再走 Wanna 自己那套 `[MCP:…]` 机制。Python 本来就是个 MCP 客户端，
    # 直接连上去就行，Wanna 那边一行都不用管。
    servers: list = []
    if FIRECRAWL_KEY_FILE.exists():
        servers.append(MCPServerStdio(
            params={"command": "npx", "args": ["-y", "firecrawl-mcp"],
                    "env": {**os.environ,
                            "FIRECRAWL_API_KEY": FIRECRAWL_KEY_FILE.read_text().strip()}},
            cache_tools_list=True,
            client_session_timeout_seconds=120,
        ))
    else:
        log("没有 .firecrawl_key，跳过 firecrawl")

    hand = MCPServerStreamableHttp(
        params={"url": WANNA_MCP_URL, "headers": {"Authorization": f"Bearer {token}"}},
        cache_tools_list=True,
        client_session_timeout_seconds=120,
    )

    try:
        async with AsyncExitStack() as stack:
            await stack.enter_async_context(hand)
            for extra in servers:
                await stack.enter_async_context(extra)

            tools = await hand.list_tools()
            log(f"挂上 Wanna 的 {len(tools)} 个工具"
                + (f" + firecrawl（官方 MCP）" if servers else ""))

            # **技能清单常驻系统提示词**（2026-09-29 用户纠正）。
            #
            # 规范是三级披露（见 `~/.claude/skills/skill-creator/SKILL.md`）：
            #   ① 名字 + 描述 —— **在选择阶段就可得**，也就是**在提示词里**
            #   ② 正文 —— 用得上时才读
            #   ③ 附属资源 —— 真要执行时才碰
            #
            # 我第一版把 ① 也做成了"要调 list_skills 才知道" —— 那等于把第一级降成第二级：
            # 模型得**先想到要去看技能**，才看得到技能。跟规范反了。
            # 现在改成启动时拉一次、直接拼进系统提示词；正文仍旧按需 read_file。
            instructions = INSTRUCTIONS
            try:
                listing = await hand.call_tool("list_skills", {})
                skill_text = "\n".join(getattr(i, "text", "") or "" for i in listing.content)
                if skill_text.strip():
                    instructions += ("\n\n## 你有哪些技能（这类事怎么做的方法论）\n\n"
                                     + skill_text.strip()
                                     + "\n\n看到正合适的，就用 `read_file` 把那份技能的正文读出来"
                                       "**照着做** —— 别自己硬来。")
                    log(f"技能清单已注入系统提示词（{len(skill_text)} 字）")
            except Exception as exc:  # noqa: BLE001
                log(f"技能清单没拉到（不影响干活）：{type(exc).__name__}: {exc}")

            agent = Agent(name="Wanna", instructions=instructions,
                          model=MODEL, mcp_servers=[hand] + servers)

            result = await Runner.run(agent, task, max_turns=args.max_steps)

            for item in result.new_items:
                described = describe(item)
                if described:
                    emit(described)

            final_text = (result.final_output or "").strip()
            emit({"type": "final", "text": final_text})
            log(f"完成：{final_text[:120]}")
            return 0
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "text": f"{type(exc).__name__}: {exc}"})
        log(f"失败：{type(exc).__name__}: {exc}")
        return 1
    finally:
        await client.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
