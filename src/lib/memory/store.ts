/**
 * Memory 数据层
 *
 * 负责 memory_messages / memory_summaries / memory_profiles / memory_entries 四张表的 CRUD
 * 所有操作都通过 user_id 隔离，禁止跨用户访问
 */

import { db } from '../db'

// ============ 类型定义 ============

export interface MemoryMessage {
  id: number
  user_id: string
  role: 'user' | 'assistant'
  content: string
  intent: string | null
  created_at: number
  processed: number
}

export interface MemorySummary {
  id: number
  user_id: string
  summary: string
  last_message_id: number | null
  updated_at: number
}

export interface MemoryProfile {
  id: number
  user_id: string
  key: string
  value: string
  confidence: number
  updated_at: number
}

export interface MemoryEntry {
  id: number
  user_id: string
  memory_type: 'profile' | 'event' | 'preference' | 'goal'
  content: string
  importance: number
  created_at: number
}

export type MemoryEntryType = MemoryEntry['memory_type']

// ============ 消息记录 ============

/**
 * 添加一条消息记录
 */
export function addMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  intent?: string
): number {
  const result = db.prepare(
    'INSERT INTO memory_messages (user_id, role, content, intent, created_at, processed) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(userId, role, content, intent || null, Date.now())
  return Number(result.lastInsertRowid)
}

/**
 * 批量添加消息（事务）
 */
export function addMessages(
  userId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string; intent?: string }>
): number[] {
  const now = Date.now()
  const ids: number[] = []

  const transaction = db.transaction(() => {
    const stmt = db.prepare(
      'INSERT INTO memory_messages (user_id, role, content, intent, created_at, processed) VALUES (?, ?, ?, ?, ?, 0)'
    )
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const result = stmt.run(userId, msg.role, msg.content, msg.intent || null, now + i)
      ids.push(Number(result.lastInsertRowid))
    }
  })

  transaction()
  return ids
}

/**
 * 获取用户最近 N 条消息
 */
export function getRecentMessages(userId: string, limit: number = 10): MemoryMessage[] {
  return db.prepare(
    'SELECT * FROM memory_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as MemoryMessage[]
}

/**
 * 获取未处理的消息
 */
export function getUnprocessedMessages(userId?: string, limit: number = 50): MemoryMessage[] {
  if (userId) {
    return db.prepare(
      'SELECT * FROM memory_messages WHERE user_id = ? AND processed = 0 ORDER BY created_at ASC LIMIT ?'
    ).all(userId, limit) as MemoryMessage[]
  }
  return db.prepare(
    'SELECT * FROM memory_messages WHERE processed = 0 ORDER BY created_at ASC LIMIT ?'
  ).all(limit) as MemoryMessage[]
}

/**
 * 标记消息为已处理
 */
export function markMessagesProcessed(messageIds: number[]): void {
  if (messageIds.length === 0) return

  const placeholders = messageIds.map(() => '?').join(',')
  db.prepare(
    `UPDATE memory_messages SET processed = 1 WHERE id IN (${placeholders})`
  ).run(...messageIds)
}

/**
 * 获取用户未处理消息数量
 */
export function getUnprocessedCount(userId: string): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM memory_messages WHERE user_id = ? AND processed = 0'
  ).get(userId) as { count: number }
  return result.count
}

// ============ 对话摘要 ============

/**
 * 获取用户摘要
 */
export function getSummary(userId: string): MemorySummary | undefined {
  return db.prepare(
    'SELECT * FROM memory_summaries WHERE user_id = ?'
  ).get(userId) as MemorySummary | undefined
}

/**
 * 更新或创建用户摘要
 */
