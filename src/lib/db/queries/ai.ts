/**
 * AI 相关查询封装
 *
 * 包含：
 * - user_ai_configs 表：用户自定义 AI 配置
 * - ai_conversations 表：AI 对话上下文（内存缓存 + 延迟持久化）
 * - ai_settings 表：全局 AI 配置
 */

import { db } from '../index'

// ============ 类型定义 ============

export interface UserAIConfig {
  user_id: string
  enabled: number
  base_url: string | null
  api_key: string | null
  model: string | null
  max_tokens: number
  temperature: number
  max_context_rounds: number
  default_reply_type: string
  custom_system_prompt: string | null
  created_at: number
  updated_at: number
}

export interface AIMessage {
  id: number
  user_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AISetting {
  key: string
  value: string
}

// ============ AI 上下文管理器（内存缓存 + 延迟持久化） ============

class AIContextManager {
  private cache = new Map<string, ConversationEntry[]>()
  private dirty = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null
  private maxContextRounds = 10

  constructor() {
    // 延迟初始化，避免模块加载时访问数据库
  }

  /**
   * 初始化管理器（启动定时器，加载数据）
   */
  init(): void {
    if (this.flushTimer) return

    // 从数据库加载现有数据
    this.loadFromDB()

    // 每 30 秒批量持久化
    this.flushTimer = setInterval(() => this.flush(), 30000)

    // 进程退出时持久化
    process.on('exit', () => this.flush())
    process.on('SIGINT', () => {
      this.flush()
      process.exit(0)
    })
    process.on('SIGTERM', () => {
      this.flush()
      process.exit(0)
    })

    console.log('[AI Context] Manager initialized')
  }

  /**
   * 获取用户上下文
   */
  getContext(userId: string | number, maxRounds?: number): ConversationEntry[] {
    this.init()

    const userIdStr = String(userId)
    const context = this.cache.get(userIdStr) || []
    const rounds = maxRounds || this.maxContextRounds
    const maxMessages = rounds * 2

    return context.slice(-maxMessages)
  }

  /**
   * 保存一轮对话
   */
  saveContext(userId: string | number, userMsg: string, assistantMsg: string): void {
    this.init()

    const userIdStr = String(userId)
    const context = this.cache.get(userIdStr) || []
    const now = Date.now()

    context.push(
      { role: 'user', content: userMsg, timestamp: now },
      { role: 'assistant', content: assistantMsg, timestamp: now + 1 }
    )

    // 裁剪到最大轮数
    const maxMessages = this.maxContextRounds * 2
    if (context.length > maxMessages) {
      context.splice(0, context.length - maxMessages)
    }

    this.cache.set(userIdStr, context)
    this.dirty.add(userIdStr)  // 标记需要持久化
  }

  /**
   * 清除用户上下文
   */
  clearContext(userId: string | number): void {
    this.init()

    const userIdStr = String(userId)
    this.cache.delete(userIdStr)
    this.dirty.delete(userIdStr)

    // 立即删除数据库记录
    db.prepare('DELETE FROM ai_conversations WHERE user_id = ?').run(userIdStr)
  }

  /**
   * 清除所有上下文
   */
  clearAllContext(): void {
    this.init()

    this.cache.clear()
    this.dirty.clear()

    db.prepare('DELETE FROM ai_conversations').run()
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalMessages: number; userCount: number; cachedUsers: number } {
    this.init()

    const totalMessages = db.prepare(
      'SELECT COUNT(*) as count FROM ai_conversations'
    ).get() as { count: number }

    const userCount = db.prepare(
      'SELECT COUNT(DISTINCT user_id) as count FROM ai_conversations'
    ).get() as { count: number }

    return {
      totalMessages: totalMessages.count,
      userCount: userCount.count,
      cachedUsers: this.cache.size,
    }
  }

  /**
   * 从数据库加载数据
   */
  private loadFromDB(): void {
    const rows = db.prepare(
      'SELECT * FROM ai_conversations ORDER BY user_id, timestamp'
    ).all() as AIMessage[]

    for (const row of rows) {
      const context = this.cache.get(row.user_id) || []
      context.push({
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
      })
      this.cache.set(row.user_id, context)
    }

    console.log(`[AI Context] Loaded ${rows.length} messages for ${this.cache.size} users`)
  }

