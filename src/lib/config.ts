// src/lib/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PlatformConfig } from '@/types/napcat'

const CONFIG_PATH = join(process.cwd(), 'data', 'config.json')

const DEFAULT_CONFIG: PlatformConfig = {
  ws: {
    url: 'ws://115.190.250.31:3001',
    token: '',
    reconnect: true,
    reconnectInterval: 5000,
    maxReconnectInterval: 30000,
  },
  api: {
    url: 'http://115.190.250.31:3000',
    token: '',
  },
  tts: {
    enabled: false,
    apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
    apiKey: '',
    model: 'mimo-v2.5-tts',
    voice: '茉莉',
    style: '温柔',
    format: 'wav',
  },
  voiceReply: {
    enabled: false,
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
        api: { ...DEFAULT_CONFIG.api, ...parsed.api },
        tts: { ...DEFAULT_CONFIG.tts, ...parsed.tts },
        voiceReply: { ...DEFAULT_CONFIG.voiceReply, ...parsed.voiceReply },
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
    if (old.ws.token !== curr.ws.token) keys.push('ws.token')
    if (old.ws.reconnect !== curr.ws.reconnect) keys.push('ws.reconnect')
    if (old.api?.url !== curr.api?.url) keys.push('api.url')
    if (old.api?.token !== curr.api?.token) keys.push('api.token')
    if (old.tts?.apiKey !== curr.tts?.apiKey) keys.push('tts.apiKey')
    if (old.tts?.enabled !== curr.tts?.enabled) keys.push('tts.enabled')
    if (old.voiceReply?.enabled !== curr.voiceReply?.enabled) keys.push('voiceReply.enabled')
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
      api: { ...this.config.api, ...partial.api },
      tts: { ...this.config.tts, ...partial.tts },
      voiceReply: { ...this.config.voiceReply, ...partial.voiceReply },
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
      ws: { ...this.config.ws, token: this.config.ws.token ? '***' : '' },
      api: { ...this.config.api, token: this.config.api?.token ? '***' : '' },
      tts: { ...this.config.tts, apiKey: this.config.tts?.apiKey ? '***' : '' },
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
