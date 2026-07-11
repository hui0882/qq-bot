/**
 * Memory 模块单元测试
 *
 * 测试内容：
 * 1. 多用户隔离
 * 2. 消息记录 CRUD
 * 3. 对话摘要
 * 4. 用户画像
 * 5. 长期记忆
 * 6. 上下文构建
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock db module before importing store
const mockExec = vi.fn()
const mockPrepare = vi.fn()
const mockRun = vi.fn()
const mockGet = vi.fn()
const mockAll = vi.fn()
const mockTransaction = vi.fn()

vi.mock('../../db', () => ({
  db: {
    exec: mockExec,
    prepare: mockPrepare,
    transaction: mockTransaction,
  },
}))

// Import store after mocking
import * as store from '../store'

describe('Memory Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock prepare to return an object with run/get/all methods
    mockPrepare.mockReturnValue({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    })

    // Mock transaction to execute the callback
    mockTransaction.mockImplementation((fn: () => void) => fn)
  })

  describe('多用户隔离', () => {
    it('用户A的消息不应被用户B获取', () => {
      // 用户A的消息
      const userAMessages = [
        { id: 1, user_id: 'userA', role: 'user' as const, content: '我是用户A', intent: null, created_at: Date.now(), processed: 0 },
      ]

      // 用户B的消息
      const userBMessages = [
        { id: 2, user_id: 'userB', role: 'user' as const, content: '我是用户B', intent: null, created_at: Date.now(), processed: 0 },
      ]

      // Mock getRecentMessages 返回正确的用户数据
      mockAll.mockImplementation((userId: string) => {
        if (userId === 'userA') return userAMessages
        if (userId === 'userB') return userBMessages
        return []
      })

      const userAResult = store.getRecentMessages('userA', 10)
      const userBResult = store.getRecentMessages('userB', 10)

      // 验证用户A只能获取自己的消息
      expect(userAResult).toEqual(userAMessages)
      expect(userAResult.every(m => m.user_id === 'userA')).toBe(true)

      // 验证用户B只能获取自己的消息
      expect(userBResult).toEqual(userBMessages)
      expect(userBResult.every(m => m.user_id === 'userB')).toBe(true)
    })

    it('用户A的画像不应被用户B获取', () => {
      const userAProfiles = [
        { id: 1, user_id: 'userA', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() },
      ]

      const userBProfiles = [
        { id: 2, user_id: 'userB', key: 'career', value: '前端开发', confidence: 0.8, updated_at: Date.now() },
      ]

      mockAll.mockImplementation((userId: string) => {
        if (userId === 'userA') return userAProfiles
        if (userId === 'userB') return userBProfiles
        return []
      })

      const userAResult = store.getProfiles('userA')
      const userBResult = store.getProfiles('userB')

      expect(userAResult).toEqual(userAProfiles)
      expect(userBResult).toEqual(userBProfiles)
      expect(userAResult[0].value).not.toBe(userBResult[0].value)
    })
  })

  describe('消息记录', () => {
    it('应该添加消息', () => {
      mockRun.mockReturnValue({ lastInsertRowid: 1 })

      const id = store.addMessage('user1', 'user', '你好')

      expect(mockRun).toHaveBeenCalledWith(
        'user1',
        'user',
        '你好',
        null,
        expect.any(Number)
      )
      expect(id).toBe(1)
    })

    it('应该批量添加消息', () => {
      mockRun.mockReturnValue({ lastInsertRowid: 1 })

      const messages = [
        { role: 'user' as const, content: '消息1' },
        { role: 'assistant' as const, content: '回复1' },
      ]

      const ids = store.addMessages('user1', messages)

      expect(ids).toHaveLength(2)
      expect(mockRun).toHaveBeenCalledTimes(2)
    })

    it('应该获取未处理消息', () => {
      const unprocessedMessages = [
        { id: 1, user_id: 'user1', role: 'user', content: '消息1', intent: null, created_at: Date.now(), processed: 0 },
        { id: 2, user_id: 'user1', role: 'assistant', content: '回复1', intent: null, created_at: Date.now(), processed: 0 },
      ]

      mockAll.mockReturnValue(unprocessedMessages)

      const result = store.getUnprocessedMessages('user1', 10)

      expect(result).toEqual(unprocessedMessages)
      expect(result.every(m => m.processed === 0)).toBe(true)
    })

    it('应该标记消息为已处理', () => {
      store.markMessagesProcessed([1, 2, 3])

      expect(mockRun).toHaveBeenCalledWith(1, 2, 3)
    })
  })

  describe('对话摘要', () => {
    it('应该获取用户摘要', () => {
      const summary = {
        id: 1,
        user_id: 'user1',
        summary: '用户关注后端开发',
        last_message_id: 10,
        updated_at: Date.now(),
      }

      mockGet.mockReturnValue(summary)

      const result = store.getSummary('user1')

      expect(result).toEqual(summary)
    })

    it('应该更新或创建摘要', () => {
      store.upsertSummary('user1', '新的摘要', 10)

      expect(mockRun).toHaveBeenCalled()
    })

    it('应该删除用户摘要', () => {
      mockRun.mockReturnValue({ changes: 1 })

      const result = store.deleteSummary('user1')

      expect(result).toBe(true)
    })
  })

  describe('用户画像', () => {
    it('应该获取用户所有画像', () => {
      const profiles = [
        { id: 1, user_id: 'user1', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() },
        { id: 2, user_id: 'user1', key: 'language', value: 'Go', confidence: 0.9, updated_at: Date.now() },
      ]

      mockAll.mockReturnValue(profiles)

      const result = store.getProfiles('user1')

      expect(result).toEqual(profiles)
      expect(result).toHaveLength(2)
    })

    it('应该获取用户特定画像', () => {
      const profile = { id: 1, user_id: 'user1', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() }

      mockGet.mockReturnValue(profile)

      const result = store.getProfile('user1', 'career')

      expect(result).toEqual(profile)
    })

    it('应该更新或创建画像', () => {
      store.upsertProfile('user1', 'career', '前端开发', 0.9)

      expect(mockRun).toHaveBeenCalled()
    })

    it('应该批量更新画像', () => {
      const profiles = [
        { key: 'career', value: '后端开发', confidence: 0.8 },
        { key: 'language', value: 'Go', confidence: 0.9 },
      ]

      store.upsertProfiles('user1', profiles)

      // 事务应该被调用
      expect(mockTransaction).toHaveBeenCalled()
    })
  })

  describe('长期记忆', () => {
    it('应该添加长期记忆', () => {
      mockRun.mockReturnValue({ lastInsertRowid: 1 })

      const id = store.addEntry('user1', 'goal', '准备秋招', 0.8)

      expect(id).toBe(1)
      expect(mockRun).toHaveBeenCalled()
    })

    it('应该批量添加长期记忆', () => {
      mockRun.mockReturnValue({ lastInsertRowid: 1 })

      const entries = [
        { memory_type: 'goal' as const, content: '目标1', importance: 0.8 },
        { memory_type: 'event' as const, content: '事件1', importance: 0.6 },
      ]

      const ids = store.addEntries('user1', entries)

      expect(ids).toHaveLength(2)
    })

    it('应该获取用户长期记忆', () => {
      const entries = [
        { id: 1, user_id: 'user1', memory_type: 'goal', content: '准备秋招', importance: 0.8, created_at: Date.now() },
        { id: 2, user_id: 'user1', memory_type: 'event', content: '参加了技术分享', importance: 0.6, created_at: Date.now() },
      ]

      mockAll.mockReturnValue(entries)

      const result = store.getEntries('user1', 10)

      expect(result).toEqual(entries)
    })

    it('应该按类型获取长期记忆', () => {
      const goalEntries = [
        { id: 1, user_id: 'user1', memory_type: 'goal', content: '准备秋招', importance: 0.8, created_at: Date.now() },
      ]

      mockAll.mockReturnValue(goalEntries)

      const result = store.getEntriesByType('user1', 'goal', 10)

      expect(result).toEqual(goalEntries)
      expect(result.every(e => e.memory_type === 'goal')).toBe(true)
    })

    it('应该搜索长期记忆', () => {
      const searchResults = [
        { id: 1, user_id: 'user1', memory_type: 'goal', content: '学习Go语言', importance: 0.8, created_at: Date.now() },
      ]

      mockAll.mockReturnValue(searchResults)

      const result = store.searchEntries('user1', 'Go', 5)

      expect(result).toEqual(searchResults)
    })

    it('应该删除长期记忆', () => {
      mockRun.mockReturnValue({ changes: 1 })

      const result = store.deleteEntry(1)

      expect(result).toBe(true)
    })
  })

  describe('清理操作', () => {
    it('应该清除用户所有记忆', () => {
      store.clearAllMemory('user1')

      // 应该调用事务
      expect(mockTransaction).toHaveBeenCalled()
    })
  })
})
