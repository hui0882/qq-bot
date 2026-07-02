// src/lib/ai/index.ts
import type { AIConfig } from '@/types/napcat'
import type { ChatMessage, LLMResponse } from './types'
import { callLLM } from './llm-client'
import { aiContext, getUserAIConfig } from '@/lib/db/queries/ai'
import { buildSystemPrompt } from './prompt'
import { PROMPT_TOOLS, executeToolCall } from './tools'
import { SCHOOL_TOOLS } from '@/lib/school/tools'

export type { LLMResponse }

/**
 * AI 管道入口：上下文构建 → 系统提示词 → 模型调用 → 工具调用 → 保存上下文。
 * 支持原生 function calling。
 */
export async function processAIMessage(
  userId: number,
  userMessage: string,
  replyType: 'text' | 'voice',
  globalConfig: AIConfig,
): Promise<LLMResponse> {
  // 1. 获取用户自定义 AI 配置
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

  // 3. 构建系统提示词（用户自定义 > 全局配置 > 默认值）
  const systemPrompt = config.customSystemPrompt
    ? { role: 'system' as const, content: config.customSystemPrompt }
    : buildSystemPrompt(replyType, globalConfig.systemPrompt)

  // 4. 读取上下文
  const contextMessages = aiContext.getContext(userId, config.maxContextRounds)

  // 5. 组装消息列表
  const messages: ChatMessage[] = [
    systemPrompt,
    ...contextMessages.map(m => ({ role: m.role, content: m.content } as ChatMessage)),
    { role: 'user', content: userMessage },
  ]

  // 6. 调用 LLM（带工具定义）
  const llmConfig = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  }

  let response = await callLLM({
    messages,
    config: llmConfig,
    tools: [...PROMPT_TOOLS, ...SCHOOL_TOOLS],
  })

  // 7. 附加提示词元数据
  response.promptMeta = {
    systemPrompt: globalConfig.systemPrompt || '',
    personalPrompt: config.customSystemPrompt || null,
    context: contextMessages.map(m => ({ role: m.role, content: m.content })),
  }

  // 8. 处理工具调用
  if (!response.error && response.toolCalls && response.toolCalls.length > 0) {
    const toolCall = response.toolCalls[0] // 取第一个工具调用
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(toolCall.function.arguments)
    } catch { /* 忽略解析错误 */ }

    const toolResult = await executeToolCall(userId, toolCall.function.name, args)
    response.toolResult = {
      tool: toolCall.function.name,
      ...toolResult,
    }

    // 将工具调用结果发送回 LLM 获取最终回复
    const toolMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      },
      {
        role: 'tool',
        content: toolResult.message,
        tool_call_id: toolCall.id,
      },
    ]

    const finalResponse = await callLLM({
      messages: toolMessages,
      config: llmConfig,
    })

    if (!finalResponse.error && finalResponse.content) {
      response.content = finalResponse.content
      if (finalResponse.usage) {
        response.usage = {
          prompt: (response.usage?.prompt || 0) + finalResponse.usage.prompt,
          completion: (response.usage?.completion || 0) + finalResponse.usage.completion,
        }
      }
    } else {
      // 如果最终回复失败，直接用工具结果
      response.content = toolResult.message
    }
  }

  // 9. 保存上下文
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
