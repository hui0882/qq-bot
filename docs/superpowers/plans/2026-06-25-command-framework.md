# 命令框架重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded command system with a config-driven command framework, and fix the bug where users can override global text-only reply mode.

**Architecture:** Command definitions (name, args, conditions) live in `config.json`. A generic dispatcher reads definitions, validates args, checks conditions, then calls registered handler functions. The old `command-handler.ts` is replaced by `src/lib/commands/` module. `getEffectiveMode()` is refactored to validate TTS availability and respect global mode=off.

**Tech Stack:** TypeScript, Next.js 15 (App Router), chokidar (config hot-reload)

## Global Constraints

- Port: 8090 (dev + prod)
- Config file: `data/config.json` (gitignored)
- User configs: `data/user-configs.json`
- Singleton pattern via `globalThis` for WS client, Config, Logger
- All API calls through WS (no HTTP API to NapCat)
- Existing `voiceReply.allowUserOverride` must remain as deprecated fallback

---

### Task 1: Add `commands` to PlatformConfig type

**Files:**
- Modify: `src/types/napcat.ts:185-221`

**Interfaces:**
- Produces: `CommandsConfig`, `CommandArg`, `CommandConditions`, `CommandDefinition` types in PlatformConfig

- [ ] **Step 1: Add command types to napcat.ts**

Add the following types before the `PlatformConfig` interface (after line 183):

```typescript
// ============ 命令系统 ============

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

export interface CommandsConfig {
  enabled: boolean
  prefix: string
  allowUserOverride: boolean
  definitions: CommandDefinition[]
}
```

- [ ] **Step 2: Add `commands` field to PlatformConfig**

In the `PlatformConfig` interface (currently lines 185-221), add after the `log` field:

```typescript
  commands: CommandsConfig
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Should fail only on files that use `PlatformConfig` and don't yet provide `commands` — that's expected, we fix those in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/types/napcat.ts
git commit -m "feat: add command system types to PlatformConfig"
```

---

### Task 2: Create command framework — types, registry, dispatcher

**Files:**
- Create: `src/lib/commands/types.ts`
- Create: `src/lib/commands/registry.ts`
- Create: `src/lib/commands/dispatcher.ts`

**Interfaces:**
- Produces: `registerHandler(id, handler)`, `getHandler(id)`, `dispatchCommand(event)` — the main entry point for command processing

- [ ] **Step 1: Create `src/lib/commands/types.ts`**

```typescript
// src/lib/commands/types.ts
// Command framework type definitions

import type { CommandDefinition } from '@/types/napcat'

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

- [ ] **Step 2: Create `src/lib/commands/registry.ts`**

```typescript
// src/lib/commands/registry.ts
// Handler registry — maps handler IDs to functions

import type { CommandHandler } from './types'

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

- [ ] **Step 3: Create `src/lib/commands/dispatcher.ts`**

