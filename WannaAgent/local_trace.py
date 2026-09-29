"""把 Agents SDK 的追踪写到本地文件 —— 官方 `TracingProcessor` 的一个实现。

## 为什么是这个方案（2026-09-29 用户选的）

官方文档给非 OpenAI 模型的首选是"给 exporter 一个 OpenAI key，用官方 Traces 面板"
（*"you can provide an OpenAI API key to the tracing exporter to enable free tracing
in the OpenAI Traces dashboard"*）。**但那个方案会把 span 上传到 `api.openai.com`**，
而一个 span 里装的是：

    FunctionSpanData.__slots__ = ("name", "input", "output", "mcp_data")

`input` 是工具参数（用户打的字、文件路径、搜索词），`output` 是工具返回
—— 对我们就是 `read_screen` 读到的**整棵界面文本**、`read_file` 读到的**文件内容**。

**这个仓库已经因为同样的理由删过一次 PostHog**（上传用户的原始转写、模型的原始回复、
用户邮箱）。所以走官方文档明写的第二条路：

    "you can set up custom trace processors to push traces to other destinations
     (as a replacement, or secondary destination)"

`set_trace_processors()` 是**替换**语义（不是 `add_trace_processor()` 的追加）——
所以装上它之后，**一个字节都不会再往 OpenAI 发**。

## 写在哪、长什么样

`~/Library/Application Support/Wanna/Agent追踪.log`，JSONL，一行一个事件 ——
与这个仓库另外两条诊断日志（`主Agent诊断.log` / `录音诊断.log`）**同一个目录、同一个形状**。
判据是"出问题能直接 grep"，不是"好看"。

## 三条官方约束（照 `processor_interface.py` 的 docstring 写的）

- *"All methods should be thread-safe"* → 一把 `Lock`。
- *"Methods should not block for long periods"* → 只做一次 `write`，不解析不格式化重的。
- *"Handle errors gracefully to prevent disrupting agent execution"* → 全部 `try/except`，
  **追踪写不进去绝不能弄坏那一轮任务**。
"""

from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import Any

from agents.tracing import TracingProcessor, set_trace_processors

LOG_PATH = Path.home() / "Library/Application Support/Wanna/Agent追踪.log"
# 与 MainFlowDiagnostics 同一条规矩：2MB 轮转，只留一份上一代。
MAXIMUM_LOG_BYTES = 2 * 1024 * 1024


def _span_kind(span: Any) -> str:
    """span 的类型名，取不到就空串 —— 只为日志里能一眼分类。"""
    try:
        return str(span.span_data.type)
    except Exception:  # noqa: BLE001
        return ""


def _span_payload(span: Any) -> dict[str, Any] | None:
    """span 自带的 `export()` —— 官方给的序列化口子，别自己拆字段。

    拿到之后**逐字段收缩**：不收缩的话一条 `screenshot` 就是 344 KB
    （整张图的 base64），日志几轮就轮转掉、而且 grep 出来是一屏乱码。
    """
    try:
        return _shrink(span.span_data.export())
    except Exception:  # noqa: BLE001
        return None


# 单个字段最多留多少字符。够看清"它传了什么、回了什么"，
# 又不至于把日志撑爆（实测：不设上限时一条 screenshot 就 344 KB）。
MAXIMUM_FIELD_CHARACTERS = 4_000
# 一长串 base64 字母数字（没有空白）就是这个长度 —— 判定为"二进制"，整段换掉。
BASE64_BLOB_PATTERN = re.compile(r"[A-Za-z0-9+/=]{200,}")


