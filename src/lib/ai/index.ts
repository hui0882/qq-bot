// src/lib/ai/index.ts
import type { AIConfig } from '@/types/napcat'
import type { ChatMessage, LLMResponse } from './types'
import { callLLM } from './llm-client'
import { aiContext, getUserAIConfig } from '@/lib/db/queries/ai'
import { buildSystemPrompt } from './prompt'

export type { LLMResponse }

/**
 * AI 管道入口：上下文构建 → 系统提示词 → 模型调用 → 保存上下文。
 * 纯函数风格，返回模型响应结果。
 *
 * 支持优先级回退：用户自定义配置 > 全局配置 > 默认值
 */
export async function processAIMessage(
  userId: number,
  userMessage: string,
  replyType: 'text' | 'voice',
  globalConfig: AIConfig,
): Promise<LLMResponse> {
  // 1. 获取用户自定义 AI 配置（如果有的话）
  const userAiConfig = getUserAIConfig(userId)

  // 2. 合并配置（优先级回退）
  const config = userAiConfig ? {
    baseUrl: userAiConfig.base_url || globalConfig.baseUrl,
    apiKey: userAiConfig.api_key || globalConfig.apiKey,
    model: userAiConfig.model || globalConfig.model,
    maxTokens: userAiConfig.max_tokens || globalConfig.maxTokens,
    temperature: userAiConfig.temperature || globalConfig.temperature,
    maxContextRounds: userAiConfig.max_context_rounds || globalConfig.maxContextRounds,
    customSystemPrompt: userAiConfig.custom_system_prompt,
  } : {
    ...globalConfig,
    customSystemPrompt: null,
  }

  // 3. 构建系统提示词
  const systemPrompt = config.customSystemPrompt
    ? { role: 'system' as const, content: config.customSystemPrompt }
    : buildSystemPrompt(replyType)

  // 4. 读取上下文（从内存缓存）
  const contextMessages = aiContext.getContext(userId, config.maxContextRounds)

  // 5. 组装完整消息列表
  const messages: ChatMessage[] = [
    systemPrompt,
    ...contextMessages.map(m => ({ role: m.role, content: m.content } as ChatMessage)),
    { role: 'user', content: userMessage },
  ]

  // 6. 调用 LLM
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

  // 7. 成功时保存上下文（写入内存缓存）
  if (!response.error && response.content) {
    aiContext.saveContext(userId, userMessage, response.content)
  }

  return response
}

/**
 * 清除用户 AI 上下文
 */
export function clearUserAIContext(userId: number): void {
  aiContext.clearContext(userId)
}

/**
 * 获取 AI 上下文统计
 */
export function getAIContextStats() {
  return aiContext.getStats()
}
