// src/lib/command-handler.ts
// Slash command parser and handler

import { napcatApi } from './napcat-api'
import { getUserResponseType, setUserConfig } from './user-config'
import { configManager } from './config'
import { logger } from './logger'

interface CommandContext {
  userId: number
  rawText: string
}

interface CommandResult {
  handled: boolean
  reply?: string
}

// Command definitions
const COMMANDS: Record<string, { description: string; usage: string }> = {
  'help': { description: '查看所有可用命令', usage: '/help' },
  'response-type': { description: '设置回复模式（语音/文本）', usage: '/response-type <voice|text|auto>' },
}

function getHelpText(): string {
  const lines = ['📖 可用命令列表：', '']
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    lines.push(`  /${name} — ${cmd.description}`)
    lines.push(`    用法: ${cmd.usage}`)
    lines.push('')
  }
  lines.push('💡 发送 / 获取命令提示')
  return lines.join('\n')
}

function getResponseTypeUsage(): string {
  return [
    '📋 /response-type 用法：',
    '',
    '  /response-type voice  — 语音回复',
    '  /response-type text   — 文本回复',
    '  /response-type auto   — AI 自动判断（暂不可用）',
    '',
    '示例：/response-type voice',
  ].join('\n')
}

async function sendReply(userId: number, text: string): Promise<void> {
  await napcatApi.sendAction('send_msg', {
    message_type: 'private',
    user_id: String(userId),
    message: [{ type: 'text', data: { text } }],
  })
}

export async function handleCommand(event: Record<string, unknown>): Promise<boolean> {
  const postType = event.post_type as string
  if (postType !== 'message') return false

  const messageType = event.message_type as string
  if (messageType !== 'private') return false

  const userId = event.user_id as number
  if (!userId) return false

  // Extract text
  const rawMessage = event.raw_message as string || ''
  let text = rawMessage
  const message = event.message as Array<Record<string, unknown>> | undefined
  if (message && Array.isArray(message)) {
    text = message
      .filter((m) => m.type === 'text')
      .map((m) => (m.data as Record<string, unknown>)?.text as string)
      .join('') || rawMessage
  }

  text = text.trim()

  // Must start with /
  if (!text.startsWith('/')) return false

  logger.logSystem('Command: received', { userId, text: text.slice(0, 50) })

  // Bare /
  if (text === '/') {
    await sendReply(userId, '💡 请输入 /help 查看所有可用命令')
    return true
  }

  // Parse command
  const parts = text.split(/\s+/)
  const cmd = parts[0].toLowerCase().slice(1) // remove leading /
  const args = parts.slice(1)

  // /help
  if (cmd === 'help') {
    await sendReply(userId, getHelpText())
    return true
  }

  // /response-type
  if (cmd === 'response-type') {
    if (args.length === 0) {
      await sendReply(userId, getResponseTypeUsage())
      return true
    }

    const mode = args[0].toLowerCase()

    if (mode === 'auto') {
      await sendReply(userId, '⚠️ 自动模式暂不可用，需要接入 AI 模型')
      return true
    }

    if (mode !== 'voice' && mode !== 'text') {
      await sendReply(userId, `❌ 无效参数: ${args[0]}\n\n${getResponseTypeUsage()}`)
      return true
    }

    // Save user config
    setUserConfig(userId, { responseType: mode })

    const modeLabel = mode === 'voice' ? '语音回复' : '文本回复'
    await sendReply(userId, `✅ 回复模式已切换为：${modeLabel}`)
    logger.logSystem('Command: responseType changed', { userId, mode })
    return true
  }

  // Unknown command
  await sendReply(userId, `❌ 未知命令: /${cmd}\n\n输入 /help 查看所有可用命令`)
  return true
}
