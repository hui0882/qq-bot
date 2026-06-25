// src/lib/commands/handlers/help.ts
// /help command handler

import { registerHandler } from '../registry'
import { configManager } from '../../config'
import type { CommandHandler } from '../types'

const handler: CommandHandler = async (ctx) => {
  const config = configManager.getConfig()
  const definitions = config.commands?.definitions || []
  const enabled = definitions.filter((d) => d.enabled)

  const lines = ['📖 可用命令列表：', '']
  for (const def of enabled) {
    lines.push(`  /${def.name} — ${def.description}`)
    lines.push(`    用法: ${def.usage}`)
    lines.push('')
  }
  lines.push('💡 发送 / 获取命令提示')

  return { reply: lines.join('\n'), handled: true }
}

registerHandler('builtin:help', handler)
