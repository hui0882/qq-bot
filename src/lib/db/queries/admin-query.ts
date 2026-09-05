/**
 * 管理后台只读查询模块
 *
 * 只接受模板白名单 + 参数化 SQL（? 占位符），严禁拼接用户输入 SQL。
 * 参数校验失败时抛出 AdminQueryError（status 400），内部异常由 route 层兜底为 500。
 *
 * 支持的模板：
 * - user_list:   分页用户列表（搜索 + 好友信息实时合并 + 全表统计）
 * - user_detail: 单用户全量详情（基础信息 / 个人配置 / 定时任务 / 记忆 / 画像）
 */

import { db } from '../index'
import { getAllUserSettings, getOrFetchNickname } from './users'
import { getUserAIConfig } from './ai'
import { getUserTasks } from '@/lib/cron/store'
import {
  getUnprocessedCount,
  getSummary,
  getProfiles,
  getEntries,
} from '@/lib/memory/store'

// ============ 错误类型 ============

export class AdminQueryError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'AdminQueryError'
    this.status = status
  }
}

// ============ 类型定义 ============

export interface AdminUserInfo {
  qq_id: string
  nickname: string | null
  remark: string | null
  created_at: number
  updated_at: number
}

export interface AdminUserAIConfigDTO {
  enabled: boolean
  model: string | null
  maxTokens: number
  temperature: number
  maxContextRounds: number
  defaultReplyType: string
  customSystemPrompt: string | null
  baseUrl: string | null
  hasApiKey: boolean
}

// ============ 参数校验工具 ============

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  if (typeof value !== 'string') {
    throw new AdminQueryError(`Invalid param: "${key}" must be a string`)
  }
  return value
}

/**
 * 解析正整数参数（用于 limit），默认值 def，上限 200 钳制
 */
function clampLimit(params: Record<string, unknown>, key: string, def: number): number {
  const raw = params[key]
  if (raw === undefined || raw === null) return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new AdminQueryError(`Invalid param: "${key}" must be a non-negative number`)
  }
  return Math.min(200, Math.floor(n))
}

/**
 * 解析非负整数参数（用于 offset），默认值 def，无上限
 */
function clampNonNegative(params: Record<string, unknown>, key: string, def: number): number {
  const raw = params[key]
  if (raw === undefined || raw === null) return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new AdminQueryError(`Invalid param: "${key}" must be a non-negative number`)
  }
  return Math.floor(n)
}

/**
 * 解析可选的关键字参数：缺失 / null 或 trim 后为空返回 null（不过滤），
 * 非字符串类型抛 400。
 */
