#!/bin/bash
#  direction-board-flow-check.sh
#
#  **走一遍用户的真实流程，每一步都量"右上角那块看板在不在屏上"。**
#
#  为什么要这个脚本（用户 2026-09-28：「你必须模仿用户的真实的操作情况……你自己造成的问题你自己改，
#  反复测试至少三次，完全没有任何问题再告诉我」）：
#  这台机器上音箱的声音进不了麦克风（耦合峰值 212–447/32768，对 0.25 的 VAD 门槛差约 20 倍），
#  所以我一直没法自己走一遍"按下快捷键→说话→再按一次→进 agent 模式"——而那正是用户反复报问题的路。
#  装上 `WANNA_SYNTHETIC_TRANSCRIPT` 之后，**除了"音频从哪来"被替换，其余每一环都是真的**：
#  真的按快捷键、真的走录音状态机与相位机、真的提交、真的调模型、真的播报。
#
#  用法：`bash scripts/direction-board-flow-check.sh [第几轮]`
#  退出码 0 = 这一轮全部检查点都对。

set -u
ROUND="${1:-1}"
cd "$(dirname "$0")/.." || exit 2

APP_DIR=$(xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{print $2}')
APP_BINARY="$APP_DIR/Wanna.app/Contents/MacOS/Wanna"
LOG="/tmp/wanna-board-flow-$ROUND.log"

failures=0
step() { printf '  %-34s %s\n' "$1" "$2"; }

echo "── 第 $ROUND 轮 ───────────────────────────────────────"
# 上一轮可能还留着，先清干净（只杀这一个路径下的进程 —— 用户在用的 /Applications 那份不动）
pkill -f "$APP_BINARY" 2>/dev/null
sleep 1

WANNA_SYNTHETIC_TRANSCRIPT="1 加 1 等于几" "$APP_BINARY" > "$LOG" 2>&1 &
APP_PID=$!
sleep 4

board() { swift scripts/board-visibility-probe.swift "$APP_PID" | sed 's/board=//; s/ frame=.*//'; }
board_frame() { swift scripts/board-visibility-probe.swift "$APP_PID"; }

check() {   # check <期望> <说明>
    local expected="$1" label="$2" actual
    actual=$(board)
    if [ "$actual" = "$expected" ]; then
        step "$label" "✅ ${actual}"
    else
        step "$label" "❌ ${actual}（期望 ${expected}；$(board_frame)）"
        failures=$((failures + 1))
    fi
}

# ① 刚启动：还没说话，看板不该在
check HIDDEN "① 启动后（还没说话）"

# ② 第一次按下 = 实时模式：说出的字到了之后，看板应该在
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null
sleep 2.5
check VISIBLE "② 第一次按下 + 说话（实时模式）"

# ③ 第二次按下 = 提交 → agent 模式：**看板必须立刻消失**
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null
sleep 2
check HIDDEN "③ 第二次按下（进 agent 模式）"

# ④ 等回答开播（这一刻会武装追问窗口 —— 旧版本正是在这里冒出来的"偶尔显示一下"）
sleep 8
check HIDDEN "④ 回答开播 / 追问窗口武装后"

# ⑤ 等回答念完（播完 30 秒窗口重新起算的那一刻）
sleep 12
check HIDDEN "⑤ 回答念完之后"

# ⑥ ESC 打断 / 退出
osascript -e 'tell application "System Events" to key code 53' > /dev/null 2>&1
sleep 2
check HIDDEN "⑥ ESC 之后"

# ⑦ 多等一会儿，确认它不会自己冒出来（"粘在鼠标上"那个症状）
sleep 5
check HIDDEN "⑦ 再等 5 秒（确认没有回弹）"

# ⑧ **一次全新的按下要能把它叫回来** —— 否则"agent 模式"那个旗标就是清不掉的，
#    下一轮说话时看板永远不出现（这条是给那个反向 bug 兜底的）。
swift scripts/talk-shortcut-probe.swift press   > /dev/null
swift scripts/talk-shortcut-probe.swift release > /dev/null
sleep 4
check VISIBLE "⑧ 全新一轮按下（看板要回来）"
osascript -e 'tell application "System Events" to key code 53' > /dev/null 2>&1
sleep 1.5


kill -TERM "$APP_PID" 2>/dev/null
sleep 1

if [ "$failures" -eq 0 ]; then
    echo "  第 $ROUND 轮：全部检查点通过 ✅"
    exit 0
else
    echo "  第 $ROUND 轮：$failures 个检查点失败 ❌   （日志：${LOG}）"
    exit 1
fi
