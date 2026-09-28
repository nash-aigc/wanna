#!/bin/bash
#  listening-stop-check.sh
#
#  **用户报的第一条**（2026-09-28）：「我进入了 agent 模式之后，我退出了……他这个持续监听应该也退出啊？
#  如果我手动的去退出了，那相当于是我代表这个任务，我说明这个任务已经完成了呀？他还是在监听我，
#  这是不对的，**那相当于是永远无法停止**」。
#
#  要验的就是这件事，分两段：
#    A. 回答**念完之后**，30 秒的追问窗口必须真的武装起来（否则这个检查是空跑）；
#    B. 这一刻**手动退出** —— 再按一次快捷键、或者按 ESC —— 窗口必须关掉，
#       而且**之后 10 秒内不许自己回来**（修之前它会自己在 30 毫秒后重新武装）。
#
#  判据全部取自 `BuddyDictationManager` 自己打的那几行（"started" = 武装、"ended" = 关掉），
#  不去猜时间点：脚本只负责在正确的时刻制造那一次按键，剩下的看日志。
#
#  用法：`bash scripts/listening-stop-check.sh <1=再按一次快捷键 | 2=按 ESC>`
#  退出码 0 = 这一轮通过。

set -u
HOW="${1:-1}"
cd "$(dirname "$0")/.." || exit 2

APP_DIR=$(xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{print $2}')
APP_BINARY="$APP_DIR/Wanna.app/Contents/MacOS/Wanna"
LOG="/tmp/wanna-listening-stop-$HOW.log"

failures=0
step() { printf '  %-40s %s\n' "$1" "$2"; }

echo "── 退出方式：$([ "$HOW" = "1" ] && echo '再按一次快捷键' || echo 'ESC') ────────────"
pkill -f "$APP_BINARY" 2>/dev/null
sleep 1
rm -f "$LOG"

WANNA_SYNTHETIC_TRANSCRIPT="请详细说明一下这个软件界面上都有哪些按钮，它们各自是做什么用的" \
  "$APP_BINARY" > "$LOG" 2>&1 &
APP_PID=$!
sleep 4

# 从"日志的第 N 行之后"里找某一行出现过没有
seen_since() {  # seen_since <起始行号> <模式>
    tail -n +"$1" "$LOG" | grep -qE "$2"
}
line_count() { wc -l < "$LOG" | tr -d ' '; }

# ── 第 1 次按下：实时模式，识别器喂进那句话 ────────────────────────────────
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null
sleep 2.5

# ── 第 2 次按下：提交 → agent 模式，模型开始回答 ──────────────────────────
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null

# ── A. 等"回答念完之后窗口武装起来"。最多等 60 秒 ─────────────────────────
armed=0
for _ in $(seq 1 60); do
    if seen_since 1 "BuddyDictationManager: continuous listening started"; then armed=1; break; fi
    sleep 1
done
if [ "$armed" = "1" ]; then
    step "A 回答念完后，30 秒窗口武装" "✅"
else
    step "A 回答念完后，30 秒窗口武装" "❌ 60 秒内没看到武装（这个检查是空跑）"
    failures=$((failures + 1))
fi

sleep 2   # 让窗口稳定下来，别在武装的同一拍上就按键
MARK=$(line_count)

# ── B. 手动退出 ───────────────────────────────────────────────────────────
if [ "$HOW" = "1" ]; then
    swift scripts/talk-shortcut-probe.swift press   > /dev/null
    swift scripts/talk-shortcut-probe.swift release > /dev/null
else
    osascript -e 'tell application "System Events" to key code 53' > /dev/null 2>&1
fi

closed=0
for _ in $(seq 1 15); do
    if seen_since "$MARK" "continuous listening ended"; then closed=1; break; fi
    sleep 1
done
if [ "$closed" = "1" ]; then
    step "B 手动退出 → 窗口关掉" "✅"
else
    step "B 手动退出 → 窗口关掉" "❌ 15 秒内窗口没关（还在监听）"
    failures=$((failures + 1))
fi

# ── C. 关掉之后 10 秒内不许自己回来（旧版本在这里 30 毫秒就回来了）──────────
AFTER=$(line_count)
sleep 10
if seen_since "$AFTER" "continuous listening started"; then
    step "C 之后 10 秒不许自己武装回来" "❌ 它自己又武装了"
    failures=$((failures + 1))
    tail -n +"$AFTER" "$LOG" | grep -E "continuous listening" | tail -5 | sed 's/^/      /'
else
    step "C 之后 10 秒不许自己武装回来" "✅"
fi

# ── D. 顺带确认：退出之后麦克风的 tap 也撤了（"永远无法停止"的另一半）──────
if seen_since "$AFTER" "listening tap installed"; then
    step "D 退出后没有重新装麦克风 tap" "❌ 又装上了"
    failures=$((failures + 1))
else
    step "D 退出后没有重新装麦克风 tap" "✅"
fi

kill -TERM "$APP_PID" 2>/dev/null
sleep 1

if [ "$failures" -eq 0 ]; then
    echo "  通过 ✅   （日志：${LOG}）"
    exit 0
else
    echo "  $failures 处失败 ❌   （日志：${LOG}）"
    exit 1
fi
