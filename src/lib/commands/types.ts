// src/lib/commands/types.ts
// Command framework type definitions

import type { CommandDefinition } from '@/types/napcat'

export interface CommandContext {
  userId: number
  rawText: string
  commandName: string
  args: string[]
  definition: CommandDefinition
}

export interface CommandResult {
  reply: string
  handled: boolean
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>
