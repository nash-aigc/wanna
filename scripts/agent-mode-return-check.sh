#!/bin/bash
#  agent-mode-return-check.sh
#
#  **用户报的那一条**（2026-09-29）：「实时对话模式 ok，但是点击快捷键：进入 agent 模式，
#  **没有返回**」。
#
#  那一轮的实测根因：Pi 是个 coding agent，默认手里有 `bash` / `read` / `edit` / `write`。
#  它**没有用我们给的 19 个 MCP 工具**，而是拿 `bash` 把整件事重做了一遍
#  （会话文件实证：`open -a Calculator` → `screencapture` → `read` 图 → `grep -rl` / `find`
#  满硬盘找目录），三十秒不回来，屏幕上就是"没有返回"。
#
#  修法：`--exclude-tools bash,edit,write` —— 留 `read`（官方技能机制只认 read/bash 这两个
#  名字来读技能正文，关掉内置技能段就整段不出现且不报错），去掉那三个"自己动手"的。
#
#  这个脚本验的就是：**一轮真的带截图的任务，能不能正常返回。**
#  用法：`bash scripts/agent-mode-return-check.sh`，退出码 0 = 通过。
#
#  ⭐ **测试卫生（2026-09-29 加，拿一次真实事故换的）**：这个脚本会真的写
#  ① Wanna 的会话库（`ConversationSessions.json`）与 ② 每个对话的 pi 会话文件。
#  不还的话，**测试用的合成转写就会留在用户自己的对话里** —— 用户 2026-09-29
#  报的「她怎么总说开会，我没说过开会」就是这个（我用「明天下午三点开会」
#  反复测试，而当时没有隔离，那些轮次全落在了他正在用的会话里）。
#  所以：跑之前快照，跑完**还原**（见文件末尾）。
#
#  判据全部取自诊断日志（🥧 行）与会话文件，不猜时间点：
#    A. 这一轮**真的交给了 Pi**（否则是空跑）；
#    B. 在超时之前出现 **「🥧 Pi 完成」**；
#    C. Pi 的会话文件里**一次 bash / edit / write 都没有**（工具真的被摘掉了）；
#    D. 思考档真的作用到模型上 —— **只断言确定性的一半**：**实时轮 0 个 thinking block**
#       （配的是关）。反方向（"开"⇒一定会有 block）**不能断言** —— 模型对简单问题可以不想，
#       实测同一个问题两次一次 1 个、一次 0 个，写成断言会随机报红（2026-09-30 改）；
#    E. 设置里配的模型，provider 名**真实存在**；
#    F. 回答**真的出了声**（诊断日志里的「出声」）—— 这是「agent 模式没有回复」的第二层；
#    G. ⭐ **每一轮实际跑的模型与思考档 = 那一轮角色在设置里配的那一份**（2026-09-30 加）——
#       判据是 pi 自己写进会话文件的 `model_change` / `thinking_level_change`。
#
#  ⭐ **2026-09-30：这个脚本改成"两轮 + 两套设置"**（一个进程、模型与思考档逐轮切之后）。
#    · 实时轮 = 按下一次，静音 1.5 秒自动发送；
#    · 执行轮 = 按下后 **0.9 秒内再按一次**（第二下走"停止并提交 + 置执行旗标"那一支）。
#      间隔必须小于 1.5 秒 —— 慢了第一句已经自动发走，第二下会开一个新的大轮（旗标复位），
#      于是又变回实时轮。**这是实测出来的**（第一版 sleep 2.5 就是这么错的）。
#    · 测试期间把两个角色的**思考档故意设成不同**（实时关 / 执行开），否则
#      "代码永远用同一个角色那一行"这种 bug 验不出来。跑完自动还原（带 trap）。
#
#  D、E 是 2026-09-29 补的 —— 用户报了第二层「没有返回、非常慢」，根因与上面的 bash 无关：
#     `--model` 写的是 `deepseek/deepseek-flash`，而 `~/.pi/agent/models.json` 里那个 provider
#     真实键名是 `deepseek-official`。pi 把 `deepseek` 当成**不存在的 provider**，`prompt` 立刻回
#     `success:false · No API key found for deepseek`，于是永远等不到 `agent_settled`，
#     屏幕上的形状就是「没有返回、非常慢（干等到超时）」。
#     同一轮还加了 `--thinking off`（用户要求「对 wanna 必须使用非思考模式」）：deepseek-flash
#     是推理模型，不关会先吐一大段 reasoning_content、正文迟迟不来；实测 off = 0.8s、
#     medium = 1.6s，关掉既满足要求又更快一倍。
#       ⚠️ provider 名与 models.json 的 providers 键名必须逐字一致 —— 它**不对**。
#       （`pi --list-models` 会列出真实名字，写脚本时用它核对，不要凭印象。）

