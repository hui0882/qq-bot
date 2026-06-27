/**
 * SQLite 数据库连接和初始化
 *
 * 使用 better-sqlite3 原生模块，内存占用小，性能好
 * 适合 2c2g 低配置服务器
 *
 * 使用单例模式确保只有一个数据库连接
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// 数据库文件路径
const DB_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DB_DIR, 'napcat.db')

// 单例模式
const globalForDb = globalThis as unknown as { __db?: Database.Database }

/**
 * 获取数据库连接（单例）
 */
function getDb(): Database.Database {
  if (!globalForDb.__db) {
    // 确保 data 目录存在
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true })
    }

    // 创建数据库连接
    const db = new Database(DB_PATH, {
      // 开发环境打印 SQL
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    })

    // 配置数据库参数
    db.pragma('journal_mode = WAL')      // WAL 模式，并发读性能更好
    db.pragma('cache_size = -2000')      // 缓存 2MB
    db.pragma('synchronous = NORMAL')    // 平衡性能和安全
    db.pragma('temp_store = MEMORY')     // 临时表存储在内存
    db.pragma('foreign_keys = ON')       // 启用外键约束

    globalForDb.__db = db
  }

  return globalForDb.__db
}

// 导出数据库实例（延迟初始化）
export const db = {
  get instance() {
    return getDb()
  },
  exec(sql: string) {
    return getDb().exec(sql)
  },
  prepare(sql: string) {
    return getDb().prepare(sql)
  },
  pragma(pragma: string, options?: Database.PragmaOptions) {
    return getDb().pragma(pragma, options)
  },
  transaction(fn: (...args: unknown[]) => unknown) {
    return getDb().transaction(fn)
  },
  close() {
    if (globalForDb.__db) {
      globalForDb.__db.close()
      globalForDb.__db = undefined
      console.log('[DB] Database closed')
    }
  },
}

/**
 * 初始化数据库表结构
 */
export function initDatabase(): void {
  const database = getDb()

  // 用户配置表
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qq_id TEXT NOT NULL UNIQUE,
      response_type TEXT DEFAULT 'text',
      ai_enabled INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // AI 对话上下文表
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `)

  // AI 配置表
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 日志表
  database.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      data TEXT,
      timestamp INTEGER NOT NULL
    )
  `)

  // 创建索引
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_qq_id ON users(qq_id);
    CREATE INDEX IF NOT EXISTS idx_ai_user_id ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_timestamp ON ai_conversations(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
  `)

  console.log('[DB] Database initialized successfully')
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  db.close()
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  return getDb()
}
