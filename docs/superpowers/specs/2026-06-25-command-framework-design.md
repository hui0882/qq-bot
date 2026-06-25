# 命令框架重构 + 回复模式修复 设计文档

**日期:** 2026-06-25  
**分支:** fix/config-persistence-and-voice-mode  
**状态:** 待实现

---

## 问题陈述

### Bug: 用户命令绕过全局配置

当管理员在 `config.json` 中设置 `voiceReply.mode = 'off'`（全局文本回复）时：

1. 用户发送 `/response-type voice` → 命令处理只检查 `allowUserOverride`，不检查全局 mode
2. 命令返回"✅ 回复模式已切换为：语音回复"
3. `getEffectiveMode()` 实际忽略用户设置，使用全局 mode
4. 用户收到矛盾的两条消息：先"切换成功"，再以文本回复

**根因：** 命令处理和模式解析是两个独立逻辑，缺乏统一的前置校验。

### 架构问题: 硬编码散落

- 命令定义（名称、参数、提示）硬编码在 `command-handler.ts`
- 回复模式逻辑散落在 `voice-reply.ts` 和 `command-handler.ts`
- 权限检查逻辑不统一（有的检查 `allowUserOverride`，有的不检查）
- 新增命令需要修改多处代码，无法通过配置管理

---

## 设计目标

1. **修复 bug** — 全局 mode=off 时阻断用户命令，消除矛盾回复
2. **配置驱动** — 命令定义在 `config.json` 中，通过设置页面可管理
3. **统一校验** — 通用的参数校验 + 条件检查，替代散落的 if-else
4. **可扩展** — 新增命令只需加配置 + 写 handler 函数
5. **向后兼容** — 现有配置文件自动迁移，不破坏已有部署

---

## 配置结构设计

### 新增 `commands` 配置块

```jsonc
// config.json
{
  "commands": {
    "enabled": true,              // 全局命令系统开关
    "prefix": "/",                // 命令前缀（预留，当前固定 "/"）
    "allowUserOverride": false,   // 是否允许用户自定义回复模式
    "definitions": [
      {
        "name": "help",
        "description": "查看所有可用命令",
        "usage": "/help",
        "enabled": true,
        "handler": "builtin:help"
      },
      {
        "name": "response-type",
        "description": "设置回复模式（语音/文本）",
        "usage": "/response-type <voice|text|auto>",
        "enabled": true,
        "handler": "builtin:response-type",
        "args": [
          {
            "name": "mode",
            "required": true,
            "values": ["voice", "text", "auto"],
            "description": "回复模式"
          }
        ],
        "conditions": {
          "requireAllowUserOverride": true,
          "requireTtsEnabled": true
        }
      }
    ]
  }
}
```

### 字段说明

**`definitions[]` 命令定义：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 命令名（不含前缀） |
| `description` | string | 命令描述，用于 `/help` 展示 |
| `usage` | string | 用法示例 |
| `enabled` | boolean | 是否启用 |
| `handler` | string | 处理器标识，`builtin:xxx` 指向内置处理器 |
| `args` | array | 参数定义（可选） |
| `conditions` | object | 执行前置条件（可选） |

**`args[]` 参数定义：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 参数名 |
| `required` | boolean | 是否必填 |
| `values` | string[] | 允许的值枚举（可选，null = 不限制） |
| `description` | string | 参数说明 |

**`conditions` 前置条件：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `requireAllowUserOverride` | boolean | 要求 `commands.allowUserOverride` 为 true |
| `requireTtsEnabled` | boolean | 是否要求 TTS 启用 |

### `voiceReply` 配置调整

```jsonc
{
  "voiceReply": {
    "mode": "off"    // 保留：全局回复模式 (off / always / auto)
    // allowUserOverride 已迁移到 commands.allowUserOverride
  }
}
```

**向后兼容：** 读取时如果 `commands.allowUserOverride` 不存在，fallback 到 `voiceReply.allowUserOverride`。

