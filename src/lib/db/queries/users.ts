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
  nickname: string | null
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
  const rows = db.prepare(
    'SELECT * FROM users ORDER BY updated_at DESC'
  ).all() as Array<Omit<User, 'nickname'> & { nickname?: string | null }>

  return rows.map((row) => ({ ...row, nickname: row.nickname ?? null }))
}

/**
 * 获取或创建用户
 */
export function getOrCreateUser(qqId: string): User {
  const existing = db.prepare(
    'SELECT * FROM users WHERE qq_id = ?'
  ).get(qqId) as (Omit<User, 'nickname'> & { nickname?: string | null }) | undefined

  if (existing) {
    return { ...existing, nickname: existing.nickname ?? null }
  }

  const now = Date.now()
  db.prepare(
    'INSERT INTO users (qq_id, created_at, updated_at) VALUES (?, ?, ?)'
  ).run(qqId, now, now)

  return { qq_id: qqId, nickname: null, created_at: now, updated_at: now }
}

// ============ 用户昵称 ============

/**
 * 获取用户昵称（仅本地缓存，不触发网络请求）
 */
export function getNickname(qqId: string): string | null {
  const result = db.prepare(
    'SELECT nickname FROM users WHERE qq_id = ?'
  ).get(qqId) as { nickname: string | null } | undefined

  return result?.nickname ?? null
}

/**
 * 设置用户昵称（写入本地缓存），用户不存在时先创建
 */
export function setNickname(qqId: string, nickname: string): void {
  const result = db.prepare(
    'UPDATE users SET nickname = ?, updated_at = ? WHERE qq_id = ?'
  ).run(nickname, Date.now(), qqId)

  if (result.changes === 0) {
    getOrCreateUser(qqId)
    db.prepare(
      'UPDATE users SET nickname = ?, updated_at = ? WHERE qq_id = ?'
    ).run(nickname, Date.now(), qqId)
  }
}

/**
 * 获取昵称：本地缓存优先，为空时通过 WS 向 NapCat 拉取并回写缓存。
 * WS 未连接或拉取失败时返回 null（不写库，避免把失败结果落库）。
 */
export async function getOrFetchNickname(qqId: string): Promise<string | null> {
  const cached = getNickname(qqId)
  if (cached) return cached

  // 动态导入 napcat-ws，避免循环依赖：
  // config -> db/init -> db/migrate -> queries/users -> napcat-ws -> config
  const { napcatWS } = await import('@/lib/napcat-ws')

  if (napcatWS.getStatus() === 'connected') {
    try {
      const response = await napcatWS.sendAction('get_stranger_info', {
        user_id: String(qqId),
      })

      if (
        response.status === 'ok' &&
        response.data &&
        typeof response.data === 'object' &&
        'nickname' in response.data
      ) {
        const nickname = (response.data as { nickname?: unknown }).nickname
        if (typeof nickname === 'string' && nickname.trim().length > 0) {
          setNickname(qqId, nickname)
          return nickname
        }
      }
    } catch (err) {
      console.error('[DB] Failed to fetch nickname via WS:', err)
    }
  }

  return null
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
