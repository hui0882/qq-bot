/**
 * 数据库测试脚本（v2 架构）
 * 运行: npx tsx src/lib/db/test.ts
 */

import { initDatabase, closeDatabase } from './index'
import {
  getOrCreateUser,
  getUserSetting,
  setUserSetting,
  getUserResponseType,
  setUserResponseType,
  getAllUserSettings,
  exportAllUserConfigs,
} from './queries/users'
import {
  aiContext,
  upsertUserAIConfig,
  getUserAIConfig,
  setAISetting,
  getAISetting,
} from './queries/ai'
import { addLog, queryLogs, getLogStats } from './queries/logs'

console.log('=== 数据库测试 (v2 架构) ===\n')

// 初始化数据库
initDatabase()

// 测试用户基础信息
console.log('1. 测试用户基础信息')
const user1 = getOrCreateUser('123456789')
console.log('   用户1:', user1)

const user2 = getOrCreateUser('987654321')
console.log('   用户2:', user2)

// 测试用户设置（EAV 模式）
console.log('\n2. 测试用户设置（EAV 模式）')
setUserSetting('123456789', 'response_type', 'voice')
setUserSetting('123456789', 'theme', 'dark')
setUserSetting('123456789', 'language', 'zh-CN')

const settings = getAllUserSettings('123456789')
console.log('   用户1 所有设置:', settings)

const responseType = getUserResponseType('123456789')
console.log('   用户1 回复类型:', responseType)

// 测试用户 AI 配置
console.log('\n3. 测试用户自定义 AI 配置')
upsertUserAIConfig('123456789', {
  enabled: 1,
  base_url: 'https://api.example.com/v1',
  api_key: 'sk-test123',
  model: 'gpt-4o',
  custom_system_prompt: '请用简洁风格回复',
})

const aiConfig = getUserAIConfig('123456789')
console.log('   用户1 AI 配置:', aiConfig)

// 测试 AI 上下文（内存缓存）
console.log('\n4. 测试 AI 上下文（内存缓存 + 延迟持久化）')
aiContext.saveContext('123456789', '你好', '你好！有什么可以帮助你的吗？')
aiContext.saveContext('123456789', '今天天气怎么样？', '今天天气晴朗，温度适宜。')

const context = aiContext.getContext('123456789', 10)
console.log('   上下文消息:', context.length, '条')

const stats = aiContext.getStats()
console.log('   统计信息:', stats)

// 测试全局 AI 配置
console.log('\n5. 测试全局 AI 配置')
setAISetting('default_model', 'gpt-4o')
setAISetting('default_temperature', '0.7')

const defaultModel = getAISetting('default_model')
console.log('   默认模型:', defaultModel)

// 测试日志
console.log('\n6. 测试日志')
addLog('system', 'test_action', { message: '测试日志' })
addLog('ai', 'ai_request', { userId: '123456789', message: '你好' })
addLog('ai', 'ai_response', { userId: '123456789', response: '你好！' })

const logs = queryLogs({ limit: 10 })
console.log('   日志条数:', logs.length)

const logStats = getLogStats()
console.log('   日志统计:', logStats)

// 测试导出
console.log('\n7. 测试导出')
const allConfigs = exportAllUserConfigs()
console.log('   所有用户配置:', Object.keys(allConfigs).length, '个用户')

// 测试优先级回退
console.log('\n8. 测试优先级回退')
const userAiConfig = getUserAIConfig('123456789')
const globalConfig = { model: 'gpt-3.5-turbo', baseUrl: 'https://api.openai.com/v1' }
const finalConfig = userAiConfig || globalConfig
console.log('   最终配置:', finalConfig.model)  // 应该是 gpt-4o

// 清理测试数据
console.log('\n9. 清理测试数据')
aiContext.clearContext('123456789')
console.log('   AI 上下文已清理')

// 关闭数据库
closeDatabase()

console.log('\n=== 测试完成 ===')