```typescript
// src/lib/commands/dispatcher.ts
// Generic command dispatcher: parse → validate args → check conditions → call handler

import { configManager } from '../config'
import { logger } from '../logger'
import { napcatWS } from '../napcat-ws'
import { getHandler } from './registry'
import type { CommandDefinition, CommandConditions } from '@/types/napcat'
import type { CommandContext, CommandResult } from './types'

// Import handlers to trigger registration
import './handlers/index'

function extractText(event: Record<string, unknown>): string | null {
  const rawMessage = event.raw_message as string || ''
  let text = rawMessage
  const message = event.message as Array<Record<string, unknown>> | undefined
  if (message && Array.isArray(message)) {
    text = message
      .filter((m) => m.type === 'text')
      .map((m) => (m.data as Record<string, unknown>)?.text as string)
      .join('') || rawMessage
  }
  if (!text || text.trim().length === 0) return null
  return text.trim()
}

function parseCommand(text: string): { name: string; args: string[] } | null {
  if (!text.startsWith('/')) return null
  const parts = text.split(/\s+/)
  const name = parts[0].toLowerCase().slice(1) // remove leading /
  if (!name) return null
  return { name, args: parts.slice(1) }
}

function findDefinition(name: string): CommandDefinition | null {
  const config = configManager.getConfig()
  const definitions = config.commands?.definitions || []
  return definitions.find((d) => d.name === name && d.enabled) || null
}

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

async function checkConditions(
  conditions: CommandConditions | undefined,
  _userId: number
): Promise<string | null> {
  if (!conditions) return null

  const config = configManager.getConfig()

  // allowUserOverride check (per-command condition)
  if (conditions.requireAllowUserOverride) {
    const allowOverride = config.commands?.allowUserOverride
      ?? config.voiceReply?.allowUserOverride
      ?? false
    if (!allowOverride) {
      return '⚠️ 当前由管理员统一配置回复模式，无法自定义'
    }
  }

  // TTS enabled check
  if (conditions.requireTtsEnabled) {
    if (!config.tts?.enabled) {
      return '⚠️ 语音功能未启用，无法切换为语音模式'
    }
  }

  return null
}

async function sendReply(userId: number, text: string): Promise<void> {
  await napcatWS.sendAction('send_msg', {
    message_type: 'private',
    user_id: String(userId),
    message: [{ type: 'text', data: { text } }],
  })
}

export async function dispatchCommand(event: Record<string, unknown>): Promise<boolean> {
  const postType = event.post_type as string
  if (postType !== 'message') return false

  const messageType = event.message_type as string
  if (messageType !== 'private') return false

  const userId = event.user_id as number
  if (!userId) return false

  const text = extractText(event)
  if (!text) return false

  // Check if commands are enabled
  const config = configManager.getConfig()
  if (config.commands?.enabled === false) return false

  const parsed = parseCommand(text)
  if (!parsed) return false

  logger.logSystem('Command: received', { userId, text: text.slice(0, 50) })

  // Bare /
  if (parsed.name === '') {
    await sendReply(userId, '💡 请输入 /help 查看所有可用命令')
    return true
  }

  // Find command definition
  const definition = findDefinition(parsed.name)
  if (!definition) {
    await sendReply(userId, `❌ 未知命令: /${parsed.name}\n\n输入 /help 查看所有可用命令`)
    return true
  }

  // Validate args
  const argError = validateArgs(parsed.args, definition)
  if (argError) {
    await sendReply(userId, argError)
    return true
  }

  // Check conditions
  const conditionError = await checkConditions(definition.conditions, userId)
  if (conditionError) {
    await sendReply(userId, conditionError)
    return true
  }

  // Find and call handler
  const handler = getHandler(definition.handler)
  if (!handler) {
    logger.logSystem('Command: handler not found', { handler: definition.handler })
    await sendReply(userId, '❌ 命令处理异常，请联系管理员')
    return true
  }

  const ctx: CommandContext = {
    userId,
    rawText: text,
    commandName: parsed.name,
    args: parsed.args,
    definition,
  }

  try {
    const result: CommandResult = await handler(ctx)
    if (result.reply) {
      await sendReply(userId, result.reply)
    }
    logger.logSystem('Command: handled', { command: parsed.name, userId })
    return result.handled
  } catch (err) {
    logger.logSystem('Command: handler error', { command: parsed.name, error: (err as Error).message })
    await sendReply(userId, '❌ 命令执行出错，请稍后重试')
    return true
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors about missing `./handlers/index` — that's expected, we create it next.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/
git commit -m "feat: add command registry and dispatcher"
```

---

### Task 3: Create built-in command handlers

**Files:**
- Create: `src/lib/commands/handlers/help.ts`
- Create: `src/lib/commands/handlers/response-type.ts`
- Create: `src/lib/commands/handlers/index.ts`

