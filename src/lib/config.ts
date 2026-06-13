// src/lib/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PlatformConfig } from '@/types/napcat'

const CONFIG_PATH = join(process.cwd(), 'data', 'config.json')

const DEFAULT_CONFIG: PlatformConfig = {
  ws: {
    url: 'ws://115.190.250.31:3001',
    reconnect: true,
    reconnectInterval: 5000,
    maxReconnectInterval: 30000,
  },
  auth: {
    token: 'napcat-admin-token',
  },
  log: {
    maxEntries: 5000,
    persistToFile: true,
    logDir: 'data/logs',
  },
}

export type ConfigChangeListener = (config: PlatformConfig, changedKeys: string[]) => void

class ConfigManager {
  private config: PlatformConfig
  private listeners: ConfigChangeListener[] = []
  private watcher: import('chokidar').FSWatcher | null = null

  constructor() {
    this.config = this.loadConfig()
    this.startWatcher()
  }

  private loadConfig(): PlatformConfig {
    try {
      if (!existsSync(CONFIG_PATH)) {
        const dir = join(process.cwd(), 'data')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
        return { ...DEFAULT_CONFIG }
      }
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PlatformConfig>
      return {
        ws: { ...DEFAULT_CONFIG.ws, ...parsed.ws },
        auth: { ...DEFAULT_CONFIG.auth, ...parsed.auth },
        log: { ...DEFAULT_CONFIG.log, ...parsed.log },
      }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  private async startWatcher(): Promise<void> {
    try {
      const chokidar = await import('chokidar')
      this.watcher = chokidar.watch(CONFIG_PATH, { ignoreInitial: true })
      this.watcher.on('change', () => {
        const newConfig = this.loadConfig()
        const changedKeys = this.diffConfigs(this.config, newConfig)
        if (changedKeys.length > 0) {
          this.config = newConfig
          for (const listener of this.listeners) {
            listener(newConfig, changedKeys)
          }
        }
      })
    } catch {
      // chokidar not available, hot-reload disabled
    }
  }

  private diffConfigs(old: PlatformConfig, curr: PlatformConfig): string[] {
    const keys: string[] = []
    if (old.ws.url !== curr.ws.url) keys.push('ws.url')
    if (old.ws.reconnect !== curr.ws.reconnect) keys.push('ws.reconnect')
    if (old.auth.token !== curr.auth.token) keys.push('auth.token')
    if (old.log.maxEntries !== curr.log.maxEntries) keys.push('log.maxEntries')
    if (old.log.persistToFile !== curr.log.persistToFile) keys.push('log.persistToFile')
    return keys
  }

  getConfig(): PlatformConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<PlatformConfig>): void {
    this.config = {
      ws: { ...this.config.ws, ...partial.ws },
      auth: { ...this.config.auth, ...partial.auth },
      log: { ...this.config.log, ...partial.log },
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8')
  }

  onUpdate(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  getMaskedConfig(): Omit<PlatformConfig, 'auth'> & { auth: { token: string } } {
    return {
      ...this.config,
      auth: { token: '***' },
    }
  }

  validateToken(token: string): boolean {
    return token === this.config.auth.token
  }

  destroy(): void {
    this.watcher?.close()
  }
}

// Singleton — survives Next.js hot-reload in development
const globalForConfig = globalThis as unknown as { __configManager?: ConfigManager }

export function getConfigManager(): ConfigManager {
  if (!globalForConfig.__configManager) {
    globalForConfig.__configManager = new ConfigManager()
  }
  return globalForConfig.__configManager
}

export const configManager = getConfigManager()
