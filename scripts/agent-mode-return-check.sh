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
#  判据全部取自诊断日志（🥧 行），不猜时间点：
#    A. 这一轮**真的交给了 Pi**（否则是空跑）；
#    B. 在超时之前出现 **「🥧 Pi 完成」**；
#    C. Pi 的会话文件里**一次 bash / edit / write 都没有**（工具真的被摘掉了）。

set -u
cd "$(dirname "$0")/.." || exit 2

APP_DIR=$(xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{print $2}')
APP_BINARY="$APP_DIR/Wanna.app/Contents/MacOS/Wanna"
DIAG="$HOME/Library/Application Support/Wanna/主Agent诊断.log"
TIMEOUT_SECONDS="${1:-90}"

failures=0
step() { printf '  %-46s %s\n' "$1" "$2"; }

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

# ── 收尾：关掉测试实例（只杀自己起的那个 pid）
kill -TERM "$APP_PID" 2>/dev/null
sleep 1
pkill -TERM -f "$APP_BINARY" 2>/dev/null

echo "──────────────────────────────────────────────────────"
if [ "$failures" = 0 ]; then echo "✅ 通过（agent 模式能正常返回）"; exit 0
else echo "❌ 失败：$failures 项"; exit 1; fi
