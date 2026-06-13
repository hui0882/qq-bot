// src/lib/logger.ts
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { LogEntry } from '@/types/napcat'
import { configManager } from './config'

export type LogListener = (entry: LogEntry) => void

class Logger {
  private buffer: LogEntry[] = []
  private listeners: LogListener[] = []
  private maxEntries: number

  constructor() {
    this.maxEntries = configManager.getConfig().log.maxEntries
    configManager.onUpdate((config, keys) => {
      if (keys.includes('log.maxEntries')) {
        this.maxEntries = config.log.maxEntries
        this.trimBuffer()
      }
    })
  }

  private trimBuffer(): void {
    while (this.buffer.length > this.maxEntries) {
      this.buffer.shift()
    }
  }

  private persist(entry: LogEntry): void {
    const config = configManager.getConfig()
    if (!config.log.persistToFile) return

    const logDir = join(process.cwd(), config.log.logDir)
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

    const date = new Date().toISOString().split('T')[0]
    const filePath = join(logDir, `${date}.jsonl`)
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
  }

  add(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const full: LogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...entry,
    }
    this.buffer.push(full)
    this.trimBuffer()
    this.persist(full)
    for (const listener of this.listeners) {
      listener(full)
    }
    return full
  }

  logRequest(action: string, params: unknown, echo: string): LogEntry {
    return this.add({
      type: 'request',
      direction: 'outgoing',
      action,
      echo,
      data: params,
      status: 'pending',
    })
  }

  logResponse(echo: string, response: unknown, success: boolean): void {
    const entry = this.buffer.find((e) => e.echo === echo && e.type === 'request')
    if (entry) {
      entry.status = success ? 'success' : 'error'
      entry.response = response
    }
    this.add({
      type: 'request',
      direction: 'incoming',
      action: entry?.action,
      echo,
      data: response,
      status: success ? 'success' : 'error',
    })
  }

  logEvent(event: unknown): LogEntry {
    const ev = event as Record<string, unknown>
    return this.add({
      type: 'event',
      direction: 'incoming',
      action: ev.post_type as string,
      data: event,
    })
  }

  logSystem(message: string, data?: unknown): LogEntry {
    return this.add({
      type: 'system',
      data: { message, ...((data as object) || {}) },
    })
  }

  getLogs(filters?: {
    type?: LogEntry['type']
    action?: string
    limit?: number
    offset?: number
  }): LogEntry[] {
    let logs = [...this.buffer].reverse()
    if (filters?.type) logs = logs.filter((l) => l.type === filters.type)
    if (filters?.action) logs = logs.filter((l) => l.action?.includes(filters.action!))
    const offset = filters?.offset || 0
    const limit = filters?.limit || 100
    return logs.slice(offset, offset + limit)
  }

  onLog(listener: LogListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  getTotal(): number {
    return this.buffer.length
  }
}

const globalForLogger = globalThis as unknown as { __logger?: Logger }

export function getLogger(): Logger {
  if (!globalForLogger.__logger) {
    globalForLogger.__logger = new Logger()
  }
  return globalForLogger.__logger
}

export const logger = getLogger()
