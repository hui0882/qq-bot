/**
 * 管理后台只读查询模块单元测试（admin-query v2 契约）
 *
 * 覆盖模板：user_list / user_detail / 未知模板（含旧模板名回归）。
 *
 * 隔离方案（沿用 users-nickname.test.ts 的做法）：
 * - 导入 db 模块前把全局单例 __db 指向内存 SQLite（index.ts 为延迟初始化代理），
 *   再调用真实 initDatabase() 建立完整 schema，避免污染 data/napcat.db；
 * - initCronTables() 建立 cron_tasks/cron_logs/task_executions 表（user_detail 复用 getUserTasks）；
 * - napcat-ws 通过 vi.mock 拦截（getFriendMap/getOrFetchNickname 内部的动态 import 同样生效），
 *   mock getStatus/sendAction，覆盖 在线返回好友列表 / 离线 / 返回 failed 三种场景；
 * - 好友列表 30s TTL 缓存为模块级状态：beforeEach 用假时钟推进 31s 使跨用例缓存自然过期，
 *   TTL 用例用 vi.advanceTimersByTime 验证连续两次调用不重复 sendAction。
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 必须在任何 db 访问前设置内存数据库单例
;(globalThis as unknown as { __db?: Database.Database }).__db = new Database(':memory:')

import { db, initDatabase } from '../index'
import { runAdminQuery, AdminQueryError, type AdminUserAIConfigDTO } from '../queries/admin-query'
import { getOrCreateUser, setNickname, setUserSetting, getNickname } from '../queries/users'
import { upsertUserAIConfig } from '../queries/ai'
import { initCronTables, createTask } from '../../cron/store'
import {
  addMessage,
  markMessagesProcessed,
  upsertSummary,
  upsertProfile,
  addEntry,
} from '../../memory/store'

// Mock napcat-ws：查询时会动态 import 该模块拉取好友列表 / 昵称
const { mockGetStatus, mockSendAction } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
  mockSendAction: vi.fn(),
}))

vi.mock('@/lib/napcat-ws', () => ({
  napcatWS: {
    getStatus: mockGetStatus,
    sendAction: mockSendAction,
  },
}))

initDatabase()
initCronTables()

// ============ 测试工具 ============

const BASE_TIME = Date.parse('2026-01-01T00:00:00Z')
let fakeNow = BASE_TIME

interface AdminListUser {
  qq_id: string
  nickname: string | null
  remark: string | null
  created_at: number
  updated_at: number
}

interface UserListResult {
  total: number
  users: AdminListUser[]
  stats: { withSettings: number; withAiConfig: number }
}

let seq = 0
function uid(prefix = 't'): string {
  seq += 1
  return `${prefix}-${Date.now()}-${seq}`
}

function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count
}

/** 批量建用户，updated_at 递增（保证 ORDER BY updated_at DESC 顺序确定） */
function bulkCreateUsers(qqs: string[]): void {
  const insert = db.prepare('INSERT INTO users (qq_id, created_at, updated_at) VALUES (?, ?, ?)')
  const tx = db.transaction(() => {
    qqs.forEach((qq, i) => insert.run(qq, 1000 + i, i * 1000))
  })
  tx()
}

/** 构造 get_friend_list 成功响应（字段缺省为 null） */
function friendListResponse(
  items: Array<{ user_id: string; nickname?: string | null; remark?: string | null }>
) {
  return {
    status: 'ok',
    retcode: 0,
    data: items.map((it) => ({ nickname: null, remark: null, ...it })),
  }
}

