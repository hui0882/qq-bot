#!/usr/bin/env bash
# =============================================================================
# agent-guard.sh — ZCode PreToolUse hook：高危 git 操作二次确认守卫
#
# 功能：
#   从 stdin 读取 ZCode hook 输入 JSON（字段含 tool_name、tool_input，
#   Bash 工具的命令在 tool_input.command 中）。
#   用 python3 解析出 command，若命中高危 git 操作（push / merge / rebase /
#   reset --hard / cherry-pick / revert / clean -f / branch -D /
#   checkout main|master），则输出 PreToolUse permission decision "ask" 的
#   JSON（弹窗让用户二次确认）。未命中或解析失败时无输出、exit 0（不拦截）。
#
# 依赖：
#   - python3（macOS 自带 /usr/bin/python3，用于 JSON 解析）
#   - grep -E（正则匹配）
#   python3 不可用或解析出错时兜底为不拦截（无输出，exit 0）。
#
# 配置说明（.zcode/config.json）：
#   hooks.events.PreToolUse 的 command 中使用 ${ZCODE_PROJECT_DIR} 指向项目根，
#   该变量是 ZCode 支持的模板变量（在 hook 命令中展开并注入为环境变量）。
#   若运行环境不支持该变量，可改用绝对路径：
#     bash /Users/makabaka/code/napcatQQ/.zcode/hooks/agent-guard.sh
# =============================================================================

set -u

# 1) 读取 stdin 全部内容（ZCode hook 输入 JSON）
INPUT=$(cat)

# 2) 用 python3 解析 JSON，提取 tool_input.command
#    command 可能不存在、为 null 或非字符串 → 兜底为空字符串
#    整个 stdin 不是合法 JSON → 兜底为空字符串（不拦截）
COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    cmd = data.get("tool_input", {}).get("command", "") or ""
except Exception:
    cmd = ""
sys.stdout.write(cmd)
' 2>/dev/null)

# 3) 高危 git 操作正则（grep -E，对整条 command 逐行匹配，多行命令也能覆盖）
#    - git push（含 --force / -f） / merge / rebase / cherry-pick / revert：
#      动作词后必须是空白或行尾，避免误伤 git merge-base 等无害命令
#    - git reset --hard（含 --hard 后的参数，如 HEAD）
#    - git clean -f（含 -fd / -fdx 等组合，前缀匹配 git clean -）
#    - git branch -D（大写 -D 强制删除）
#    - git checkout main / git checkout master（精确匹配分支名，不含 main-xxx）
HIGH_RISK_PATTERN='git (push|merge|rebase|cherry-pick|revert)([[:space:]]|$)|git reset --hard|git clean -[a-zA-Z]*f|git branch -D|git checkout (main|master)([[:space:]]|$)'

# 4) 命中高危操作 → 输出 permission decision "ask" 的 JSON（严格 schema，
#    只含 hookSpecificOutput 一个键，hookEventName 必须与实际事件一致）
#    未命中 → 无输出。两种情况均 exit 0（ask 由客户端弹窗，不阻塞调用）
if printf '%s' "$COMMAND" | grep -qE -- "$HIGH_RISK_PATTERN"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"高危 git 操作（merge/push/reset 等），需要用户二次确认"}}'
fi

exit 0