---

## 代码架构设计

### 目录结构

```
src/lib/commands/
  registry.ts        — 命令注册表
  dispatcher.ts      — 通用命令分发器
  types.ts           — 命令相关类型定义
  handlers/
    help.ts          — /help 处理器
    response-type.ts — /response-type 处理器
    index.ts         — 自动注册所有内置 handler
```

### 类型定义 (`types.ts`)

```typescript
export interface CommandArg {
  name: string
  required: boolean
  values?: string[]
  description?: string
}

export interface CommandConditions {
  requireAllowUserOverride?: boolean
  requireTtsEnabled?: boolean
}

export interface CommandDefinition {
  name: string
  description: string
  usage: string
  enabled: boolean
  handler: string
  args?: CommandArg[]
  conditions?: CommandConditions
}

export interface CommandContext {
  userId: number
  rawText: string
  commandName: string
  args: string[]
  definition: CommandDefinition
}

export interface CommandResult {
  reply: string
  handled: boolean
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>
```

### 命令注册表 (`registry.ts`)

```typescript
// Handler 注册表 — handler 标识 → 处理函数
const handlers = new Map<string, CommandHandler>()

export function registerHandler(id: string, handler: CommandHandler): void {
  handlers.set(id, handler)
}

export function getHandler(id: string): CommandHandler | undefined {
  return handlers.get(id)
}

export function listHandlers(): string[] {
  return [...handlers.keys()]
}
```

### 通用分发器 (`dispatcher.ts`)

核心流程：

```
1. 解析输入 → 提取命令名 + 参数
2. 从 config.commands.definitions 查找命令定义
3. 检查 enabled
4. 通用参数校验（required、values 枚举）
5. 条件检查（conditions）
6. 查找 handler 并调用
7. 返回结果
```

**关键逻辑 — 条件检查：**

```typescript
async function checkConditions(
  conditions: CommandConditions | undefined,
  userId: number
): Promise<string | null> {
  if (!conditions) return null

  const config = configManager.getConfig()

  // allowUserOverride 检查（命令级条件，仅对声明了此条件的命令生效）
  if (conditions.requireAllowUserOverride) {
    const allowOverride = config.commands?.allowUserOverride
      ?? config.voiceReply?.allowUserOverride
      ?? false
    if (!allowOverride) {
      return '⚠️ 当前由管理员统一配置回复模式，无法自定义'
    }
  }

  // TTS 启用检查
  if (conditions.requireTtsEnabled) {
    if (!config.tts?.enabled) {
      return '⚠️ 语音功能未启用，无法切换为语音模式'
    }
  }

  return null // 通过
}
```

**参数校验：**

```typescript
function validateArgs(
  args: string[],
  definition: CommandDefinition
): string | null {
  if (!definition.args) return null

  for (let i = 0; i < definition.args.length; i++) {
    const argDef = definition.args[i]
    const value = args[i]

    if (argDef.required && !value) {
      return `❌ 缺少必填参数: ${argDef.name}\n\n用法: ${definition.usage}`
    }

    if (value && argDef.values && !argDef.values.includes(value)) {
      return `❌ 无效参数: ${value}\n\n允许的值: ${argDef.values.join(', ')}`
    }
  }

  return null
}
```

### Handler 实现示例

**`handlers/response-type.ts`：**

```typescript
import { registerHandler } from '../registry'
import { setUserConfig } from '../../user-config'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const mode = ctx.args[0]

  // auto 模式特殊处理
  if (mode === 'auto') {
    return { reply: '⚠️ 自动模式暂不可用，需要接入 AI 模型', handled: true }
  }

  // 保存用户配置
  setUserConfig(ctx.userId, { responseType: mode as 'voice' | 'text' })

  const modeLabel = mode === 'voice' ? '语音回复' : '文本回复'
  return { reply: `✅ 回复模式已切换为：${modeLabel}`, handled: true }
}

registerHandler('builtin:response-type', handler)
```