beforeEach(() => {
  // 内存库，清空全部业务表（含 cron / memory）
  db.exec(`
    DELETE FROM cron_logs;
    DELETE FROM task_executions;
    DELETE FROM cron_tasks;
    DELETE FROM memory_messages;
    DELETE FROM memory_summaries;
    DELETE FROM memory_profiles;
    DELETE FROM memory_entries;
    DELETE FROM user_settings;
    DELETE FROM user_ai_configs;
    DELETE FROM ai_conversations;
    DELETE FROM users;
  `)
  vi.clearAllMocks()
  // 假时钟推进 31s：超过好友列表 30s TTL，保证跨用例模块级缓存自然过期互不污染
  fakeNow += 31_000
  vi.useFakeTimers()
  vi.setSystemTime(new Date(fakeNow))
  // 默认离线 + sendAction 默认 failed（若被意外调用也不会误回填）
  mockGetStatus.mockReturnValue('disconnected')
  mockSendAction.mockResolvedValue({ status: 'failed', retcode: -1, data: null })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============ user_list ============

describe('runAdminQuery - user_list', () => {
  it('无 keyword：默认 limit 20，返回 total/users/stats（stats 为全表统计不受分页影响）', async () => {
    const qqs: string[] = []
    for (let i = 0; i < 22; i++) qqs.push(uid('u'))
    bulkCreateUsers(qqs)
    setUserSetting(qqs[0], 'theme', 'dark')
    setUserSetting(qqs[1], 'theme', 'light')
    upsertUserAIConfig(qqs[2], { enabled: 1, model: 'gpt-4o' })

    const result = (await runAdminQuery('user_list', {})) as UserListResult

    expect(result.total).toBe(22)
    expect(result.users).toHaveLength(20) // 默认 limit 20
    expect(result.users[0].qq_id).toBe(qqs[21]) // ORDER BY updated_at DESC
    expect(result.users[0].remark).toBeNull()
    expect(typeof result.users[0].created_at).toBe('number')
    expect(typeof result.users[0].updated_at).toBe('number')
    expect(result.stats).toEqual({ withSettings: 2, withAiConfig: 1 })
  })

  it('limit/offset 分页生效，total 不受分页影响', async () => {
    const qqs = [uid('u'), uid('u'), uid('u'), uid('u')]
    bulkCreateUsers(qqs)

    const result = (await runAdminQuery('user_list', { limit: 2, offset: 1 })) as UserListResult

    expect(result.total).toBe(4)
    expect(result.users).toHaveLength(2)
    expect(result.users.map((u) => u.qq_id)).toEqual([qqs[2], qqs[1]])
  })

  it('limit 超上限钳制到 200（传 999 不报错），limit=0 返回空列表', async () => {
    const qqs: string[] = []
    for (let i = 0; i < 205; i++) qqs.push(uid('bulk'))
    bulkCreateUsers(qqs)

    const clamped = (await runAdminQuery('user_list', { limit: 999 })) as UserListResult
    expect(clamped.total).toBe(205)
    expect(clamped.users).toHaveLength(200)

    const zero = (await runAdminQuery('user_list', { limit: 0 })) as UserListResult
    expect(zero.total).toBe(205)
    expect(zero.users).toHaveLength(0)
  })

  it('keyword 命中 qq_id（LIKE 路径）', async () => {
    getOrCreateUser('100000001')
    getOrCreateUser('200000002')

    const result = (await runAdminQuery('user_list', { keyword: '1000000' })) as UserListResult

    expect(result.total).toBe(1)
    expect(result.users.map((u) => u.qq_id)).toEqual(['100000001'])
    expect(result.total).toBe(result.users.length)
  })

  it('keyword 命中 DB nickname（LIKE 路径）', async () => {
    const a = uid('n')
    const b = uid('n')
    getOrCreateUser(a)
    getOrCreateUser(b)
    setNickname(a, 'AliceWang')

    const result = (await runAdminQuery('user_list', { keyword: 'lice' })) as UserListResult

    expect(result.total).toBe(1)
    expect(result.users.map((u) => u.qq_id)).toEqual([a])
  })

  it('keyword 命中好友备注（IN 路径）且 total 与列表一致', async () => {
    const a = uid('r')
    const b = uid('r')
    getOrCreateUser(a)
    getOrCreateUser(b)
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue(
      friendListResponse([{ user_id: a, nickname: '好友昵称', remark: '老同学-张三' }])
    )

    const result = (await runAdminQuery('user_list', { keyword: '老同学' })) as UserListResult

    expect(result.total).toBe(1)
    expect(result.users.map((u) => u.qq_id)).toEqual([a])
    expect(result.users[0].nickname).toBe('好友昵称') // 好友 Map 同时回填 nickname
    expect(result.users[0].remark).toBe('老同学-张三')
    expect(result.total).toBe(result.users.length)
  })

  it('WS 在线：DB 无昵称的行被好友 Map 回填 nickname/remark；DB 有昵称时不被覆盖', async () => {
    const u1 = uid('m')
    const u2 = uid('m')
    getOrCreateUser(u1)
    getOrCreateUser(u2)
    setNickname(u2, 'DbNick')
    db.prepare('UPDATE users SET updated_at = ? WHERE qq_id = ?').run(1000, u1)
    db.prepare('UPDATE users SET updated_at = ? WHERE qq_id = ?').run(2000, u2)

    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue(
      friendListResponse([
        { user_id: u1, nickname: 'FriendNick', remark: 'FriendRemark' },
        { user_id: u2, nickname: 'FriendNick2', remark: 'FriendRemark2' },
      ])
    )

    const result = (await runAdminQuery('user_list', {})) as UserListResult

    const u1Row = result.users.find((u) => u.qq_id === u1)!
    const u2Row = result.users.find((u) => u.qq_id === u2)!
    expect(u1Row.nickname).toBe('FriendNick') // DB null → 好友 Map 回填
    expect(u1Row.remark).toBe('FriendRemark')
    expect(u2Row.nickname).toBe('DbNick') // DB 昵称优先，不被好友昵称覆盖
    expect(u2Row.remark).toBe('FriendRemark2') // remark 无 DB 来源，回填
  })

  it('WS 离线：nickname/remark 为 null 且不调用 sendAction', async () => {
    const u = uid('off')
    getOrCreateUser(u)

    const result = (await runAdminQuery('user_list', {})) as UserListResult

    expect(result.users[0].nickname).toBeNull()
    expect(result.users[0].remark).toBeNull()
    expect(mockSendAction).not.toHaveBeenCalled()
  })

  it('WS 在线但 get_friend_list 返回 failed：不合并、不报错', async () => {
    const u = uid('f')
    getOrCreateUser(u)
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue({ status: 'failed', retcode: -1, data: null })

    const result = (await runAdminQuery('user_list', {})) as UserListResult

    expect(result.users[0].nickname).toBeNull()
    expect(result.users[0].remark).toBeNull()
  })

  it('好友列表 30s TTL 缓存：连续两次调用只 sendAction 一次，过期后重新拉取', async () => {
    const u = uid('ttl')
    getOrCreateUser(u)
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue(friendListResponse([{ user_id: u, nickname: 'N', remark: 'R' }]))

    const r1 = (await runAdminQuery('user_list', {})) as UserListResult
    const r2 = (await runAdminQuery('user_list', {})) as UserListResult
    expect(r1.users[0].nickname).toBe('N')
    expect(r2.users[0].nickname).toBe('N')
    expect(mockSendAction).toHaveBeenCalledTimes(1)
    expect(mockGetStatus).toHaveBeenCalledTimes(1)

    // 缓存窗口内即使转为离线也直接复用缓存结果（不再访问 WS）
    mockGetStatus.mockReturnValue('disconnected')
    const r3 = (await runAdminQuery('user_list', {})) as UserListResult
    expect(r3.users[0].nickname).toBe('N')
    expect(mockGetStatus).toHaveBeenCalledTimes(1)

    // 超过 30s TTL 后重新拉取
    vi.advanceTimersByTime(31_000)
    mockGetStatus.mockReturnValue('connected')
    await runAdminQuery('user_list', {})
    expect(mockSendAction).toHaveBeenCalledTimes(2)
    expect(mockGetStatus).toHaveBeenCalledTimes(2)
  })

  it('空表：total=0、users=[]、stats 全 0', async () => {
    const result = (await runAdminQuery('user_list', {})) as UserListResult

    expect(result).toEqual({ total: 0, users: [], stats: { withSettings: 0, withAiConfig: 0 } })
  })
})

// ============ user_detail ============

describe('runAdminQuery - user_detail', () => {
  it('存在的用户：五区块结构完整（user/settings/aiConfig/cronTasks/memory）', async () => {
    const qq = uid('d')
    const other = uid('other')
    getOrCreateUser(qq)
    setNickname(qq, 'Alice')
    setUserSetting(qq, 'theme', 'dark')
    setUserSetting(qq, 'response_type', 'voice')
    upsertUserAIConfig(qq, { enabled: 1, model: 'gpt-4o' })

    // WS 在线：nickname 已缓存不触发 get_stranger_info；get_friend_list 回填 remark
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockImplementation((action: string) => {
      if (action === 'get_friend_list') {
        return Promise.resolve(friendListResponse([{ user_id: qq, nickname: 'FNick', remark: '老友' }]))
      }
      return Promise.resolve({ status: 'failed', retcode: -1, data: null })
    })

    // cron 任务：本用户 2 条（时间递增保证 created_at DESC 顺序），另一用户 1 条应被过滤
    const task1 = createTask({
      userId: qq,
      name: 't1',
      description: '第一个任务',
      schedule: '0 8 * * *',
      prompt: 'p1',
    })
    vi.advanceTimersByTime(1000)
    const task2 = createTask({ userId: qq, name: 't2', schedule: 'every 1h', prompt: 'p2' })
    createTask({ userId: other, name: 'other-task', schedule: '0 9 * * *', prompt: 'po' })

    // memory 数据（本用户）+ 隔离数据（另一用户，不应串入）
    const msgIds = [
      addMessage(qq, 'user', '你好'),
      addMessage(qq, 'assistant', '你好呀'),
      addMessage(qq, 'user', '今天天气如何'),
    ]
    markMessagesProcessed([msgIds[0]])
    upsertSummary(qq, '用户喜欢咖啡')
    upsertProfile(qq, 'coffee', 'latte', 0.95)
    addEntry(qq, 'preference', '喜欢拿铁', 0.8)
    addMessage(other, 'user', '其他用户的消息')
    upsertProfile(other, 'x', 'y')

    const result = (await runAdminQuery('user_detail', { qq_id: qq })) as {
      user: {
        qq_id: string
        nickname: string | null
        remark: string | null
        created_at: number
        updated_at: number
      }
      settings: Record<string, string>
      aiConfig: { model: string | null } | null
      cronTasks: Array<{
        id: string
        name: string
        description: string | null
        schedule_raw: string
        schedule_type: string
        enabled: boolean
        created_at: number
      }>
      memory: {
        messageCount: number
        unprocessedCount: number
        summary: string | null
        profiles: Array<{ key: string; value: string; confidence: number; updated_at: number }>
        entries: Array<{
          id: number
          memory_type: string
          content: string
          importance: number
          created_at: number
        }>
      }
    }

    // user 区块：nickname DB 优先，remark 来自好友 Map
    expect(result.user.qq_id).toBe(qq)
    expect(result.user.nickname).toBe('Alice')
    expect(result.user.remark).toBe('老友')
    expect(typeof result.user.created_at).toBe('number')
    expect(typeof result.user.updated_at).toBe('number')

    // settings 区块
    expect(result.settings).toEqual({ theme: 'dark', response_type: 'voice' })

    // aiConfig 区块（详细字段映射见独立用例）
    expect(result.aiConfig).not.toBeNull()
    expect(result.aiConfig!.model).toBe('gpt-4o')

    // cronTasks 区块：仅本用户任务，created_at DESC
    expect(result.cronTasks).toHaveLength(2)
    expect(result.cronTasks.map((t) => t.name)).toEqual(['t2', 't1'])
    expect(result.cronTasks[0].id).toBe(task2.id)
    expect(result.cronTasks[0]).toMatchObject({
      name: 't2',
      description: null,
      schedule_raw: 'every 1h',
      schedule_type: 'cron',
      enabled: true,
    })
    expect(result.cronTasks[1]).toMatchObject({
      id: task1.id,
      name: 't1',
      description: '第一个任务',
      schedule_raw: '0 8 * * *',
      schedule_type: 'cron',
      enabled: true,
    })
    expect(typeof result.cronTasks[0].created_at).toBe('number')

    // memory 区块
    expect(result.memory.messageCount).toBe(3)
    expect(result.memory.unprocessedCount).toBe(2)
    expect(result.memory.summary).toBe('用户喜欢咖啡')
    expect(result.memory.profiles).toEqual([
      { key: 'coffee', value: 'latte', confidence: 0.95, updated_at: expect.any(Number) },
    ])
    expect(result.memory.entries).toHaveLength(1)
    expect(result.memory.entries[0]).toMatchObject({
      memory_type: 'preference',
      content: '喜欢拿铁',
      importance: 0.8,
    })
    expect(typeof result.memory.entries[0].id).toBe('number')
    expect(typeof result.memory.entries[0].created_at).toBe('number')
  })

  it('DB 无昵称时经 WS get_stranger_info 拉取昵称并写回缓存', async () => {
    const qq = uid('ws')
    getOrCreateUser(qq)
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockImplementation((action: string, payload?: unknown) => {
      if (action === 'get_friend_list') {
        return Promise.resolve(friendListResponse([]))
      }
      if (action === 'get_stranger_info') {
        return Promise.resolve({
          status: 'ok',
          retcode: 0,
          data: { nickname: 'WS-Alice', user_id: (payload as { user_id: string }).user_id },
        })
      }
      return Promise.resolve({ status: 'failed', retcode: -1, data: null })
    })

    const result = (await runAdminQuery('user_detail', { qq_id: qq })) as {
      user: { nickname: string | null }
    }

    expect(result.user.nickname).toBe('WS-Alice')
    expect(mockSendAction).toHaveBeenCalledWith('get_stranger_info', { user_id: qq })
    expect(getNickname(qq)).toBe('WS-Alice') // 已写回 users 表缓存
  })

  it('不存在的用户：返回空默认结构，不触发任何 WS 调用、不建行', async () => {
    const ghost = uid('ghost')
    const before = countUsers()
    mockGetStatus.mockReturnValue('connected') // 即便在线也不应拉取

    const result = await runAdminQuery('user_detail', { qq_id: ghost })

    expect(result).toEqual({
      user: null,
      settings: {},
      aiConfig: null,
      cronTasks: [],
      memory: { messageCount: 0, unprocessedCount: 0, summary: null, profiles: [], entries: [] },
    })
    expect(mockGetStatus).not.toHaveBeenCalled()
    expect(mockSendAction).not.toHaveBeenCalled()
    expect(countUsers()).toBe(before)
  })

  it('aiConfig 字段映射正确（enabled/hasApiKey 布尔转换、camelCase 字段名）', async () => {
    const qq = uid('ai')
    getOrCreateUser(qq)
    setNickname(qq, 'n')
    upsertUserAIConfig(qq, {
      enabled: 1,
      base_url: 'https://api.example.com/v1',
      api_key: 'sk-test-123',
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.5,
      max_context_rounds: 20,
      default_reply_type: 'voice',
      custom_system_prompt: '请用简洁风格回复',
    })

    const result = (await runAdminQuery('user_detail', { qq_id: qq })) as {
      aiConfig: AdminUserAIConfigDTO
    }

    expect(result.aiConfig).toEqual({
      enabled: true,
      model: 'gpt-4o',
      maxTokens: 4096,
      temperature: 0.5,
      maxContextRounds: 20,
      defaultReplyType: 'voice',
      customSystemPrompt: '请用简洁风格回复',
      baseUrl: 'https://api.example.com/v1',
      hasApiKey: true,
    })
  })

  it('enabled=1 无 api_key 时 hasApiKey=false；enabled=0 时 aiConfig 为 null', async () => {
    const qq1 = uid('ai1')
    getOrCreateUser(qq1)
    setNickname(qq1, 'n')
    upsertUserAIConfig(qq1, { enabled: 1, model: 'gpt-4o-mini' })
    const r1 = (await runAdminQuery('user_detail', { qq_id: qq1 })) as {
      aiConfig: { enabled: boolean; hasApiKey: boolean }
    }
    expect(r1.aiConfig).toMatchObject({ enabled: true, hasApiKey: false })

    const qq2 = uid('ai2')
    getOrCreateUser(qq2)
    setNickname(qq2, 'n')
    upsertUserAIConfig(qq2, { enabled: 0, api_key: 'sk-hidden' })
    const r2 = (await runAdminQuery('user_detail', { qq_id: qq2 })) as { aiConfig: unknown }
    expect(r2.aiConfig).toBeNull()
  })
})

// ============ 参数与模板校验 ============

describe('runAdminQuery - 参数与模板校验', () => {
  it('user_detail 的 qq_id 非字符串时抛 AdminQueryError(status=400)', async () => {
    for (const params of [{}, { qq_id: 123 }, { qq_id: null }, { qq_id: true }, { qq_id: {} }]) {
      await expect(runAdminQuery('user_detail', params)).rejects.toThrow(AdminQueryError)
    }

    const err = (await runAdminQuery('user_detail', { qq_id: 123 }).catch((e) => e)) as AdminQueryError
    expect(err).toBeInstanceOf(AdminQueryError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AdminQueryError')
    expect(err.status).toBe(400)
  })

  it('user_list 的 keyword 非字符串抛 400；空白关键字视为不过滤', async () => {
    await expect(runAdminQuery('user_list', { keyword: 123 })).rejects.toThrow(AdminQueryError)
    await expect(runAdminQuery('user_list', { keyword: {} })).rejects.toThrow(AdminQueryError)

    const u = uid('k')
    getOrCreateUser(u)
    const result = (await runAdminQuery('user_list', { keyword: '   ' })) as UserListResult
    expect(result.total).toBe(1) // trim 后为空 → 不过滤
  })

  it('limit/offset 为负数或非数字时抛 400', async () => {
    await expect(runAdminQuery('user_list', { limit: -1 })).rejects.toThrow(AdminQueryError)
    await expect(runAdminQuery('user_list', { limit: 'abc' })).rejects.toThrow(AdminQueryError)
    await expect(runAdminQuery('user_list', { limit: NaN })).rejects.toThrow(AdminQueryError)
    await expect(runAdminQuery('user_list', { limit: Infinity })).rejects.toThrow(AdminQueryError)
    await expect(runAdminQuery('user_list', { offset: -1 })).rejects.toThrow(AdminQueryError)
    await expect(runAdminQuery('user_list', { offset: 'abc' })).rejects.toThrow(AdminQueryError)
  })

  it('未知模板（含 SQL 注入式模板名与已移除旧模板名）抛 AdminQueryError 且不破坏数据库', async () => {
    for (const tpl of [
      'hack; DROP TABLE users',
      'no_such_template',
      'user_by_qq', // 旧模板已移除
      'user_config_by_qq', // 旧模板已移除
      'memory_profile_search', // 旧模板已移除
    ]) {
      await expect(runAdminQuery(tpl, {})).rejects.toThrow(AdminQueryError)
    }

    const err = (await runAdminQuery('hack; DROP TABLE users', {}).catch((e) => e)) as AdminQueryError
    expect(err).toBeInstanceOf(AdminQueryError)
    expect(err.status).toBe(400)
    expect(err.message).toContain('hack; DROP TABLE users')

    // SQL 注入未生效：users 表仍存在且可正常查询
    expect(() => countUsers()).not.toThrow()
  })
})