  /**
   * 批量持久化脏数据
   */
  private flush(): void {
    if (this.dirty.size === 0) return

    try {
      const transaction = db.transaction(() => {
        for (const userId of this.dirty) {
          const context = this.cache.get(userId)
          if (!context) continue

          // 删除旧记录
          db.prepare('DELETE FROM ai_conversations WHERE user_id = ?').run(userId)

          // 插入新记录
          const insert = db.prepare(
            'INSERT INTO ai_conversations (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
          )
          for (const msg of context) {
            insert.run(userId, msg.role, msg.content, msg.timestamp)
          }
        }
      })

      transaction()
      this.dirty.clear()
    } catch (err) {
      console.error('[AI Context] Flush error:', err)
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.flush()  // 立即持久化
  }
}

// 单例模式
const globalForAI = globalThis as unknown as { __aiContextManager?: AIContextManager }

export function getAIContextManager(): AIContextManager {
  if (!globalForAI.__aiContextManager) {
    globalForAI.__aiContextManager = new AIContextManager()
  }
  return globalForAI.__aiContextManager
}

// 导出便捷方法
export const aiContext = {
  getContext: (userId: string | number, maxRounds?: number) =>
    getAIContextManager().getContext(userId, maxRounds),
  saveContext: (userId: string | number, userMsg: string, assistantMsg: string) =>
    getAIContextManager().saveContext(userId, userMsg, assistantMsg),
  clearContext: (userId: string | number) =>
    getAIContextManager().clearContext(userId),
  clearAllContext: () =>
    getAIContextManager().clearAllContext(),
  getStats: () =>
    getAIContextManager().getStats(),
}

// ============ 用户 AI 配置 ============

/**
 * 获取用户自定义 AI 配置
 */
export function getUserAIConfig(userId: string | number): UserAIConfig | undefined {
  return db.prepare(
    'SELECT * FROM user_ai_configs WHERE user_id = ? AND enabled = 1'
  ).get(String(userId)) as UserAIConfig | undefined
}

/**
 * 创建或更新用户 AI 配置
 */
export function upsertUserAIConfig(
  userId: string | number,
  config: Partial<Omit<UserAIConfig, 'user_id' | 'created_at' | 'updated_at'>>
): UserAIConfig {
  const userIdStr = String(userId)
  const now = Date.now()
  const existing = db.prepare(
    'SELECT * FROM user_ai_configs WHERE user_id = ?'
  ).get(userIdStr) as UserAIConfig | undefined

  if (existing) {
    // 更新
    const updates: string[] = []
    const values: (string | number | null)[] = []

    if (config.enabled !== undefined) {
      updates.push('enabled = ?')
      values.push(config.enabled)
    }
    if (config.base_url !== undefined) {
      updates.push('base_url = ?')
      values.push(config.base_url)
    }
    if (config.api_key !== undefined) {
      updates.push('api_key = ?')
      values.push(config.api_key)
    }
    if (config.model !== undefined) {
      updates.push('model = ?')
      values.push(config.model)
    }
    if (config.max_tokens !== undefined) {
      updates.push('max_tokens = ?')
      values.push(config.max_tokens)
    }
    if (config.temperature !== undefined) {
      updates.push('temperature = ?')
      values.push(config.temperature)
    }
    if (config.max_context_rounds !== undefined) {
      updates.push('max_context_rounds = ?')
      values.push(config.max_context_rounds)
    }
    if (config.default_reply_type !== undefined) {
      updates.push('default_reply_type = ?')
      values.push(config.default_reply_type)
    }
    if (config.custom_system_prompt !== undefined) {
      updates.push('custom_system_prompt = ?')
      values.push(config.custom_system_prompt)
    }

    updates.push('updated_at = ?')
    values.push(now)
    values.push(userIdStr)

    db.prepare(
      `UPDATE user_ai_configs SET ${updates.join(', ')} WHERE user_id = ?`
    ).run(...values)
  } else {
    // 创建
    db.prepare(`
      INSERT INTO user_ai_configs (
        user_id, enabled, base_url, api_key, model, max_tokens,
        temperature, max_context_rounds, default_reply_type,
        custom_system_prompt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userIdStr,
      config.enabled || 0,
      config.base_url || null,
      config.api_key || null,
      config.model || null,
      config.max_tokens || 2048,
      config.temperature || 0.7,
      config.max_context_rounds || 10,
      config.default_reply_type || 'text',
      config.custom_system_prompt || null,
      now,
      now
    )
  }

  return db.prepare(
    'SELECT * FROM user_ai_configs WHERE user_id = ?'
  ).get(userIdStr) as UserAIConfig
}

/**
 * 删除用户 AI 配置
 */
export function deleteUserAIConfig(userId: string | number): boolean {
  const result = db.prepare(
    'DELETE FROM user_ai_configs WHERE user_id = ?'
  ).run(String(userId))
  return result.changes > 0
}

/**
 * 获取所有启用自定义 AI 配置的用户
 */
export function getUsersWithCustomAI(): UserAIConfig[] {
  return db.prepare(
    'SELECT * FROM user_ai_configs WHERE enabled = 1'
  ).all() as UserAIConfig[]
}

// ============ 全局 AI 配置 ============

/**
 * 获取全局 AI 配置
 */
export function getAISetting(key: string): string | undefined {
  const result = db.prepare(
    'SELECT value FROM ai_settings WHERE key = ?'
  ).get(key) as AISetting | undefined
  return result?.value
}

/**
 * 设置全局 AI 配置
 */
export function setAISetting(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)'
  ).run(key, value)
}

/**
 * 删除全局 AI 配置
 */
export function deleteAISetting(key: string): boolean {
  const result = db.prepare('DELETE FROM ai_settings WHERE key = ?').run(key)
  return result.changes > 0
}

/**
 * 获取所有全局 AI 配置
 */
export function getAllAISettings(): Record<string, string> {
  const settings = db.prepare('SELECT * FROM ai_settings').all() as AISetting[]
  return settings.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {} as Record<string, string>)
}

/**
 * 清理过期的 AI 上下文
 */
export function cleanupExpiredAIContext(daysToKeep: number = 30): number {
  const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
  const result = db.prepare(
    'DELETE FROM ai_conversations WHERE timestamp < ?'
  ).run(cutoff)
  return result.changes
}
