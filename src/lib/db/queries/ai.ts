/**
 * AI 上下文查询封装
 */

import { db } from '../index'

export interface AIMessage {
  id: number
  user_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AISetting {
  key: string
  value: string
}

/**
 * 获取用户最近的对话上下文
 */
export function getAIContext(userId: string | number, maxRounds: number = 10): AIMessage[] {
  const maxMessages = maxRounds * 2
  return db.prepare(
    'SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(String(userId), maxMessages) as AIMessage[]
}

/**
 * 保存一轮对话（用户消息 + AI 回复）
 */
export function saveAIContext(
  userId: string | number,
  userMessage: string,
  assistantMessage: string
): void {
  const now = Date.now()
  const userIdStr = String(userId)

  const insert = db.prepare(
    'INSERT INTO ai_conversations (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
  )

  // 使用事务确保原子性
  const transaction = db.transaction(() => {
    insert.run(userIdStr, 'user', userMessage, now)
    insert.run(userIdStr, 'assistant', assistantMessage, now + 1)
  })

  transaction()

  // 清理旧的上下文，保留最近 N 轮
  cleanupAIContext(userIdStr, 10)
}

/**
 * 清理用户的旧 AI 上下文
 */
export function cleanupAIContext(userId: string, keepRounds: number = 10): void {
  const keepMessages = keepRounds * 2

  // 获取当前消息数量
  const count = db.prepare(
    'SELECT COUNT(*) as count FROM ai_conversations WHERE user_id = ?'
  ).get(userId) as { count: number }

  if (count.count > keepMessages) {
    // 删除最旧的消息
    const deleteCount = count.count - keepMessages
    db.prepare(
      `DELETE FROM ai_conversations WHERE id IN (
        SELECT id FROM ai_conversations WHERE user_id = ? ORDER BY timestamp ASC LIMIT ?
      )`
    ).run(userId, deleteCount)
  }
}

/**
 * 清除用户的所有 AI 上下文
 */
export function clearAIContext(userId: string | number): void {
  db.prepare('DELETE FROM ai_conversations WHERE user_id = ?').run(String(userId))
}

/**
 * 清除所有 AI 上下文
 */
export function clearAllAIContext(): void {
  db.prepare('DELETE FROM ai_conversations').run()
}

/**
 * 获取 AI 配置
 */
export function getAISetting(key: string): string | undefined {
  const result = db.prepare(
    'SELECT value FROM ai_settings WHERE key = ?'
  ).get(key) as AISetting | undefined
  return result?.value
}

/**
 * 设置 AI 配置
 */
export function setAISetting(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)'
  ).run(key, value)
}

/**
 * 删除 AI 配置
 */
export function deleteAISetting(key: string): boolean {
  const result = db.prepare('DELETE FROM ai_settings WHERE key = ?').run(key)
  return result.changes > 0
}

/**
 * 获取所有 AI 配置
 */
export function getAllAISettings(): Record<string, string> {
  const settings = db.prepare('SELECT * FROM ai_settings').all() as AISetting[]
  return settings.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {} as Record<string, string>)
}

/**
 * 清理过期的 AI 上下文（超过指定天数）
 */
export function cleanupExpiredAIContext(daysToKeep: number = 30): number {
  const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
  const result = db.prepare(
    'DELETE FROM ai_conversations WHERE timestamp < ?'
  ).run(cutoff)
  return result.changes
}

/**
 * 获取 AI 上下文统计信息
 */
export function getAIContextStats(): { totalMessages: number; userCount: number } {
  const totalMessages = db.prepare(
    'SELECT COUNT(*) as count FROM ai_conversations'
  ).get() as { count: number }

  const userCount = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as count FROM ai_conversations'
  ).get() as { count: number }

  return {
    totalMessages: totalMessages.count,
    userCount: userCount.count,
  }
}
