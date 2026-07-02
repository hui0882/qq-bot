// src/lib/school/service.ts
// 学业助手 — 统一服务层

import { configManager } from '@/lib/config'
import type { SchoolSession, HomeworkItem } from './types'
import { SessionExpiredError, ServiceDisabledError } from './types'
import { getCredentials } from './credentials'
import { getAdapter, getDefaultSchool } from './adapters'

// Session 缓存（内存，不持久化）
const sessionCache = new Map<string, SchoolSession>()

export function checkServiceEnabled(userId: string, channel: 'command' | 'ai'): void {
  const config = configManager.getConfig()
  const schoolConfig = config.school
  if (!schoolConfig) return // 未配置时默认允许

  if (channel === 'command' && !schoolConfig.enabledCommands) {
    throw new ServiceDisabledError('作业查询命令功能已关闭，请联系管理员开启')
  }
  if (channel === 'ai' && !schoolConfig.enabledAI) {
    throw new ServiceDisabledError('作业查询 AI 功能已关闭，请联系管理员开启')
  }
}

export async function queryHomework(
  userId: string,
  channel: 'command' | 'ai',
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. 系统级开关检查
    checkServiceEnabled(userId, channel)

    // 2. 获取凭据
    const school = getDefaultSchool()
    const creds = getCredentials(userId, school)
    if (!creds) {
      return {
        success: false,
        message: '❌ 请先使用 /set-config <账号> <密码> 配置学校平台账号',
      }
    }

    // 3. 查找适配器
    const adapter = getAdapter(school)
    if (!adapter) {
      return { success: false, message: `❌ 不支持的学校: ${school}` }
    }

    // 4. 获取 session（缓存或重新认证）
    const cacheKey = `${userId}:${school}`
    let session = sessionCache.get(cacheKey)

    try {
      if (!session) {
        session = await adapter.authenticate(creds.username, creds.password) || undefined
        if (!session) {
          return {
            success: false,
            message: '❌ 登录失败，请检查账号密码是否正确。\n使用 /set-config <账号> <密码> 重新配置',
          }
        }
        sessionCache.set(cacheKey, session)
      }

      // 5. 查询作业
      const homeworks = await adapter.fetchHomework(session)

      // 6. 格式化输出
      const message = formatHomeworkMessage(homeworks)
      return { success: true, message }
    } catch (error) {
      // Session 过期 → 清除缓存，重试一次
      if (error instanceof SessionExpiredError) {
        sessionCache.delete(cacheKey)
        const newSession = await adapter.authenticate(creds.username, creds.password)
        if (!newSession) {
          return {
            success: false,
            message: '❌ 会话已过期且重新登录失败，请检查账号密码。\n使用 /set-config <账号> <密码> 重新配置',
          }
        }
        sessionCache.set(cacheKey, newSession)
        const homeworks = await adapter.fetchHomework(newSession)
        const message = formatHomeworkMessage(homeworks)
        return { success: true, message }
      }
      throw error
    }
  } catch (error) {
    if (error instanceof ServiceDisabledError) {
      return { success: false, message: `❌ ${error.message}` }
    }
    return { success: false, message: `❌ 查询失败: ${error instanceof Error ? error.message : '未知错误'}` }
  }
}

export function formatHomeworkMessage(homeworks: HomeworkItem[]): string {
  if (homeworks.length === 0) {
    return '🎉 当前没有待提交的作业，可以放心休息！'
  }

  const lines = [`📚 当前有 ${homeworks.length} 个待提交作业：\n`]

  for (let i = 0; i < homeworks.length; i++) {
    const hw = homeworks[i]
    lines.push('─'.repeat(30))
    lines.push(`【${i + 1}】${hw.title}`)
    lines.push(`  📖 课程：${hw.courseName}`)
    lines.push(`  📅 开始：${hw.startTime}`)
    lines.push(`  ⏰ 截止：${hw.deadline}  ${hw.remainingText}`)

    if (hw.detail) {
      lines.push(`  📝 内容：${hw.detail}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
