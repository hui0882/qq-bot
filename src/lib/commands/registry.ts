// src/lib/commands/registry.ts
// Handler registry — maps handler IDs to functions

import type { CommandHandler } from './types'

const handlers = new Map<string, CommandHandler>()

export function registerHandler(id: string, handler: CommandHandler): void {
  handlers.set(id, handler)
}

export function getHandler(id: string): CommandHandler | undefined {
  return handlers.get(id)
}

export function listHandlers(): string[] {
  return [...handlers.keys()]
}
