/**
 * Memory Cache 单元测试
 *
 * 测试内容：
 * 1. 缓存读写
 * 2. TTL 超时
 * 3. 缓存更新
 * 4. 缓存删除
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 不 mock cache 模块，直接测试真实实现
import { MemoryCache } from '../cache'

describe('MemoryCache', () => {
  let cache: MemoryCache

  beforeEach(() => {
    // 使用短 TTL 进行测试
    cache = new MemoryCache(0.01) // 0.01 分钟 = 600ms
  })

  afterEach(() => {
    cache.stop()
  })

  describe('基本读写', () => {
    it('应该存储和获取数据', () => {
      const data = {
        recentMessages: [],
        profiles: [],
        summary: null,
        timestamp: Date.now(),
      }

      cache.set('user1', data)
      const result = cache.get('user1')

      expect(result).toEqual(data)
    })

    it('应该返回 null 当缓存不存在', () => {
      const result = cache.get('nonexistent')
      expect(result).toBeNull()
    })

    it('应该检查缓存是否存在', () => {
      const data = {
        recentMessages: [],
        profiles: [],
        summary: null,
        timestamp: Date.now(),
      }

      cache.set('user1', data)
      expect(cache.has('user1')).toBe(true)
      expect(cache.has('user2')).toBe(false)
    })
  })

  describe('TTL 超时', () => {
    it('应该在 TTL 过期后返回 null', async () => {
      const data = {
        recentMessages: [],
        profiles: [],
        summary: null,
        timestamp: Date.now(),
      }

      cache.set('user1', data)

      // 等待 TTL 过期（600ms + buffer）
      await new Promise(resolve => setTimeout(resolve, 700))

      const result = cache.get('user1')
      expect(result).toBeNull()
    })
  })

  describe('缓存更新', () => {
    it('应该支持部分更新', () => {
      const initialData = {
        recentMessages: [],
        profiles: [],
        summary: null,
        timestamp: Date.now(),
      }

      cache.set('user1', initialData)

      const update = {
        profiles: [{ id: 1, user_id: 'user1', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() }],
      }

      cache.update('user1', update)

      const result = cache.get('user1')
      expect(result?.profiles).toEqual(update.profiles)
      expect(result?.recentMessages).toEqual([])
    })

    it('不应该更新不存在的缓存', () => {
      const update = {
        profiles: [{ id: 1, user_id: 'user1', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() }],
      }

      cache.update('nonexistent', update)

      const result = cache.get('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('缓存删除', () => {
    it('应该删除缓存', () => {
      const data = {
        recentMessages: [],
        profiles: [],
        summary: null,
        timestamp: Date.now(),
      }

      cache.set('user1', data)
      cache.delete('user1')

      const result = cache.get('user1')
      expect(result).toBeNull()
    })
  })

  describe('多用户隔离', () => {
    it('不同用户应该有独立的缓存', () => {
      const dataA = {
        recentMessages: [],
        profiles: [{ id: 1, user_id: 'userA', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() }],
        summary: null,
        timestamp: Date.now(),
      }

      const dataB = {
        recentMessages: [],
        profiles: [{ id: 2, user_id: 'userB', key: 'career', value: '前端开发', confidence: 0.8, updated_at: Date.now() }],
        summary: null,
        timestamp: Date.now(),
      }

      cache.set('userA', dataA)
      cache.set('userB', dataB)

      const resultA = cache.get('userA')
      const resultB = cache.get('userB')

      expect(resultA?.profiles[0].value).toBe('后端开发')
      expect(resultB?.profiles[0].value).toBe('前端开发')
    })
  })

  describe('统计信息', () => {
    it('应该返回正确的统计信息', () => {
      cache.set('user1', { recentMessages: [], profiles: [], summary: null, timestamp: Date.now() })
      cache.set('user2', { recentMessages: [], profiles: [], summary: null, timestamp: Date.now() })

      const stats = cache.getStats()

      expect(stats.size).toBe(2)
      expect(stats.ttl).toBeGreaterThan(0)
    })
  })
})
