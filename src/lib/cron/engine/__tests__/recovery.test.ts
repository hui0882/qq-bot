/**
 * 宕机恢复 - 缓冲填充单元测试（回归：schedule_at 单位混乱 + 注册即入队）
 *
 * 覆盖 pushTaskToBuffer / fillBuffer：
 * - 已禁用任务、缓冲满、任务已在缓冲中的短路行为
 * - 无 pending 时按调度创建 Execution 并入堆
 * - 有 pending 时直接复用 pending 入堆
 * - 防毒化：毫秒级 schedule_at（旧数据）不会产生 16 位时间戳
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted 共享 db mock（便于按调用顺序控制 get/run 返回值）
const { mockPrepare, mockGet, mockRun, mockAll } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockGet: vi.fn(),
  mockRun: vi.fn(),
  mockAll: vi.fn(),
}))

vi.mock('../../../db', () => ({
  db: {
    prepare: vi.fn(() => ({ run: mockRun, get: mockGet, all: mockAll })),
    exec: vi.fn(),
  },
}))

vi.mock('../../../logger', () => ({
  logger: {
    logSystem: vi.fn(),
  },
}))

import { fillBuffer, pushTaskToBuffer } from '../recovery'
import { PreFetchBuffer } from '../buffer'
import type { Task, TaskExecution } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
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

function makeExecution(overrides: Partial<TaskExecution> = {}): TaskExecution {
  return {
    id: 'exec-1',
    taskId: 'task-1',
    userId: 'user-1',
    scheduledAt: Date.now() + 60_000,
    status: 'pending',
    scheduleType: 'cron',
    taskName: '测试任务',
    prompt: '测试提示词',
    outputFormat: 'text',
    attempts: 0,
    maxRetries: 2,
    createdAt: Date.now(),
    ...overrides,
  }
}

/** 执行行（getExecutionById 返回） */
function makeExecutionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'exec-1',
    task_id: 'task-1',
    user_id: 'user-1',
    scheduled_at: Date.now() + 60_000,
    started_at: null,
    completed_at: null,
    status: 'pending',
    schedule_type: 'cron',
    task_name: '测试任务',
    prompt: '测试提示词',
    tools: null,
    output_format: 'text',
    result: null,
    error: null,
    duration: null,
    attempts: 0,
    max_retries: 2,
    created_at: Date.now(),
    ...overrides,
  }
}

/** pending 执行行（findPendingByTask 返回） */
function makePendingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeExecutionRow({ id: 'pending-exec-1', ...overrides })
}

/**
 * 队列一次"无 pending → 创建 → 读回"流程：
 * 第 1 次 get（findPendingByTask）返回 undefined，
 * 第 2 次 get（getExecutionById）返回构造的执行行。
 */
function queueCreateFlow(row: Record<string, unknown>): void {
  mockGet.mockReturnValueOnce(undefined).mockReturnValueOnce(row)
}

beforeEach(() => {
  mockPrepare.mockClear()
  mockGet.mockReset()
  mockRun.mockReset()
  mockAll.mockReset()
})

// ---------------------------------------------------------------------------
// pushTaskToBuffer
// ---------------------------------------------------------------------------

