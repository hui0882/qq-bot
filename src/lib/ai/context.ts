// src/lib/ai/context.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ConversationEntry, AIContextStore } from './types'

const CONTEXT_PATH = join(process.cwd(), 'data', 'ai-context.json')
const MAX_CONTEXT_ROUNDS = 10

let store: AIContextStore = { conversations: {} }

function loadStore(): void {
  try {
    if (existsSync(CONTEXT_PATH)) {
      const raw = readFileSync(CONTEXT_PATH, 'utf-8')
      store = JSON.parse(raw) as AIContextStore
    }
  } catch {
    store = { conversations: {} }
  }
}

function saveStore(): void {
  try {
    const dir = join(process.cwd(), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CONTEXT_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch {
    // 写入失败时静默忽略
  }
}

// 初始化时加载
loadStore()

/**
 * 获取用户最近 N 轮有效对话上下文。
 * 返回的消息数组可直接拼接到 system prompt 之后发送给模型。
 */
export function getContext(userId: number, maxRounds: number = MAX_CONTEXT_ROUNDS): ConversationEntry[] {
  const conversation = store.conversations[String(userId)]
  if (!conversation?.messages?.length) return []

  // 保留最近 N 轮（每轮 = 1 user + 1 assistant = 2 条消息）
  const maxMessages = maxRounds * 2
  const messages = conversation.messages
  return messages.slice(-maxMessages)
}

/**
 * 保存一轮对话到上下文。
 * 在 AI 回复成功后调用。
 */
export function saveContext(userId: number, userMsg: string, assistantMsg: string): void {
  const key = String(userId)
  const now = Date.now()

  if (!store.conversations[key]) {
    store.conversations[key] = { messages: [], lastUpdated: now }
  }

  store.conversations[key].messages.push(
    { role: 'user', content: userMsg, timestamp: now },
    { role: 'assistant', content: assistantMsg, timestamp: now + 1 }
  )

  // 裁剪到最大轮数
  const maxMessages = MAX_CONTEXT_ROUNDS * 2
  const msgs = store.conversations[key].messages
  if (msgs.length > maxMessages) {
    store.conversations[key].messages = msgs.slice(-maxMessages)
  }

  store.conversations[key].lastUpdated = now + 1
  saveStore()
}

/**
 * 清除用户的对话上下文。
 */
export function clearContext(userId: number): void {
  delete store.conversations[String(userId)]
  saveStore()
}
