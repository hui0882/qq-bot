/**
 * users 表 nickname 列幂等迁移单元测试
 *
 * 隔离方案：全局单例 __db 指向内存 SQLite，真实执行 initDatabase() 的建表与迁移逻辑。
 */

import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'

// 必须在任何 db 访问前设置内存数据库单例
;(globalThis as unknown as { __db?: Database.Database }).__db = new Database(':memory:')

import { db, initDatabase } from '../index'

function hasNicknameColumn(): boolean {
  const columns = db.pragma('table_info(users)') as { name: string }[]
  return columns.some((col) => col.name === 'nickname')
}

describe('users 表 nickname 列迁移', () => {
  it('initDatabase 初始化后 users 表包含 nickname 列', () => {
    initDatabase()
    expect(hasNicknameColumn()).toBe(true)
  })

  it('重复调用 initDatabase 幂等，不抛错', () => {
    expect(() => initDatabase()).not.toThrow()
    expect(() => initDatabase()).not.toThrow()
    expect(hasNicknameColumn()).toBe(true)
  })

  it('旧库（无 nickname 列）迁移后补列且保留已有数据', () => {
    // 模拟旧版本 users 表结构（无 nickname 列）
    db.exec('DROP TABLE users')
    db.exec(
      'CREATE TABLE users (qq_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
    )
    db.prepare('INSERT INTO users (qq_id, created_at, updated_at) VALUES (?, ?, ?)').run('legacy-user', 111, 222)

    // 触发迁移
    initDatabase()

    expect(hasNicknameColumn()).toBe(true)
    const row = db.prepare('SELECT * FROM users WHERE qq_id = ?').get('legacy-user') as {
      qq_id: string
      nickname: string | null
      created_at: number
      updated_at: number
    }
    expect(row.qq_id).toBe('legacy-user')
    expect(row.nickname).toBeNull()
    expect(row.created_at).toBe(111)

    // 迁移后的表可正常写入昵称
    db.prepare('UPDATE users SET nickname = ? WHERE qq_id = ?').run('migrated-nick', 'legacy-user')
    expect((db.prepare('SELECT nickname FROM users WHERE qq_id = ?').get('legacy-user') as { nickname: string | null }).nickname).toBe('migrated-nick')
  })
})
