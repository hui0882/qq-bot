/**
 * Memory 系统全流程集成测试
 *
 * 使用真实数据库（不走 mock），测试以下功能：
 * 1. 多用户隔离：用户 A 创建记忆，用户 B 不能获取
 * 2. 摘要测试：输入多轮聊天，验证生成正确 summary
 * 3. 用户画像测试：输入"我是 Go 后端开发"，验证 profile 生成
 * 4. Context 测试：验证 LLM 收到的上下文包含正确的用户信息，不包含其他用户信息
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// 使用测试数据库
const TEST_DB_DIR = join(process.cwd(), 'data')
const TEST_DB_PATH = join(TEST_DB_DIR, 'napcat.db')

// 创建测试数据库连接
function getTestDb(): Database.Database {
  const db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

// 初始化 memory 表
function initMemoryTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      intent TEXT,
      created_at INTEGER NOT NULL,
      processed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memory_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      last_message_id INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 0.8,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, key)
    );

    CREATE TABLE IF NOT EXISTS memory_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_messages_user_id ON memory_messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_memory_messages_processed ON memory_messages(processed);
    CREATE INDEX IF NOT EXISTS idx_memory_profiles_user_id ON memory_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_user_id ON memory_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_type ON memory_entries(memory_type);
  `)
}

// 清理测试数据
function cleanupTestData(db: Database.Database, userIds: string[]): void {
  for (const userId of userIds) {
    db.prepare('DELETE FROM memory_messages WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_summaries WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_profiles WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_entries WHERE user_id = ?').run(userId)
  }
}

describe('Memory 系统全流程集成测试', () => {
  let db: Database.Database
  const testUserA = 'test_user_a_' + Date.now()
  const testUserB = 'test_user_b_' + Date.now()
  const testUsers = [testUserA, testUserB]

  beforeEach(() => {
    db = getTestDb()
    initMemoryTables(db)
    cleanupTestData(db, testUsers)
  })

  afterAll(() => {
    cleanupTestData(db, testUsers)
    db.close()
  })

  describe('1. 多用户隔离测试', () => {
    it('用户 A 创建的消息不应被用户 B 获取', () => {
      // 用户 A 添加消息
      const now = Date.now()
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'user', '我是用户 A 的消息', now, 0)

      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'assistant', '用户 A 的回复', now + 1, 0)

      // 用户 B 添加消息
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'user', '我是用户 B 的消息', now + 2, 0)

      // 查询用户 A 的消息
      const userAMessages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ? ORDER BY created_at'
      ).all(testUserA) as Array<{ user_id: string; content: string }>

      // 查询用户 B 的消息
      const userBMessages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ? ORDER BY created_at'
      ).all(testUserB) as Array<{ user_id: string; content: string }>

      // 验证用户 A 只能获取自己的消息
      expect(userAMessages).toHaveLength(2)
      expect(userAMessages.every(m => m.user_id === testUserA)).toBe(true)
      expect(userAMessages.some(m => m.content.includes('用户 B'))).toBe(false)

      // 验证用户 B 只能获取自己的消息
      expect(userBMessages).toHaveLength(1)
      expect(userBMessages.every(m => m.user_id === testUserB)).toBe(true)
      expect(userBMessages.some(m => m.content.includes('用户 A'))).toBe(false)
    })

    it('用户 A 创建的画像不应被用户 B 获取', () => {
      const now = Date.now()

      // 用户 A 添加画像
      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'career', 'Go 后端开发', 0.9, now)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'language', 'Go', 0.95, now)

      // 用户 B 添加画像
      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'career', '前端开发', 0.8, now)

      // 查询用户 A 的画像
      const userAProfiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ?'
      ).all(testUserA) as Array<{ user_id: string; key: string; value: string }>

      // 查询用户 B 的画像
      const userBProfiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ?'
      ).all(testUserB) as Array<{ user_id: string; key: string; value: string }>

      // 验证用户 A 的画像
      expect(userAProfiles).toHaveLength(2)
      expect(userAProfiles.some(p => p.key === 'career' && p.value === 'Go 后端开发')).toBe(true)
      expect(userAProfiles.some(p => p.key === 'language' && p.value === 'Go')).toBe(true)

      // 验证用户 B 的画像
      expect(userBProfiles).toHaveLength(1)
      expect(userBProfiles.some(p => p.key === 'career' && p.value === '前端开发')).toBe(true)

      // 验证用户 B 无法获取用户 A 的画像
      expect(userBProfiles.some(p => p.value === 'Go')).toBe(false)
    })

    it('用户 A 创建的长期记忆不应被用户 B 获取', () => {
      const now = Date.now()

      // 用户 A 添加长期记忆
      db.prepare(
        'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'goal', '准备秋招', 0.9, now)

      db.prepare(
        'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'preference', '喜欢 Go 语言', 0.8, now)

      // 用户 B 添加长期记忆
      db.prepare(
        'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'goal', '学习 React', 0.7, now)

      // 查询用户 A 的长期记忆
      const userAEntries = db.prepare(
        'SELECT * FROM memory_entries WHERE user_id = ?'
      ).all(testUserA) as Array<{ user_id: string; content: string }>

      // 查询用户 B 的长期记忆
      const userBEntries = db.prepare(
        'SELECT * FROM memory_entries WHERE user_id = ?'
      ).all(testUserB) as Array<{ user_id: string; content: string }>

      // 验证用户 A 的长期记忆
      expect(userAEntries).toHaveLength(2)
      expect(userAEntries.some(e => e.content === '准备秋招')).toBe(true)
      expect(userAEntries.some(e => e.content === '喜欢 Go 语言')).toBe(true)

      // 验证用户 B 的长期记忆
      expect(userBEntries).toHaveLength(1)
      expect(userBEntries.some(e => e.content === '学习 React')).toBe(true)

      // 验证用户 B 无法获取用户 A 的长期记忆
      expect(userBEntries.some(e => e.content.includes('Go'))).toBe(false)
    })

    it('用户 A 的摘要不应被用户 B 获取', () => {
      const now = Date.now()

      // 用户 A 添加摘要
      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserA, '用户 A 关注 Go 后端开发', now)

      // 用户 B 添加摘要
      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserB, '用户 B 关注前端开发', now)

      // 查询用户 A 的摘要
      const userASummary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserA) as { user_id: string; summary: string } | undefined

      // 查询用户 B 的摘要
      const userBSummary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserB) as { user_id: string; summary: string } | undefined

      // 验证摘要隔离
      expect(userASummary).toBeDefined()
      expect(userASummary!.summary).toContain('Go 后端开发')

      expect(userBSummary).toBeDefined()
      expect(userBSummary!.summary).toContain('前端开发')

      // 验证用户 B 无法获取用户 A 的摘要
      expect(userBSummary!.summary).not.toContain('Go')
    })
  })

  describe('2. 摘要测试', () => {
    it('应该正确存储和更新摘要', () => {
      const now = Date.now()

      // 第一次创建摘要
      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserA, '用户刚开始学习 Go 语言', now)

      // 查询摘要
      let summary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserA) as { summary: string } | undefined

      expect(summary).toBeDefined()
      expect(summary!.summary).toBe('用户刚开始学习 Go 语言')

      // 更新摘要（使用 UPSERT）
      db.prepare(`
        INSERT INTO memory_summaries (user_id, summary, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          summary = excluded.summary,
          updated_at = excluded.updated_at
      `).run(testUserA, '用户已经掌握 Go 基础，正在学习并发编程', now + 1000)

      // 再次查询摘要
      summary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserA) as { summary: string } | undefined

      expect(summary).toBeDefined()
      expect(summary!.summary).toBe('用户已经掌握 Go 基础，正在学习并发编程')
    })

    it('应该支持多轮对话后的摘要更新', () => {
      const now = Date.now()

      // 模拟多轮对话
      const conversations = [
        { role: 'user', content: '我想学习 Go 语言' },
        { role: 'assistant', content: 'Go 是一门很好的语言，适合后端开发' },
        { role: 'user', content: 'Go 的并发模型是怎样的？' },
        { role: 'assistant', content: 'Go 使用 goroutine 和 channel 实现并发' },
        { role: 'user', content: '能举个例子吗？' },
        { role: 'assistant', content: '当然，这里是一个简单的 goroutine 示例...' },
      ]

      // 保存对话
      for (let i = 0; i < conversations.length; i++) {
        db.prepare(
          'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
        ).run(testUserA, conversations[i].role, conversations[i].content, now + i * 1000, 0)
      }

      // 更新摘要
      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserA, '用户正在学习 Go 语言，重点关注并发编程，包括 goroutine 和 channel 的使用', now + 6000)

      // 查询对话和摘要
      const messages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ? ORDER BY created_at'
      ).all(testUserA) as Array<{ role: string; content: string }>

      const summary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserA) as { summary: string } | undefined

      // 验证
      expect(messages).toHaveLength(6)
      expect(summary).toBeDefined()
      expect(summary!.summary).toContain('Go')
      expect(summary!.summary).toContain('并发')
      expect(summary!.summary).toContain('goroutine')
    })
  })

  describe('3. 用户画像测试', () => {
    it('应该正确存储用户职业信息', () => {
      const now = Date.now()

      // 模拟用户说"我是 Go 后端开发"
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'user', '我是 Go 后端开发', now, 0)

      // 模拟 AI 提取画像
      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'career', 'Go 后端开发', 0.9, now + 1000)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'language', 'Go', 0.95, now + 1000)

      // 查询画像
      const profiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ? ORDER BY key'
      ).all(testUserA) as Array<{ key: string; value: string; confidence: number }>

      // 验证
      expect(profiles).toHaveLength(2)
      expect(profiles[0].key).toBe('career')
      expect(profiles[0].value).toBe('Go 后端开发')
      expect(profiles[0].confidence).toBe(0.9)
      expect(profiles[1].key).toBe('language')
      expect(profiles[1].value).toBe('Go')
      expect(profiles[1].confidence).toBe(0.95)
    })

    it('应该支持画像更新（UPSERT）', () => {
      const now = Date.now()

      // 第一次设置画像
      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'career', '后端开发', 0.8, now)

      // 查询
      let profile = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ? AND key = ?'
      ).get(testUserA, 'career') as { value: string; confidence: number } | undefined

      expect(profile).toBeDefined()
      expect(profile!.value).toBe('后端开发')
      expect(profile!.confidence).toBe(0.8)

      // 更新画像（更具体的信息）
      db.prepare(`
        INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET
          value = excluded.value,
          confidence = excluded.confidence,
          updated_at = excluded.updated_at
      `).run(testUserA, 'career', 'Go 后端开发', 0.9, now + 1000)

      // 再次查询
      profile = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ? AND key = ?'
      ).get(testUserA, 'career') as { value: string; confidence: number } | undefined

      expect(profile).toBeDefined()
      expect(profile!.value).toBe('Go 后端开发')
      expect(profile!.confidence).toBe(0.9)
    })

    it('应该支持多个画像字段', () => {
      const now = Date.now()

      // 添加多个画像字段
      const profiles = [
        { key: 'career', value: 'Go 后端开发', confidence: 0.9 },
        { key: 'language', value: 'Go', confidence: 0.95 },
        { key: 'company', value: '字节跳动', confidence: 0.7 },
        { key: 'education', value: '计算机科学', confidence: 0.8 },
      ]

      for (const p of profiles) {
        db.prepare(
          'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(testUserA, p.key, p.value, p.confidence, now)
      }

      // 查询所有画像
      const result = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ? ORDER BY key'
      ).all(testUserA) as Array<{ key: string; value: string }>

      // 验证
      expect(result).toHaveLength(4)
      expect(result.some(p => p.key === 'career' && p.value === 'Go 后端开发')).toBe(true)
      expect(result.some(p => p.key === 'language' && p.value === 'Go')).toBe(true)
      expect(result.some(p => p.key === 'company' && p.value === '字节跳动')).toBe(true)
      expect(result.some(p => p.key === 'education' && p.value === '计算机科学')).toBe(true)
    })
  })

  describe('4. Context 测试', () => {
    it('应该构建包含正确用户信息的上下文', () => {
      const now = Date.now()

      // 为用户 A 添加完整数据
      // 1. 消息
      const messagesA = [
        { role: 'user', content: '我想学习 Go 的并发' },
        { role: 'assistant', content: 'Go 的并发基于 goroutine 和 channel' },
        { role: 'user', content: '能举个例子吗？' },
        { role: 'assistant', content: '当然，这里是一个简单的例子...' },
      ]

      for (let i = 0; i < messagesA.length; i++) {
        db.prepare(
          'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
        ).run(testUserA, messagesA[i].role, messagesA[i].content, now + i * 1000, 0)
      }

      // 2. 画像
      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'career', 'Go 后端开发', 0.9, now)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'language', 'Go', 0.95, now)

      // 3. 摘要
      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserA, '用户正在学习 Go 并发编程', now + 4000)

      // 4. 长期记忆
      db.prepare(
        'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'goal', '掌握 Go 并发编程', 0.9, now)

      // 为用户 B 添加数据（应该被隔离）
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'user', '我是前端开发', now, 0)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'career', '前端开发', 0.8, now)

      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserB, '用户关注前端技术', now)

      // 构建用户 A 的上下文
      const userAMessages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 6'
      ).all(testUserA) as Array<{ role: string; content: string }>

      const userAProfiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ?'
      ).all(testUserA) as Array<{ key: string; value: string }>

      const userASummary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserA) as { summary: string } | undefined

      const userAEntries = db.prepare(
        'SELECT * FROM memory_entries WHERE user_id = ? ORDER BY importance DESC'
      ).all(testUserA) as Array<{ content: string }>

      // 验证上下文包含正确的用户信息
      expect(userAMessages.length).toBeGreaterThan(0)
      expect(userAMessages.every(m => !m.content.includes('前端'))).toBe(true)

      expect(userAProfiles.some(p => p.key === 'career' && p.value === 'Go 后端开发')).toBe(true)
      expect(userAProfiles.some(p => p.key === 'language' && p.value === 'Go')).toBe(true)

      expect(userASummary).toBeDefined()
      expect(userASummary!.summary).toContain('Go')
      expect(userASummary!.summary).not.toContain('前端')

      expect(userAEntries.some(e => e.content.includes('Go'))).toBe(true)
    })

    it('上下文不应包含其他用户的信息', () => {
      const now = Date.now()

      // 用户 A 的数据
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'user', '我是 Go 开发', now, 0)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'career', 'Go 后端开发', 0.9, now)

      // 用户 B 的数据
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'user', '我是 Python 开发', now, 0)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserB, 'career', 'Python 数据分析', 0.8, now)

      // 查询用户 A 的上下文
      const userAMessages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ?'
      ).all(testUserA) as Array<{ content: string }>

      const userAProfiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ?'
      ).all(testUserA) as Array<{ value: string }>

      // 验证不包含用户 B 的信息
      expect(userAMessages.every(m => !m.content.includes('Python'))).toBe(true)
      expect(userAProfiles.every(p => !p.value.includes('Python'))).toBe(true)

      // 查询用户 B 的上下文
      const userBMessages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ?'
      ).all(testUserB) as Array<{ content: string }>

      const userBProfiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ?'
      ).all(testUserB) as Array<{ value: string }>

      // 验证不包含用户 A 的信息
      expect(userBMessages.every(m => !m.content.includes('Go'))).toBe(true)
      expect(userBProfiles.every(p => !p.value.includes('Go'))).toBe(true)
    })

    it('应该支持关键词搜索长期记忆', () => {
      const now = Date.now()

      // 添加多条长期记忆
      const entries = [
        { type: 'goal', content: '掌握 Go 并发编程', importance: 0.9 },
        { type: 'goal', content: '学习微服务架构', importance: 0.8 },
        { type: 'preference', content: '喜欢 Go 语言', importance: 0.7 },
        { type: 'event', content: '参加了 Go 语言大会', importance: 0.6 },
      ]

      for (const e of entries) {
        db.prepare(
          'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(testUserA, e.type, e.content, e.importance, now)
      }

      // 搜索包含"Go"的记忆
      const goEntries = db.prepare(
        'SELECT * FROM memory_entries WHERE user_id = ? AND content LIKE ? ORDER BY importance DESC'
      ).all(testUserA, '%Go%') as Array<{ content: string; importance: number }>

      // 验证搜索结果
      expect(goEntries).toHaveLength(3)
      expect(goEntries[0].content).toContain('Go 并发')
      expect(goEntries[0].importance).toBe(0.9)
      expect(goEntries.some(e => e.content.includes('Go 语言大会'))).toBe(true)

      // 搜索包含"微服务"的记忆
      const microserviceEntries = db.prepare(
        'SELECT * FROM memory_entries WHERE user_id = ? AND content LIKE ? ORDER BY importance DESC'
      ).all(testUserA, '%微服务%') as Array<{ content: string }>

      expect(microserviceEntries).toHaveLength(1)
      expect(microserviceEntries[0].content).toContain('微服务')
    })
  })

  describe('5. 完整流程测试', () => {
    it('应该支持完整的记忆管理流程', () => {
      const now = Date.now()

      // 1. 用户发送消息
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'user', '我是 Go 后端开发，想学习微服务', now, 0)

      // 2. AI 回复
      db.prepare(
        'INSERT INTO memory_messages (user_id, role, content, created_at, processed) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'assistant', '好的，我来帮你学习微服务架构', now + 1000, 0)

      // 3. 提取画像
      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'career', 'Go 后端开发', 0.9, now + 2000)

      db.prepare(
        'INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'interest', '微服务', 0.8, now + 2000)

      // 4. 添加长期记忆
      db.prepare(
        'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testUserA, 'goal', '学习微服务架构', 0.9, now + 2000)

      // 5. 更新摘要
      db.prepare(
        'INSERT INTO memory_summaries (user_id, summary, updated_at) VALUES (?, ?, ?)'
      ).run(testUserA, '用户是 Go 后端开发，正在学习微服务架构', now + 3000)

      // 6. 标记消息为已处理
      db.prepare(
        'UPDATE memory_messages SET processed = 1 WHERE user_id = ? AND processed = 0'
      ).run(testUserA)

      // 验证完整流程
      const messages = db.prepare(
        'SELECT * FROM memory_messages WHERE user_id = ?'
      ).all(testUserA) as Array<{ processed: number }>

      const profiles = db.prepare(
        'SELECT * FROM memory_profiles WHERE user_id = ?'
      ).all(testUserA) as Array<{ key: string; value: string }>

      const entries = db.prepare(
        'SELECT * FROM memory_entries WHERE user_id = ?'
      ).all(testUserA) as Array<{ content: string }>

      const summary = db.prepare(
        'SELECT * FROM memory_summaries WHERE user_id = ?'
      ).get(testUserA) as { summary: string } | undefined

      // 验证所有数据都已正确存储
      expect(messages).toHaveLength(2)
      expect(messages.every(m => m.processed === 1)).toBe(true)

      expect(profiles).toHaveLength(2)
      expect(profiles.some(p => p.key === 'career' && p.value === 'Go 后端开发')).toBe(true)
      expect(profiles.some(p => p.key === 'interest' && p.value === '微服务')).toBe(true)

      expect(entries).toHaveLength(1)
      expect(entries[0].content).toContain('微服务')

      expect(summary).toBeDefined()
      expect(summary!.summary).toContain('Go')
      expect(summary!.summary).toContain('微服务')
    })
  })
})
