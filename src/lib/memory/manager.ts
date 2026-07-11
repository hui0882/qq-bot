/**
 * Memory Manager
 *
 * 核心管理器，负责：
 * 1. 构建 LLM 上下文（用户画像 + 摘要 + 最近消息 + 相关记忆）
 * 2. 添加记忆
 * 3. 更新用户画像
 * 4. 管理缓存
 *
 * 所有操作都通过 user_id 隔离
 */

import * as store from './store'
import { memoryCache } from './cache'
import type { CachedContext } from './cache'
import type { MemoryMessage, MemoryProfile, MemorySummary, MemoryEntry, MemoryEntryType } from './store'

// ============ 类型定义 ============

export interface BuiltContext {
  userProfiles: Record<string, string>
  conversationSummary: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  relatedMemories: string[]
}

// ============ Memory Manager ============

class MemoryManagerImpl {

  /**
   * 构建 LLM 上下文
   *
   * @param userId 用户ID
   * @param currentMessage 当前用户消息（用于搜索相关记忆）
   * @param recentLimit 最近消息轮数（默认3轮=6条）
   * @returns 构建好的上下文
   */
  buildContext(userId: string, currentMessage?: string, recentLimit: number = 3): BuiltContext {
    // 1. 尝试从缓存获取
    let cached = memoryCache.get(userId)

    // 2. 缓存未命中，从数据库加载
    if (!cached) {
      cached = this.loadFromDB(userId)
      memoryCache.set(userId, cached)
    }

    // 3. 构建用户画像 KV
    const userProfiles: Record<string, string> = {}
    for (const p of cached.profiles) {
      userProfiles[p.key] = p.value
    }

    // 4. 获取最近消息
    const recentMessages = cached.recentMessages
      .slice(-recentLimit * 2)
      .map(m => ({ role: m.role, content: m.content }))

    // 5. 搜索相关记忆
    const relatedMemories = this.searchRelatedMemories(userId, currentMessage)

    // 6. 获取摘要
    const conversationSummary = cached.summary?.summary || ''

    return {
      userProfiles,
      conversationSummary,
      recentMessages,
      relatedMemories,
    }
  }

  /**
   * 保存一轮对话到 memory_messages
   */
  saveConversation(userId: string, userMsg: string, assistantMsg: string): void {
    store.addMessage(userId, 'user', userMsg)
    store.addMessage(userId, 'assistant', assistantMsg)

    // 更新缓存中的最近消息
    const cached = memoryCache.get(userId)
    if (cached) {
      const now = Date.now()
      cached.recentMessages.push(
        { id: 0, user_id: userId, role: 'user', content: userMsg, intent: null, created_at: now, processed: 0 },
        { id: 0, user_id: userId, role: 'assistant', content: assistantMsg, intent: null, created_at: now + 1, processed: 0 }
      )
      // 裁剪到最近20条
      if (cached.recentMessages.length > 20) {
        cached.recentMessages = cached.recentMessages.slice(-20)
      }
      memoryCache.set(userId, cached)
    }
  }

  /**
   * 添加长期记忆
   */
  addMemory(
    userId: string,
    memoryType: MemoryEntryType,
    content: string,
    importance: number = 0.5
  ): number {
    return store.addEntry(userId, memoryType, content, importance)
  }

  /**
   * 批量添加长期记忆
   */
  addMemories(
    userId: string,
    entries: Array<{ memory_type: MemoryEntryType; content: string; importance?: number }>
  ): number[] {
    return store.addEntries(userId, entries)
  }

  /**
   * 更新用户画像
   */
  updateProfile(userId: string, key: string, value: string, confidence: number = 0.8): void {
    store.upsertProfile(userId, key, value, confidence)

    // 更新缓存
    const cached = memoryCache.get(userId)
    if (cached) {
      const existing = cached.profiles.findIndex(p => p.key === key)
      const now = Date.now()
      if (existing >= 0) {
        cached.profiles[existing] = { ...cached.profiles[existing], value, confidence, updated_at: now }
      } else {
        cached.profiles.push({ id: 0, user_id: userId, key, value, confidence, updated_at: now })
      }
      memoryCache.set(userId, cached)
    }
  }

  /**
   * 批量更新用户画像
   */
  updateProfiles(userId: string, profiles: Array<{ key: string; value: string; confidence?: number }>): void {
    store.upsertProfiles(userId, profiles)

    // 使缓存失效，下次读取时重新加载
    memoryCache.delete(userId)
  }

  /**
   * 更新对话摘要
   */
  updateSummary(userId: string, summary: string, lastMessageId?: number): void {
    store.upsertSummary(userId, summary, lastMessageId)

    // 更新缓存
    const cached = memoryCache.get(userId)
    if (cached) {
      cached.summary = {
        id: 0,
        user_id: userId,
        summary,
        last_message_id: lastMessageId || null,
        updated_at: Date.now(),
      }
      memoryCache.set(userId, cached)
    }
  }

  /**
   * 获取用户画像
   */
  getProfiles(userId: string): MemoryProfile[] {
    const cached = memoryCache.get(userId)
    if (cached) return cached.profiles
    return store.getProfiles(userId)
  }

  /**
   * 获取用户摘要
   */
  getSummary(userId: string): MemorySummary | undefined {
    const cached = memoryCache.get(userId)
    if (cached?.summary) return cached.summary
    return store.getSummary(userId)
  }

  /**
   * 获取用户最近消息
   */
  getRecentMessages(userId: string, limit: number = 10): MemoryMessage[] {
    return store.getRecentMessages(userId, limit)
  }

  /**
   * 获取用户长期记忆
   */
  getMemories(userId: string, limit: number = 20): MemoryEntry[] {
    return store.getEntries(userId, limit)
  }