set -u
cd "$(dirname "$0")/.." || exit 2

APP_DIR=$(xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{print $2}')
APP_BINARY="$APP_DIR/Wanna.app/Contents/MacOS/Wanna"
DIAG="$HOME/Library/Application Support/Wanna/主Agent诊断.log"
TIMEOUT_SECONDS="${1:-90}"

failures=0
step() { printf '  %-46s %s\n' "$1" "$2"; }

# ── 测试卫生：跑之前把两处存储快照下来（末尾还原）
SUPPORT="$HOME/Library/Application Support/Wanna"
HYGIENE_SESSIONS_BAK="/tmp/wanna-check-sessions.bak.json"
HYGIENE_PIMODE_BAK="/tmp/wanna-check-pimode.bak.json"
HYGIENE_PI_LINES="/tmp/wanna-check-pi-lines.txt"
cp "$SUPPORT/ConversationSessions.json" "$HYGIENE_SESSIONS_BAK" 2>/dev/null

# ⭐ **模型设置也要快照 + 还原，而且测试期间要故意改成"两个角色不一样"**
# （2026-09-30）。理由：用户的要求是「窗口中选择思考开，实际的时候，就思考开」——
# 而这条**只有在两个角色的取值不同时才验得出来**：如果测试沿用他现在的配置
#（两个角色都是思考关），那么"代码永远用实时那一行"这种 bug 会照样通过 ✗。
# 所以测试期间：实时 = 思考关、执行 = 思考开（模型不变，避免依赖第二个可用供应商）。
PIMODE="$SUPPORT/PiModeSettings.json"
cp "$PIMODE" "$HYGIENE_PIMODE_BAK" 2>/dev/null
python3 - "$PIMODE" <<'PY' 2>/dev/null
import json,sys
p=sys.argv[1]
try: d=json.load(open(p))
except Exception: d={}
d.setdefault("realtimeModelID","deepseek-official/deepseek-flash")
d.setdefault("executeModelID","deepseek-official/deepseek-flash")
d["realtimeThinkingEnabled"]=False   # 实时：关
d["executeThinkingEnabled"]=True     # 执行：开（这就是"窗口里选了开，实际就开"）
json.dump(d,open(p,"w"),ensure_ascii=False)
PY
# 不管怎么退出都要还回去 —— 否则用户的模型设置会被这次测试改掉。
restore_pimode() { cp "$HYGIENE_PIMODE_BAK" "$PIMODE" 2>/dev/null; }
trap 'restore_pimode' EXIT INT TERM
: > "$HYGIENE_PI_LINES"
for f in "$SUPPORT"/pi-sessions/*.jsonl; do
    [ -f "$f" ] || continue
    echo "$f=$(wc -l < "$f" | tr -d ' ')" >> "$HYGIENE_PI_LINES"
done

# ── 快照：这一轮之后所有新增的回合都要能收掉
restore_test_hygiene() {
    cp "$HYGIENE_SESSIONS_BAK" "$SUPPORT/ConversationSessions.json" 2>/dev/null
    while IFS='=' read -r path lines; do
        [ -f "$path" ] || continue
        total=$(wc -l < "$path" | tr -d ' ')
        if [ "${total:-0}" -lt "${lines:-0}" ]; then continue; fi
        if [ "$total" != "$lines" ]; then
            # 截回测试前的行数（pi 会话是追加写的，新增的就是这一轮测试的）
            head -n "$lines" "$path" > "$path.tmp" && mv "$path.tmp" "$path"
        fi
    done < "$HYGIENE_PI_LINES"
}

echo "── agent 模式能不能返回（超时 ${TIMEOUT_SECONDS}s）──────────────"
pkill -TERM -f "$APP_BINARY" 2>/dev/null
sleep 1

# 记下当前诊断日志的行数，之后只看这之后新长出来的部分
START_LINE=0
[ -f "$DIAG" ] && START_LINE=$(wc -l < "$DIAG" | tr -d ' ')
NEW_LOG="/tmp/wanna-agent-return-$START_LINE.log"
: > "$NEW_LOG"

# 会话文件在这一轮之前的行数 —— C 项只比对**新增的帧**（否则永远匹配到旧历史）
BEFORE_FILE="/tmp/wanna-agent-return-before.txt"
: > "$BEFORE_FILE"
for f in "$HOME/Library/Application Support/Wanna/pi-sessions"/*.jsonl; do
    [ -f "$f" ] || continue
    echo "$f=$(wc -l < "$f" | tr -d ' ')" >> "$BEFORE_FILE"
done

# 这句话故意**提到一个不存在的目录** —— 正是上一轮让 Pi 拿 bash 满硬盘找的形状。
# F/G 用同一个 stdout 文件：它开场就被 `>` 截断，所以**整份都是这一轮的**（不需要行偏移）。
STDOUT_LOG=/tmp/wanna-agent-return-stdout.log
WANNA_SYNTHETIC_TRANSCRIPT="请注意看我的屏幕，然后告诉我：屏幕上这个软件的主界面里，最上面那一行有哪些按钮？" \
  "$APP_BINARY" > /tmp/wanna-agent-return-stdout.log 2>&1 &
APP_PID=$!
sleep 4

new_diag() { [ -f "$DIAG" ] && tail -n +"$((START_LINE + 1))" "$DIAG"; }

# ── 按下说话键（合成识别器把上面那句话当成用户说的）
#
# ⚠️ **2026-09-30 改：分成两轮 —— 一轮实时、一轮执行**，因为"配置为准"这件事
#    只有两轮都跑到才验得全。
#
# · **实时轮** = 按下一次，说完了**静音 1.5 秒自动发送**（这就是现在的默认路径）。
# · **执行轮** = 按下之后 **0.9 秒内再按一次** —— 那时还在录音，第二下走的是
#   「停止并提交 + 置执行旗标」那一支，所以这一轮进的是**执行模式**。
#   ⚠️ 间隔必须**小于 1.5 秒**：慢了的话第一句已经自动发出去、第二下会开一个**新的大轮**
#   （旗标被复位），于是又变回实时轮 —— 这是实测出来的（第一版 sleep 2.5 就是这么错的）。
press_talk() { swift scripts/talk-shortcut-probe.swift press > /dev/null; swift scripts/talk-shortcut-probe.swift release > /dev/null; }

# ── 第 1 轮：实时
#
# 先记一份"实时轮之前"的行数 —— 实时轮的判据（没有思考流）只看它之后新增的帧。
REALTIME_BEFORE="/tmp/wanna-agent-return-realtime-before.txt"
: > "$REALTIME_BEFORE"
for f in "$HOME/Library/Application Support/Wanna/pi-sessions"/*.jsonl; do
    [ -f "$f" ] || continue
    echo "$f=$(wc -l < "$f" | tr -d ' ')" >> "$REALTIME_BEFORE"
done

REALTIME_MARK=$(wc -l < "$DIAG" 2>/dev/null || echo 0)
press_talk
realtime_seen=0
for _ in $(seq 1 30); do
    if tail -n +"$((REALTIME_MARK + 1))" "$DIAG" 2>/dev/null | grep -q "🥧 实时轮回来了"; then realtime_seen=1; break; fi
    sleep 1
done
if [ "$realtime_seen" = 1 ]; then step "0 实时轮跑完（为下一轮腾出窗口）" "✓"; else step "0 实时轮跑完" "✗ 超时"; failures=$((failures+1)); fi
sleep 2

# 这一轮之后、执行轮之前，再记一次行数 —— 执行轮的判据只看它之后新增的帧
BEFORE_FILE="/tmp/wanna-agent-return-before.txt"
: > "$BEFORE_FILE"
for f in "$HOME/Library/Application Support/Wanna/pi-sessions"/*.jsonl; do
    [ -f "$f" ] || continue
    echo "$f=$(wc -l < "$f" | tr -d ' ')" >> "$BEFORE_FILE"
done

# ── 第 2 轮：执行（按下 → 0.9 秒内再按一次）
press_talk
sleep 0.9
press_talk

# ── A. 等"真的交给了 Pi"
handed=0
for _ in $(seq 1 30); do
    if new_diag | grep -q "🥧 这一轮交给 Pi"; then handed=1; break; fi
    sleep 1
done
if [ "$handed" = 1 ]; then step "A 这一轮真的交给了 Pi" "✓"; else step "A 这一轮真的交给了 Pi" "✗（空跑）"; failures=$((failures+1)); fi

# ── B. 等「🥧 Pi 完成」
done_at=0
elapsed=0
for _ in $(seq 1 "$TIMEOUT_SECONDS"); do
    elapsed=$((elapsed + 1))
    if new_diag | grep -q "🥧 Pi 完成"; then done_at=$elapsed; break; fi
    sleep 1
done
if [ "$done_at" != 0 ]; then
    step "B Pi 有返回（${done_at}s）" "✓"
    new_diag | grep "🥧 Pi 完成" | tail -1 | sed 's/^/      /'
else
    step "B Pi 有返回（${TIMEOUT_SECONDS}s 内）" "✗ —— 这就是用户报的『没有返回』"
    failures=$((failures+1))
fi

# ── C. 这一轮**新追加的帧**里有没有 bash / edit / write
#
# ⚠️ 会话文件是**整条对话的累积历史**，里面永远留着修复前那几次 bash 调用 ——
#    直接 grep 整个文件会永远红（第一版就是这么错的）。所以只比对**新增的行**。
SESSION_DIR="$HOME/Library/Application Support/Wanna/pi-sessions"
BAD=""
for f in "$SESSION_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    before=$(grep "^$f=" /tmp/wanna-agent-return-before.txt 2>/dev/null | cut -d= -f2)
    before=${before:-0}
    delta=$(tail -n +"$((before + 1))" "$f" 2>/dev/null)
    [ -z "$delta" ] && continue
    hit=$(printf '%s\n' "$delta" | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
        const names=new Set();
        for (const l of raw.split("\n")) { if(!l.trim()) continue;
          let f; try{f=JSON.parse(l)}catch{continue}
          const c=f.message&&f.message.content; if(!Array.isArray(c)) continue;
          for(const b of c) if(b.type==="toolCall" && ["bash","edit","write"].includes(b.name)) names.add(b.name);
        }
        if(names.size) console.log([...names].join(", "));
      });' 2>/dev/null)
    [ -n "$hit" ] && BAD="$BAD $hit"
done
if [ -z "$BAD" ]; then
    step "C 这一轮没有用过 bash / edit / write" "✓"
else
    step "C 这一轮没有用过 bash / edit / write" "✗ 用了：$BAD"
    failures=$((failures+1))
fi

# ── D. 思考档**真的作用到模型上了** —— 只断言确定性的一半（2026-09-30）
#
# 判据是 pi 自己写进会话文件的 thinking block：思考**关**时它连 `reasoning_content`
# 都不收，一个 block 都不会有。
#
# ⚠️⚠️ **反方向不能断言**（第一版就是这么错的）：思考**开**只代表"允许它想"，
# **不代表它一定会想** —— 实测同一个问题两次，一次 1 个 thinking block、一次 0 个。
# 把它写成断言会随机报红，而那**不是**功能坏了。所以：
#   · **D1（断言）**：实时轮配的是"关" → 新增帧里必须 **0 个** thinking block；
#   · **D2（只报告）**：执行轮配的是"开" → 打印 block 数，**不做断言**。
# 真正确定性的判据是 **G**：pi 自己记下的 `thinking_level_change` 必须等于该角色配的档。
#
# ⚠️ 两轮必须分开看 —— 测试期间两个角色被故意设成不同的（见文件头的卫生段）。
count_thinking() {   # count_thinking <行数快照文件>
    local snap="$1" total=0 n
    for f in "$SESSION_DIR"/*.jsonl; do
        [ -f "$f" ] || continue
        local before
        before=$(grep "^$f=" "$snap" 2>/dev/null | cut -d= -f2); before=${before:-0}
        local delta
        delta=$(tail -n +"$((before + 1))" "$f" 2>/dev/null)
        [ -z "$delta" ] && continue
        n=$(printf '%s\n' "$delta" | node -e '
          let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
            let n=0;
            for (const l of raw.split("\n")) { if(!l.trim()) continue;
              let f; try{f=JSON.parse(l)}catch{continue}
              const c=f.message&&f.message.content; if(!Array.isArray(c)) continue;
              for(const b of c) if(b.type==="thinking") n++;
            }
            console.log(n);
          });' 2>/dev/null)
        total=$((total + ${n:-0}))
    done
    echo "$total"
}
RT_THINK=$(count_thinking "$REALTIME_BEFORE")
EX_THINK=$(count_thinking "$BEFORE_FILE")
if [ "$RT_THINK" = 0 ]; then
    step "D1 实时轮没有 thinking block（配的是思考关）" "✓"
else
    step "D1 实时轮没有 thinking block（配的是思考关）" "✗ 有 $RT_THINK 个 —— 思考档没按设置走"
    failures=$((failures+1))
fi
step "D2 执行轮的 thinking block 数（只报告，不断言）" "= ${EX_THINK}（模型对简单问题可以不想）"

# ── E. 设置里配的模型，provider 名必须真实存在（配置里对得上）
#
# 纯静态检查：从 `PiModeSettings.json` 取出两个模式配的模型 id，去 `pi --list-models`
# 的真实输出里找 provider。
#
# 这正是上一层「没有返回」的根因，但它**不体现在会话文件里**（pi 连会话都没建），
# 所以只能这样查。
#
# ⚠️ 2026-09-29 深夜改：这条原来是从源码里 grep `"--model", "…"` —— 现在
#    模型不再是启动参数，而是每轮用官方 `set_model` 设下去（见 `applyModelAndThinking`），
#    源码里没有那个字面量了。所以改成**直接查配置**（那才是唯一真相）。
MODEL_SETTINGS="$HOME/Library/Application Support/Wanna/PiModeSettings.json"
MODEL_IDS=$(python3 -c '
import json,sys
try:
    d=json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for k in ("realtimeModelID","executeModelID"):
    v=d.get(k)
    if v: print(v)
' "$MODEL_SETTINGS" 2>/dev/null)
if [ -z "$MODEL_IDS" ]; then
    step "E 配的模型 provider 名真实存在" "✗ 读不到 PiModeSettings.json 里的模型 id"
    failures=$((failures+1))
else
    BAD_PROVIDER=""
    while IFS= read -r mid; do
        [ -z "$mid" ] && continue
        prov="${mid%%/*}"
        pi --list-models 2>/dev/null | awk 'NR>1{print $1}' | grep -qx "$prov" || BAD_PROVIDER="$BAD_PROVIDER $mid"
    done <<< "$MODEL_IDS"
    if [ -z "$BAD_PROVIDER" ]; then
        step "E 配的模型 provider 名真实存在" "✓"
    else
        step "E 配的模型 provider 名真实存在" "✗ 配置里没有：$BAD_PROVIDER"
        failures=$((failures+1))
    fi
fi

# ── G. ⭐ **每一轮实际跑的模型与思考档 = 那一轮角色在设置里配的那一份**（2026-09-30 改成两轮）
#
# 用户的要求逐字：「必须根据用户（设置页面 or 窗口中的选项中的模型参数为准），做好匹配，
# **窗口中选择思考开，实际的时候，就思考开**」。
#
# 判据是 pi **自己写进会话文件的**两条记录（不是我们的日志 —— 日志只能证明我们"发了命令"，
# 会话文件才能证明"pi 真的换了"）：
#   · `model_change`          → provider + modelId
#   · `thinking_level_change` → thinkingLevel
#
# ⚠️ **两轮都要查**，而且测试期间两个角色被故意设成不同的思考档（见文件头的卫生段）：
# 只查一轮的话，"代码永远用同一个角色那一行"这种 bug 照样能过。
# 进程刚起来时 `appliedModelID` 是 nil，所以**第一轮一定会发 set_model**。
#
# ⚠️⚠️ **模型是"变了才发"的**（`applyModelAndThinking` 有意跳过重复命令 —— 每轮都发会
# 往会话文件里灌一串 `model_change`）。所以两轮里只有**第一轮**一定带模型记录，
# 后面几轮沿用同一个模型时**没有** `model_change`。判据据此分两条：
#   · 思考档 —— 每轮都必须有，且必须等于该角色的设置（测试把两角色设成不同，所以必然触发）；
#   · 模型   —— **有就查，没有就算沿用上一轮**（"用错模型"这种 bug 会让它多出一条不符的记录）。
last_change() {   # last_change <行数快照文件>  → 打印 "provider|model thinkingLevel"（缺的留空）
    local snap="$1"
    for f in "$SESSION_DIR"/*.jsonl; do
        [ -f "$f" ] || continue
        local before
        before=$(grep "^$f=" "$snap" 2>/dev/null | cut -d= -f2); before=${before:-0}
        tail -n +"$((before + 1))" "$f" 2>/dev/null
    done | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
        let model="", think="";
        for (const l of raw.split("\n")) { if(!l.trim()) continue;
          let f; try{f=JSON.parse(l)}catch{continue}
          if(f.type==="model_change") model=(f.provider||"")+"|"+(f.modelId||"");
          if(f.type==="thinking_level_change") think=f.thinkingLevel||"";
        }
        console.log(model+" "+think);
      });' 2>/dev/null
}
expected_for() {  # expected_for realtime|execute
    python3 -c '
import json,sys
role=sys.argv[2]
try: d=json.load(open(sys.argv[1]))
except Exception: sys.exit(0)
mid=d.get(role+"ModelID","")
on=d.get(role+"ThinkingEnabled",False)
print(mid.replace("/","|",1) + " " + ("medium" if on else "off"))
' "$MODEL_SETTINGS" "$1" 2>/dev/null
}

for ROLE in realtime execute; do
    if [ "$ROLE" = realtime ]; then SNAP="$REALTIME_BEFORE"; LABEL="实时"; else SNAP="$BEFORE_FILE"; LABEL="执行"; fi
    EXP=$(expected_for "$ROLE")
    EXP_MODEL="${EXP%% *}"; EXP_THINK="${EXP##* }"
    GOT=$(last_change "$SNAP")
    GOT_MODEL="${GOT%% *}"; GOT_THINK="${GOT##* }"
    if [ -z "$EXP" ]; then
        step "G ${LABEL}轮：实际 = 设置里那一份" "✗ 读不到设置"
        failures=$((failures+1))
    elif [ "$GOT_THINK" != "$EXP_THINK" ]; then
        step "G ${LABEL}轮：思考档 = 设置里那一份" "✗ 设置是「${EXP_THINK}」，实际跑的是「${GOT_THINK}」"
        failures=$((failures+1))
    elif [ -n "$GOT_MODEL" ] && [ "$GOT_MODEL" != "$EXP_MODEL" ]; then
        step "G ${LABEL}轮：模型 = 设置里那一份" "✗ 设置是「${EXP_MODEL}」，实际跑的是「${GOT_MODEL}」"
        failures=$((failures+1))
    else
        # ⚠️ 花括号不能省：后面紧跟全角括号，bash 会把 `$EXP_MODEL）` 整个当变量名
        #    （`set -u` 下直接 unbound variable —— 这个脚本自己的注释警告过一次，我还是踩了）。
        MODEL_NOTE="${GOT_MODEL:-沿用上一轮}"
        step "G ${LABEL}轮：实际 = 设置里那一份（${MODEL_NOTE} / ${EXP_THINK}）" "✓"
    fi
done

# ── F / G. 回答真的被喂给播报且真的出了声（2026-09-29 补，修的就是这一环）
#
# 背景：Pi 换血时把**唯一**喂播报会话的那行随旧流式回调一起删掉了
#（`feed(cumulativeSpeakableText:)` 全仓只剩语音聊天在用），于是：
#   · `finishStreaming()` 只报「the whole reply played / first audio never started」
#   · 用户设置「回答文字多留一会儿」= 0 秒时，清空逻辑见 `isPlaying == false`
#     就下一拍把卡片擦了 —— 真机上就是「点了进 agent，**没有回复**」。
# 判据全部取自**这一轮新长出来的** stdout 行（不猜时间点）。
# ── F. 回答真的出了声（2026-09-29 补，修的就是这一环）
#
# 判据只看**诊断日志**，不看 stdout：App 写 stdout 到文件是**块缓冲**的，中途读
# 会「明明喂了却说没喂」（第一版就是这么错的，和 D50「假的空」同一族）。
# 「出声」只能发生在会话被喂过文字之后，所以它同时覆盖「喂了」与「真的出声」两件事；
# 而它正是卡片能留在屏上的原因（清空逻辑等 `isPlaying` 结束，
# 用户「回答文字多留一会儿」= 0 秒时，没声音就等于卡片一闪就没）。
# 出声比 B（Pi 完成）晚：合成 + 下载要 ~0.6-1 秒，所以等一等。
SPOKE=0
for _ in $(seq 1 25); do
    if new_diag | grep -q "出声"; then SPOKE=1; break; fi
    sleep 1
done
if [ "$SPOKE" = 1 ]; then
    step "F 回答真的出了声（出声）" "✓"
    new_diag | grep "出声" | head -1 | sed 's/^/      /'
else
    step "F 回答真的出了声（出声）" "✗ 静默 —— 卡片也会因此一闪就被清掉（见 D58）"
    failures=$((failures+1))
fi

# ── 收尾：关掉测试实例（只杀自己起的那个 pid）
kill -TERM "$APP_PID" 2>/dev/null
sleep 1
pkill -TERM -f "$APP_BINARY" 2>/dev/null

# ── 还原测试前的存储（测试卫生）—— **必须在 kill 之后**，否则 App 退出时
#    可能又把内存里那一份写回来。
restore_test_hygiene
restore_pimode
step "卫生：会话库 / pi 会话 / 模型设置已还原" "✓"

echo "──────────────────────────────────────────────────────"
if [ "$failures" = 0 ]; then echo "✅ 通过（agent 模式能正常返回）"; exit 0
else echo "❌ 失败：$failures 项"; exit 1; fi