export function upsertSummary(userId: string, summary: string, lastMessageId?: number): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO memory_summaries (user_id, summary, last_message_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      summary = excluded.summary,
      last_message_id = excluded.last_message_id,
      updated_at = excluded.updated_at
  `).run(userId, summary, lastMessageId || null, now)
}

/**
 * 删除用户摘要
 */
export function deleteSummary(userId: string): boolean {
  const result = db.prepare('DELETE FROM memory_summaries WHERE user_id = ?').run(userId)
  return result.changes > 0
}

// ============ 用户画像 ============

/**
 * 获取用户所有画像
 */
export function getProfiles(userId: string): MemoryProfile[] {
  return db.prepare(
    'SELECT * FROM memory_profiles WHERE user_id = ? ORDER BY key'
  ).all(userId) as MemoryProfile[]
}

/**
 * 获取用户某个画像值
 */
export function getProfile(userId: string, key: string): MemoryProfile | undefined {
  return db.prepare(
    'SELECT * FROM memory_profiles WHERE user_id = ? AND key = ?'
  ).get(userId, key) as MemoryProfile | undefined
}

/**
 * 更新或创建用户画像
 */
export function upsertProfile(
  userId: string,
  key: string,
  value: string,
  confidence: number = 0.8
): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at
  `).run(userId, key, value, confidence, now)
}

/**
 * 批量更新用户画像（事务）
 */
export function upsertProfiles(
  userId: string,
  profiles: Array<{ key: string; value: string; confidence?: number }>
): void {
  const now = Date.now()

  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO memory_profiles (user_id, key, value, confidence, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `)
    for (const p of profiles) {
      stmt.run(userId, p.key, p.value, p.confidence || 0.8, now)
    }
  })

  transaction()
}

/**
 * 删除用户某个画像
 */
export function deleteProfile(userId: string, key: string): boolean {
  const result = db.prepare(
    'DELETE FROM memory_profiles WHERE user_id = ? AND key = ?'
  ).run(userId, key)
  return result.changes > 0
}

// ============ 长期记忆 ============

/**
 * 添加一条长期记忆
 */
export function addEntry(
  userId: string,
  memoryType: MemoryEntryType,
  content: string,
  importance: number = 0.5
): number {
  const result = db.prepare(
    'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, memoryType, content, importance, Date.now())
  return Number(result.lastInsertRowid)
}

/**
 * 批量添加长期记忆（事务）
 */
export function addEntries(
  userId: string,
  entries: Array<{ memory_type: MemoryEntryType; content: string; importance?: number }>
): number[] {
  const now = Date.now()
  const ids: number[] = []

  const transaction = db.transaction(() => {
    const stmt = db.prepare(
      'INSERT INTO memory_entries (user_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const e of entries) {
      const result = stmt.run(userId, e.memory_type, e.content, e.importance || 0.5, now)
      ids.push(Number(result.lastInsertRowid))
    }
  })

  transaction()
  return ids
}

/**
 * 获取用户长期记忆（按重要性排序）
 */
export function getEntries(userId: string, limit: number = 20): MemoryEntry[] {
  return db.prepare(
    'SELECT * FROM memory_entries WHERE user_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?'
  ).all(userId, limit) as MemoryEntry[]
}

/**
 * 获取用户指定类型的长期记忆
 */
export function getEntriesByType(userId: string, memoryType: MemoryEntryType, limit: number = 10): MemoryEntry[] {
  return db.prepare(
    'SELECT * FROM memory_entries WHERE user_id = ? AND memory_type = ? ORDER BY importance DESC, created_at DESC LIMIT ?'
  ).all(userId, memoryType, limit) as MemoryEntry[]
}

/**
 * 搜索用户长期记忆（关键词匹配）
 */
export function searchEntries(userId: string, keyword: string, limit: number = 5): MemoryEntry[] {
  return db.prepare(
    'SELECT * FROM memory_entries WHERE user_id = ? AND content LIKE ? ORDER BY importance DESC LIMIT ?'
  ).all(userId, `%${keyword}%`, limit) as MemoryEntry[]
}

/**
 * 删除一条长期记忆
 */
export function deleteEntry(entryId: number): boolean {
  const result = db.prepare('DELETE FROM memory_entries WHERE id = ?').run(entryId)
  return result.changes > 0
}

/**
 * 清理用户所有 Memory 数据
 */
export function clearAllMemory(userId: string): void {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM memory_messages WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_summaries WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_profiles WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_entries WHERE user_id = ?').run(userId)
  })
  transaction()
}

/**
 * 仅清除对话记忆（保留画像和长期记忆）
 */
export function clearConversationMemory(userId: string): void {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM memory_messages WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM memory_summaries WHERE user_id = ?').run(userId)
    // memory_profiles 保留
    // memory_entries 保留
  })
  transaction()
}
