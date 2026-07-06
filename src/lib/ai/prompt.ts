// src/lib/ai/prompt.ts
import type { ChatMessage } from './types'

/**
 * 根据回复类型构建系统提示词。
 * 支持从全局配置读取自定义 system prompt，语音模式自动追加简洁规则。
 */
export function buildSystemPrompt(
  replyType: 'text' | 'voice',
  customSystemPrompt?: string,
): ChatMessage {
  const base = customSystemPrompt || '你是一个友好、有帮助的 AI 助手。请用中文回复。'

  // 分段规则（文字和语音都适用）
  const splitRules = '\n\n回复规则：\n' +
    '1. 第一条回复要体现关心和快速应答，表达你正在认真帮助对方\n' +
    '2. 之后用 ||| 分隔符将主要内容拆分为多条消息\n' +
    '3. 每条消息应该是一个完整的思维单元，像人发消息一样自然'

  if (replyType === 'voice') {
    return {
      role: 'system',
      content: `${base}\n\n你的回复将通过语音播报，请遵守以下规则：\n` +
        '1. 回复简洁干净，控制在 100 字以内\n' +
        '2. 不使用 markdown 格式、代码块、列表符号\n' +
        '3. 不使用括号注释、表情符号\n' +
        '4. 语句通顺自然，适合朗读\n' +
        '5. 直接回答问题，不要说"好的""没问题"等开场白' +
        splitRules,
    }
  }

  return {
    role: 'system',
    content: base + splitRules,
  }
}
