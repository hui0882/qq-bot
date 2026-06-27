/**
 * 数据库测试脚本
 * 运行: npx tsx src/lib/db/test.ts
 */

import { initDatabase, closeDatabase } from './index'
import { upsertUserConfig, getUserConfig, getAllUserConfigs } from './queries/users'
import { saveAIContext, getAIContext, clearAIContext } from './queries/ai'
import { addLog, queryLogs, getLogStats } from './queries/logs'

console.log('=== 数据库测试 ===\n')

// 初始化数据库
initDatabase()

// 测试用户配置
console.log('1. 测试用户配置')
upsertUserConfig('123456789', { response_type: 'voice' })
upsertUserConfig('987654321', { response_type: 'text', ai_enabled: 1 })

const user1 = getUserConfig('123456789')
console.log('   用户1:', user1)

const user2 = getUserConfig('987654321')
console.log('   用户2:', user2)

const allUsers = getAllUserConfigs()
console.log('   所有用户:', allUsers.length, '个')

// 测试 AI 上下文
console.log('\n2. 测试 AI 上下文')
saveAIContext('123456789', '你好', '你好！有什么可以帮助你的吗？')
saveAIContext('123456789', '今天天气怎么样？', '今天天气晴朗，温度适宜。')

const context = getAIContext('123456789', 10)
console.log('   上下文消息:', context.length, '条')

// 测试日志
console.log('\n3. 测试日志')
addLog('system', 'test_action', { message: '测试日志' })
addLog('ai', 'ai_request', { userId: '123456789', message: '你好' })
addLog('ai', 'ai_response', { userId: '123456789', response: '你好！' })

const logs = queryLogs({ limit: 10 })
console.log('   日志条数:', logs.length)

const stats = getLogStats()
console.log('   日志统计:', stats)

// 清理测试数据
console.log('\n4. 清理测试数据')
clearAIContext('123456789')
console.log('   AI 上下文已清理')

// 关闭数据库
closeDatabase()

console.log('\n=== 测试完成 ===')
