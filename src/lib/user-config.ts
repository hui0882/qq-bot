// src/lib/user-config.ts
// Per-user configuration storage (lightweight JSON file)

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface UserConfig {
  responseType?: 'voice' | 'text' | 'auto'
}

interface UserConfigsStore {
  users: Record<string, UserConfig>
}

const CONFIG_PATH = join(process.cwd(), 'data', 'user-configs.json')

let store: UserConfigsStore = { users: {} }

function loadStore(): void {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      store = JSON.parse(raw) as UserConfigsStore
    }
  } catch {
    store = { users: {} }
  }
}

function saveStore(): void {
  try {
    const dir = join(process.cwd(), 'data')
    if (!existsSync(dir)) {
      const { mkdirSync } = require('fs')
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

// Load on init
loadStore()

export function getUserConfig(userId: number): UserConfig | null {
  return store.users[String(userId)] || null
}

export function setUserConfig(userId: number, config: UserConfig): void {
  store.users[String(userId)] = { ...store.users[String(userId)], ...config }
  saveStore()
}

export function getUserResponseType(userId: number): 'voice' | 'text' | 'auto' | null {
  const config = getUserConfig(userId)
  return config?.responseType || null
}

export function exportUserConfigs(): UserConfigsStore {
  return JSON.parse(JSON.stringify(store))
}

export function importUserConfigs(data: UserConfigsStore): void {
  store = { users: { ...store.users, ...data.users } }
  saveStore()
}
