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
from agents.mcp import MCPServerStreamableHttp
from openai import AsyncOpenAI

from local_trace import install_local_trace_processor

HERE = Path(__file__).resolve().parent
WANNA_TOKEN = Path.home() / "Library/Application Support/Wanna/mcp-token"
WANNA_MCP_URL = "http://127.0.0.1:8765/mcp"

MODEL = os.environ.get("WANNA_AGENT_MODEL", "deepseek-flash")
BASE_URL = os.environ.get("WANNA_AGENT_BASE_URL", "https://api.deepseek.com/v1")
KEY_FILE = HERE / ".deepseek_key"

INSTRUCTIONS = """你是 Wanna，住在用户 Mac 刘海里的助手。用户说一句任务，你就真的把它做出来。"""

# **为什么只有一句话**（用户 2026-09-29 定的，这是设计原则不是偷懒）：
#
# 以前要把「怎么点、怎么打字、点不动怎么办」全写进系统提示词，是因为**框架当时没有那些能力** ——
# 模型只会写字，所以得在提示词里教它。
#
# 现在不一样了：那些做法都包成了**技能**（`skills/` 下的 SKILL.md）和**工具**（Wanna 的 18 个 MCP 工具），
# 模型**调用的时候自然读得到怎么做**，没有必要在提示词里重复一遍。
#
# 而且官方 Agent Skills 规范也是这么分的：提示词里放**清单**（名字 + 描述），
# 正文**按需读**（见 `agents/sandbox/capabilities/skills.py` 的 _SKILLS_SECTION_INTRO）。
#
# 所以这里的规矩是：**能说一句话就不说两句。** 想加内容之前先问自己 ——
# 「这条该放进某个技能吗？」—— 多半是。


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

    # **追踪写到本地文件、一个字节都不外发**（2026-09-29 用户选的方案②）。
    #
    # 官方给非 OpenAI 模型的首选是"给 exporter 一个 OpenAI key、用官方 Traces 面板"，
    # 但那条会把每个 span POST 到 api.openai.com —— 而 span 里装的是工具参数
    # 与**工具返回**（对我们就是整棵界面文本、读到的文件内容）。
    # 这个仓库已经因为同样的理由删过一次 PostHog，所以走官方明写的第二条路：
    # "custom trace processors to push traces to other destinations (as a replacement…)"。
    #
    # ⚠️ 必须是 `set_trace_processors`（替换）而不是 `add_trace_processor`（追加）——
    # 追加的话默认那个往 OpenAI 发的 exporter 还在，等于没改。
    install_local_trace_processor()

    # **只有 Wanna 自己这一个 MCP**（2026-09-29 用户拍板删掉 firecrawl）。
    #
    # 用户原话：「把这个 Firecrawl MCP 删掉，因为它只是一个搜索工具。现在用
    # AnySearch 这个技能，其实也能实现很好的功能和效果。」
    #
    # 这是**极简逻辑：功能重复就只留一个**。AnySearch 已经是一个技能（走三级披露 ——
    # 描述常驻约 130 字、正文按需读），而 firecrawl 是 **27 个工具全量进上下文、
    # 46 604 字符**。同一件事，留成本低的那个。
    #
    # ⚠️ 以后**再想加 MCP / 工具 / 权限之前，先问一句"这个功能是不是已经有了"** ——
    # 重复的要提醒用户，而不是顺手装上（用户 2026-09-29：「用户要求安装时，你也应该
    # 提醒用户，符合极简逻辑」）。用户已经默认的那些保留，但不自动加新的。
    hand = MCPServerStreamableHttp(
        params={"url": WANNA_MCP_URL, "headers": {"Authorization": f"Bearer {token}"}},
        cache_tools_list=True,
        client_session_timeout_seconds=120,
    )

    try:
        async with AsyncExitStack() as stack:
            await stack.enter_async_context(hand)

            tools = await hand.list_tools()
            log(f"挂上 Wanna 的 {len(tools)} 个工具")

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
                          model=MODEL, mcp_servers=[hand])

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
