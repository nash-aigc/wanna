#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 models-catalog.json —— 「模型」页的三厂商模型目录（火山方舟 / 阿里百炼 / MiniMax）。

数据源（全部只读文档与本地数据，**不调用任何模型 API**）：
  - 阿里百炼：本地 skills/bailian-docs-llm-wiki/models/（models.jsonl + groups/*.json，187 家族真值）
  - 火山方舟：arkcli-models 场景表 + 火山方舟技能（手录，ID 均有出处）
  - MiniMax：platform.minimax.io 官方 docs（手录，端点/参数取自官方示例 curl）

去重规则（用户 2026-10-03）：同族近乎相同的变体（flash/pro/highspeed/turbo 孪生）合并进
variants 只留一行；**模态不同必须独立成行**（如 文本 vs 视觉、TTS vs ASR）。
"""
import json, os, re, glob, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAILIAN = os.path.expanduser("~/.agents/skills/bailian-docs-llm-wiki/models")

TYPES = ["文本生成", "推理思考", "视觉理解", "图像生成", "视频生成", "语音识别",
         "语音合成", "实时语音", "嵌入向量", "音乐生成", "3D生成"]

# 百炼 capability → 页面类型
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

# ── 各厂商端点（文档实证；none = 无单一 REST 调用，只给 ID+文档）────────────────
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
DOC = {
    "volcano_list": "https://www.volcengine.com/docs/82379/1553586",
    "minimax_overview": "https://platform.minimax.io/docs/api-reference/api-overview",
    "minimax_chat": "https://platform.minimax.io/docs/api-reference/text-chat-openai",
    "minimax_video": "https://platform.minimax.io/docs/api-reference/video-generation-v2-create",
    "minimax_tts": "https://platform.minimax.io/docs/api-reference/speech-t2a-http",
    "minimax_asr": "https://platform.minimax.io/docs/api-reference/speech-to-text",
    "minimax_image": "https://platform.minimax.io/docs/api-reference/image-generation-t2i",
    "minimax_music": "https://platform.minimax.io/docs/api-reference/music-generation",
}

def P(name, defv, desc="", typ="string", options=None, nest=None, required=False):
    d = {"name": name, "def": defv, "desc": desc, "type": typ}
    if options: d["options"] = options
    if nest: d["nest"] = nest
    if required: d["required"] = True
    return d

# ── 各 (厂商, kind) 的参数规格（默认值 = 官方默认或官方示例值；def=None 表示留空=不传）──
PARAMS = {
    ("volcano", "chat"): [
        P("prompt", "你好，请介绍一下你自己", "用户消息（代码模板会放进 messages）", "string", required=True),
        P("temperature", 0.7, "采样温度", "number"),
        P("top_p", None, "核采样（留空=不传）", "number"),
        P("max_tokens", None, "最大生成 token（留空=不限）", "number"),
        P("stream", False, "流式输出", "bool"),
        P("seed", None, "随机种子（留空=不传）", "number"),
        P("thinking", None, '深度思考开关，JSON 如 {"type":"disabled"}（思考模型）', "json"),
        P("response_format", None, '响应格式，JSON 如 {"type":"json_object"}', "json"),
    ],
    ("bailian", "chat"): [
        P("prompt", "你好，请介绍一下你自己", "用户消息（代码模板会放进 messages）", "string", required=True),
        P("temperature", 1.0, "采样温度（官方默认 1.0，范围 0~2）", "number"),
        P("top_p", 0.8, "核采样（官方默认 0.8）", "number"),
        P("max_tokens", None, "最大生成 token（留空=不限）", "number"),
        P("stream", False, "流式输出", "bool"),
        P("enable_thinking", False, "是否开启深度思考（qwen3 系列可开）", "bool"),
        P("seed", None, "随机种子（留空=不传）", "number"),
        P("response_format", None, '响应格式，JSON 如 {"type":"json_object"}', "json"),
    ],
    ("minimax", "chat"): [
        P("prompt", "Which is bigger, 9.11 or 9.9?", "用户消息（官方示例原句）", "string", required=True),
        P("temperature", None, "采样温度（留空=官方默认）", "number"),
        P("top_p", None, "核采样（留空=不传）", "number"),
        P("max_completion_tokens", 500, "最大补全 token（官方示例 500）", "number"),
        P("stream", False, "流式输出", "bool"),
        P("reasoning_effort", None, "思考深度（M3/M3.1，默认 max）", "select",
          ["low", "medium", "high", "xhigh", "max"]),
        P("thinking", None, '思考模式，JSON 如 {"type":"adaptive"}（M3 系列）', "json"),
    ],
    ("volcano", "image"): [
        P("prompt", "一只戴红色围巾的柴犬，摄影风格", "文生图提示词", "string", required=True),
        P("size", "1024x1024", "图片尺寸", "string"),
        P("n", 1, "生成张数", "number"),
        P("seed", None, "随机种子（留空=不传）", "number"),
    ],
    ("bailian", "image"): [
        P("prompt", "一只戴红色围巾的柴犬，摄影风格", "文生图提示词", "string", required=True),
        P("size", "1024*1024", "图片尺寸（宽*高）", "string"),
        P("n", 1, "生成张数", "number"),
        P("seed", None, "随机种子（留空=不传）", "number"),
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
        P("duration", None, "时长秒数（留空=模型默认，各模型上限不同）", "number"),
        P("ratio", "16:9", "画幅比", "select", ["16:9", "9:16", "1:1", "4:3", "3:4"]),
        P("seed", None, "随机种子（留空=不传）", "number"),
        P("camerafixed", False, "固定镜头", "bool"),
    ],
    ("bailian", "video"): [
        P("prompt", "一只柴犬在草地上奔跑，阳光明媚", "视频提示词", "string", required=True),
        P("size", "1280*720", "视频尺寸（宽*高）", "string"),
        P("duration", None, "时长秒数（留空=模型默认）", "number"),
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
    ],
    ("bailian", "tts"): [
        P("text", "你好，这是一段通义语音合成示例。", "要合成的文本", "string", required=True),
        P("voice", None, "音色 id，如 longxiaochun_v2（见音色列表）", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "pcm", "opus", "aac"]),
        P("sample_rate", 24000, "采样率", "number"),
        P("rate", None, "语速倍率（如 1.5，留空=默认）", "number"),
    ],
    ("minimax", "tts"): [
        P("text", "Omg(sighs), the real danger is not that computers start thinking like people.",
          "要合成的文本（官方示例原句）", "string", required=True),
        P("voice_id", None, "音色 id（Get Voice API / 系统音色表）", "string", required=True),
        P("speed", 1, "语速 0.5~2", "number"),
        P("vol", 1, "音量 0~10", "number"),
        P("pitch", 0, "音调 -12~12", "number"),
        P("format", "mp3", "输出格式", "select", ["mp3", "pcm", "flac", "wav"]),
        P("stream", False, "流式输出", "bool"),
    ],
    ("volcano", "asr"): [
        P("audio_url", "https://example.com/audio.mp3", "音频文件 URL", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "ogg", "m4a", "aac"]),
        P("sample_rate", None, "采样率（留空=自动）", "number"),
    ],
    ("bailian", "asr"): [
        P("file_url", "https://example.com/audio.mp3", "音频文件 URL", "string", required=True),
        P("format", "mp3", "音频格式", "select", ["mp3", "wav", "ogg", "m4a", "aac", "flac"]),
        P("sample_rate", 16000, "采样率", "number"),
    ],
    ("minimax", "asr"): [
        P("file", "audio.mp3", "本地音频文件路径（multipart 上传）", "string", required=True),
        P("response_format", "json", "返回格式", "select", ["json"]),
        P("timestamp_level", "word", "时间戳粒度", "select", ["word", "sentence"]),
        P("stream", "false", "流式（官方示例为字符串 false）", "string", options=["true", "false"]),
    ],
    ("volcano", "embedding"): [
        P("text", "要向量化的文本", "输入文本", "string", required=True),
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
    ],
}

def pick_item(items):
    """家族内选主干：优先无日期快照/带 latest 的，其次第一条。"""
    def score(it):
        m = it.get("model", "")
        s = 0
        if re.search(r"-\d{6}($|-)", m) and not m.endswith("-latest"): s -= 3   # 日期快照
        if m.endswith("-latest"): s += 2
        if it.get("versionTag") in (None, "", "latest"): s += 1
        if it.get("offlineInfo"): s -= 5
        return -s
    return sorted(items, key=score, reverse=True)[0]

def load_bailian():
    models = []
    rows = [json.loads(l) for l in open(os.path.join(BAILIAN, "models.jsonl"), encoding="utf-8")]
    # 按家族聚合，家族内只留主干（去重规则）
    fams = {}
    for r in rows:
        if r.get("provider") not in ("qwen", "qwen-domain-model", "wan"):
            continue  # 阿里自家；三方市场货不进阿里分区
        fams.setdefault(r["family"], []).append(r)
    for fam, items in fams.items():
        it = pick_item(items)
        cap = (it.get("capabilities") or ["TG"])[0]
        types = CAP2TYPE.get(cap, ["文本生成"])
        kind = TYPE2KIND[types[0]]
        # 编辑/多图类图像模型走 image2image 端点
        endpoint = ENDPOINTS["bailian"].get(kind)
        if kind == "image" and re.search(r"edit|i2i|图像编辑|图生图", it.get("name", "") + fam, re.I):
            endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis"
        # 家族 group 里的官方示例（chat）
        official = None
        gpath = os.path.join(BAILIAN, "groups", f"{fam}.json")
        if os.path.exists(gpath):
            try:
                g = json.load(open(gpath, encoding="utf-8"))
                gi = pick_item(g.get("items", [g]) if isinstance(g, dict) else [])
                sam = (gi.get("samples") or {}).get("openai", {}).get("completionsAPI", {})
                if sam:
                    official = {"python": sam.get("python"), "curl": sam.get("curl")}
            except Exception:
                pass
        price = None
        try:
            mp = it.get("multiPrices") or []
            for band in mp:
                for p in band.get("prices", []):
                    if p.get("type") == "input_token":
                        price = f"输入 ¥{p.get('price')}/百万tok"
                        break
                if price: break
        except Exception:
            pass
        profile = it.get("profile") or {}
        desc = (it.get("description") or "").strip() or (profile.get("oneLinePositioning") or "")
        scenes = profile.get("scenes") or []
        example = ("、".join(scenes[:3]) + "…") if scenes else ""
        models.append({
            "vendor": "bailian", "id": it.get("model") or "", "name": it.get("name") or fam,
            "family": fam, "types": types, "kind": kind,
            "desc": desc[:220], "example": example,
            "ctx": it.get("contextWindow"), "price": price,
            "docUrl": it.get("docUrl") or "https://docs.bailian.console.aliyun.com/zh/model-studio",
            "endpoint": endpoint, "officialSample": official,
            "variants": [x.get("model") for x in items if x.get("model") != (it.get("model"))][:6],
        })
    return models

# ── 火山方舟手录（出处：arkcli-models 场景表 + 火山方舟技能；ID 均实证）────────
def load_volcano():
    V = ENDPOINTS["volcano"]; L = DOC["volcano_list"]
    def m(id_, name, types, desc, example, kind="chat", variants=None, tags=None):
        return {"vendor": "volcano", "id": id_, "name": name, "family": name, "types": types,
                "kind": kind, "desc": desc, "example": example,
                "ctx": None, "price": None, "docUrl": L,
                "endpoint": V.get(kind) if kind not in ("none", "realtime") else None,
                "variants": variants or [], "tags": tags or []}
    return [
        m("doubao-seed-2-1-pro-260628", "Doubao-Seed-2.1-pro", ["文本生成", "推理思考"],
          "豆包 Seed 2.1 旗舰：复杂工作流、长链路推理、Agent 与工具调用最强档。",
          "多步骤方案比较、复杂指令拆解、科研辅助推理", variants=["doubao-seed-2-1-turbo-260628"]),
        m("doubao-seed-2-0-lite-260428", "Doubao-Seed-2.0-lite", ["文本生成", "视觉理解"],
          "通用生产默认档：文本/图片/音频/视频原生统一理解，兼顾效果、速度与成本。",
          "日常问答、文案摘要、看图识图、图表分析、视频总结", variants=["doubao-seed-2-0-mini-260428"]),
        m("doubao-seed-2-0-pro-260215", "Doubao-Seed-2.0-pro", ["文本生成", "推理思考"],
          "复杂推理与 Agent 任务优化：任务拆解、多轮规划、持续决策。",
          "智能体编排、Function Calling、数学逻辑与科研辅助",
          variants=["doubao-seed-2-0-code-preview-260215"]),
        m("doubao-seed-character-260628", "Doubao-Seed-Character", ["文本生成"],
          "角色扮演与故事叙事定向优化：人设对话、情感陪伴、多人剧情。",
          "虚拟角色对话、陪伴型聊天、长旁白故事"),
        m("doubao-seed-evolving", "Doubao-Seed-Evolving", ["文本生成"],
          "持续进化的豆包 Seed 实验档（模型会滚动更新）。",
          "尝鲜新能力、跟踪豆包最新效果"),
        m("doubao-seed-1-6", "Doubao-Seed-1.6", ["文本生成", "视觉理解"],
          "上一代 Seed：多模态理解 + 性价比（已逐步被 2.0 取代，旧接入兼容用）。",
          "旧项目兼容、低成本多模态", variants=["doubao-seed-1-6-flash", "doubao-seed-1-6-vision"]),
        m("doubao-1-5-pro-32k", "Doubao-1.5-pro-32k", ["文本生成"],
          "豆包 1.5 旗舰（32k 上下文）：旧版本，新接入建议 Seed 2.x。",
          "旧接入兼容", variants=["doubao-1-5-lite-32k", "doubao-1-5-flash-32k"]),
        m("doubao-1-5-vision-pro-32k", "Doubao-1.5-vision-pro-32k", ["视觉理解"],
          "豆包 1.5 视觉理解旗舰（32k）：图片问答、截图分析。",
          "看图问答、图表解读（旧版；推荐用 Seed-2.0-lite 原生多模态）",
          variants=["doubao-1-5-vision-lite"]),
        m("deepseek-v4-pro-ga-260813", "DeepSeek-V4-Pro（方舟托管）", ["文本生成", "推理思考"],
          "DeepSeek V4 旗舰在方舟的托管版：深度推理、长文分析。",
          "复杂推理、代码与数学任务",
          variants=["deepseek-v4-flash-ga-260731", "deepseek-v4-1-flash-260910", "deepseek-v4-pro-260425"]),
        m("glm-5-2-260617", "GLM-5.2（方舟托管）", ["文本生成"],
          "智谱 GLM-5.2 在方舟的托管版：通用对话与智能体。",
          "通用问答、Agent 任务", variants=["glm-5-3-flash-260828"]),
        m("doubao-seedream-5-0-260128", "Doubao-Seedream-5.0", ["图像生成"],
          "新一代图片生成：深度思考 + 联网检索，编辑响应与一致性强化，支持文字渲染。",
          "海报/电商素材/信息图/多图参考一致性编辑", kind="image"),
        m("doubao-seedance-2-0-260128", "Doubao-Seedance-2.0", ["视频生成"],
          "音视频联合生成：文本/图片/音频/视频混合输入，原生音轨与对白。",
          "广告短片、口型同步、运镜参考视频（异步任务）", kind="video",
          variants=["doubao-seedance-2-0-fast-260128"]),
        m("doubao-seed3d-2-0-260328", "Doubao-Seed3D-2.0", ["3D生成"],
          "图生 3D：几何精度、纹理与 PBR 材质，面向商品展示与游戏资产。",
          "商品 3D 展示、游戏资产、仿真素材", kind="none"),
        m("doubao-seed-tts-2-0", "Doubao-语音合成-2.0", ["语音合成"],
          "豆包语音合成 2.0：自然、流畅、有表现力的配音与朗读。",
          "视频配音、有声阅读、客服播报", kind="tts"),
        m("doubao-seed-asr-2-0", "Doubao-录音文件识别", ["语音识别"],
          "录音文件离线转写：会议纪要、访谈、课堂、字幕批量处理。",
          "会议纪要、播客转字幕", kind="asr"),
        m("seedasr-streaming", "Doubao-流式语音识别", ["语音识别", "实时语音"],
          "边说边转的实时流式识别：字幕、语音输入、直播转写。",
          "会议实时字幕、语音输入框", kind="realtime"),
        m("doubao-seed-podcast", "Doubao-语音播客", ["语音合成"],
          "把文章/网页自动提炼成双人对话并生成播客音频。",
          "资讯解读、知识讲解转播客", kind="none"),
        m("doubao-seed-voice-design", "Doubao-音色设计", ["语音合成"],
          "用自然语言描述设计个性化音色，产出可用于合成的 voice_id。",
          "品牌声音、虚拟角色音色", kind="none"),
        m("doubao-embedding-vision-251215", "Doubao-embedding-vision", ["嵌入向量"],
          "文本/图片/视频统一向量化：语义检索、以图搜图、跨模态召回。",
          "知识库检索、相似内容召回", kind="embedding"),
    ]

# ── MiniMax 手录（出处：platform.minimax.io 官方 docs，端点与参数取自官方示例）──
def load_minimax():
    V = ENDPOINTS["minimax"]
    def m(id_, name, types, kind, desc, example, doc, variants=None, noCodegen=False):
        return {"vendor": "minimax", "id": id_, "name": name, "family": name, "types": types,
                "kind": kind, "desc": desc, "example": example, "ctx": None, "price": None,
                "docUrl": doc, "endpoint": None if noCodegen else V.get(kind),
                "variants": variants or [], "tags": []}
    return [
        m("MiniMax-M3.1-Flash-Preview", "MiniMax-M3.1-Flash-Preview", ["文本生成", "推理思考"], "chat",
          "前沿多模态编程模型：1M 上下文、可调思考深度（reasoning_effort）。仅 M Plan / MiniMax Code 可用。",
          "超长上下文编程、图文视频理解（官方示例 9.11 vs 9.9 思考链）", DOC["minimax_chat"]),
        m("MiniMax-M3", "MiniMax-M3", ["文本生成", "推理思考"], "chat",
          "旗舰多模态模型：1M 上下文，输出约 100+ tps，默认开启思考。",
          "Agent 工作流、工具调用、复杂推理", DOC["minimax_chat"],
          variants=["MiniMax-M3.1-Flash-Preview"]),
        m("MiniMax-M2.7", "MiniMax-M2.7", ["文本生成", "推理思考"], "chat",
          "递归自我改进之旅：204.8k 上下文，约 60 tps；highspeed 变体同能力约 100 tps。",
          "通用对话与 Agent 任务", DOC["minimax_chat"],
          variants=["MiniMax-M2.7-highspeed"]),
        m("MiniMax-M2.5", "MiniMax-M2.5（Legacy）", ["文本生成"], "chat",
          "上一代：性能与价值平衡档（官方标记 Legacy，新接入建议 M3/M2.7）。",
          "旧接入兼容", DOC["minimax_chat"],
          variants=["MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M2"]),
        m("MiniMax-H3", "MiniMax-H3", ["视频生成"], "video",
          "多模态视频生成：文/图/首尾帧/参考输入，768P~2K、4~15s，异步任务。",
          "短片、广告、参考图生视频（官方示例太空歌剧预告片）", DOC["minimax_video"],
          variants=["MiniMax-H3-Max"]),
        m("speech-2.8-hd", "speech-2.8-hd", ["语音合成"], "tts",
          "最新 HD 语音合成：超真实音质、支持 sound tags 与情感标注。",
          "带 (sighs) 等声音标签的自然旁白；40 语言 300+ 音色", DOC["minimax_tts"],
          variants=["speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo", "speech-02-hd", "speech-02-turbo"]),
        m("asr-1.0", "MiniMax ASR（asr-1.0）", ["语音识别"], "asr",
          "语音转文字：流式、说话人分离、字幕导出。",
          "会议纪要、播客/视频转写、客服质检", DOC["minimax_asr"]),
        m("image-01", "MiniMax image-01", ["图像生成"], "image",
          "文生图 + 图生图：aspect_ratio/多张生成/提示词优化。",
          "海报素材、多比例出图（官方示例 90s 纪实风格人像，n=3）", DOC["minimax_image"]),
        m("music-3.0", "MiniMax music-3.0", ["音乐生成"], "music",
          "歌曲生成：风格 prompt + 结构化歌词（[verse]/[chorus]），可调采样率/码率。",
          "主题曲、带词完整歌曲（官方示例独立民谣）", DOC["minimax_music"]),
    ]

def main():
    models = load_volcano() + load_bailian() + load_minimax()
    # 兜底：无类型/无 kind 的修正
    for m in models:
        if not m.get("types"): m["types"] = ["文本生成"]
        if not m.get("kind"): m["kind"] = TYPE2KIND.get(m["types"][0], "chat")
        if m["kind"] not in ("none", "realtime") and not m.get("endpoint"):
            m["endpoint"] = ENDPOINTS.get(m["vendor"], {}).get(m["kind"])
    out = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "note": "只读目录：本数据由 scripts/build-models-catalog.py 生成，全程未调用任何模型 API。def=null 的参数 = 留空不传。",
        "types": TYPES,
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
    t = Counter(t for m in models for t in m["types"])
    print(f"写入 {path}")
    print(f"模型总数={len(models)} 厂商分布={dict(c)}")
    print(f"类型分布={dict(t)}")

if __name__ == "__main__":
    main()
