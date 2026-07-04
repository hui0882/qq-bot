/**
 * 调度器单元测试
 *
 * 重点验证一次性任务（repeat=false）执行后自动禁用的逻辑：
 * - at 类型任务：无论 repeat 标志如何，执行后都应禁用
 * - every 类型 + repeat=false：执行后应禁用
 * - cron 类型 + repeat=false：执行后应禁用
 * - every/cron 类型 + repeat=true：执行后应更新 nextRunAt，继续调度
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdateTask = vi.fn()
const mockIncrementRunCount = vi.fn()
const mockEnqueue = vi.fn().mockResolvedValue(undefined)
const mockCalculateNextRun = vi.fn()

vi.mock('../store', () => ({
  findDueTasks: vi.fn(),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  incrementRunCount: (...args: unknown[]) => mockIncrementRunCount(...args),
  getTask: vi.fn(),
}))

vi.mock('../queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
  },
}))

vi.mock('../parser', () => ({
  calculateNextRun: (...args: unknown[]) => mockCalculateNextRun(...args),
}))

vi.mock('../executor', () => ({
  executeTask: vi.fn().mockResolvedValue({ status: 'success' }),
}))

// Import after mocking
import { CronScheduler } from '../scheduler'
import type { CronTask } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<CronTask> = {}): CronTask {
  const now = Date.now()
  return {
    id: 'test-task-id',
    userId: 'user-1',
    name: '测试任务',
    scheduleRaw: 'at 15:30',
    scheduleType: 'at',
    scheduleAt: Math.floor(now / 1000) + 3600,
    prompt: '测试提示词',
    outputFormat: 'text',
    enabled: true,
    repeat: false,
    runCount: 0,
    silent: false,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CronScheduler - 一次性任务自动禁用', () => {
  let scheduler: CronScheduler

  beforeEach(() => {
    vi.clearAllMocks()
    scheduler = new CronScheduler({ tickInterval: 60_000 })
  })

  afterEach(() => {
    scheduler.stop()
  })

  it('at 类型任务（repeat=false）执行后应自动禁用', async () => {
    const task = makeTask({ scheduleType: 'at', repeat: false })
    mockCalculateNextRun.mockReturnValue(Math.floor(Date.now() / 1000) + 100)

    // 通过反射调用私有方法 processTask
    await (scheduler as any).processTask(task, Date.now())

    // 验证 enqueue 被调用
    expect(mockEnqueue).toHaveBeenCalledWith(task)

    // 验证 updateTask 被调用两次：
    // 1. 更新 lastRunAt
    // 2. 禁用任务（nextRunAt=undefined, enabled=false）
    const updateCalls = mockUpdateTask.mock.calls
    expect(updateCalls.length).toBe(2)

    // 第二次调用应该是禁用任务
    const disableCall = updateCalls[1]
    expect(disableCall[0]).toBe('test-task-id')
    expect(disableCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })

  it('at 类型任务（repeat=true）执行后也应自动禁用（at 本身就是一次性）', async () => {
    const task = makeTask({ scheduleType: 'at', repeat: true })
    mockCalculateNextRun.mockReturnValue(Math.floor(Date.now() / 1000) + 100)

    await (scheduler as any).processTask(task, Date.now())

    // 验证任务被禁用（不是更新 nextRunAt）
    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })

  it('every 类型 + repeat=false 执行后应自动禁用', async () => {
    const task = makeTask({
      scheduleType: 'every',
      scheduleInterval: 300,
      scheduleAt: undefined,
      repeat: false,
    })
    mockCalculateNextRun.mockReturnValue(Math.floor(Date.now() / 1000) + 300)

    await (scheduler as any).processTask(task, Date.now())

    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })

  it('every 类型 + repeat=true 执行后应更新 nextRunAt（继续调度）', async () => {
    const task = makeTask({
      scheduleType: 'every',
      scheduleInterval: 300,
      scheduleAt: undefined,
      repeat: true,
    })
    const nextRunSeconds = Math.floor(Date.now() / 1000) + 300
    mockCalculateNextRun.mockReturnValue(nextRunSeconds)

    await (scheduler as any).processTask(task, Date.now())

    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: nextRunSeconds * 1000 })
  })

  it('cron 类型 + repeat=false 执行后应自动禁用', async () => {
    const task = makeTask({
      scheduleType: 'cron',
      scheduleCron: '0 9 * * *',
      scheduleAt: undefined,
      repeat: false,
    })
    mockCalculateNextRun.mockReturnValue(Math.floor(Date.now() / 1000) + 86400)

    await (scheduler as any).processTask(task, Date.now())

    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })

  it('cron 类型 + repeat=true 执行后应更新 nextRunAt（继续调度）', async () => {
    const task = makeTask({
      scheduleType: 'cron',
      scheduleCron: '0 9 * * *',
      scheduleAt: undefined,
      repeat: true,
    })
    const nextRunSeconds = Math.floor(Date.now() / 1000) + 86400
    mockCalculateNextRun.mockReturnValue(nextRunSeconds)

    await (scheduler as any).processTask(task, Date.now())

    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: nextRunSeconds * 1000 })
  })

  it('calculateNextRun 抛出异常时，一次性任务仍应被安全禁用', async () => {
    const task = makeTask({ scheduleType: 'at', repeat: false })
    mockCalculateNextRun.mockImplementation(() => {
      throw new Error('计算错误')
    })

    await (scheduler as any).processTask(task, Date.now())

    // 即使计算失败，一次性任务也应被禁用
    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })
})

describe('CronScheduler - triggerTask 一次性任务自动禁用', () => {
  let scheduler: CronScheduler

  beforeEach(() => {
    vi.clearAllMocks()
    scheduler = new CronScheduler({ tickInterval: 60_000 })
  })

  afterEach(() => {
    scheduler.stop()
  })

  it('手动触发 at 类型任务后应自动禁用', async () => {
    const task = makeTask({ scheduleType: 'at', repeat: false })
    const { getTask } = await import('../store')
    vi.mocked(getTask as any).mockReturnValue(task)
    mockCalculateNextRun.mockReturnValue(Math.floor(Date.now() / 1000) + 100)

    await scheduler.triggerTask('test-task-id')

    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })

  it('手动触发 every + repeat=false 任务后应自动禁用', async () => {
    const task = makeTask({
      scheduleType: 'every',
      scheduleInterval: 300,
      scheduleAt: undefined,
      repeat: false,
    })
    const { getTask } = await import('../store')
    vi.mocked(getTask as any).mockReturnValue(task)
    mockCalculateNextRun.mockReturnValue(Math.floor(Date.now() / 1000) + 300)

    await scheduler.triggerTask('test-task-id')

    const updateCalls = mockUpdateTask.mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ nextRunAt: undefined, enabled: false })
  })
})
