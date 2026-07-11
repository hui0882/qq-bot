#!/bin/bash

# Hook 脚本：检查是否有权限执行开发任务
# 这个脚本会在写入文件之前被调用
#
# 功能：
# 1. 检查当前是否在 main 分支上修改代码文件
# 2. 如果是，警告用户应该使用开发 Agent
# 3. 记录操作日志用于审计

# 获取当前分支
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

# 获取当前工作目录
CURRENT_DIR=$(pwd)

# 日志文件
LOG_FILE="/Users/makabaka/code/napcatQQ/data/logs/hooks.log"

# 检查是否在项目根目录下
PROJECT_ROOT="/Users/makabaka/code/napcatQQ"
if [[ "$CURRENT_DIR" != "$PROJECT_ROOT"* ]]; then
  # 不在项目目录下，允许操作
  exit 0
fi

# 记录日志
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Hook triggered - Branch: $CURRENT_BRANCH, Dir: $CURRENT_DIR" >> "$LOG_FILE"

# 检查是否在 main 分支上修改代码文件
if [[ "$CURRENT_BRANCH" == "main" ]]; then
  # 检查修改的文件是否是代码文件（.ts, .tsx, .js, .jsx）
  # 这里通过检查文件扩展名来判断
  MODIFIED_FILES=$(git diff --name-only 2>/dev/null || true)

  CODE_FILES_FOUND=false
  for file in $MODIFIED_FILES; do
    if [[ "$file" =~ \.(ts|tsx|js|jsx)$ ]]; then
      CODE_FILES_FOUND=true
      break
    fi
  done

  if [[ "$CODE_FILES_FOUND" == "true" ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Code modification detected on main branch" >> "$LOG_FILE"
    echo "⚠️ 警告：检测到在 main 分支上修改代码文件"
    echo "请使用开发 Agent (subagent_type='developer') 来执行开发任务"
    echo "如果这是非开发操作（如更新文档），请忽略此警告"
    # 不阻止操作，只是警告
    exit 0
  fi
fi

# 如果在 feature 分支上，允许操作
# 这里可以添加更复杂的逻辑来判断是否是开发任务
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Operation allowed" >> "$LOG_FILE"
exit 0
