/**
 * 用户昵称功能单元测试（getNickname / setNickname / getOrFetchNickname）
 *
 * 隔离方案：在导入 db 模块前，把全局单例 __db 指向内存 SQLite，再调用真实 initDatabase()
 * 建立完整 schema，避免污染 data/napcat.db。
 * napcat-ws 通过 vi.mock 拦截 getOrFetchNickname 内部的动态 import：
 * 覆盖 已缓存 / WS connected 返回昵称 / WS connected 返回失败 / WS 未连接 四种场景。
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 必须在任何 db 访问前设置内存数据库单例
;(globalThis as unknown as { __db?: Database.Database }).__db = new Database(':memory:')

import { db, initDatabase } from '../index'
import { getNickname, setNickname, getOrFetchNickname, getOrCreateUser } from '../queries/users'

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

let seq = 0
function uid(): string {
  seq += 1
  return `nick-${Date.now()}-${seq}`
}

function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count
}

beforeEach(() => {
  db.exec('DELETE FROM users; DELETE FROM user_settings; DELETE FROM user_ai_configs;')
  vi.clearAllMocks()
})

describe('getNickname', () => {
  it('未设置昵称时返回 null', () => {
    const qq = uid()
    getOrCreateUser(qq)
    expect(getNickname(qq)).toBeNull()
  })

  it('不存在的用户也返回 null（不抛错）', () => {
    expect(getNickname(uid())).toBeNull()
  })

  it('setNickname 后返回正确值', () => {
    const qq = uid()
    getOrCreateUser(qq)
    setNickname(qq, 'Alice')
    expect(getNickname(qq)).toBe('Alice')
  })
})

describe('setNickname', () => {
  it('用户不存在时自动创建用户再写入昵称', () => {
    const qq = uid()
    const before = countUsers()

    setNickname(qq, 'Bob')

    expect(countUsers()).toBe(before + 1)
    expect(getNickname(qq)).toBe('Bob')
    // 其余字段为默认值
    const row = db.prepare('SELECT qq_id, nickname, created_at, updated_at FROM users WHERE qq_id = ?').get(qq) as {
      qq_id: string
      nickname: string | null
      created_at: number
      updated_at: number
    }
    expect(row.qq_id).toBe(qq)
    expect(row.nickname).toBe('Bob')
    expect(typeof row.created_at).toBe('number')
  })

  it('用户已存在时仅更新昵称，不新增行', () => {
    const qq = uid()
    getOrCreateUser(qq)
    setNickname(qq, 'First')
    const count = countUsers()

    setNickname(qq, 'Second')

    expect(countUsers()).toBe(count)
    expect(getNickname(qq)).toBe('Second')
  })

  it('更新昵称后 updated_at 被刷新', () => {
    const qq = uid()
    getOrCreateUser(qq)
    setNickname(qq, 'First')

    const before = (db.prepare('SELECT updated_at FROM users WHERE qq_id = ?').get(qq) as { updated_at: number }).updated_at
    db.prepare('UPDATE users SET updated_at = ? WHERE qq_id = ?').run(before - 100000, qq)

    setNickname(qq, 'Second')
    const after = (db.prepare('SELECT updated_at FROM users WHERE qq_id = ?').get(qq) as { updated_at: number }).updated_at

    expect(after).toBeGreaterThan(before - 100000)
  })
})

describe('getOrFetchNickname', () => {
  it('DB 已有缓存昵称时直接返回，且不调用 WS', async () => {
    const qq = uid()
    setNickname(qq, 'cached-name')

    const result = await getOrFetchNickname(qq)

    expect(result).toBe('cached-name')
    expect(mockGetStatus).not.toHaveBeenCalled()
    expect(mockSendAction).not.toHaveBeenCalled()
  })

  it('无缓存且 WS connected + 返回 nickname → 返回昵称并写回 DB', async () => {
    const qq = uid()
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue({
      status: 'ok',
      retcode: 0,
      data: { nickname: 'Alice', user_id: Number(qq) },
    })

    const result = await getOrFetchNickname(qq)

    expect(result).toBe('Alice')
    expect(mockSendAction).toHaveBeenCalledWith('get_stranger_info', { user_id: qq })
    // 写回 DB：再次查询本地缓存可拿到
    expect(getNickname(qq)).toBe('Alice')
  })

  it('无缓存且 WS connected 但返回 failed → 返回 null 且不写库', async () => {
    const qq = uid()
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue({ status: 'failed', retcode: -1, data: null, message: 'not found' })

    const result = await getOrFetchNickname(qq)

    expect(result).toBeNull()
    expect(getNickname(qq)).toBeNull()
    // 未写库 = 不创建用户行
    expect(countUsers()).toBe(0)
  })

  it('无缓存且 WS connected 但 nickname 为空/空白 → 返回 null 且不写库', async () => {
    const qq = uid()
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockResolvedValue({ status: 'ok', retcode: 0, data: { nickname: '   ' } })

    const result = await getOrFetchNickname(qq)

    expect(result).toBeNull()
    expect(getNickname(qq)).toBeNull()
    expect(countUsers()).toBe(0)
  })

  it('WS 未连接（status 非 connected）→ 返回 null 且不调用 sendAction、不写库', async () => {
    const qq = uid()
    mockGetStatus.mockReturnValue('disconnected')

    const result = await getOrFetchNickname(qq)

    expect(result).toBeNull()
    expect(mockSendAction).not.toHaveBeenCalled()
    expect(countUsers()).toBe(0)
  })

  it('WS 处于 connecting 状态同样视为未连接', async () => {
    const qq = uid()
    mockGetStatus.mockReturnValue('connecting')

    const result = await getOrFetchNickname(qq)

    expect(result).toBeNull()
    expect(mockSendAction).not.toHaveBeenCalled()
  })

  it('sendAction 抛异常时返回 null 且不写库', async () => {
    const qq = uid()
    mockGetStatus.mockReturnValue('connected')
    mockSendAction.mockRejectedValue(new Error('network down'))

    const result = await getOrFetchNickname(qq)

    expect(result).toBeNull()
    expect(getNickname(qq)).toBeNull()
    expect(countUsers()).toBe(0)
  })
})
