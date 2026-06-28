// src/lib/commands/handlers/prompt.ts
// /prompt command handler — 用户自定义个人提示词

import { registerHandler } from '../registry'
import { getUserAIConfig, upsertUserAIConfig } from '../../db/queries/ai'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const userId = ctx.userId
  const text = ctx.args.join(' ').trim()

  // 无参数：查看当前个人提示词
  if (!text) {
    const config = getUserAIConfig(userId)
    if (config?.custom_system_prompt) {
      return {
        reply: `📝 你的个人提示词：\n\n${config.custom_system_prompt}\n\n💡 修改：/prompt <新内容>\n🗑️ 清除：/prompt clear`,
        handled: true,
      }
    }
    return {
      reply: '📝 你还没有设置个人提示词，当前使用全局默认提示词。\n\n💡 设置：/prompt <你的提示词>',
      handled: true,
    }
  }

  // clear / off / 删除 / 清除 — 清除个人提示词
  if (['clear', 'off', '删除', '清除', '取消'].includes(text.toLowerCase())) {
    upsertUserAIConfig(userId, {
      enabled: 1,
      custom_system_prompt: null,
    })
    return {
      reply: '✅ 个人提示词已清除，将使用全局默认提示词。',
      handled: true,
    }
  }

  // 设置个人提示词
  if (text.length > 2000) {
    return {
      reply: '❌ 提示词过长，请控制在 2000 字以内。',
      handled: true,
    }
  }

  upsertUserAIConfig(userId, {
    enabled: 1,
    custom_system_prompt: text,
  })

  const preview = text.length > 100 ? text.slice(0, 100) + '...' : text
  return {
    reply: `✅ 个人提示词已设置：\n\n${preview}\n\n💡 清除：/prompt clear`,
    handled: true,
  }
}

registerHandler('builtin:prompt', handler)