**`handlers/help.ts`：**

```typescript
import { registerHandler } from '../registry'
import { configManager } from '../../config'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const config = configManager.getConfig()
  const definitions = config.commands?.definitions || []
  const enabled = definitions.filter(d => d.enabled)

  const lines = ['📖 可用命令列表：', '']
  for (const def of enabled) {
    lines.push(`  /${def.name} — ${def.description}`)
    lines.push(`    用法: ${def.usage}`)
    lines.push('')
  }
  lines.push('💡 发送 / 获取命令提示')

  return { reply: lines.join('\n'), handled: true }
}

registerHandler('builtin:help', handler)
```

---

## `getEffectiveMode()` 重构

```typescript
function getEffectiveMode(userId: number): 'off' | 'always' | 'auto' {
  const config = configManager.getConfig()
  const globalMode = config.voiceReply?.mode || 'off'

  // 全局 mode=off → 直接返回，不看用户设置
  if (globalMode === 'off') return 'off'

  // 检查是否允许用户自定义（兼容旧字段）
  const allowOverride = config.commands?.allowUserOverride
    ?? config.voiceReply?.allowUserOverride
    ?? false

  if (!allowOverride) return globalMode

  // 读取用户设置
  const userMode = getUserResponseType(userId)
  if (!userMode || userMode === 'auto') return globalMode

  // 用户选择 voice，校验 TTS 可用性
  if (userMode === 'voice') {
    if (!config.tts?.enabled) {
      logger.logSystem('VoiceReply: TTS not enabled, fallback to text', { userId })
      return 'off'
    }
    return 'always'
  }

  // 用户选择 text
  return 'off'
}
```

---

## 设置页面联动

设置页的「命令管理」区域需要读取 `commands` 配置：

1. **全局开关** — `commands.enabled` 切换
2. **用户自定义开关** — `commands.allowUserOverride` 切换
3. **命令列表** — 展示所有 definitions，可单独启用/禁用
4. **参数展示** — 只读展示命令的 args 和 conditions

设置页修改后通过 `/api/config` 保存，chokidar 热重载自动生效。

---

## 配置迁移策略

启动时检测旧配置格式，自动合并新字段：

```typescript
function migrateConfig(parsed: any): PlatformConfig {
  // 迁移 voiceReply.allowUserOverride → commands.allowUserOverride
  if (parsed.voiceReply?.allowUserOverride !== undefined && !parsed.commands) {
    parsed.commands = {
      ...DEFAULT_CONFIG.commands,
      allowUserOverride: parsed.voiceReply.allowUserOverride,
    }
  }

  // 确保 commands.definitions 存在
  if (!parsed.commands?.definitions) {
    parsed.commands = { ...DEFAULT_CONFIG.commands, ...parsed.commands }
  }

  return parsed
}
```

---

## 错误处理

| 场景 | 行为 |
|------|------|
| 命令不存在 | 返回"未知命令"+ 提示 `/help` |
| 参数缺失 | 返回用法提示 |
| 参数值无效 | 返回允许的值列表 |
| 条件不满足 | 返回具体原因（全局模式/TTS 未启用/权限不足） |
| handler 执行失败 | 返回通用错误提示 + 记录日志 |
| commands 配置缺失 | 使用 DEFAULT_CONFIG.commands |

---

## 测试场景

1. **allowUserOverride=false** → `/response-type voice` 被阻断，返回"管理员统一配置"提示；`/help` 正常工作
2. **allowUserOverride=true + TTS 未启用** → `/response-type voice` 提示 TTS 未启用
3. **allowUserOverride=true + TTS 启用** → `/response-type voice` 正常切换
4. **全局 mode=off** → 用户已有的 voice 配置被忽略，始终文本回复
5. **help 命令** → 只显示 enabled 的命令
6. **配置热修改** → 禁用某命令后立即生效
7. **旧配置迁移** → `voiceReply.allowUserOverride` 自动迁移到 `commands`
