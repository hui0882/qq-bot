// src/lib/ai/prompt.ts
import type { ChatMessage } from './types'

/**
 * 根据回复类型构建系统提示词。
 * 后续可通过配置自定义 system prompt。
 */
export function buildSystemPrompt(replyType: 'text' | 'voice'): ChatMessage {
  const base = '你是一个友好、有帮助的 AI 助手。请用中文回复。'

  if (replyType === 'voice') {
    return {
      role: 'system',
      content: `${base} 你的回复将通过语音播报，请遵守以下规则：\n` +
        '1. 回复简洁干净，控制在 100 字以内\n' +
        '2. 不使用 markdown 格式、代码块、列表符号\n' +
        '3. 不使用括号注释、表情符号\n' +
        '4. 语句通顺自然，适合朗读\n' +
        '5. 直接回答问题，不要说"好的""没问题"等开场白',
    }
  }

  return {
    role: 'system',
    content: base,
  }
}