**Interfaces:**
- Consumes: `registerHandler` from `../registry`, `CommandHandler` from `../types`
- Produces: Side-effect registration of `builtin:help` and `builtin:response-type` handlers

- [ ] **Step 1: Create `src/lib/commands/handlers/help.ts`**

```typescript
// src/lib/commands/handlers/help.ts
// /help command handler

import { registerHandler } from '../registry'
import { configManager } from '../../config'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const config = configManager.getConfig()
  const definitions = config.commands?.definitions || []
  const enabled = definitions.filter((d) => d.enabled)

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

- [ ] **Step 2: Create `src/lib/commands/handlers/response-type.ts`**

```typescript
// src/lib/commands/handlers/response-type.ts
// /response-type command handler

import { registerHandler } from '../registry'
import { setUserConfig } from '../../user-config'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const mode = ctx.args[0]

  // auto mode not yet available
  if (mode === 'auto') {
    return { reply: '⚠️ 自动模式暂不可用，需要接入 AI 模型', handled: true }
  }

  // Save user config
  setUserConfig(ctx.userId, { responseType: mode as 'voice' | 'text' })

  const modeLabel = mode === 'voice' ? '语音回复' : '文本回复'
  return { reply: `✅ 回复模式已切换为：${modeLabel}`, handled: true }
}

registerHandler('builtin:response-type', handler)
```

- [ ] **Step 3: Create `src/lib/commands/handlers/index.ts`**

```typescript
// src/lib/commands/handlers/index.ts
// Auto-register all built-in handlers

import './help'
import './response-type'
```

- [ ] **Step 4: Create `src/lib/commands/index.ts` barrel export**

```typescript
// src/lib/commands/index.ts
// Public API for command system

export { dispatchCommand } from './dispatcher'
export { registerHandler, getHandler, listHandlers } from './registry'
export type { CommandContext, CommandResult, CommandHandler } from './types'
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors only about `commands` field missing from `DEFAULT_CONFIG` and `loadConfig` merge — fixed in next task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/commands/
git commit -m "feat: add built-in command handlers (help, response-type)"
```

---

### Task 4: Update config.ts — add commands defaults + migration

**Files:**
- Modify: `src/lib/config.ts`

**Interfaces:**
- Consumes: `CommandsConfig` from `@/types/napcat`
- Produces: `config.commands` available in all configs, migration from old `voiceReply.allowUserOverride`

- [ ] **Step 1: Add `commands` to DEFAULT_CONFIG**

In `src/lib/config.ts`, add the `commands` field to `DEFAULT_CONFIG` (after the `log` block, around line 43):

```typescript
  commands: {
    enabled: true,
    prefix: '/',
    allowUserOverride: false,
    definitions: [
      {
        name: 'help',
        description: '查看所有可用命令',
        usage: '/help',
        enabled: true,
        handler: 'builtin:help',
      },
      {
        name: 'response-type',
        description: '设置回复模式（语音/文本）',
        usage: '/response-type <voice|text|auto>',
        enabled: true,
        handler: 'builtin:response-type',
        args: [
          {
            name: 'mode',
            required: true,
            values: ['voice', 'text', 'auto'],
            description: '回复模式',
          },
        ],
        conditions: {
          requireAllowUserOverride: true,
          requireTtsEnabled: true,
        },
      },
    ],
  },
```

- [ ] **Step 2: Add migration logic in `loadConfig`**

In the `loadConfig` method, after the `parsed` variable is obtained (after line 67: `const parsed = JSON.parse(raw) as Partial<PlatformConfig>`), add migration before the merge:

```typescript
      // Migrate voiceReply.allowUserOverride → commands.allowUserOverride
      if (parsed.voiceReply?.allowUserOverride !== undefined && !parsed.commands) {
        parsed.commands = {
          ...DEFAULT_CONFIG.commands,
          allowUserOverride: parsed.voiceReply.allowUserOverride,
        }
      }
