// src/lib/commands/handlers/cron.ts
// /cron command handler - 定时任务管理

import { registerHandler } from '../registry'
import { handleCronCommand } from '@/lib/cron/commands'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const { userId, args } = ctx

  // 将 userId 转换为字符串（cron 模块使用字符串 ID）
  const userIdStr = String(userId)

  try {
    const reply = await handleCronCommand(userIdStr, args)
    return { reply, handled: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { reply: `❌ 命令执行出错: ${message}`, handled: true }
  }
}

registerHandler('builtin:cron', handler)
