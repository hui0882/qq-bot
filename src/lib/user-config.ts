// src/lib/user-config.ts
// Per-user configuration storage (SQLite with EAV mode)

import {
  getUserResponseType as dbGetUserResponseType,
  setUserResponseType as dbSetUserResponseType,
  getUserSetting,
  setUserSetting,
  getAllUserSettings,
  exportAllUserConfigs,
  importUserConfigs,
} from './db/queries/users'

export interface UserConfig {
  responseType?: 'voice' | 'text' | 'auto'
}

/**
 * 获取用户配置
 */
export function getUserConfig(userId: number): UserConfig | null {
  const settings = getAllUserSettings(String(userId))
  if (Object.keys(settings).length === 0) return null

  return {
    responseType: settings.response_type as 'voice' | 'text' | 'auto' | undefined,
  }
}

/**
 * 设置用户配置
 */
export function setUserConfig(userId: number, config: UserConfig): void {
  if (config.responseType) {
    dbSetUserResponseType(String(userId), config.responseType)
  }
}

/**
 * 获取用户回复类型
 */
export function getUserResponseType(userId: number): 'voice' | 'text' | 'auto' | null {
  return dbGetUserResponseType(String(userId))
}

/**
 * 导出所有用户配置
 */
export function exportUserConfigs(): { users: Record<string, UserConfig> } {
  const allConfigs = exportAllUserConfigs()
  const users: Record<string, UserConfig> = {}

  for (const [userId, settings] of Object.entries(allConfigs)) {
    users[userId] = {
      responseType: settings.response_type as 'voice' | 'text' | 'auto' | undefined,
    }
  }

  return { users }
}

/**
 * 导入用户配置
 */
export function importUserConfigsData(data: { users: Record<string, UserConfig> }): void {
  const configs: Record<string, Record<string, string>> = {}

  for (const [userId, config] of Object.entries(data.users)) {
    configs[userId] = {}
    if (config.responseType) {
      configs[userId].response_type = config.responseType
    }
  }

  importUserConfigs(configs)
}
