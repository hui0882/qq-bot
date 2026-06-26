// src/lib/config.ts
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PlatformConfig } from '@/types/napcat'

const CONFIG_PATH = join(process.cwd(), 'data', 'config.json')
const TEMPLATE_PATH = join(process.cwd(), 'data', 'config.template.json')

const DEFAULT_CONFIG: PlatformConfig = {
  ws: {
    url: '',
    token: '',
    reconnect: true,
    reconnectInterval: 5000,
    maxReconnectInterval: 30000,
  },
  api: {
    url: '',
    token: '',
  },
  tts: {
    enabled: false,
    apiUrl: '',
    apiKey: '',
    model: '',
    voice: '',
    style: '',
    format: 'wav',
  },
  voiceReply: {
    mode: 'off',
    allowUserOverride: false,
  },
  friendRequest: {
    mode: 'auto',
  },
  auth: {
    token: 'napcat-admin-token',
  },
  log: {
    maxEntries: 5000,
    persistToFile: true,
    logDir: 'data/logs',
  },
  commands: {
    enabled: true,
    prefix: '/',
    allowUserOverride: false,
    definitions: [
      {
        name: 'help',
        description: '查看所有可用命令',
        usage: '/help',
        enabled: true,
        handler: 'builtin:help',
      },
      {
        name: 'response-type',
        description: '设置回复模式（语音/文本）',
        usage: '/response-type <voice|text|auto>',
        enabled: true,
        handler: 'builtin:response-type',
        args: [
          {
            name: 'mode',
            required: true,
            values: ['voice', 'text', 'auto'],
            description: '回复模式',
          },
        ],
        conditions: {
          requireAllowUserOverride: true,
          requireTtsEnabled: true,
        },
      },
    ],
  },
  ai: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    model: '',
    maxTokens: 2048,
    temperature: 0.7,
    maxContextRounds: 10,
    defaultReplyType: 'text',
    debugContext: false,
    fileReplyEnabled: false,
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

  private loadTemplate(): PlatformConfig {
    try {
      if (existsSync(TEMPLATE_PATH)) {
        const raw = readFileSync(TEMPLATE_PATH, 'utf-8')
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) as Partial<PlatformConfig> }
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIG }
  }

  private loadConfig(): PlatformConfig {
    try {
      if (!existsSync(CONFIG_PATH)) {
        const dir = join(process.cwd(), 'data')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        // 从模板复制，模板不存在则用代码默认值
        if (existsSync(TEMPLATE_PATH)) {
          copyFileSync(TEMPLATE_PATH, CONFIG_PATH)
        } else {
          writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
        }
        return this.loadTemplate()
      }
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PlatformConfig>
      // Migrate voiceReply.allowUserOverride → commands.allowUserOverride
      if (parsed.voiceReply?.allowUserOverride !== undefined && !parsed.commands) {
        parsed.commands = {
          ...DEFAULT_CONFIG.commands,
          allowUserOverride: parsed.voiceReply.allowUserOverride,
        }
      }
      return {
        ws: { ...DEFAULT_CONFIG.ws, ...parsed.ws },
        api: { ...DEFAULT_CONFIG.api, ...parsed.api },
        tts: { ...DEFAULT_CONFIG.tts, ...parsed.tts },
        voiceReply: { ...DEFAULT_CONFIG.voiceReply, ...parsed.voiceReply },
        friendRequest: { ...DEFAULT_CONFIG.friendRequest, ...parsed.friendRequest },
        auth: { ...DEFAULT_CONFIG.auth, ...parsed.auth },
        log: { ...DEFAULT_CONFIG.log, ...parsed.log },
        commands: {
          ...DEFAULT_CONFIG.commands,
          ...parsed.commands,
          definitions: parsed.commands?.definitions || DEFAULT_CONFIG.commands.definitions,
        },
        ai: { ...DEFAULT_CONFIG.ai, ...parsed.ai },
      }
    } catch {
      return this.loadTemplate()
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
    if (old.voiceReply?.mode !== curr.voiceReply?.mode) keys.push('voiceReply.mode')
    if (old.voiceReply?.allowUserOverride !== curr.voiceReply?.allowUserOverride) keys.push('voiceReply.allowUserOverride')
    if (old.friendRequest?.mode !== curr.friendRequest?.mode) keys.push('friendRequest.mode')
    if (old.auth.token !== curr.auth.token) keys.push('auth.token')
    if (old.log.maxEntries !== curr.log.maxEntries) keys.push('log.maxEntries')
    if (old.log.persistToFile !== curr.log.persistToFile) keys.push('log.persistToFile')
    if (old.commands?.enabled !== curr.commands?.enabled) keys.push('commands.enabled')
    if (old.commands?.allowUserOverride !== curr.commands?.allowUserOverride) keys.push('commands.allowUserOverride')
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
      friendRequest: { ...this.config.friendRequest, ...partial.friendRequest },
      auth: { ...this.config.auth, ...partial.auth },
      log: { ...this.config.log, ...partial.log },
      commands: { ...this.config.commands, ...partial.commands },
      ai: { ...this.config.ai, ...partial.ai },
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8')
  }

  onUpdate(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  getMaskedConfig(): PlatformConfig {
    // Return full config — frontend handles masking and reveal
    return { ...this.config }
  }

  resetConfig(): PlatformConfig {
    // 从模板恢复默认配置
    const template = this.loadTemplate()
    writeFileSync(CONFIG_PATH, JSON.stringify(template, null, 2), 'utf-8')
    this.config = template
    return { ...this.config }
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
