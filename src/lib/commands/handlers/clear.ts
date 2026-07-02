// src/lib/commands/handlers/clear.ts
// /clear command handler — 清空 AI 上下文

import { registerHandler } from '../registry'
import { clearUserAIContext } from '../../ai'
import { logger } from '../../logger'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  try {
    clearUserAIContext(ctx.userId)
    logger.logSystem('Command: clear context', { userId: ctx.userId })
    return { reply: '🧹 AI 上下文已清空！', handled: true }
  } catch (err) {
    logger.logSystem('Command: clear context failed', {
      userId: ctx.userId,
      error: (err as Error).message,
    })
    return { reply: '❌ 清空上下文失败，请稍后重试', handled: true }
  }
}

registerHandler('builtin:clear', handler)
