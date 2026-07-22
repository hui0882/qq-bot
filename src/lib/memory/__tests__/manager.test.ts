/**
 * Memory Manager 单元测试
 *
 * 测试内容：
 * 1. 上下文构建
 * 2. 对话保存
 * 3. 记忆添加
 * 4. 画像更新
 * 5. 缓存机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock 依赖
const {
  mockAddMessage, mockGetRecentMessages, mockGetProfiles, mockGetSummary,
  mockGetEntries, mockSearchEntries, mockUpsertProfile, mockUpsertProfiles,
  mockUpsertSummary, mockAddEntry, mockAddEntries, mockMarkMessagesProcessed,
  mockGetUnprocessedMessages, mockGetUnprocessedCount, mockClearAllMemory,
} = vi.hoisted(() => ({
  mockAddMessage: vi.fn(),
  mockGetRecentMessages: vi.fn(),
  mockGetProfiles: vi.fn(),
  mockGetSummary: vi.fn(),
  mockGetEntries: vi.fn(),
  mockSearchEntries: vi.fn(),
  mockUpsertProfile: vi.fn(),
  mockUpsertProfiles: vi.fn(),
  mockUpsertSummary: vi.fn(),
  mockAddEntry: vi.fn(),
  mockAddEntries: vi.fn(),
  mockMarkMessagesProcessed: vi.fn(),
  mockGetUnprocessedMessages: vi.fn(),
  mockGetUnprocessedCount: vi.fn(),
  mockClearAllMemory: vi.fn(),
}))

vi.mock('../store', () => ({
  addMessage: mockAddMessage,
  getRecentMessages: mockGetRecentMessages,
  getProfiles: mockGetProfiles,
  getSummary: mockGetSummary,
  getEntries: mockGetEntries,
  searchEntries: mockSearchEntries,
  upsertProfile: mockUpsertProfile,
  upsertProfiles: mockUpsertProfiles,
  upsertSummary: mockUpsertSummary,
  addEntry: mockAddEntry,
  addEntries: mockAddEntries,
  markMessagesProcessed: mockMarkMessagesProcessed,
  getUnprocessedMessages: mockGetUnprocessedMessages,
  getUnprocessedCount: mockGetUnprocessedCount,
  clearAllMemory: mockClearAllMemory,
}))

// Mock cache
const { mockCacheGet, mockCacheSet, mockCacheDelete, mockCacheHas, mockCacheGetStats } = vi.hoisted(() => ({
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  mockCacheDelete: vi.fn(),
  mockCacheHas: vi.fn(),
  mockCacheGetStats: vi.fn(),
}))

vi.mock('../cache', () => ({
  memoryCache: {
    get: mockCacheGet,
    set: mockCacheSet,
    delete: mockCacheDelete,
    has: mockCacheHas,
    getStats: mockCacheGetStats,
  },
}))

// Import manager after mocking
import { memoryManager } from '../manager'

describe('Memory Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // 默认缓存未命中
    mockCacheGet.mockReturnValue(null)
    mockCacheGetStats.mockReturnValue({ size: 0, ttl: 300 })
  })

  describe('buildContext', () => {
    it('应该构建包含用户画像的上下文', () => {
      const profiles = [
        { id: 1, user_id: 'user1', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() },
        { id: 2, user_id: 'user1', key: 'language', value: 'Go', confidence: 0.9, updated_at: Date.now() },
      ]

      mockGetRecentMessages.mockReturnValue([])
      mockGetProfiles.mockReturnValue(profiles)
      mockGetSummary.mockReturnValue(null)
      mockGetEntries.mockReturnValue([])

      const context = memoryManager.buildContext('user1')

      expect(context.userProfiles).toEqual({
        career: '后端开发',
        language: 'Go',
      })
    })

    it('应该构建包含对话摘要的上下文', () => {
      const summary = {
        id: 1,
        user_id: 'user1',
        summary: '用户关注后端开发学习',
        last_message_id: 10,
        updated_at: Date.now(),
      }

      mockGetRecentMessages.mockReturnValue([])
      mockGetProfiles.mockReturnValue([])
      mockGetSummary.mockReturnValue(summary)
      mockGetEntries.mockReturnValue([])

      const context = memoryManager.buildContext('user1')

      expect(context.conversationSummary).toBe('用户关注后端开发学习')
    })

    it('应该构建包含最近消息的上下文', () => {
      const recentMessages = [
        { id: 1, user_id: 'user1', role: 'user', content: '你好', intent: null, created_at: Date.now(), processed: 0 },
        { id: 2, user_id: 'user1', role: 'assistant', content: '你好！有什么可以帮助你的？', intent: null, created_at: Date.now(), processed: 0 },
      ]

      mockGetRecentMessages.mockReturnValue(recentMessages)
      mockGetProfiles.mockReturnValue([])
      mockGetSummary.mockReturnValue(null)
      mockGetEntries.mockReturnValue([])

      const context = memoryManager.buildContext('user1', undefined, 3)

      expect(context.recentMessages).toHaveLength(2)
      expect(context.recentMessages[0].role).toBe('user')
      expect(context.recentMessages[1].role).toBe('assistant')
    })

    it('应该构建包含相关记忆的上下文', () => {
      const memories = [
        { id: 1, user_id: 'user1', memory_type: 'goal', content: '准备秋招', importance: 0.8, created_at: Date.now() },
        { id: 2, user_id: 'user1', memory_type: 'event', content: '参加了技术分享', importance: 0.6, created_at: Date.now() },
      ]

      mockGetRecentMessages.mockReturnValue([])
      mockGetProfiles.mockReturnValue([])
      mockGetSummary.mockReturnValue(null)
      mockGetEntries.mockReturnValue(memories)
      mockSearchEntries.mockReturnValue([])

      const context = memoryManager.buildContext('user1', '我想找实习')

      expect(context.relatedMemories.length).toBeGreaterThan(0)
    })

    it('应该使用缓存数据', () => {
      const cachedContext = {
        recentMessages: [],
        profiles: [{ id: 1, user_id: 'user1', key: 'career', value: '后端开发', confidence: 0.8, updated_at: Date.now() }],
        summary: null,
        timestamp: Date.now(),
      }

      mockCacheGet.mockReturnValue(cachedContext)
      mockGetEntries.mockReturnValue([])

      const context = memoryManager.buildContext('user1')

      // 应该使用缓存的画像
      expect(context.userProfiles.career).toBe('后端开发')
      // 不应该调用数据库
      expect(mockGetProfiles).not.toHaveBeenCalled()
    })
  })

  describe('saveConversation', () => {
    it('应该保存对话到数据库', () => {
      memoryManager.saveConversation('user1', '你好', '你好！')

      // 应该调用两次 addMessage（用户消息和助手回复）
      expect(mockAddMessage).toHaveBeenCalledTimes(2)
      expect(mockAddMessage).toHaveBeenCalledWith('user1', 'user', '你好')
      expect(mockAddMessage).toHaveBeenCalledWith('user1', 'assistant', '你好！')
    })
  })

  describe('addMemory', () => {
    it('应该添加长期记忆', () => {
      mockAddEntry.mockReturnValue(1)

      const id = memoryManager.addMemory('user1', 'goal', '准备秋招', 0.8)

      expect(id).toBe(1)
      expect(mockAddEntry).toHaveBeenCalledWith('user1', 'goal', '准备秋招', 0.8)
    })
  })

  describe('updateProfile', () => {
    it('应该更新用户画像', () => {
      memoryManager.updateProfile('user1', 'career', '前端开发', 0.9)

      expect(mockUpsertProfile).toHaveBeenCalledWith('user1', 'career', '前端开发', 0.9)
    })
  })

  describe('updateSummary', () => {
    it('应该更新对话摘要', () => {
      memoryManager.updateSummary('user1', '用户关注前端开发', 10)

      expect(mockUpsertSummary).toHaveBeenCalledWith('user1', '用户关注前端开发', 10)
    })
  })

  describe('clearAll', () => {
    it('应该清除用户所有记忆', () => {
      memoryManager.clearAll('user1')

      expect(mockClearAllMemory).toHaveBeenCalledWith('user1')
      expect(mockCacheDelete).toHaveBeenCalledWith('user1')
    })
  })

  describe('getUnprocessedCount', () => {
    it('应该获取未处理消息数量', () => {
      mockGetUnprocessedCount.mockReturnValue(5)

      const count = memoryManager.getUnprocessedCount('user1')

      expect(count).toBe(5)
    })
  })
})
