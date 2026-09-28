#!/bin/bash
#
# 《项目全貌》事实核查 —— **文档里说的数字和名字，和实际对不对。**
#
# ## 为什么需要它（2026-09-29 用户问「如何才能让你不出错呢」之后写的）
#
# 那天我犯的八次错里，有两次是**同一类**：
#   · 文档写「10 个工具」—— 实际 18（写了之后又加了 8 个，忘了回头改）
#   · 文档写「命令 ×2」放在 Python 底下 —— 而 Python **根本没有跑命令的工具**
#
# 两次都不是"改错了代码"，是**"描述现状的时候靠记忆、不靠核实"**。
# 而《项目全貌》是**给用户看的** —— 他照着一张错的图做决定。
#
# 所以把"能自动对上的部分"挂成闸门：**文档说几个，就去数几个；对不上直接拒。**
#
# ## 它查什么（只查"能用机器数出来"的）
#
#   ① 工具数：文档说「N 个动作」，就去数 WannaMCPTools.swift 里的工具声明
#   ② 技能数：文档说「技能 ×N」，就去数 skills/ 下的文件夹
#   ③ 图 2 里列的每个工具名，都得真的存在
#   ④ 位置表里的每条路径，都得真的在
#
# ## 它**不**查什么（说清楚，免得误以为它管全了）
#
#   它管不了"措辞对不对""这张图讲清楚没有""某个说法是不是已经过期" ——
#   那些仍然只能靠人。**它拦的是"数字和名字"这一类，也是我实际犯的那一类。**
#
# 用法：`scripts/overview-fact-check.sh`（退出码非 0 = 对不上）
#
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DOC="$ROOT/全局框架/00-项目全貌.md"
TOOLS="$ROOT/Wanna/WannaMCPTools.swift"
SKILLS="$HOME/Documents/SuperAgent/APP/Design/wanna/skills"

[ -f "$DOC" ] || { echo "⚠️ 找不到 $DOC"; exit 0; }
[ -f "$TOOLS" ] || { echo "⚠️ 找不到 $TOOLS"; exit 0; }

failures=0
note() { echo "     $1"; }
fail() { echo "  ✗ $1"; failures=$((failures + 1)); }

echo "── 《项目全貌》事实核查"

# ── ① 工具数 ────────────────────────────────────────────────────────────
# 数的是「声明表」里那一串 —— 每个工具一个 `xxxDeclaration`
# 数**唯一**的 xxxDeclaration 标识符 —— 它出现两次（声明 + 清单），sort -u 去重后正好一个工具一个。
ACTUAL_TOOLS=$(grep -oE '\b[a-zA-Z]+Declaration\b' "$TOOLS" | sort -u | wc -l | tr -d ' ')
DOC_TOOLS=$(grep -oE '（[0-9]+ 个动作）' "$DOC" | grep -oE '[0-9]+' | head -1)

if [ -z "$DOC_TOOLS" ]; then
    fail "文档里没找到「（N 个动作）」这句 —— 无法核对工具数"
elif [ "$DOC_TOOLS" != "$ACTUAL_TOOLS" ]; then
    fail "工具数对不上：文档说 $DOC_TOOLS 个，实际 $ACTUAL_TOOLS 个"
    note "核对方式：数 $TOOLS 里的 xxxDeclaration 声明"
else
    echo "  ✓ 工具数 $ACTUAL_TOOLS"
fi

# ── ② 技能数 ────────────────────────────────────────────────────────────
if [ -d "$SKILLS" ]; then
    ACTUAL_SKILLS=$(ls -d "$SKILLS"/*/ 2>/dev/null | wc -l | tr -d ' ')
    DOC_SKILLS=$(grep -oE '技能 ×[0-9]+' "$DOC" | grep -oE '[0-9]+' | head -1)
    if [ -z "$DOC_SKILLS" ]; then
        fail "文档里没找到「技能 ×N」—— 无法核对技能数"
    elif [ "$DOC_SKILLS" != "$ACTUAL_SKILLS" ]; then
        fail "技能数对不上：文档说 $DOC_SKILLS 个，实际 $ACTUAL_SKILLS 个"
        note "核对方式：数 $SKILLS 下的文件夹"
    else
        echo "  ✓ 技能数 $ACTUAL_SKILLS"
    fi
else
    fail "技能目录不存在：$SKILLS"
fi

# ── ③ 图 2 里列的每个工具名，都得真的存在 ───────────────────────────────
# 只认「T数字["名字<br/>…」这个形状 —— 图 2 里每一格都是这么写的。
MISSING=""
while read -r name; do
    [ -z "$name" ] && continue
    if ! grep -q "\"$name\"" "$TOOLS"; then
        MISSING="$MISSING $name"
    fi
done < <(grep -oE 'T[0-9]+\["[a-z_]+' "$DOC" | sed 's/.*"//' | sort -u)

if [ -n "$MISSING" ]; then
    fail "图 2 里这些工具名在代码里找不到：$MISSING"
else
    echo "  ✓ 图 2 里的工具名全部存在"
fi

# ── ④ 位置表里每条路径都得在 ────────────────────────────────────────────
MISSING_PATH=""
while read -r path; do
    [ -z "$path" ] && continue
    expanded="${path/#\~/$HOME}"
    expanded="${expanded//<仓库>/$ROOT}"
    [ -e "$expanded" ] || MISSING_PATH="$MISSING_PATH $path"
done < <(grep -oE '`(~/[^`]+|<仓库>/[^`]+)`' "$DOC" | tr -d '`' | sort -u)

if [ -n "$MISSING_PATH" ]; then
    fail "位置表里这些路径不存在：$MISSING_PATH"
else
    echo "  ✓ 位置表里的路径全部存在"
fi

echo
if [ "$failures" -gt 0 ]; then
    echo "⛔ 有 $failures 处对不上 —— 《项目全貌》是给用户看的，先把它改对。"
    echo "   （改法：跑一遍上面'核对方式'那条命令，按实际数字改文档）"
    exit 1
fi
echo "✓ 《项目全貌》说的数字和名字，与实际一致。"