def _shrink(value: Any) -> Any:
    """把要写进日志的值压到可读的尺寸。**只影响日志，不影响任务。**"""
    if isinstance(value, dict):
        return {key: _shrink(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_shrink(inner) for inner in value]
    if not isinstance(value, str):
        return value

    # 图片 / 附件：整段 base64 或 data URI，替换成一句人话
    if value.startswith("data:") or BASE64_BLOB_PATTERN.search(value):
        return f"<省略二进制内容 {len(value):,} 字节>"

    if len(value) > MAXIMUM_FIELD_CHARACTERS:
        return (value[:MAXIMUM_FIELD_CHARACTERS]
                + f"…（共 {len(value):,} 字符，已截断）")
    return value


class LocalTraceProcessor(TracingProcessor):
    """把每一次 run 的 step / 工具调用 / 模型调用写成一行 JSON。

    记的是**事件的骨架 + span 自己的 export()**：类型、名字、起止时间、
    以及工具调用/模型调用的输入输出。这样"它这一步到底做了什么"有据可查 ——
    在此之前 Python 那一侧只有 `{"type":"step","tool":"click"}` 这种一行，
    没有耗时、没有参数、没有返回。
    """

    def __init__(self, log_path: Path = LOG_PATH) -> None:
        self._log_path = log_path
        self._lock = threading.Lock()
        self._span_started_at: dict[str, float] = {}
        self._write({"event": "启动追踪（本地文件，不上传）", "path": str(log_path)})

    # ── 内部：写入 ────────────────────────────────────────────────────────

    def _write(self, payload: dict[str, Any]) -> None:
        """一行 JSON + 换行。**绝不抛异常** —— 追踪不能弄坏任务。"""
        try:
            with self._lock:
                self._rotate_if_needed_locked()
                self._log_path.parent.mkdir(parents=True, exist_ok=True)
                line = json.dumps(payload, ensure_ascii=False, default=str)
                with self._log_path.open("a", encoding="utf-8") as handle:
                    handle.write(f"[{time.strftime('%m-%d %H:%M:%S')}] {line}\n")
        except Exception:  # noqa: BLE001
            pass

    def _rotate_if_needed_locked(self) -> None:
        try:
            if self._log_path.exists() and self._log_path.stat().st_size > MAXIMUM_LOG_BYTES:
                self._log_path.with_suffix(".log.1").unlink(missing_ok=True)
                self._log_path.rename(self._log_path.with_suffix(".log.1"))
        except Exception:  # noqa: BLE001
            pass

    # ── 官方要求实现的六个方法 ────────────────────────────────────────────

    def on_trace_start(self, trace: Any) -> None:
        self._write({"event": "trace 开始", "trace_id": getattr(trace, "trace_id", None),
                     "workflow": getattr(trace, "name", None)})

    def on_trace_end(self, trace: Any) -> None:
        self._write({"event": "trace 结束", "trace_id": getattr(trace, "trace_id", None)})

    def on_span_start(self, span: Any) -> None:
        span_id = getattr(span, "span_id", None)
        if span_id:
            self._span_started_at[span_id] = time.monotonic()

    def on_span_end(self, span: Any) -> None:
        span_id = getattr(span, "span_id", None)
        started_at = self._span_started_at.pop(span_id, None) if span_id else None
        self._write({
            "event": "span",
            "kind": _span_kind(span),
            "span_id": span_id,
            "parent_id": getattr(span, "parent_id", None),
            # 毫秒整数：日志要能直接排序、直接比较，不要 `3.2999999`
            "duration_ms": int((time.monotonic() - started_at) * 1000) if started_at else None,
            "data": _span_payload(span),
        })

    def shutdown(self) -> None:
        self._write({"event": "追踪关闭"})

    def force_flush(self) -> None:
        """我们没有队列 —— 每次 `on_span_end` 已经落盘了，所以这里是空操作。

        官方要求实现它（"Should process all queued items before returning"），
        我们**没有排队**，所以没有东西可 flush。
        """


def install_local_trace_processor(log_path: Path = LOG_PATH) -> LocalTraceProcessor:
    """装上本地处理器。**用 `set_trace_processors` 而不是 `add_trace_processor`** ——

    官方对两者的区别写得很清楚：
      · `add_trace_processor()` —— 追加一个，**默认那个往 OpenAI 发的仍然在**
      · `set_trace_processors()` —— **替换**，不装 OpenAI 的 exporter 就不会往外发

    我们要的是"一个字节都不出去"，所以必须是**替换**。
    """
    processor = LocalTraceProcessor(log_path)
    set_trace_processors([processor])
    return processor
