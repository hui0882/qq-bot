// src/lib/school/commands/set-config.ts
// /set-config 命令 — 配置学校平台账号密码

import { registerHandler } from '@/lib/commands/registry'
import { saveCredentials, getCredentials } from '../credentials'
import { getDefaultSchool, getAdapter } from '../adapters'
import type { CommandHandler } from '@/lib/commands/types'

const handler: CommandHandler = async (ctx) => {
  const userId = String(ctx.userId)
  const args = ctx.args

  const school = getDefaultSchool()
  const adapter = getAdapter(school)
  const schoolName = adapter?.displayName || school

  // 无参数：显示当前配置
  if (args.length === 0) {
    const creds = getCredentials(userId, school)
    if (!creds) {
      return {
        reply: `📝 你还没有配置学校平台账号。\n\n💡 配置：/set-config <账号> <密码>`,
        handled: true,
      }
    }
    const maskedPwd = '****'
    return {
      reply: `📝 当前学校平台配置：\n\n📖 学校：${schoolName}\n👤 账号：${creds.username}\n🔑 密码：${maskedPwd}\n\n💡 修改：/set-config <新账号> <新密码>`,
      handled: true,
    }
  }

  // 参数不足
  if (args.length < 2) {
    return {
      reply: '❌ 参数不足，请按格式输入：\n/set-config <账号> <密码>',
      handled: true,
    }
  }

  const [username, password] = args
  saveCredentials(userId, school, username, password)

  // 截取账号后4位以外的部分做脱敏
  const maskedUser = username.length > 4
    ? username.slice(0, -4) + '****'
    : username

  return {
    reply: `✅ 学校平台账号已配置！\n\n📖 学校：${schoolName}\n👤 账号：${maskedUser}`,
    handled: true,
  }
}

registerHandler('builtin:set-homework-config', handler)
