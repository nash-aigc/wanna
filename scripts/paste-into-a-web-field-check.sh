#!/bin/bash
#  paste-into-a-web-field-check.sh
#
#  **验「粘贴到底有没有落到用户的光标位置」** —— 靶子是浏览器里的一个网页文本框
#  （和 Notion / Orca 同一类：不是原生文本控件），而且**每一步都能读回证据**。
#
#  用户 2026-09-28 报的：
#    「实时模式，com+enter，无法粘贴（右下角内容到光标位置）；录音完成也无法粘贴到光标位置。
#      但是某些软件 Zed 使用时能粘贴，Orca、notion 等等无法实现粘贴」
#
#  ⚠️ 第一版这个脚本拿**终端**当靶子，而"终端进了 cat 状态"那句 ✅ 是**假断言** ✗
#  （只证明我发过按键，没证明按键落地）—— 后来对照实验里连 System Events 的 ⌘V 都"没落地"，
#  才发现靶子根本没准备好，整个实验是坏的。所以这一版**每步都读回**：
#  靶子页面的文本框内容用 Accessibility 读（`kAXValueAttribute`），空 → 失败，有字 → 真的成了。
#
#  用法：`bash scripts/paste-into-a-web-field-check.sh`
#  退出码 0 = 文字真的落进了目标窗口。

set -u
cd "$(dirname "$0")/.." || exit 2

TARGET_PAGE=/tmp/wanna-paste-target.html
APP_DIR=$(xcodebuild -project Wanna.xcodeproj -scheme Wanna -configuration Debug -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{print $2}')
APP_BINARY="$APP_DIR/Wanna.app/Contents/MacOS/Wanna"
LOG=/tmp/wanna-paste-web-check.log

step() { printf '  %-42s %s\n' "$1" "$2"; }
failures=0

pkill -f "$APP_BINARY" 2>/dev/null
sleep 1

if [ ! -f "$TARGET_PAGE" ]; then
    echo "缺少靶子页面 $TARGET_PAGE"; exit 2
fi

echo "── 靶子：浏览器里的网页文本框（不是原生文本控件）──────────────"
open -a Safari "$TARGET_PAGE"
sleep 4
osascript -e 'tell application "Safari" to activate' >/dev/null 2>&1
sleep 1
swift scripts/ax-text-field-probe.swift focus >/dev/null
sleep 0.5
before=$(swift scripts/ax-text-field-probe.swift read)
step "① 靶子就位（此刻应为空）" "$(echo "$before" | head -1)"

# 起 Wanna：合成一句话 → 第一次按下（实时模式）→ 第二次按下（提交）→ 等回答
WANNA_SYNTHETIC_TRANSCRIPT="屏幕上这个是什么软件" "$APP_BINARY" > "$LOG" 2>&1 &
APP_PID=$!
sleep 5
swift scripts/talk-shortcut-probe.swift press > /dev/null
sleep 4
swift scripts/talk-shortcut-probe.swift press > /dev/null
sleep 12   # 等回答念完，右下角那张卡片里有内容

# 把焦点交回 Safari 的文本框，再让看板按下 ⌘⏎（它的语义就是"粘贴并退出"）
osascript -e 'tell application "Safari" to activate' >/dev/null 2>&1
sleep 1
swift scripts/ax-text-field-probe.swift focus >/dev/null
sleep 0.5
swift scripts/board-shortcut-probe.swift commandReturn >/dev/null
sleep 3

after=$(swift scripts/ax-text-field-probe.swift read)
content=$(echo "$after" | sed -n 's/^当前内容（[0-9]* 字）：//p')
if [ -n "$content" ]; then
    step "② 文字真的落进了目标窗口" "✅ $(echo "$after" | head -1)"
    echo "      $(echo "$content" | head -c 100)"
else
    step "② 文字真的落进了目标窗口" "❌ 目标窗口还是空的"
    failures=$((failures + 1))
fi

echo "  ── 粘贴那一发的日志 ──"
grep -E "粘贴" ~/Library/Application\ Support/Wanna/主Agent诊断.log | tail -2 | sed 's/^/      /'

kill -TERM "$APP_PID" 2>/dev/null
sleep 1
if [ "$failures" -eq 0 ]; then echo "  通过 ✅"; exit 0; else echo "  $failures 处失败 ❌"; exit 1; fi
