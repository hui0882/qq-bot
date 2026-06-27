/**
 * 数据库初始化脚本
 * 在应用启动时运行
 */

import { initDatabase, closeDatabase } from './index'
import { needsMigration, runMigration } from './migrate'

/**
 * 初始化数据库
 * 检查是否需要迁移，然后初始化表结构
 */
export function initializeDatabase(): void {
  console.log('[DB] Initializing database...')

  // 检查是否需要从 JSON 迁移
  if (needsMigration()) {
    console.log('[DB] JSON files detected, running migration...')
    runMigration()
  } else {
    // 直接初始化表结构
    initDatabase()
  }

  console.log('[DB] Database ready')
}

// 注册进程退出时关闭数据库
process.on('exit', () => {
  closeDatabase()
})

process.on('SIGINT', () => {
  closeDatabase()
  process.exit(0)
})

process.on('SIGTERM', () => {
  closeDatabase()
  process.exit(0)
})