function optionalKeyword(params: Record<string, unknown>): string | null {
  const raw = params.keyword
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    throw new AdminQueryError('Invalid param: "keyword" must be a string')
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ============ 好友列表缓存（30 秒 TTL） ============

interface FriendInfo {
  nickname: string | null
  remark: string | null
}

const FRIEND_LIST_TTL_MS = 30_000

let friendListCache: { map: Map<string, FriendInfo>; fetchedAt: number } | null = null

/**
 * 获取好友信息 Map<qq_id, {nickname, remark}>。
 *
 * QQ 在线（napcatWS 状态为 connected）时通过 get_friend_list 拉取并缓存 30 秒，
 * 避免分页查询每页都重复请求；离线时返回空 Map（remark/nickname 不合并）。
 * napcat-ws 使用动态 import，避免循环依赖（参考 queries/users.ts 的 getOrFetchNickname）。
 */
async function getFriendMap(): Promise<Map<string, FriendInfo>> {
  const now = Date.now()
  if (friendListCache && now - friendListCache.fetchedAt < FRIEND_LIST_TTL_MS) {
    return friendListCache.map
  }

  const map = new Map<string, FriendInfo>()

  const { napcatWS } = await import('@/lib/napcat-ws')
  if (napcatWS.getStatus() === 'connected') {
    try {
      const response = await napcatWS.sendAction('get_friend_list')

      if (response.status === 'ok' && Array.isArray(response.data)) {
        for (const item of response.data) {
          if (!item || typeof item !== 'object' || !('user_id' in item)) continue
          const raw = item as { user_id?: unknown; nickname?: unknown; remark?: unknown }
          if (raw.user_id === undefined || raw.user_id === null) continue

          const nickname =
            typeof raw.nickname === 'string' && raw.nickname.trim().length > 0
              ? raw.nickname
              : null
          const remark =
            typeof raw.remark === 'string' && raw.remark.trim().length > 0
              ? raw.remark
              : null

          map.set(String(raw.user_id), { nickname, remark })
        }
      }
    } catch (err) {
      console.error('[DB] Failed to fetch friend list via WS:', err)
    }
  }

  friendListCache = { map, fetchedAt: now }
  return map
}

// ============ 模板实现 ============

/**
 * 模板 user_list：分页用户列表
 *
 * params: { keyword?: string, limit?: number(默认20,上限200), offset?: number(默认0) }
 */
async function queryUserList(keyword: string | null, limit: number, offset: number) {
  const friendMap = await getFriendMap()

  // 构造统一的 WHERE 条件（COUNT 与列表查询共用，保证 total 正确）
  const conditions: string[] = []
  const whereParams: string[] = []

  if (keyword) {
    const like = `%${keyword}%`
    conditions.push('(u.qq_id LIKE ? OR u.nickname LIKE ?)')
    whereParams.push(like, like)

    // 好友 Map 中备注命中关键字的好友 uids（数量上限 500，安全）
    const remarkMatched: string[] = []
    for (const [qqId, info] of friendMap) {
      if (info.remark && info.remark.includes(keyword)) {
        remarkMatched.push(qqId)
        if (remarkMatched.length >= 500) break
      }
    }
    if (remarkMatched.length > 0) {
      conditions.push(`u.qq_id IN (${remarkMatched.map(() => '?').join(', ')})`)
      whereParams.push(...remarkMatched)
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' OR ')}` : ''

  const totalRow = db.prepare(
    `SELECT COUNT(*) as count FROM users u ${whereClause}`
  ).get(...whereParams) as { count: number }

  const rows = db.prepare(
    `SELECT u.qq_id, u.nickname, u.created_at, u.updated_at
     FROM users u
     ${whereClause}
     ORDER BY u.updated_at DESC
     LIMIT ? OFFSET ?`
  ).all(
    ...whereParams,
    limit,
    offset
  ) as Array<{
    qq_id: string
    nickname: string | null
    created_at: number
    updated_at: number
  }>

  // 行数据合并好友信息：nickname = DB 值 ?? 好友 Map 值 ?? null；remark = 好友 Map 值 ?? null
  const users: AdminUserInfo[] = rows.map((row) => {
    const friend = friendMap.get(row.qq_id)
    return {
      qq_id: row.qq_id,
      nickname: row.nickname ?? friend?.nickname ?? null,
      remark: friend?.remark ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })

  // 全表统计（与分页/搜索无关）
  const withSettingsRow = db.prepare(
    'SELECT COUNT(DISTINCT user_id) as count FROM user_settings'
  ).get() as { count: number }

  const withAiConfigRow = db.prepare(
    'SELECT COUNT(*) as count FROM user_ai_configs'
  ).get() as { count: number }

  return {
    total: totalRow.count,
    users,
    stats: {
      withSettings: withSettingsRow.count,
      withAiConfig: withAiConfigRow.count,
    },
  }
}

function toAIConfigDTO(
  row: ReturnType<typeof getUserAIConfig>
): AdminUserAIConfigDTO | null {
  if (!row) return null
  return {
    enabled: Boolean(row.enabled),
    model: row.model,
    maxTokens: row.max_tokens,
    temperature: row.temperature,
    maxContextRounds: row.max_context_rounds,
    defaultReplyType: row.default_reply_type,
    customSystemPrompt: row.custom_system_prompt,
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key),
  }
}

/**
 * 模板 user_detail：单用户全量详情（只读，不创建行）
 *
 * params: { qq_id: string }（必填，非字符串抛 400）
 * user 不存在于 users 表时返回 null，其余字段给空值默认，且不触发 WS 拉取。
 */
async function queryUserDetail(qqId: string) {
  const row = db.prepare(
    'SELECT qq_id, created_at, updated_at FROM users WHERE qq_id = ?'
  ).get(qqId) as
    | { qq_id: string; created_at: number; updated_at: number }
    | undefined

  if (!row) {
    return {
      user: null,
      settings: {},
      aiConfig: null,
      cronTasks: [],
      memory: {
        messageCount: 0,
        unprocessedCount: 0,
        summary: null,
        profiles: [],
        entries: [],
      },
    }
  }

  // 昵称实时回填（本地缓存优先，为空时通过 WS 拉取并写缓存）
  const nickname = await getOrFetchNickname(qqId)
  // 备注来自好友列表（复用 30 秒缓存）
  const friendMap = await getFriendMap()
  const friend = friendMap.get(qqId)

  const settings = getAllUserSettings(qqId)
  const aiConfig = toAIConfigDTO(getUserAIConfig(qqId))

  const cronTasks = getUserTasks(qqId).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    schedule_raw: t.scheduleRaw,
    schedule_type: t.scheduleType,
    enabled: t.enabled,
    created_at: t.createdAt,
  }))

  const messageCountRow = db.prepare(
    'SELECT COUNT(*) as count FROM memory_messages WHERE user_id = ?'
  ).get(qqId) as { count: number }

  const summary = getSummary(qqId)

  return {
    user: {
      qq_id: row.qq_id,
      nickname,
      remark: friend?.remark ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    settings,
    aiConfig,
    cronTasks,
    memory: {
      messageCount: messageCountRow.count,
      unprocessedCount: getUnprocessedCount(qqId),
      summary: summary?.summary ?? null,
      profiles: getProfiles(qqId).map((p) => ({
        key: p.key,
        value: p.value,
        confidence: p.confidence,
        updated_at: p.updated_at,
      })),
      entries: getEntries(qqId, 20).map((e) => ({
        id: e.id,
        memory_type: e.memory_type,
        content: e.content,
        importance: e.importance,
        created_at: e.created_at,
      })),
    },
  }
}

// ============ 统一入口 ============

/**
 * 执行管理后台查询
 *
 * 支持的模板：
 * - user_list:    params { keyword?: string, limit?: number, offset?: number }
 * - user_detail:  params { qq_id: string }
 */
export async function runAdminQuery(
  template: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (template) {
    case 'user_list': {
      const keyword = optionalKeyword(params)
      const limit = clampLimit(params, 'limit', 20)
      const offset = clampNonNegative(params, 'offset', 0)
      return queryUserList(keyword, limit, offset)
    }

    case 'user_detail': {
      const qqId = requireString(params, 'qq_id')
      return queryUserDetail(qqId)
    }

    default:
      throw new AdminQueryError(`Unknown template: "${template}"`)
  }
}
