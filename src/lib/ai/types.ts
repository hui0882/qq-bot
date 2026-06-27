// src/lib/ai/types.ts

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp?: number
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
}

export interface LLMResponse {
  content: string
  usage?: {
    prompt: number
    completion: number
  }
  finishReason?: string
  error?: string
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
