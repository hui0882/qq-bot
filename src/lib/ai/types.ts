// src/lib/ai/types.ts

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp?: number
  /** 工具调用（assistant 消息） */
  tool_calls?: ToolCallMessage[]
  /** 工具调用 ID（tool 消息） */
  tool_call_id?: string
}

/** OpenAI 格式的工具定义 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}

/** LLM 返回的工具调用 */
export interface ToolCallMessage {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LLMRequest {
  messages: ChatMessage[]
  config: {
    baseUrl: string
    apiKey: string
    model: string
    maxTokens: number
    temperature: number
  }
  /** 可选的工具定义 */
  tools?: ToolDefinition[]
}

export interface LLMResponse {
  content: string
  usage?: {
    prompt: number
    completion: number
  }
  finishReason?: string
  error?: string
  /** LLM 返回的原始工具调用 */
  toolCalls?: ToolCallMessage[]
  /** 工具执行结果（用于日志和回复） */
  toolResult?: {
    tool: string
    success: boolean
    message: string
  }
  /** 请求时使用的提示词元数据（用于日志记录） */
  promptMeta?: {
    systemPrompt: string
    personalPrompt: string | null
    context: Array<{ role: string; content: string }>
  }
}

export interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface UserConversation {
  messages: ConversationEntry[]
  lastUpdated: number
}

export interface AIContextStore {
  conversations: Record<string, UserConversation>
}
