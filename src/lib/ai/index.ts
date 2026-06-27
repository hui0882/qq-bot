// src/lib/ai/index.ts
import type { AIConfig } from '@/types/napcat'
import type { ChatMessage, LLMResponse } from './types'
import { callLLM } from './llm-client'
import { getContext, saveContext } from './context'
import { buildSystemPrompt } from './prompt'

export { clearContext } from './context'
export type { LLMResponse }

/**
 * AI 管道入口：上下文构建 → 系统提示词 → 模型调用 → 保存上下文。
 * 纯函数风格，返回模型响应结果。
 */
export async function processAIMessage(
  userId: number,
  userMessage: string,
  replyType: 'text' | 'voice',
  config: AIConfig,
): Promise<LLMResponse> {
  // 1. 构建系统提示词
  const systemPrompt = buildSystemPrompt(replyType)

  // 2. 读取上下文
  const contextMessages = getContext(userId, config.maxContextRounds)

  // 3. 组装完整消息列表
  const messages: ChatMessage[] = [
    systemPrompt,
    ...contextMessages.map(m => ({ role: m.role, content: m.content } as ChatMessage)),
    { role: 'user', content: userMessage },
  ]

  // 4. 调用 LLM
  const response = await callLLM({
    messages,
    config: {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    },
  })

  // 5. 成功时保存上下文
  if (!response.error && response.content) {
    saveContext(userId, userMessage, response.content)
  }

  return response
}
