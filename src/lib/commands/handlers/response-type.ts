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
