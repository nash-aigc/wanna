#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 models-catalog.json —— 「模型」页的三厂商模型目录（火山方舟 / 阿里百炼 / MiniMax）。

数据源（只读文档与本地数据；**生成过程不调用任何模型 API**）：
  - 阿里百炼：本地 skills/bailian-docs-llm-wiki/models/（models.jsonl + groups/*.json）
  - 火山方舟：arkcli 场景表 + 火山方舟技能 + 用户控制台截图实证（如 3D 三个模型）
  - MiniMax：platform.minimax.io 官方 docs（端点/参数取自官方示例 curl）

§61 口径（用户 2026-10-04 补充，取代 §60 的同族合并）：
  **官网存在的模型全部各占一行** —— flash/pro/highspeed 等相似模型虽像，但细节有差异，
  都要显示（family 字段标出同族关系）。价格结构化（input/output token 价或按次价），
  供「预计扣费」二次确认使用。
"""
import json, os, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAILIAN = os.path.expanduser("~/.agents/skills/bailian-docs-llm-wiki/models")

TYPES = ["文本生成", "推理思考", "视觉理解", "图像生成", "视频生成", "语音识别",
         "语音合成", "实时语音", "嵌入向量", "音乐生成", "3D生成"]

CAP2TYPE = {
    "TG": ["文本生成"], "Reasoning": ["推理思考"], "VU": ["视觉理解"],
    "IG": ["图像生成"], "VG": ["视频生成"], "ASR": ["语音识别"], "TTS": ["语音合成"],
    "Realtime-ASR": ["实时语音"], "Realtime-Omni": ["实时语音"], "Realtime-Chatting": ["实时语音"],
    "Realtime-Audio-Translate": ["实时语音"], "Realtime-Text-to-Speech": ["实时语音"],
    "Multimodal-Omni": ["文本生成"], "ME": ["嵌入向量"], "TR": ["文本生成"],
    "World-Model": ["视频生成"], "3D-generation": ["3D生成"],
}
TYPE2KIND = {"文本生成": "chat", "推理思考": "chat", "视觉理解": "chat", "图像生成": "image",
             "视频生成": "video", "语音识别": "asr", "语音合成": "tts", "实时语音": "realtime",
             "嵌入向量": "embedding", "音乐生成": "music", "3D生成": "none"}

ENDPOINTS = {
    "volcano": {
        "chat": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        "image": "https://ark.cn-beijing.volces.com/api/v3/images/generations",
        "video": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
        "tts": "https://ark.cn-beijing.volces.com/api/v3/audio/speech",
        "asr": "https://ark.cn-beijing.volces.com/api/v3/audio/transcriptions",
        "embedding": "https://ark.cn-beijing.volces.com/api/v3/embeddings",
    },
    "bailian": {
        "chat": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        "image": "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
        "video": "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
        "tts": "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
        "asr": "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
        "embedding": "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
    },
    "minimax": {
        "chat": "https://api.minimax.io/v1/chat/completions",
        "image": "https://api.minimax.io/v1/image_generation",
        "video": "https://api.minimax.io/v2/video_generation",
        "tts": "https://api.minimax.io/v1/t2a_v2",
        "asr": "https://api.minimax.io/v1/speech_to_text",
        "music": "https://api.minimax.io/v1/music_generation",
    },
}
# 异步任务轮询端点（§61 运行状态用）
POLL = {
    "volcano": {"video": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}"},
    "bailian": {"image": "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}/results",
                "video": "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}/results"},
    "minimax": {"video": "https://api.minimax.io/v2/query/video_generation/{task_id}"},
}
DOC = {
    "volcano_list": "https://www.volcengine.com/docs/82379/1553586",
    "minimax_overview": "https://platform.minimax.io/docs/api-reference/api-overview",
    "minimax_chat": "https://platform.minimax.io/docs/api-reference/text-chat-openai",
    "minimax_video": "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
    "minimax_video_query": "https://platform.minimax.io/docs/api-reference/video-generation-v2-query",
    "minimax_tts": "https://platform.minimax.io/docs/api-reference/speech-t2a-http",
    "minimax_asr": "https://platform.minimax.io/docs/api-reference/speech-to-text",
    "minimax_image": "https://platform.minimax.io/docs/api-reference/image-generation-t2i",
    "minimax_music": "https://platform.minimax.io/docs/api-reference/music-generation",
}

def P(name, defv, desc="", typ="string", options=None, required=False):
    d = {"name": name, "def": defv, "desc": desc, "type": typ}
    if options: d["options"] = options
    if required: d["required"] = True
    return d

# ── 参数全集（§61：官方文档支持的参数尽量写全；def=None = 默认不传 = 只有用户填了才带上）──
PARAMS = {
    ("volcano", "chat"): [
        P("prompt", "你好，请介绍一下你自己", "用户消息（模板放进 messages）", "string", required=True),
        P("temperature", 0.7, "采样温度（官方默认 0.7）", "number"),
        P("top_p", None, "核采样", "number"),
        P("max_tokens", None, "最大生成 token", "number"),
        P("stream", False, "流式输出", "bool"),
        P("stream_options", None, '流式附加项，JSON 如 {"include_usage":true}', "json"),
        P("seed", None, "随机种子", "number"),
        P("stop", None, '停止串，JSON 数组如 ["\\n\\n"]', "json"),
        P("thinking", None, '深度思考，JSON 如 {"type":"disabled"}（思考模型）', "json"),
        P("response_format", None, '响应格式，JSON 如 {"type":"json_object"}', "json"),
        P("tools", None, '工具调用，JSON Function 数组（见官方 tool call 文档）', "json"),
        P("tool_choice", None, '工具选择策略，如 "auto" / JSON', "json"),
        P("presence_penalty", None, "存在惩罚", "number"),
        P("frequency_penalty", None, "频率惩罚", "number"),
    ],
    ("bailian", "chat"): [
        P("prompt", "你好，请介绍一下你自己", "用户消息（模板放进 messages）", "string", required=True),
        P("temperature", 1.0, "采样温度（官方默认 1.0，范围 0~2）", "number"),
        P("top_p", 0.8, "核采样（官方默认 0.8）", "number"),
        P("max_tokens", None, "最大生成 token", "number"),
        P("stream", False, "流式输出", "bool"),
        P("enable_thinking", False, "开启深度思考（qwen3 系列）", "bool"),
        P("thinking_budget", None, "思考 token 预算（需 enable_thinking）", "number"),
        P("seed", None, "随机种子", "number"),
        P("stop", None, '停止串，JSON 数组', "json"),
        P("response_format", None, '响应格式，JSON 如 {"type":"json_object"}', "json"),
        P("tools", None, '工具调用，JSON Function 数组', "json"),
        P("tool_choice", None, '工具选择策略', "json"),
        P("presence_penalty", None, "存在惩罚（-2~2）", "number"),
        P("frequency_penalty", None, "频率惩罚（-2~2）", "number"),
    ],
    ("minimax", "chat"): [
        P("prompt", "Which is bigger, 9.11 or 9.9?", "用户消息（官方示例原句）", "string", required=True),
        P("temperature", None, "采样温度（留空=官方默认）", "number"),
        P("top_p", None, "核采样", "number"),
        P("max_completion_tokens", 500, "最大补全 token（官方示例 500）", "number"),
        P("stream", False, "流式输出", "bool"),
        P("reasoning_effort", None, "思考深度（M3/M3.1，默认 max）", "select",
          ["low", "medium", "high", "xhigh", "max"]),
        P("thinking", None, '思考模式，JSON 如 {"type":"adaptive"}（M3 系列）', "json"),
        P("response_format", None, '响应格式，JSON 如 {"type":"json_object"}', "json"),
        P("tools", None, '工具调用，JSON Function 数组', "json"),
        P("tool_choice", None, '工具选择策略', "json"),
        P("stop", None, '停止串，JSON 数组', "json"),
    ],
    ("volcano", "image"): [
        P("prompt", "一只戴红色围巾的柴犬，摄影风格", "文生图提示词", "string", required=True),
        P("size", "1024x1024", "图片尺寸", "string"),
        P("n", 1, "生成张数", "number"),
        P("seed", None, "随机种子", "number"),
        P("guidance_scale", None, "提示词强度", "number"),
        P("water_mark_enabled", None, "是否加水印", "bool"),
    ],
    ("bailian", "image"): [
        P("prompt", "一只戴红色围巾的柴犬，摄影风格", "文生图提示词", "string", required=True),
        P("size", "1024*1024", "图片尺寸（宽*高）", "string"),
        P("n", 1, "生成张数", "number"),
        P("seed", None, "随机种子", "number"),
        P("prompt_extend", None, "智能改写提示词", "bool"),
        P("watermark_enabled", None, "是否加水印", "bool"),
    ],
    ("minimax", "image"): [
        P("prompt", "A man in a white t-shirt, full-body, standing front view, outdoors, film grain, photorealistic.",
          "文生图提示词（官方示例原句）", "string", required=True),
        P("aspect_ratio", "16:9", "宽高比", "select", ["1:1", "4:3", "3:4", "16:9", "9:16"]),
        P("n", 3, "生成张数（官方示例 3）", "number"),
        P("response_format", "url", "返回格式", "select", ["url", "base64"]),
        P("prompt_optimizer", True, "提示词自动优化", "bool"),
    ],
    ("volcano", "video"): [
        P("prompt", "史诗太空歌剧预告片：女舰长站在巨大舷窗前，舰队依次跃迁离开", "视频提示词", "string", required=True),
        P("duration", None, "时长秒数（各模型上限不同）", "number"),
        P("ratio", "16:9", "画幅比", "select", ["16:9", "9:16", "1:1", "4:3", "3:4"]),
        P("seed", None, "随机种子", "number"),
        P("camerafixed", None, "固定镜头", "bool"),
        P("callback_url", None, "任务完成回调 URL", "string"),
    ],
    ("bailian", "video"): [
        P("prompt", "一只柴犬在草地上奔跑，阳光明媚", "视频提示词", "string", required=True),
        P("size", "1280*720", "视频尺寸（宽*高）", "string"),
        P("duration", None, "时长秒数（留空=模型默认）", "number"),
        P("seed", None, "随机种子", "number"),
        P("prompt_extend", None, "智能改写提示词", "bool"),
    ],
    ("minimax", "video"): [
        P("prompt", "Epic space-opera theatrical teaser: a female captain stands before a massive observation window as the fleet jumps away.",
          "视频提示词（官方示例原句）", "string", required=True),
        P("duration", None, "时长秒（4~15，留空=模型默认）", "number"),
        P("resolution", None, "分辨率，如 768P / 2K（留空=模型默认）", "string"),
    ],
    ("volcano", "tts"): [
        P("text", "你好，这是一段火山方舟语音合成示例。", "要合成的文本", "string", required=True),
        P("voice", None, "音色 id（见官方音色列表）", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "pcm", "ogg", "aac"]),
        P("speed", 1.0, "语速", "number"),
        P("sample_rate", None, "采样率", "number"),
        P("volume", None, "音量", "number"),
        P("pitch", None, "音调", "number"),
    ],
    ("bailian", "tts"): [
        P("text", "你好，这是一段通义语音合成示例。", "要合成的文本", "string", required=True),
        P("voice", None, "音色 id，如 longxiaochun_v2（见音色列表）", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "pcm", "opus", "aac"]),
        P("sample_rate", 24000, "采样率", "number"),
        P("rate", None, "语速倍率（如 1.5）", "number"),
        P("volume", None, "音量", "number"),
        P("pitch", None, "音调", "number"),
        P("pronunciation_dict", None, "发音词典，JSON（见官方文档）", "json"),
    ],
    ("minimax", "tts"): [
        P("text", "Omg(sighs), the real danger is not that computers start thinking like people.",
          "要合成的文本（官方示例原句）", "string", required=True),
        P("voice_id", None, "音色 id（Get Voice API / 系统音色表）", "string", required=True),
        P("speed", 1, "语速 0.5~2", "number"),
        P("vol", 1, "音量 0~10", "number"),
        P("pitch", 0, "音调 -12~12", "number"),
        P("format", "mp3", "输出格式", "select", ["mp3", "pcm", "flac", "wav"]),
        P("sample_rate", None, "采样率", "number"),
        P("stream", False, "流式输出", "bool"),
        P("language_boost", None, "语言增强，如 Mandarin / English", "string"),
        P("pronunciation_dict", None, "发音词典，JSON（见官方文档）", "json"),
    ],
    ("volcano", "asr"): [
        P("audio_url", "https://example.com/audio.mp3", "音频文件 URL", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "ogg", "m4a", "aac"]),
        P("sample_rate", None, "采样率", "number"),
    ],
    ("bailian", "asr"): [
        P("file_url", "https://example.com/audio.mp3", "音频文件 URL", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "ogg", "m4a", "aac", "flac"]),
        P("sample_rate", 16000, "采样率", "number"),
        P("language_hint", None, "语言提示，如 zh / en", "string"),
    ],
    ("minimax", "asr"): [
        P("file", "audio.mp3", "本地音频文件路径（multipart 上传）", "string", required=True),
        P("response_format", "json", "返回格式", "select", ["json"]),
        P("timestamp_level", "word", "时间戳粒度", "select", ["word", "sentence"]),
        P("stream", "false", "流式（官方示例为字符串 false）", "string", options=["true", "false"]),
    ],
    ("volcano", "embedding"): [
        P("text", "要向量化的文本", "输入文本", "string", required=True),
        P("dimensions", None, "输出维度（模型支持时）", "number"),
    ],
    ("bailian", "embedding"): [
        P("texts", "要向量化的文本", "输入文本（数组第一项）", "string", required=True),
        P("text_type", "query", "文本类型", "select", ["query", "document"]),
        P("dimension", None, "输出维度（留空=模型默认）", "number"),
    ],
    ("minimax", "music"): [
        P("prompt", "Indie folk, melancholic, introspective, longing, solitary walk, coffee shop",
          "音乐风格提示（官方示例原句）", "string", required=True),
        P("lyrics", "[verse]\nStreetlights flicker, the night breeze sighs\n[chorus]\nPushing the wooden door, the aroma spreads",
          "歌词（[verse]/[chorus] 分段；留空=纯音乐）", "string"),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "flac"]),
        P("sample_rate", 44100, "采样率", "number"),
        P("bitrate", 256000, "码率", "number"),
        P("music_duration", None, "时长秒（留空=默认）", "number"),
    ],
}

def parse_price(it):
    """结构化价格：token 价（input/output 每百万）或按次/其它价 —— 供「预计扣费」使用。
    models.jsonl 用平铺 `prices`（{type,unit,price}）；groups 明细用 `multiPrices`（分档包一层）。"""
    tok_in = tok_out = None
    unit = None
    other = None
    entries = []
    for p in (it.get("prices") or []):
        entries.append(p)
    # 分档价优先取首档（rangeStart=0，如「输入<=32k」），否则会拿到高价档
    bands = sorted((it.get("multiPrices") or []), key=lambda b: 0 if b.get("rangeStart") == 0 else 1)
    for band in bands:
        entries.extend(band.get("prices") or [])
    for p in entries:
        t = p.get("type")
        if t == "input_token" and tok_in is None:      # 首档生效：后档不得覆盖（否则拿到的是最高档价）
            tok_in = p.get("price"); unit = p.get("unit") or p.get("priceUnit") or "每百万tokens"
        elif t == "output_token" and tok_out is None:
            tok_out = p.get("price")
        elif other is None and p.get("price") is not None:
            other = {"price": p.get("price"), "unit": p.get("unit") or p.get("priceUnit") or "",
                     "name": p.get("priceName") or p.get("type") or ""}
    if tok_in is not None:
        return {"input": tok_in, "output": tok_out, "unit": unit}
    if other:
        return {"other": other}
    return None

def load_bailian():
    """§61 全量：阿里自家每个模型一行（不再按家族合并；相似模型细节差异也保留）。"""
    models = []
    for line in open(os.path.join(BAILIAN, "models.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        if r.get("provider") not in ("qwen", "qwen-domain-model", "wan"):
            continue
        cap = (r.get("capabilities") or ["TG"])[0]
        types = CAP2TYPE.get(cap, ["文本生成"])
        kind = TYPE2KIND[types[0]]
        endpoint = ENDPOINTS["bailian"].get(kind)
        if kind == "image" and re.search(r"edit|i2i|图像编辑|图生图", (r.get("name") or "") + (r.get("family") or ""), re.I):
            endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis"
        official = None
        gpath = os.path.join(BAILIAN, "groups", f"{r.get('family')}.json")
        if kind == "chat" and os.path.exists(gpath):
            try:
                g = json.load(open(gpath, encoding="utf-8"))
                for gi in g.get("items", []):
                    sam = (gi.get("samples") or {}).get("openai", {}).get("completionsAPI", {})
                    if sam and (gi.get("model") == r.get("model") or not official):
                        official = {"python": sam.get("python"), "curl": sam.get("curl")}
                        if gi.get("model") == r.get("model"):
                            break
            except Exception:
                pass
        profile = r.get("profile") or {}
        desc = (r.get("description") or "").strip() or (profile.get("oneLinePositioning") or "")
        scenes = profile.get("scenes") or []
        price = parse_price(r)
        if price is None and os.path.exists(gpath):
            # 行内 prices 常缺（如 qwen3-max）—— 家族明细 groups/*.json 的 multiPrices 是完整价
            try:
                g2 = json.load(open(gpath, encoding="utf-8"))
                for gi in g2.get("items", []):
                    if gi.get("model") == r.get("model") or not price:
                        price = parse_price(gi)
                        if price:
                            if gi.get("model") == r.get("model"):
                                break
            except Exception:
                pass
        models.append({
            "vendor": "bailian", "id": r.get("model") or "", "name": r.get("name") or "",
            "family": r.get("family") or "", "types": types, "kind": kind,
            "desc": desc[:220], "example": ("、".join(scenes[:3]) + "…") if scenes else "",
            "ctx": r.get("contextWindow"), "price": price,
            "offline": bool(r.get("offlineInfo")),
            "docUrl": r.get("docUrl") or "https://docs.bailian.console.aliyun.com/zh/model-studio",
            "endpoint": endpoint, "officialSample": official, "variants": [],
        })
    return models

def load_volcano():
    """火山方舟全量（实证 ID）：arkcli 场景表 + 技能清单 + 用户控制台截图（3D 三个模型）。"""
    V = ENDPOINTS["volcano"]; L = DOC["volcano_list"]
    def m(id_, name, types, desc, example, kind="chat", family=None):
        return {"vendor": "volcano", "id": id_, "name": name, "family": family or name,
                "types": types, "kind": kind, "desc": desc, "example": example,
                "ctx": None, "price": None, "offline": False, "docUrl": L,
                "endpoint": None if kind in ("none", "realtime") else V.get(kind),
                "officialSample": None, "variants": []}
    return [
        # —— 文本 / 推理（Seed 2.1 / 2.0 各档全部列出，孪生不合并）——
        m("doubao-seed-2-1-pro-260628", "Doubao-Seed-2.1-pro", ["文本生成", "推理思考"],
          "豆包 Seed 2.1 旗舰：复杂工作流、长链路推理、Agent 与工具调用最强档。", "多步骤方案比较、复杂指令拆解", family="Doubao-Seed-2.1"),
        m("doubao-seed-2-1-turbo-260628", "Doubao-Seed-2.1-turbo", ["文本生成"],
          "Seed 2.1 快速档：与 pro 同源、更快更省（细节差异见文档）。", "高并发低成本问答", family="Doubao-Seed-2.1"),
        m("doubao-seed-2-0-pro-260215", "Doubao-Seed-2.0-pro", ["文本生成", "推理思考"],
          "复杂推理与 Agent 任务优化：任务拆解、多轮规划、持续决策。", "智能体编排、Function Calling", family="Doubao-Seed-2.0"),
        m("doubao-seed-2-0-lite-260428", "Doubao-Seed-2.0-lite", ["文本生成", "视觉理解"],
          "通用生产默认档：文本/图片/音频/视频原生统一理解，兼顾效果、速度与成本。", "日常问答、看图识图、视频总结", family="Doubao-Seed-2.0"),
        m("doubao-seed-2-0-mini-260428", "Doubao-Seed-2.0-mini", ["文本生成"],
          "面向高吞吐、轻量调用优化：字段提取、分类、批量结构化。", "批处理、成本敏感任务", family="Doubao-Seed-2.0"),
        m("doubao-seed-2-0-code-preview-260215", "Doubao-Seed-2.0-Code", ["文本生成"],
          "面向企业级编程任务优化：代码生成、补全、调试、多文件修改。", "Coding Agent、仓库级修改", family="Doubao-Seed-2.0"),
        m("doubao-seed-character-260628", "Doubao-Seed-Character", ["文本生成"],
          "角色扮演与故事叙事定向优化：人设对话、情感陪伴、多人剧情。", "虚拟角色对话、长旁白故事"),
        m("doubao-seed-evolving", "Doubao-Seed-Evolving", ["文本生成"],
          "持续进化的豆包 Seed 实验档（模型会滚动更新）。", "尝鲜新能力"),
        m("doubao-seed-translation", "Doubao-Seed-Translation", ["文本生成"],
          "豆包翻译专用模型（开通后可用）。", "多语言翻译、润色改写"),
        # —— 上代（官网仍列出）——
        m("doubao-seed-1-6", "Doubao-Seed-1.6", ["文本生成", "视觉理解"],
          "上一代 Seed：多模态理解 + 性价比（旧接入兼容）。", "旧项目兼容", family="Doubao-Seed-1.6"),
        m("doubao-seed-1-6-flash", "Doubao-Seed-1.6-flash", ["文本生成"],
          "Seed 1.6 快速版（旧接入兼容）。", "低成本快速问答", family="Doubao-Seed-1.6"),
        m("doubao-seed-1-6-vision", "Doubao-Seed-1.6-vision", ["视觉理解"],
          "Seed 1.6 视觉版（旧接入兼容）。", "图片问答、截图分析", family="Doubao-Seed-1.6"),
        m("doubao-1-5-pro-32k", "Doubao-1.5-pro-32k", ["文本生成"],
          "豆包 1.5 旗舰（32k 上下文）：旧版本，新接入建议 Seed 2.x。", "旧接入兼容", family="Doubao-1.5"),
        m("doubao-1-5-lite-32k", "Doubao-1.5-lite-32k", ["文本生成"],
          "豆包 1.5 轻量（32k）：旧版本。", "旧接入低成本", family="Doubao-1.5"),
        m("doubao-1-5-vision-pro-32k", "Doubao-1.5-vision-pro-32k", ["视觉理解"],
          "豆包 1.5 视觉旗舰（32k）：图片问答、截图分析。", "看图问答（旧版）", family="Doubao-1.5-vision"),
        m("doubao-1-5-vision-lite", "Doubao-1.5-vision-lite", ["视觉理解"],
          "豆包 1.5 视觉轻量（32k）。", "低成本看图", family="Doubao-1.5-vision"),
        m("doubao-pro-32k", "Doubao-pro-32k", ["文本生成"], "更早的豆包 pro（32k，兼容用）。", "旧接入兼容"),
        m("doubao-lite-32k", "Doubao-lite-32k", ["文本生成"], "更早的豆包 lite（32k，兼容用）。", "旧接入兼容"),
        m("doubao-lite-4k", "Doubao-lite-4k", ["文本生成"], "更早的豆包 lite（4k，兼容用）。", "旧接入兼容"),
        # —— 托管第三方 ——
        m("deepseek-v4-pro-ga-260813", "DeepSeek-V4-Pro正式版", ["文本生成", "推理思考"],
          "DeepSeek V4 旗舰方舟托管：深度推理、长文分析。", "复杂推理、代码与数学", family="DeepSeek-V4"),
        m("deepseek-v4-pro-260425", "DeepSeek-V4-pro", ["文本生成", "推理思考"],
          "DeepSeek V4 pro（非 GA 快照）。", "复杂推理", family="DeepSeek-V4"),
        m("deepseek-v4-flash-ga-260731", "DeepSeek-V4-Flash正式版", ["文本生成"],
          "DeepSeek V4 快速档方舟托管。", "高性价比问答", family="DeepSeek-V4"),
        m("deepseek-v4-1-flash-260910", "DeepSeek-V4.1-Flash", ["文本生成"],
          "DeepSeek V4.1 快速档方舟托管。", "高性价比问答", family="DeepSeek-V4"),
        m("glm-5-2-260617", "GLM-5.2", ["文本生成"], "智谱 GLM-5.2 方舟托管：通用对话与智能体。", "通用问答、Agent", family="GLM"),
        m("glm-5-3-flash-260828", "GLM-5.3-Flash", ["文本生成"], "智谱 GLM-5.3-Flash 方舟托管。", "快速问答", family="GLM"),
        # —— 图像 / 视频 / 3D（3D 三个来自用户控制台截图实证）——
        m("doubao-seedream-5-0-260128", "Doubao-Seedream-5.0", ["图像生成"],
          "新一代图片生成：深度思考 + 联网检索，编辑响应与一致性强化，支持文字渲染。",
          "海报/电商素材/信息图/多图参考编辑", kind="image"),
        m("doubao-seedance-2-0-260128", "Doubao-Seedance-2.0", ["视频生成"],
          "音视频联合生成：文本/图片/音频/视频混合输入，原生音轨与对白。",
          "广告短片、口型同步（异步任务）", kind="video", family="Doubao-Seedance-2.0"),
        m("doubao-seedance-2-0-fast-260128", "Doubao-Seedance-2.0-fast", ["视频生成"],
          "Seedance 2.0 快速版：更快出片、批量预览。", "快速短视频生成", kind="video", family="Doubao-Seedance-2.0"),
        m("doubao-seed3d-2-0-260328", "Doubao-Seed3D-2.0", ["3D生成"],
          "完整结构细节、倒角锐利白模、写实材质纹理（控制台文案）。", "商品 3D、游戏资产", kind="none", family="3D生成"),
        m("Hyper3D-Gen2", "Hyper3D-Gen2", ["3D生成"],
          "分钟内输出百万面级精度 3D 资产（控制台文案）。", "高精度 3D 资产生成", kind="none", family="3D生成"),
        m("Hitem3D-2.0", "Hitem3D-2.0", ["3D生成"],
          "超高分辨率，雕刻级精度，PBR材质直出（控制台文案）。", "雕刻级 3D + PBR", kind="none", family="3D生成"),
        # —— 语音 ——
        m("doubao-seed-tts-2-0", "Doubao-语音合成-2.0", ["语音合成"],
          "豆包语音合成 2.0：自然、流畅、有表现力的配音与朗读。", "视频配音、有声阅读", kind="tts"),
        m("doubao-seed-asr-2-0", "Doubao-录音文件识别", ["语音识别"],
          "录音文件离线转写：会议纪要、访谈、课堂、字幕批量处理。", "会议纪要、播客转字幕", kind="asr"),
        m("seedasr-streaming", "Doubao-流式语音识别", ["语音识别", "实时语音"],
          "边说边转的实时流式识别：字幕、语音输入、直播转写。", "会议实时字幕、语音输入", kind="realtime"),
        m("doubao-seed-podcast", "Doubao-语音播客", ["语音合成"],
          "把文章/网页自动提炼成双人对话并生成播客音频。", "资讯解读转播客", kind="none"),
        m("doubao-seed-voice-design", "Doubao-音色设计", ["语音合成"],
          "用自然语言描述设计个性化音色，产出可用于合成的 voice_id。", "品牌声音、角色音色", kind="none"),
        # —— 向量 ——
        m("doubao-embedding-vision-251215", "Doubao-embedding-vision", ["嵌入向量"],
          "文本/图片/视频统一向量化：语义检索、以图搜图、跨模态召回。", "知识库检索、相似召回", kind="embedding"),
    ]

def load_minimax():
    """MiniMax 官方 docs 全量（含 Legacy 与 highspeed 孪生，各占一行）。"""
    V = ENDPOINTS["minimax"]
    def m(id_, name, types, kind, desc, example, doc, family=None):
        return {"vendor": "minimax", "id": id_, "name": name, "family": family or name,
                "types": types, "kind": kind, "desc": desc, "example": example,
                "ctx": None, "price": None, "offline": False, "docUrl": doc,
                "endpoint": None if kind in ("none", "realtime") else V.get(kind),
                "officialSample": None, "variants": []}
    T = DOC["minimax_chat"]
    return [
        m("MiniMax-M3.1-Flash-Preview", "MiniMax-M3.1-Flash-Preview", ["文本生成", "推理思考"], "chat",
          "前沿多模态编程模型：1M 上下文、可调思考深度。仅 M Plan / MiniMax Code 可用。",
          "超长上下文编程、图文视频理解", T, family="MiniMax-M3.1"),
        m("MiniMax-M3", "MiniMax-M3", ["文本生成", "推理思考"], "chat",
          "旗舰多模态模型：1M 上下文，约 100+ tps，默认开启思考。", "Agent 工作流、工具调用", T, family="MiniMax-M3"),
        m("MiniMax-M2.7", "MiniMax-M2.7", ["文本生成", "推理思考"], "chat",
          "204.8k 上下文，约 60 tps。", "通用对话与 Agent", T, family="MiniMax-M2.7"),
        m("MiniMax-M2.7-highspeed", "MiniMax-M2.7-highspeed", ["文本生成", "推理思考"], "chat",
          "M2.7 同能力高速版：约 100 tps（细节差异见文档）。", "更快输出的同款能力", T, family="MiniMax-M2.7"),
        m("MiniMax-M2.5", "MiniMax-M2.5（Legacy）", ["文本生成"], "chat",
          "上一代平衡档（官方 Legacy 列表）。", "旧接入兼容", T, family="MiniMax-M2.5"),
        m("MiniMax-M2.5-highspeed", "MiniMax-M2.5-highspeed（Legacy）", ["文本生成"], "chat",
          "M2.5 高速版（Legacy）。", "旧接入兼容", T, family="MiniMax-M2.5"),
        m("MiniMax-M2.1", "MiniMax-M2.1（Legacy）", ["文本生成"], "chat",
          "上一代编程增强档（Legacy）。", "旧接入兼容", T, family="MiniMax-M2.1"),
        m("MiniMax-M2.1-highspeed", "MiniMax-M2.1-highspeed（Legacy）", ["文本生成"], "chat",
          "M2.1 高速版（Legacy）。", "旧接入兼容", T, family="MiniMax-M2.1"),
        m("MiniMax-M2", "MiniMax-M2（Legacy）", ["文本生成", "推理思考"], "chat",
          "M2：Agentic 能力、高级推理（Legacy）。", "旧接入兼容", T, family="MiniMax-M2"),
        m("MiniMax-H3", "MiniMax-H3", ["视频生成"], "video",
          "多模态视频生成：文/图/首尾帧/参考输入，768P~2K、4~15s，异步任务。",
          "短片、广告、参考图生视频", DOC["minimax_video"], family="MiniMax-H3"),
        m("MiniMax-H3-Max", "MiniMax-H3-Max", ["视频生成"], "video",
          "H3 快速档：480P/768P、5~15s（无 2K），同一套 content 协议。",
          "更快更省的视频生成", DOC["minimax_video"], family="MiniMax-H3"),
        m("speech-2.8-hd", "speech-2.8-hd", ["语音合成"], "tts",
          "最新 HD 语音合成：超真实音质、sound tags 情感标注。", "带 (sighs) 标签的自然旁白",
          DOC["minimax_tts"], family="speech-2.8"),
        m("speech-2.8-turbo", "speech-2.8-turbo", ["语音合成"], "tts",
          "最新 Turbo：速度与自然度兼顾。", "低延迟合成", DOC["minimax_tts"], family="speech-2.8"),
        m("speech-2.6-hd", "speech-2.6-hd", ["语音合成"], "tts",
          "HD：韵律出色、克隆相似度高。", "高质量克隆音色合成", DOC["minimax_tts"], family="speech-2.6"),
        m("speech-2.6-turbo", "speech-2.6-turbo", ["语音合成"], "tts",
          "Turbo：支持 40 语言。", "多语言快速合成", DOC["minimax_tts"], family="speech-2.6"),
        m("speech-02-hd", "speech-02-hd", ["语音合成"], "tts",
          "上一代 HD：节奏稳定、克隆相似度好（Legacy）。", "旧接入兼容", DOC["minimax_tts"], family="speech-02"),
        m("speech-02-turbo", "speech-02-turbo", ["语音合成"], "tts",
          "上一代 Turbo：多语言增强（Legacy）。", "旧接入兼容", DOC["minimax_tts"], family="speech-02"),
        m("asr-1.0", "MiniMax ASR（asr-1.0）", ["语音识别"], "asr",
          "语音转文字：流式、说话人分离、字幕导出。", "会议纪要、视频转写", DOC["minimax_asr"]),
        m("image-01", "MiniMax image-01", ["图像生成"], "image",
          "文生图 + 图生图：aspect_ratio/多张/提示词优化。", "海报素材、多比例出图", DOC["minimax_image"]),
        m("music-3.0", "MiniMax music-3.0", ["音乐生成"], "music",
          "歌曲生成：风格 prompt + 结构化歌词，可调采样率/码率。", "主题曲、带词完整歌曲", DOC["minimax_music"]),
    ]

def main():
    models = load_volcano() + load_bailian() + load_minimax()
    for m in models:
        if not m.get("types"): m["types"] = ["文本生成"]
        if not m.get("kind"): m["kind"] = TYPE2KIND.get(m["types"][0], "chat")
        if m["kind"] not in ("none", "realtime") and not m.get("endpoint"):
            m["endpoint"] = ENDPOINTS.get(m["vendor"], {}).get(m["kind"])
    seen, dup = set(), 0
    uniq = []
    for m in models:
        k = (m["vendor"], m["id"])
        if k in seen:
            dup += 1; continue
        seen.add(k); uniq.append(m)
    models = uniq
    out = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "note": "只读目录：scripts/build-models-catalog.py 生成，未调用任何模型 API。def=null 的参数 = 默认不传（用户填了才带上）。",
        "types": TYPES,
        "poll": POLL,
        "vendors": [
            {"id": "volcano", "name": "火山方舟", "site": "https://console.volcengine.com/ark",
             "keyHint": "火山方舟控制台 → API Key 管理"},
            {"id": "bailian", "name": "阿里百炼", "site": "https://bailian.console.aliyun.com",
             "keyHint": "百炼控制台 → API-KEY 管理"},
            {"id": "minimax", "name": "MiniMax", "site": "https://platform.minimax.io",
             "keyHint": "MiniMax Platform → API Keys"},
        ],
        "params": {f"{v}.{k}": ps for (v, k), ps in PARAMS.items()},
        "models": models,
    }
    path = os.path.join(ROOT, "models-catalog.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    c = Counter(m["vendor"] for m in models)
    t = Counter(x for m in models for x in m["types"])
    pr = sum(1 for m in models if m.get("price"))
    print(f"写入 {path}")
    print(f"模型总数={len(models)}（重复剔除 {dup}）厂商={dict(c)} 带价格={pr}")
    print(f"类型={dict(t)}")

if __name__ == "__main__":
    main()