describe('pushTaskToBuffer', () => {
  it('任务已禁用时不入堆且不访问数据库', () => {
    const buffer = new PreFetchBuffer(5)
    const task = makeTask({ enabled: false })

    const result = pushTaskToBuffer(buffer, task)

    expect(result).toBe(false)
    expect(buffer.size).toBe(0)
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('缓冲已满时不入堆', () => {
    const buffer = new PreFetchBuffer(1)
    buffer.push(makeExecution({ taskId: 'other-task' }))
    expect(buffer.isFull).toBe(true)

    const result = pushTaskToBuffer(buffer, makeTask())

    expect(result).toBe(false)
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('任务已在缓冲中时不重复入堆', () => {
    const buffer = new PreFetchBuffer(5)
    buffer.push(makeExecution({ taskId: 'task-1' }))

    const result = pushTaskToBuffer(buffer, makeTask())

    expect(result).toBe(false)
    expect(buffer.size).toBe(1)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('无 pending 时按调度计算下次时间、创建 Execution 并入堆（oneTime 秒级）', () => {
    const buffer = new PreFetchBuffer(5)
    const nowSec = Math.floor(Date.now() / 1000)
    const atSec = nowSec + 3600
    const task = makeTask({ schedule: { type: 'oneTime', at: atSec } })
    queueCreateFlow(makeExecutionRow({ task_id: 'task-1', scheduled_at: atSec * 1000 }))

    const result = pushTaskToBuffer(buffer, task)

    expect(result).toBe(true)
    expect(buffer.size).toBe(1)
    expect(buffer.peek()!.taskId).toBe('task-1')
    // 入堆的 scheduledAt 为毫秒 = atSec * 1000（13 位）
    expect(buffer.peek()!.scheduledAt).toBe(atSec * 1000)
    // 写入 DB 的 scheduled_at 也是毫秒
    const insertArgs = mockRun.mock.calls[0]
    expect(insertArgs).toBeDefined()
    expect(insertArgs[3]).toBe(atSec * 1000)
  })

  it('有 pending 时直接复用 pending Execution 入堆，不创建新记录', () => {
    const buffer = new PreFetchBuffer(5)
    const pendingRow = makePendingRow({ scheduled_at: Date.now() + 5_000 })
    mockGet.mockReturnValueOnce(pendingRow) // findPendingByTask

    const result = pushTaskToBuffer(buffer, makeTask())

    expect(result).toBe(true)
    expect(buffer.size).toBe(1)
    expect(buffer.peek()!.id).toBe('pending-exec-1')
    expect(buffer.peek()!.scheduledAt).toBe(pendingRow.scheduled_at)
    expect(mockRun).not.toHaveBeenCalled() // 没有 INSERT
  })

  it('oneTime 任务 at 已过期（秒级过去时间）时返回 false', () => {
    const buffer = new PreFetchBuffer(5)
    const nowSec = Math.floor(Date.now() / 1000)
    const task = makeTask({ schedule: { type: 'oneTime', at: nowSec - 3600 } })

    const result = pushTaskToBuffer(buffer, task)

    expect(result).toBe(false)
    expect(buffer.size).toBe(0)
  })

  it('防毒化：oneTime 任务 at 为毫秒（旧数据 2e12）时生成 13 位 scheduledAt 而非 16 位', () => {
    const buffer = new PreFetchBuffer(5)
    const atMs = 2_000_000_000_000 // 毫秒级残留数据（2033 年）
    const task = makeTask({ schedule: { type: 'oneTime', at: atMs } })
    queueCreateFlow(makeExecutionRow({ task_id: 'task-1', scheduled_at: 2_000_000_000_000 }))

    const result = pushTaskToBuffer(buffer, task)

    expect(result).toBe(true)
    // 归一化为秒（2e9）后再转毫秒（2e12，13 位）——若未归一化会是 2e15（16 位）
    expect(buffer.peek()!.scheduledAt).toBe(2_000_000_000_000)
    expect(String(buffer.peek()!.scheduledAt).length).toBe(13)
    expect(mockRun.mock.calls[0][3]).toBe(2_000_000_000_000)
  })

  it('interval 任务按 now + interval 计算下次执行时间', () => {
    const buffer = new PreFetchBuffer(5)
    const nowSec = Math.floor(Date.now() / 1000)
    const task = makeTask({ schedule: { type: 'interval', interval: 60 } })
    queueCreateFlow(makeExecutionRow({ task_id: 'task-1', scheduled_at: (nowSec + 60) * 1000 }))

    const result = pushTaskToBuffer(buffer, task)

    expect(result).toBe(true)
    expect(buffer.peek()!.scheduledAt).toBe((nowSec + 60) * 1000)
  })
})

// ---------------------------------------------------------------------------
// fillBuffer（全流程防毒化回归）
// ---------------------------------------------------------------------------

describe('fillBuffer', () => {
  it('毫秒 schedule_at 任务走完整流程后 buffer 中不会出现 16 位时间戳', () => {
    const buffer = new PreFetchBuffer(15)
    const nowSec = Math.floor(Date.now() / 1000)

    const tasks = [
      // 旧数据：毫秒级 at（应归一化为秒 → 13 位毫秒时间戳）
      makeTask({ id: 'legacy-ms', schedule: { type: 'oneTime', at: 2_000_000_000_000 } }),
      // 正常 interval 任务
      makeTask({ id: 'normal-interval', schedule: { type: 'interval', interval: 300 } }),
      // 禁用任务不应入堆
      makeTask({ id: 'disabled', enabled: false, schedule: { type: 'interval', interval: 60 } }),
      // 已过期的一次性任务不应入堆
      makeTask({ id: 'expired', schedule: { type: 'oneTime', at: nowSec - 3600 } }),
    ]

    // 队列：每个任务一次"无 pending → 创建 → 读回"流程
    queueCreateFlow(makeExecutionRow({ id: 'exec-legacy', task_id: 'legacy-ms', scheduled_at: 2_000_000_000_000 }))
    queueCreateFlow(makeExecutionRow({ id: 'exec-normal', task_id: 'normal-interval', scheduled_at: (nowSec + 300) * 1000 }))

    const count = fillBuffer(buffer, tasks)

    expect(count).toBe(2)
    expect(buffer.size).toBe(2)

    const buffered = buffer.toArray()
    for (const exec of buffered) {
      // 任何情况下不允许 16 位时间戳（> 1e15）
      expect(exec.scheduledAt).toBeLessThan(1_000_000_000_000_000)
      // 正常毫秒时间戳最多 13 位
      expect(String(exec.scheduledAt).length).toBeLessThanOrEqual(13)
    }

    const legacy = buffered.find(e => e.taskId === 'legacy-ms')
    expect(legacy).toBeDefined()
    expect(legacy!.scheduledAt).toBe(2_000_000_000_000) // 13 位
    const normal = buffered.find(e => e.taskId === 'normal-interval')
    expect(normal!.scheduledAt).toBe((nowSec + 300) * 1000)
  })

  it('缓冲满时停止填充剩余任务', () => {
    const buffer = new PreFetchBuffer(1)
    const tasks = [
      makeTask({ id: 'task-a', schedule: { type: 'interval', interval: 60 } }),
      makeTask({ id: 'task-b', schedule: { type: 'interval', interval: 60 } }),
    ]
    queueCreateFlow(makeExecutionRow({ task_id: 'task-a' }))

    const count = fillBuffer(buffer, tasks)

    expect(count).toBe(1)
    expect(buffer.size).toBe(1)
    expect(buffer.peek()!.taskId).toBe('task-a')
  })
})
