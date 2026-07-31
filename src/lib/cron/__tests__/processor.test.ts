/**
 * 定时任务引擎 - 处理器单元测试
 *
 * 测试 computeNextExecutionTime 核心逻辑和 CAS 抢占机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock db module for CAS tests
const { mockRun } = vi.hoisted(() => ({
  mockRun: vi.fn(),
}))

vi.mock('../../db', () => ({
  db: {
    prepare: vi.fn(() => ({
      run: mockRun,
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
    exec: vi.fn(),
  },
}))

vi.mock('../../logger', () => ({
  logger: {
    logSystem: vi.fn(),
  },
}))

import { computeNextExecutionTime, casRunning } from '../engine/processor'
import type { Task } from '../engine/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-id',
    userId: 'user-1',
    name: '测试任务',
    schedule: { type: 'cron', expression: '0 9 * * *' },
    scheduleRaw: '0 9 * * *',
    prompt: '测试提示词',
    outputFormat: 'text',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeNextExecutionTime', () => {
  describe('oneTime 类型', () => {
    it('应该返回正确的时间当 at 未到期', () => {
      const now = Date.now()
      const atSec = Math.floor(now / 1000) + 3600 // 1小时后
      const task = makeTask({
        schedule: { type: 'oneTime', at: atSec },
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).toBe(atSec * 1000)
    })

    it('应该返回 null 当 at 已到期', () => {
      const now = Date.now()
      const atSec = Math.floor(now / 1000) - 3600 // 1小时前
      const task = makeTask({
        schedule: { type: 'oneTime', at: atSec },
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).toBeNull()
    })

    it('应该返回 null 当 at 等于当前时间', () => {
      const now = Date.now()
      const atSec = Math.floor(now / 1000)
      const task = makeTask({
        schedule: { type: 'oneTime', at: atSec },
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).toBeNull()
    })

    it('应该返回 null 当 at 为 undefined', () => {
      const task = makeTask({
        schedule: { type: 'oneTime' },
      })

      const result = computeNextExecutionTime(task, Date.now())
      expect(result).toBeNull()
    })
  })

  describe('interval 类型', () => {
    it('应该返回当前时间加间隔', () => {
      const now = Date.now()
      const task = makeTask({
        schedule: { type: 'interval', interval: 300 }, // 5分钟
      })

      const result = computeNextExecutionTime(task, now)
      const expected = (Math.floor(now / 1000) + 300) * 1000
      expect(result).toBe(expected)
    })

    it('应该返回 null 当 interval <= 0', () => {
      const task = makeTask({
        schedule: { type: 'interval', interval: 0 },
      })

      const result = computeNextExecutionTime(task, Date.now())
      expect(result).toBeNull()
    })

    it('应该返回 null 当 interval 为 undefined', () => {
      const task = makeTask({
        schedule: { type: 'interval' },
      })

      const result = computeNextExecutionTime(task, Date.now())
      expect(result).toBeNull()
    })

    it('应该返回 null 当下次执行时间超过 endTime', () => {
      const now = Date.now()
      // 设置 endTime 为当前时间 + 100秒（小于间隔 300 秒）
      const endTime = now + 100_000 // 100秒后（毫秒）
      const task = makeTask({
        schedule: { type: 'interval', interval: 300 },
        endTime,
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).toBeNull()
    })

    it('应该返回正确时间当下次执行时间未超过 endTime', () => {
      const now = Date.now()
      // 设置 endTime 为当前时间 + 100000秒（远大于间隔）
      const endTime = now + 100_000_000 // 很多秒后
      const task = makeTask({
        schedule: { type: 'interval', interval: 300 },
        endTime,
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).not.toBeNull()
      expect(result!).toBeGreaterThan(now)
    })

    it('边界情况：下次执行时间等于 endTime 时应该返回该时间', () => {
      const now = Date.now()
      const nowSec = Math.floor(now / 1000)
      // 设置 endTime 正好等于下次执行时间
      const endTime = (nowSec + 300) * 1000
      const task = makeTask({
        schedule: { type: 'interval', interval: 300 },
        endTime,
      })

      const result = computeNextExecutionTime(task, now)
      // nextTime === endTime，不满足 nextTime > endTime，所以应该返回
      expect(result).toBe(endTime)
    })
  })

  describe('cron 类型', () => {
    it('应该返回下次执行时间', () => {
      const now = Date.now()
      const task = makeTask({
        schedule: { type: 'cron', expression: '0 9 * * *' },
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).not.toBeNull()
      expect(result!).toBeGreaterThan(now)
    })

    it('应该返回 null 当 expression 为空', () => {
      const task = makeTask({
        schedule: { type: 'cron', expression: '' },
      })

      const result = computeNextExecutionTime(task, Date.now())
      expect(result).toBeNull()
    })

    it('应该返回 null 当 expression 为 undefined', () => {
      const task = makeTask({
        schedule: { type: 'cron' },
      })

      const result = computeNextExecutionTime(task, Date.now())
      expect(result).toBeNull()
    })

    it('应该正确计算 */15 * * * * 的下次执行时间', () => {
      const now = Date.now()
      const task = makeTask({
        schedule: { type: 'cron', expression: '*/15 * * * *' },
      })

      const result = computeNextExecutionTime(task, now)
      expect(result).not.toBeNull()
      // 应该在 15 分钟内
      expect(result!).toBeLessThanOrEqual(now + 15 * 60 * 1000)
      expect(result!).toBeGreaterThan(now)
    })
  })

  describe('未知类型', () => {
    it('应该返回 null 对于未知调度类型', () => {
      const task = makeTask({
        schedule: { type: 'unknown' as any },
      })

      const result = computeNextExecutionTime(task, Date.now())
      expect(result).toBeNull()
    })
  })
})

describe('casRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该返回 true 当 CAS 抢占成功', () => {
    mockRun.mockReturnValue({ changes: 1 })

    const result = casRunning('exec-id', Date.now())
    expect(result).toBe(true)
    expect(mockRun).toHaveBeenCalled()
  })

  it('应该返回 false 当 CAS 抢占失败（记录已被抢占）', () => {
    mockRun.mockReturnValue({ changes: 0 })

    const result = casRunning('exec-id', Date.now())
    expect(result).toBe(false)
  })
})