```

- [ ] **Step 3: Add `commands` to the merge block**

In the `loadConfig` merge section (around line 76), add:

```typescript
        commands: {
          ...DEFAULT_CONFIG.commands,
          ...parsed.commands,
          definitions: parsed.commands?.definitions || DEFAULT_CONFIG.commands.definitions,
        },
```

Also add to `diffConfigs` method (after the `log` checks):

```typescript
    if (old.commands?.enabled !== curr.commands?.enabled) keys.push('commands.enabled')
    if (old.commands?.allowUserOverride !== curr.commands?.allowUserOverride) keys.push('commands.allowUserOverride')
```

Also add to `updateConfig` merge (after the `log` block):

```typescript
        commands: { ...this.config.commands, ...partial.commands },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add commands config with migration from voiceReply"
```

---

### Task 5: Refactor voice-reply.ts — fix getEffectiveMode, use dispatcher

**Files:**
- Modify: `src/lib/voice-reply.ts`

**Interfaces:**
- Consumes: `dispatchCommand` from `./commands`, `configManager` from `./config`, `getUserResponseType` from `./user-config`
- Produces: Fixed `getEffectiveMode()` that respects global mode=off and TTS availability

- [ ] **Step 1: Update imports**

Replace the imports at the top of `src/lib/voice-reply.ts`:

```typescript
// src/lib/voice-reply.ts
// Message handler: commands, text echo, voice reply

import { textToSpeech } from './tts'
import { napcatWS } from './napcat-ws'
import { configManager } from './config'
import { getUserResponseType } from './user-config'
import { dispatchCommand } from './commands'
import { logger } from './logger'
import { readFileSync, unlinkSync } from 'fs'
```

- [ ] **Step 2: Refactor `getEffectiveMode()`**

Replace the existing `getEffectiveMode` function (lines 29-42) with:

```typescript
function getEffectiveMode(userId: number): 'off' | 'always' | 'auto' {
  const config = configManager.getConfig()
  const globalMode = config.voiceReply?.mode || 'off'

  // Global mode=off → always text, ignore user settings
  if (globalMode === 'off') return 'off'

  // Check if user override is allowed (compat: fallback to voiceReply.allowUserOverride)
  const allowOverride = config.commands?.allowUserOverride
    ?? config.voiceReply?.allowUserOverride
    ?? false

  if (!allowOverride) return globalMode

  // Read user setting
  const userMode = getUserResponseType(userId)
  if (!userMode || userMode === 'auto') return globalMode

  // User chose voice — validate TTS availability
  if (userMode === 'voice') {
    if (!config.tts?.enabled) {
      logger.logSystem('VoiceReply: TTS not enabled, fallback to text', { userId })
      return 'off'
    }
    return 'always'
  }

  // User chose text
  return 'off'
}
```

- [ ] **Step 3: Replace `handleCommand` call with `dispatchCommand`**

In `handleVoiceReply`, replace the command handling block (lines 109-112):

```typescript
  if (textContent.trim().startsWith('/')) {
    await dispatchCommand(event)
    return
  }
```

(This is the same call pattern, just pointing to the new dispatcher.)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-reply.ts
git commit -m "fix: refactor getEffectiveMode, use command dispatcher"
```

---

### Task 6: Remove old command-handler.ts

**Files:**
- Delete: `src/lib/command-handler.ts`

**Interfaces:**
- Consumes: Nothing — this file is no longer imported anywhere after Task 5

- [ ] **Step 1: Verify no remaining imports of command-handler**

Run: `grep -r "command-handler" src/`
Expected: No results (voice-reply.ts now imports from `./commands`).

- [ ] **Step 2: Delete the old file**

```bash
rm src/lib/command-handler.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old command-handler.ts, replaced by commands module"
```

---