  /**
   * 清除用户所有记忆
   */
  clearAll(userId: string): void {
    store.clearAllMemory(userId)
    memoryCache.delete(userId)
  }

  /**
   * 使用户缓存失效
   */
  invalidateCache(userId: string): void {
    memoryCache.delete(userId)
  }

  /**
   * 获取未处理消息（供 Memory Worker 使用）
   */
  getUnprocessedMessages(userId?: string, limit?: number): MemoryMessage[] {
    return store.getUnprocessedMessages(userId, limit)
  }

  /**
   * 标记消息为已处理
   */
  markProcessed(messageIds: number[]): void {
    store.markMessagesProcessed(messageIds)
  }

  /**
   * 获取未处理消息数量
   */
  getUnprocessedCount(userId: string): number {
    return store.getUnprocessedCount(userId)
  }

  /**
   * 获取统计信息
   */
  getStats(): { cachedUsers: number } {
    return {
      cachedUsers: memoryCache.getStats().size,
    }
  }

  // ============ 私有方法 ============

  /**
   * 从数据库加载用户数据
   */
  private loadFromDB(userId: string): CachedContext {
    return {
      recentMessages: store.getRecentMessages(userId, 20),
      profiles: store.getProfiles(userId),
      summary: store.getSummary(userId) || null,
      timestamp: Date.now(),
    }
  }

  /**
   * 搜索相关长期记忆
   */
  private searchRelatedMemories(userId: string, currentMessage?: string): string[] {
    if (!currentMessage) {
      // 无当前消息时返回高重要性记忆
      const entries = store.getEntries(userId, 5)
      return entries.map(e => `[${e.memory_type}] ${e.content}`)
    }

    // 提取关键词搜索
    const keywords = this.extractKeywords(currentMessage)
    const results: string[] = []
    const seen = new Set<string>()

    for (const keyword of keywords) {
      const entries = store.searchEntries(userId, keyword, 3)
      for (const e of entries) {
        const key = `${e.memory_type}:${e.content}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push(`[${e.memory_type}] ${e.content}`)
        }
      }
    }

    // 如果关键词搜索结果不足，补充高重要性记忆
    if (results.length < 3) {
      const entries = store.getEntries(userId, 5)
      for (const e of entries) {
        const key = `${e.memory_type}:${e.content}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push(`[${e.memory_type}] ${e.content}`)
        }
      }
    }

    return results.slice(0, 5)
  }

  /**
   * 从消息中提取关键词
   */
  private extractKeywords(message: string): string[] {
    // 去除标点符号，按空格分词
    const cleaned = message.replace(/[，。！？、；：""''（）\[\]【】,.!?;:'"()\s]+/g, ' ')
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2)

    // 过滤常见停用词
    const stopWords = new Set([
      '的', '了', '是', '在', '我', '你', '他', '她', '它',
      '我们', '你们', '他们', '这个', '那个', '什么', '怎么',
      '可以', '需要', '应该', '但是', '因为', '所以', '如果',
      '有', '没有', '不', '很', '都', '就', '也', '还',
      '和', '与', '或', '但', '而', '把', '被', '让',
      '请', '帮', '想', '要', '会', '能', '得', '着',
    ])

    return words.filter(w => !stopWords.has(w)).slice(0, 5)
  }
}

// 单例模式
const globalForManager = globalThis as unknown as { __memoryManager?: MemoryManagerImpl }

export function getMemoryManager(): MemoryManagerImpl {
  if (!globalForManager.__memoryManager) {
    globalForManager.__memoryManager = new MemoryManagerImpl()
  }
  return globalForManager.__memoryManager
}

// 导出便捷方法
export const memoryManager = {
  buildContext: (userId: string, currentMessage?: string, recentLimit?: number) =>
    getMemoryManager().buildContext(userId, currentMessage, recentLimit),
  saveConversation: (userId: string, userMsg: string, assistantMsg: string) =>
    getMemoryManager().saveConversation(userId, userMsg, assistantMsg),
  addMemory: (userId: string, type: MemoryEntryType, content: string, importance?: number) =>
    getMemoryManager().addMemory(userId, type, content, importance),
  addMemories: (userId: string, entries: Array<{ memory_type: MemoryEntryType; content: string; importance?: number }>) =>
    getMemoryManager().addMemories(userId, entries),
  updateProfile: (userId: string, key: string, value: string, confidence?: number) =>
    getMemoryManager().updateProfile(userId, key, value, confidence),
  updateProfiles: (userId: string, profiles: Array<{ key: string; value: string; confidence?: number }>) =>
    getMemoryManager().updateProfiles(userId, profiles),
  updateSummary: (userId: string, summary: string, lastMessageId?: number) =>
    getMemoryManager().updateSummary(userId, summary, lastMessageId),
  getProfiles: (userId: string) =>
    getMemoryManager().getProfiles(userId),
  getSummary: (userId: string) =>
    getMemoryManager().getSummary(userId),
  getRecentMessages: (userId: string, limit?: number) =>
    getMemoryManager().getRecentMessages(userId, limit),
  getMemories: (userId: string, limit?: number) =>
    getMemoryManager().getMemories(userId, limit),
  clearAll: (userId: string) =>
    getMemoryManager().clearAll(userId),
  invalidateCache: (userId: string) =>
    getMemoryManager().invalidateCache(userId),
  getUnprocessedMessages: (userId?: string, limit?: number) =>
    getMemoryManager().getUnprocessedMessages(userId, limit),
  markProcessed: (messageIds: number[]) =>
    getMemoryManager().markProcessed(messageIds),
  getUnprocessedCount: (userId: string) =>
    getMemoryManager().getUnprocessedCount(userId),
  getStats: () =>
    getMemoryManager().getStats(),
}
