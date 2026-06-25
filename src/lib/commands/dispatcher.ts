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
  const rawMessage = (event.raw_message as string) || ''
  let text = rawMessage
  const message = event.message as Array<Record<string, unknown>> | undefined
  if (message && Array.isArray(message)) {
    text =
      message
        .filter((m) => m.type === 'text')
        .map((m) => ((m.data as Record<string, unknown>)?.text as string))
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
  definition: CommandDefinition,
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
  _userId: number,
): Promise<string | null> {
  if (!conditions) return null

  const config = configManager.getConfig()

  // allowUserOverride check (per-command condition)
  if (conditions.requireAllowUserOverride) {
    const allowOverride =
      config.commands?.allowUserOverride ??
      config.voiceReply?.allowUserOverride ??
      false
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

export async function dispatchCommand(
  event: Record<string, unknown>,
): Promise<boolean> {
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
    await sendReply(
      userId,
      `❌ 未知命令: /${parsed.name}\n\n输入 /help 查看所有可用命令`,
    )
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
    logger.logSystem('Command: handler not found', {
      handler: definition.handler,
    })
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
    logger.logSystem('Command: handler error', {
      command: parsed.name,
      error: (err as Error).message,
    })
    await sendReply(userId, '❌ 命令执行出错，请稍后重试')
    return true
  }
}
