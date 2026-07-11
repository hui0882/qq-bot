/**
 * Memory 本地缓存层
 *
 * 无 Redis 环境下使用内存 Map 缓存
 * 支持 TTL 超时清理，避免内存泄漏
 *
 * 缓存结构: userId → { context, profiles, summary, timestamp }
 */

import type { MemoryMessage, MemoryProfile, MemorySummary } from './store'

// ============ 类型定义 ============

export interface CachedContext {
  recentMessages: MemoryMessage[]
  profiles: MemoryProfile[]
  summary: MemorySummary | null
  timestamp: number
}

interface CacheEntry {
  data: CachedContext
  expiresAt: number
}

// ============ 缓存实现 ============

export class MemoryCache {
  private cache = new Map<string, CacheEntry>()
  private ttl: number         // 缓存 TTL (毫秒)
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(ttlMinutes: number = 5) {
    this.ttl = ttlMinutes * 60 * 1000
  }

  /**
   * 启动定期清理
   */
  start(): void {
    if (this.cleanupTimer) return

    // 每 60 秒清理过期缓存
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000)

    // 进程退出时清理
    process.on('exit', () => this.stop())

    console.log(`[MemoryCache] Started with TTL=${this.ttl / 1000}s`)
  }

  /**
   * 停止缓存
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.cache.clear()
  }

  /**
   * 获取缓存
   */
  get(userId: string): CachedContext | null {
    const entry = this.cache.get(userId)
    if (!entry) return null

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(userId)
      return null
    }

    return entry.data
  }

  /**
   * 设置缓存
   */
  set(userId: string, data: CachedContext): void {
    this.cache.set(userId, {
      data,
      expiresAt: Date.now() + this.ttl,
    })
  }

  /**
   * 更新缓存的部分数据
   */
  update(userId: string, partial: Partial<CachedContext>): void {
    const existing = this.get(userId)
    if (existing) {
      this.set(userId, { ...existing, ...partial })
    }
  }

  /**
   * 删除缓存
   */
  delete(userId: string): void {
    this.cache.delete(userId)
  }

  /**
   * 检查缓存是否存在且未过期
   */
  has(userId: string): boolean {
    return this.get(userId) !== null
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[MemoryCache] Cleaned ${cleaned} expired entries, ${this.cache.size} remaining`)
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; ttl: number } {
    return {
      size: this.cache.size,
      ttl: this.ttl / 1000,
    }
  }
}

// 单例模式
const globalForCache = globalThis as unknown as { __memoryCache?: MemoryCache }

export function getMemoryCache(): MemoryCache {
  if (!globalForCache.__memoryCache) {
    globalForCache.__memoryCache = new MemoryCache(5)  // 默认 5 分钟 TTL
    globalForCache.__memoryCache.start()
  }
  return globalForCache.__memoryCache
}

// 导出便捷方法
export const memoryCache = {
  get: (userId: string) => getMemoryCache().get(userId),
  set: (userId: string, data: CachedContext) => getMemoryCache().set(userId, data),
  update: (userId: string, partial: Partial<CachedContext>) => getMemoryCache().update(userId, partial),
  delete: (userId: string) => getMemoryCache().delete(userId),
  has: (userId: string) => getMemoryCache().has(userId),
  getStats: () => getMemoryCache().getStats(),
}
