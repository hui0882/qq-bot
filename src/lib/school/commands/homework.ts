// src/lib/school/commands/homework.ts
// /homework 命令 — 查询待提交作业

import { registerHandler } from '@/lib/commands/registry'
import { queryHomework } from '../service'
import type { CommandHandler } from '@/lib/commands/types'

const handler: CommandHandler = async (ctx) => {
  const result = await queryHomework(String(ctx.userId), 'command')
  return { reply: result.message, handled: true }
}

registerHandler('builtin:homework', handler)
