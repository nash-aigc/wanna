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
#  判据全部取自诊断日志（🥧 行），不猜时间点：
#    A. 这一轮**真的交给了 Pi**（否则是空跑）；
#    B. 在超时之前出现 **「🥧 Pi 完成」**；
#    C. Pi 的会话文件里**一次 bash / edit / write 都没有**（工具真的被摘掉了）；
#    D. 这一轮新增的帧里**没有 thinking block**（`--thinking off` 真的生效了）；
#    E. 传给 Pi 的 `--model` 用的是**配置里真实存在的 provider 名**（2026-09-29 补）；
#    F. 回答**真的出了声**（诊断日志里的「出声」）—— 这是「agent 模式没有回复」的第二层（2026-09-29 补）。
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
HYGIENE_PI_LINES="/tmp/wanna-check-pi-lines.txt"
cp "$SUPPORT/ConversationSessions.json" "$HYGIENE_SESSIONS_BAK" 2>/dev/null
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
# ⚠️ **两次**：用户那条快捷键是「点两下说话」模式，第一次是开始录、第二次才是
#    停止并提交（只按一次会一直录下去 —— 实测录了 120 秒才被我杀掉）。
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null
sleep 2.5
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null

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

# ── D. 这一轮**新追加的帧**里有没有 thinking block
#
# `--thinking off` 生效时，Pi 不会写 thinking block（它连 reasoning_content 都不收）。
# 判据同样只看增量 —— 旧历史里留着修复前的 25 个 thinking block，整文件数会永远非零。
THINKING_HITS=0
for f in "$SESSION_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    before=$(grep "^$f=" /tmp/wanna-agent-return-before.txt 2>/dev/null | cut -d= -f2)
    before=${before:-0}
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
    THINKING_HITS=$((THINKING_HITS + ${n:-0}))
done
if [ "$THINKING_HITS" = 0 ]; then
    step "D 这一轮没有 thinking block（非思考模式）" "✓"
else
    step "D 这一轮没有 thinking block（非思考模式）" "✗ 有 $THINKING_HITS 个 —— --thinking off 没生效"
    failures=$((failures+1))
fi

# ── E. `--model` 里的 provider 名必须真实存在（配置里对得上）
#
# 纯静态检查：从源码里取出那一行，去 `pi --list-models` 的真实输出里找。
# 这正是上一层「没有返回」的根因，但它**不体现在会话文件里**（pi 连会话都没建），
# 所以只能这样查。
#
# ⚠️ `"${MODEL_LINE}"` 的花括号不能省：后面紧跟全角中文括号「（」，
#    bash 会把 `$MODEL_LINE（` 整个当成变量名去解析，`set -u` 下直接 `unbound variable`。
#    （这是 D50「zsh 不分词」那一族：语言把"看起来是两样东西"当成了一样。）
MODEL_LINE=$(grep -oE '"--model", "[^"]+"' Wanna/PiAgentRunner.swift | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
if [ -z "$MODEL_LINE" ]; then
    step "E --model 的 provider 名真实存在" "✗ 源码里找不到 --model（写法变了？）"
    failures=$((failures+1))
else
    PROVIDER="${MODEL_LINE%%/*}"
    if pi --list-models 2>/dev/null | awk 'NR>1{print $1}' | grep -qx "$PROVIDER"; then
        step "E --model 的 provider 名真实存在（${MODEL_LINE}）" "✓"
    else
        step "E --model 的 provider 名真实存在（${MODEL_LINE}）" "✗ 配置里没有 provider「${PROVIDER}」"
        failures=$((failures+1))
    fi
fi

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
step "卫生：会话库与 pi 会话已还原" "✓"

echo "──────────────────────────────────────────────────────"
if [ "$failures" = 0 ]; then echo "✅ 通过（agent 模式能正常返回）"; exit 0
else echo "❌ 失败：$failures 项"; exit 1; fi
