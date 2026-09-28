#!/bin/bash
#
# 录音健康检查 —— **改完代码、提交之前跑这一条。**
#
#     scripts/recording-health-check.sh            # 快（读日志，<1 秒）
#     scripts/recording-health-check.sh --probe    # 另跑采集探针（约 1 分钟，占麦克风）
#
# 退出码 0 = 录音这条链路正常；非 0 = **判明坏了**，不许提交。
#
# ## 三种结论，别把它们混成两种
#
#   ✅ 通过      —— App 自检说这一场通了
#   ✗ 没通过    —— App 自检说这一场**坏了**（采集没块 / 服务端没回段 / 一个字都没有）
#   ⚠️ 未验证    —— **日志里还没有任何自检行**（还没录过，或装的是加自检之前的版本）
#
# ⚠️ 与 ✗ 是两件事，所以退出码也不同：**未验证不拦提交**（否则加了自检的那第一次提交
# 会把自己锁死 —— 没有新版本的自检行，就永远提交不了），但它会**大声说出来**。
# 真正该拦住"改了麦克风却没验证"的是 `--probe`：那条探针**自包含**，不依赖有没有
# 录过音，现在就能跑。所以 hook 在动了音频文件的提交上一定会带上它。
#
# ## 为什么要有它（用户 2026-09-28 提的问题）
#
# 「你的方法怎么样才能让 AI 知道他的修改已经让麦克风无法正常使用？如果他修改完之后
#   没有读到什么程序，或者没有去读到这些文件，那他就不知道。」
#
# 所以这条脚本**不是**给"想知道的时候"用的，它是给 `scripts/git-hooks/pre-commit`
# 用的 —— 由 git 在每一次提交时强制执行，AI 躲不掉，也不需要"记得去看"。
#
# ## 它判的是什么
#
# 判 **App 自己写的那一行自检**（`LongFormRecorderController.recordingSelfCheckLine`）：
# 每场录音结束 App 都会自己判一次"这一场通没通"并写进 `录音诊断.log`。
# 判据是两条（缺一不可，理由见那个函数的注释）：**采集有没有块** + **服务端有没有回段**。
# 「采到了但送不出去」这一类（D45，界面上一切正常、只是不出字）就死在这一条上。
#
set -uo pipefail

LOG="$HOME/Library/Application Support/Wanna/录音诊断.log"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"

strict=0
run_probe=0
for arg in "$@"; do
    case "$arg" in
        --strict) strict=1 ;;   # 保留：目前与默认行为相同，只为兼容旧的调用写法
        --probe)  run_probe=1 ;;
        *) echo "未知参数：$arg（可用：--strict / --probe）"; exit 2 ;;
    esac
done

failed=0
unverified=0
note() { printf '%s\n' "$*"; }

# ── ① App 自己写的那一行自检 ────────────────────────────────────────────────
if [ ! -f "$LOG" ]; then
    note "⚠️ 未验证：找不到录音诊断日志（$LOG）"
    unverified=1
else
    # 最后一行自检（App 每场录音结束写一行，形如 `✅ 录音自检：…`）
    last="$(grep -a "录音自检" "$LOG" | tail -1)"
    if [ -z "$last" ]; then
        note "⚠️ 未验证：日志里还没有任何自检行 —— 要么还没录过，要么装的是加自检之前的版本。"
        unverified=1
    else
        case "$last" in
            *"✅ 录音自检"*)
                note "✓ App 自检：${last##*] }"
                ;;
            *)
                note "✗ App 自检没过："
                note "   ${last##*] }"
                note "   最后一场录音在这一行（同一份日志里往前翻上下文）："
                grep -a -B 6 "录音自检" "$LOG" | tail -6 | sed 's/^/     /'
                failed=1
                ;;
        esac
    fi
fi

# ── ② 采集探针（可选，自包含：不依赖 App、不依赖有没有录过音）────────────────
#
# 它验的是"设备 → 重采样 → 能拿到真实样本"这一段，也就是本仓 2026-09-26 那类
# 「录出来全是零」的故障。`--probe` 才跑：它要占麦克风约一分钟。
if [ "$run_probe" = "1" ]; then
    if [ ! -f "$ROOT/scripts/recording-capture-probe.swift" ]; then
        note "⚠️ 找不到采集探针，跳过。"
    else
        note "… 跑采集探针（约 1 分钟，会占麦克风）"
        if (cd "$ROOT" && swift scripts/recording-capture-probe.swift); then
            note "✓ 采集探针通过"
        else
            note "✗ 采集探针**失败** —— 这条链路上录不到真实样本。"
            failed=1
        fi
    fi
fi

echo
if [ "$failed" -ne 0 ]; then
    note "──────────────────────────────────────────────────────────"
    note "录音健康检查**没通过**。上面那几行就是判据，别跳过它们去猜。"
    note "排查顺序（本仓既有）：开发经验/15-录音采集与设备自愈.md §七"
    note "──────────────────────────────────────────────────────────"
    exit 1
fi
if [ "$unverified" -ne 0 ]; then
    note "──────────────────────────────────────────────────────────"
    note "⚠️ **端到端那一段没有验证过**：日志里还没有 App 自检行，所以"
    note "   「采集 → 识别 → 文字上屏」这条链今天没有被任何机器判过。"
    note ""
    note "   如果你这次**动了音频/麦克风/识别相关的代码**，那么按 CLAUDE.md 的规矩："
    note "   **让用户录 30 秒**（中间停两次），再重跑这一条。App 会在录音结束时自己"
    note "   写一行 `✅/⚠️ 录音自检：…`，那才是这一段的判据。"
    note "──────────────────────────────────────────────────────────"
    exit 0
fi
note "录音健康检查通过。"
exit 0
