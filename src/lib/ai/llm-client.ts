// src/lib/ai/llm-client.ts
import type { LLMRequest, LLMResponse } from './types'

/**
 * 调用 OpenAI 兼容 API，纯函数，无副作用。
 * 后续可替换为其他 API 格式（如 Anthropic），只需实现相同接口。
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const { messages, config } = request
  const { baseUrl, apiKey, model, maxTokens, temperature } = config

  // 构建请求 URL
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(30000), // 30s 超时
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
        message?: { content?: string }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = data.choices?.[0]
    if (!choice?.message?.content) {
      return {
        content: '',
        error: 'API 返回空响应',
      }
    }

    return {
      content: choice.message.content,
      usage: data.usage
        ? { prompt: data.usage.prompt_tokens || 0, completion: data.usage.completion_tokens || 0 }
        : undefined,
      finishReason: choice.finish_reason,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    // 区分超时和其他错误
    if (message.includes('timeout') || message.includes('TimeoutError')) {
      return { content: '', error: '请求超时（30s）' }
    }
    return { content: '', error: `请求失败: ${message}` }
  }
}
