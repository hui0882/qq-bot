# 命令框架 — 待处理事项

**关联文档:** [2026-06-25-command-framework-design.md](2026-06-25-command-framework-design.md)  
**关联计划:** [2026-06-25-command-framework.md](../plans/2026-06-25-command-framework.md)  
**分支:** fix/config-persistence-and-voice-mode  
**状态:** 主体完成，以下为遗留优化项

---

## 1. `_userId` 参数预留

**文件:** `src/lib/commands/dispatcher.ts:67`  
**描述:** `checkConditions` 函数的 `_userId` 参数当前未使用，以下划线前缀标记。spec 中的伪代码签名包含此参数，为未来条件类型（如按用户等级限制命令）预留。  
**优先级:** 低  
**触发条件:** 新增需要用户维度判断的命令条件时启用

---

## 2. 设置页 Voice Reply 警告字段引用

**文件:** `src/app/(authenticated)/settings/page.tsx:240-242`  
**描述:** Voice Reply 区域的警告信息仍引用 `config.voiceReply?.allowUserOverride`，但规范字段已迁移到 `config.commands?.allowUserOverride`。当用户仅在命令管理区域切换开关时，旧警告不会同步更新。  
**优先级:** 低（cosmetic）  
**修复方案:** 将警告条件改为同时检查 `config.commands?.allowUserOverride ?? config.voiceReply?.allowUserOverride`，或直接移除旧警告（命令管理区域已可视化此状态）

---

## 3. `restart.sh` 意外提交

**文件:** `restart.sh`  
**描述:** 该文件在 Task 6 执行时被意外包含在提交中。脚本内容是强制终止 8090 端口进程（`kill -9`），属于开发辅助脚本，不应进入主分支。  
**优先级:** 中  
**修复方案:** 合入 main 前从分支中移除：`git rm restart.sh && git commit -m "chore: remove accidental restart.sh"`

---

## 4. `diffConfigs` 不跟踪 `commands.definitions` 变化

**文件:** `src/lib/config.ts:161-162`  
**描述:** `diffConfigs` 仅跟踪 `commands.enabled` 和 `commands.allowUserOverride`，不跟踪 `definitions` 数组中单个命令的启用/禁用变化。当外部编辑 `config.json` 修改某个命令的 `enabled` 字段时，chokidar 热重载不会触发。通过设置页面保存的修改不受影响（直接调用 `updateConfig` 更新内存）。  
**优先级:** 低  
**修复方案:** 在 `diffConfigs` 中添加 definitions 深度比较，或在 `updateConfig` 中主动通知监听器
