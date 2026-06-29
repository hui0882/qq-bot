/**
 * 用户配置查询封装
 *
 * 包含：
 * - users 表：用户基础信息
 * - user_settings 表：用户设置（EAV 模式）
 */

import { db } from '../index'

// ============ 类型定义 ============

export interface User {
  qq_id: string
  created_at: number
  updated_at: number
}

export interface UserSetting {
  user_id: string
  key: string
  value: string
  updated_at: number
}

// ============ 用户基础信息 ============

/**
 * 获取所有用户
 */
export function getAllUsers(): User[] {
  return db.prepare(
    'SELECT * FROM users ORDER BY updated_at DESC'
  ).all() as User[]
}

/**
 * 获取或创建用户
 */
export function getOrCreateUser(qqId: string): User {
  const existing = db.prepare(
    'SELECT * FROM users WHERE qq_id = ?'
  ).get(qqId) as User | undefined

  if (existing) {
    return existing
  }

  const now = Date.now()
  db.prepare(
    'INSERT INTO users (qq_id, created_at, updated_at) VALUES (?, ?, ?)'
  ).run(qqId, now, now)

  return { qq_id: qqId, created_at: now, updated_at: now }
}

/**
 * 删除用户（级联删除设置）
 */
export function deleteUser(qqId: string): boolean {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(qqId)
    db.prepare('DELETE FROM user_ai_configs WHERE user_id = ?').run(qqId)
    db.prepare('DELETE FROM ai_conversations WHERE user_id = ?').run(qqId)
    const result = db.prepare('DELETE FROM users WHERE qq_id = ?').run(qqId)
    return result.changes > 0
  })

  return transaction() as boolean
}

// ============ 用户设置（EAV 模式） ============

/**
 * 获取用户单个设置
 */
export function getUserSetting(userId: string, key: string): string | undefined {
  const result = db.prepare(
    'SELECT value FROM user_settings WHERE user_id = ? AND key = ?'
  ).get(userId, key) as { value: string } | undefined

  return result?.value
}

/**
 * 获取用户所有设置
 */
export function getAllUserSettings(userId: string): Record<string, string> {
  const rows = db.prepare(
    'SELECT key, value FROM user_settings WHERE user_id = ?'
  ).all(userId) as { key: string; value: string }[]

  return rows.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {} as Record<string, string>)
}

/**
 * 设置用户配置
 */
export function setUserSetting(userId: string, key: string, value: string): void {
  // 确保用户存在
  getOrCreateUser(userId)

  db.prepare(
    'INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'
  ).run(userId, key, value, Date.now())
}

/**
 * 批量设置用户配置
 */
export function setUserSettings(userId: string, settings: Record<string, string>): void {
  // 确保用户存在
  getOrCreateUser(userId)

  const transaction = db.transaction(() => {
    const now = Date.now()
    for (const [key, value] of Object.entries(settings)) {
      db.prepare(
        'INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'
      ).run(userId, key, value, now)
    }
  })

  transaction()
}

/**
 * 删除用户设置
 */
export function deleteUserSetting(userId: string, key: string): boolean {
  const result = db.prepare(
    'DELETE FROM user_settings WHERE user_id = ? AND key = ?'
  ).run(userId, key)
  return result.changes > 0
}

// ============ 便捷方法 ============

/**
 * 获取用户回复类型
 */
export function getUserResponseType(userId: string): 'voice' | 'text' | 'auto' | null {
  const value = getUserSetting(userId, 'response_type')
  return value ? (value as 'voice' | 'text' | 'auto') : null
}

/**
 * 设置用户回复类型
 */
export function setUserResponseType(userId: string, type: 'voice' | 'text' | 'auto'): void {
  setUserSetting(userId, 'response_type', type)
}

/**
 * 获取所有用户配置（用于导出）
 */
export function exportAllUserConfigs(): Record<string, Record<string, string>> {
  const rows = db.prepare(
    'SELECT user_id, key, value FROM user_settings'
  ).all() as { user_id: string; key: string; value: string }[]

  const result: Record<string, Record<string, string>> = {}

  for (const { user_id, key, value } of rows) {
    if (!result[user_id]) {
      result[user_id] = {}
    }
    result[user_id][key] = value
  }

  return result
}

/**
 * 导入用户配置
 */
export function importUserConfigs(configs: Record<string, Record<string, string>>): number {
  let count = 0

  const transaction = db.transaction(() => {
    const now = Date.now()
    for (const [userId, settings] of Object.entries(configs)) {
      // 确保用户存在
      getOrCreateUser(userId)

      for (const [key, value] of Object.entries(settings)) {
        db.prepare(
          'INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'
        ).run(userId, key, value, now)
        count++
      }
    }
  })

  transaction()
  return count
}
