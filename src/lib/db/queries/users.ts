/**
 * 用户配置查询封装
 */

import { db } from '../index'

export interface UserConfig {
  id: number
  qq_id: string
  response_type: 'text' | 'voice'
  ai_enabled: number
  created_at: number
  updated_at: number
}

/**
 * 获取用户配置
 */
export function getUserConfig(qqId: string): UserConfig | undefined {
  return db.prepare(
    'SELECT * FROM users WHERE qq_id = ?'
  ).get(qqId) as UserConfig | undefined
}

/**
 * 创建或更新用户配置
 */
export function upsertUserConfig(
  qqId: string,
  config: Partial<Pick<UserConfig, 'response_type' | 'ai_enabled'>>
): UserConfig {
  const now = Date.now()
  const existing = getUserConfig(qqId)

  if (existing) {
    // 更新
    const updates: string[] = []
    const values: (string | number)[] = []

    if (config.response_type !== undefined) {
      updates.push('response_type = ?')
      values.push(config.response_type)
    }
    if (config.ai_enabled !== undefined) {
      updates.push('ai_enabled = ?')
      values.push(config.ai_enabled)
    }

    updates.push('updated_at = ?')
    values.push(now)
    values.push(qqId)

    db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE qq_id = ?`
    ).run(...values)

    return getUserConfig(qqId)!
  } else {
    // 创建
    db.prepare(
      'INSERT INTO users (qq_id, response_type, ai_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(qqId, config.response_type || 'text', config.ai_enabled || 0, now, now)

    return getUserConfig(qqId)!
  }
}

/**
 * 删除用户配置
 */
export function deleteUserConfig(qqId: string): boolean {
  const result = db.prepare('DELETE FROM users WHERE qq_id = ?').run(qqId)
  return result.changes > 0
}

/**
 * 获取所有用户配置
 */
export function getAllUserConfigs(): UserConfig[] {
  return db.prepare('SELECT * FROM users ORDER BY updated_at DESC').all() as UserConfig[]
}

/**
 * 获取用户回复类型
 */
export function getUserResponseType(qqId: string): 'text' | 'voice' {
  const user = getUserConfig(qqId)
  return user?.response_type || 'text'
}

/**
 * 设置用户回复类型
 */
export function setUserResponseType(qqId: string, type: 'text' | 'voice'): void {
  upsertUserConfig(qqId, { response_type: type })
}
