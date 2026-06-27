/**
 * 数据迁移工具
 * 将现有 JSON 数据迁移到 SQLite
 */

import { readFileSync, existsSync, renameSync } from 'fs'
import { join } from 'path'
import { db, initDatabase } from './index'
import { upsertUserConfig } from './queries/users'
import { saveAIContext } from './queries/ai'

const DATA_DIR = join(process.cwd(), 'data')

interface OldUserConfigs {
  users: Record<string, { responseType: string }>
}

interface OldAIContext {
  conversations: Record<string, {
    messages: Array<{
      role: 'user' | 'assistant'
      content: string
      timestamp: number
    }>
    lastUpdated: number
  }>
}

/**
 * 迁移用户配置
 */
function migrateUserConfigs(): number {
  const configPath = join(DATA_DIR, 'user-configs.json')

  if (!existsSync(configPath)) {
    console.log('[Migrate] user-configs.json not found, skipping')
    return 0
  }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const configs = JSON.parse(raw) as OldUserConfigs

    let count = 0
    for (const [qqId, config] of Object.entries(configs.users)) {
      upsertUserConfig(qqId, {
        response_type: config.responseType as 'text' | 'voice',
      })
      count++
    }

    console.log(`[Migrate] Migrated ${count} user configs`)
    return count
  } catch (err) {
    console.error('[Migrate] Failed to migrate user configs:', err)
    return 0
  }
}

/**
 * 迁移 AI 上下文
 */
function migrateAIContext(): number {
  const contextPath = join(DATA_DIR, 'ai-context.json')

  if (!existsSync(contextPath)) {
    console.log('[Migrate] ai-context.json not found, skipping')
    return 0
  }

  try {
    const raw = readFileSync(contextPath, 'utf-8')
    const context = JSON.parse(raw) as OldAIContext

    let count = 0
    for (const [userId, conversation] of Object.entries(context.conversations)) {
      // 按时间排序消息
      const sortedMessages = [...conversation.messages].sort((a, b) => a.timestamp - b.timestamp)

      // 成对保存（user + assistant）
      for (let i = 0; i < sortedMessages.length - 1; i += 2) {
        const userMsg = sortedMessages[i]
        const assistantMsg = sortedMessages[i + 1]

        if (userMsg.role === 'user' && assistantMsg.role === 'assistant') {
          saveAIContext(userId, userMsg.content, assistantMsg.content)
          count++
        }
      }
    }

    console.log(`[Migrate] Migrated ${count} AI conversation rounds`)
    return count
  } catch (err) {
    console.error('[Migrate] Failed to migrate AI context:', err)
    return 0
  }
}

/**
 * 备份旧文件
 */
function backupOldFiles(): void {
  const files = ['user-configs.json', 'ai-context.json']

  for (const file of files) {
    const filePath = join(DATA_DIR, file)
    if (existsSync(filePath)) {
      const backupPath = join(DATA_DIR, `${file}.backup.${Date.now()}`)
      renameSync(filePath, backupPath)
      console.log(`[Migrate] Backed up ${file} to ${backupPath}`)
    }
  }
}

/**
 * 执行完整迁移
 */
export function runMigration(): void {
  console.log('[Migrate] Starting migration...')

  // 初始化数据库表
  initDatabase()

  // 迁移数据
  const userCount = migrateUserConfigs()
  const aiCount = migrateAIContext()

  // 备份旧文件
  backupOldFiles()

  console.log(`[Migrate] Migration completed:`)
  console.log(`  - User configs: ${userCount}`)
  console.log(`  - AI conversations: ${aiCount}`)
}

/**
 * 检查是否需要迁移
 */
export function needsMigration(): boolean {
  const userConfigsPath = join(DATA_DIR, 'user-configs.json')
  const aiContextPath = join(DATA_DIR, 'ai-context.json')

  return existsSync(userConfigsPath) || existsSync(aiContextPath)
}

// 如果直接运行此文件，执行迁移
if (require.main === module) {
  runMigration()
  process.exit(0)
}