### Task 7: Update settings page — add commands section

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`

**Interfaces:**
- Consumes: `CommandsConfig` fields from config API
- Produces: UI controls for `commands.enabled`, `commands.allowUserOverride`, per-command `enabled` toggles

- [ ] **Step 1: Add `commands` to the local Config interface**

In the settings page, update the `Config` interface (around line 6) to include:

```typescript
  commands?: {
    enabled: boolean
    prefix: string
    allowUserOverride: boolean
    definitions: Array<{
      name: string
      description: string
      usage: string
      enabled: boolean
      handler: string
    }>
  }
```

- [ ] **Step 2: Add commands section to the form (after Voice Reply section)**

After the Voice Reply section (after the closing `</div>` of the voiceReply block, around line 232), add:

```tsx
        {/* 命令管理 */}
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-medium mb-3">命令管理</h3>

          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={config.commands?.enabled ?? true}
              onChange={(e) =>
                setConfig({
                  ...config,
                  commands: { ...config.commands!, enabled: e.target.checked },
                })
              }
            />
            <span>启用命令系统</span>
          </label>

          <label className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={config.commands?.allowUserOverride ?? false}
              onChange={(e) =>
                setConfig({
                  ...config,
                  commands: { ...config.commands!, allowUserOverride: e.target.checked },
                })
              }
            />
            <span>允许用户自定义回复模式</span>
          </label>

          {config.commands?.definitions && config.commands.definitions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-2">命令列表：</p>
              {config.commands.definitions.map((def, i) => (
                <label key={def.name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={def.enabled}
                    onChange={(e) => {
                      const defs = [...config.commands!.definitions]
                      defs[i] = { ...defs[i], enabled: e.target.checked }
                      setConfig({
                        ...config,
                        commands: { ...config.commands!, definitions: defs },
                      })
                    }}
                  />
                  <span className="font-mono">/{def.name}</span>
                  <span className="text-gray-400">— {def.description}</span>
                </label>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 3: Ensure `commands` is included in save payload**

The existing `handleSave` sends the full `config` object to `POST /api/config`. Since `commands` is now part of the config state, it will be included automatically. No change needed to `handleSave`.

- [ ] **Step 4: Ensure config API accepts `commands` field**

In `src/app/api/config/route.ts`, the POST handler builds `safePartial` from the body. The `commands` field has no token fields, so it passes through the existing merge logic in `configManager.updateConfig`. No change needed.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile.

- [ ] **Step 6: Commit**

```bash
git add src/app/(authenticated)/settings/page.tsx
git commit -m "feat: add command management section to settings page"
```

---

### Task 8: Manual verification — end-to-end test

**Files:**
- None (testing only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on port 8090 without errors.

- [ ] **Step 2: Verify settings page loads**

Open `http://localhost:8090/settings` in browser.
Expected: Settings page shows the new "命令管理" section with command list.

- [ ] **Step 3: Verify config.json has commands block**

Check `data/config.json` — should contain the `commands` section with default definitions.

- [ ] **Step 4: Test scenario 1 — allowUserOverride=false blocks response-type**

In settings, ensure "允许用户自定义回复模式" is unchecked. Send `/response-type voice` via the bot.
Expected: Bot replies "⚠️ 当前由管理员统一配置回复模式，无法自定义"

- [ ] **Step 5: Test scenario 2 — help works regardless of override setting**

Send `/help` via the bot.
Expected: Bot replies with the command list.

- [ ] **Step 6: Test scenario 3 — allowUserOverride=true + TTS disabled**

Enable "允许用户自定义回复模式" in settings, ensure TTS is disabled. Send `/response-type voice`.
Expected: Bot replies "⚠️ 语音功能未启用，无法切换为语音模式"

- [ ] **Step 7: Test scenario 4 — global mode=off ignores user setting**

Set voiceReply.mode to "off" in settings. Even if a user previously set voice via command, messages should be text replies.
Expected: All replies are text, not voice.

- [ ] **Step 8: Commit final state if any fixes needed**

```bash
git add -A
git commit -m "fix: address verification findings"
```
