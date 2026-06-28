// src/lib/ai/llm-client.ts
import type { LLMRequest, LLMResponse } from './types'

/**
 * 调用 OpenAI 兼容 API，支持 function calling。
 * 纯函数，无副作用。
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const { messages, config, tools } = request
  const { baseUrl, apiKey, model, maxTokens, temperature } = config

  // 构建请求 URL
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  // 构建请求体
  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content }
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      return msg
    }),
    max_tokens: maxTokens,
    temperature,
  }

  // 如果有工具定义，添加到请求体
  if (tools && tools.length > 0) {
    body.tools = tools
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60s 超时（工具调用可能需要更长时间）
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        content: '',
        error: `API 错误 (${response.status}): ${errorText}`,
      }
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string
          tool_calls?: Array<{
            id: string
            type: 'function'
            function: { name: string; arguments: string }
          }>
        }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = data.choices?.[0]
    if (!choice?.message) {
      return {
        content: '',
        error: 'API 返回空响应',
      }
    }

    const result: LLMResponse = {
      content: choice.message.content || '',
      usage: data.usage
        ? { prompt: data.usage.prompt_tokens || 0, completion: data.usage.completion_tokens || 0 }
        : undefined,
      finishReason: choice.finish_reason,
    }

    // 解析工具调用
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    // 区分超时和其他错误
    if (message.includes('timeout') || message.includes('TimeoutError')) {
      return { content: '', error: '请求超时（60s）' }
    }
    return { content: '', error: `请求失败: ${message}` }
  }
}
