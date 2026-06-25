// src/lib/commands/index.ts
// Public API for command system

export { dispatchCommand } from './dispatcher'
export { registerHandler, getHandler, listHandlers } from './registry'
export type { CommandContext, CommandResult, CommandHandler } from './types'
