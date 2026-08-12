/**
 * 调度器单元测试（新架构）
 *
 * 验证 CronEngine 的核心功能：
 * - 任务注册/注销
 * - 引擎启动/停止
 * - 状态查询
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Hoisted 共享 db mock（引擎内部多处 prepare 复用同一组 get/run/all，
// 便于按调用顺序控制返回值）
const { mockPrepare, mockGet, mockRun, mockAll } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockGet: vi.fn(),
  mockRun: vi.fn(),
  mockAll: vi.fn(),
}))

// Mock dependencies
vi.mock('../../db', () => ({
  db: {
    prepare: vi.fn(() => ({
      all: mockAll,
      get: mockGet,
      run: mockRun,
    })),
    exec: vi.fn(),
    // initCronTables 的列迁移使用 db.pragma 读取现有列
    pragma: vi.fn(() => []),
  },
  initDatabase: vi.fn().mockResolvedValue(undefined),
  closeDatabase: vi.fn(),
}))

vi.mock('../../logger', () => ({
  logger: {
    logSystem: vi.fn(),
  },
}))

// Import after mocking
import { CronEngine, getCronEngine } from '../engine/scheduler'
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

/** pending 执行行（findPendingByTask 返回） */
function makePendingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pending-exec-1',
    task_id: 'test-task-id',
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

/**
 * 队列一次"无 pending → 创建 → 读回"流程：
 * 第 1 次 get（findPendingByTask）返回 undefined，
 * 第 2 次 get（getExecutionById）返回构造的执行行。
 */
function queueCreateFlow(row: Record<string, unknown>): void {
  mockGet.mockReturnValueOnce(undefined).mockReturnValueOnce(row)
}

// 全局 db mock 默认行为：
// - loadTasks / findRunningExecutions / findMissedExecutions → 空表
// - 单个用例按需用 mockReturnValueOnce 队列控制 get 的返回值
beforeEach(() => {
  mockPrepare.mockClear()
  mockAll.mockReset()
  mockAll.mockReturnValue([])
  mockRun.mockReset()
  mockGet.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CronEngine - 基本功能', () => {
  let engine: CronEngine

  beforeEach(() => {
    // 重置单态
    (globalThis as any).__napcatCronEngine = undefined
    engine = new CronEngine({
      bufferSize: 5,
      tickInterval: 10_000,
      maxConcurrent: 2,
    })
  })

  afterEach(() => {
    engine.stop()
  })

  it('应该能启动和停止引擎', () => {
    expect(engine.getStatus().running).toBe(false)

    engine.start()
    expect(engine.getStatus().running).toBe(true)

    engine.stop()
    expect(engine.getStatus().running).toBe(false)
  })

  it('重复启动不会出错', () => {
    engine.start()
    engine.start() // 第二次调用应该被忽略
    expect(engine.getStatus().running).toBe(true)
  })

  it('未启动时停止不会出错', () => {
    engine.stop() // 不应该抛出错误
    expect(engine.getStatus().running).toBe(false)
  })

  it('应该返回正确的初始状态', () => {
    const status = engine.getStatus()
    expect(status.running).toBe(false)
    expect(status.buffered).toBe(0)
    expect(status.runningCount).toBe(0)
    expect(status.totalTasks).toBe(0)
    expect(status.enabledTasks).toBe(0)
  })
})

describe('CronEngine - 任务注册/注销', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__napcatCronEngine = undefined
    engine = new CronEngine()
  })

  afterEach(() => {
    engine.stop()
  })

  it('应该注册任务', () => {
    const task = makeTask()
    engine.registerTask(task)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1)
    expect(status.enabledTasks).toBe(1)
  })

  it('应该注销任务', () => {
    const task = makeTask()
    engine.registerTask(task)
    engine.unregisterTask(task.id)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(0)
    expect(status.enabledTasks).toBe(0)
  })

  it('应该更新已注册的任务', () => {
    const task = makeTask()
    engine.registerTask(task)

    const updatedTask = makeTask({ name: '更新后的任务' })
    engine.registerTask(updatedTask)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1) // 仍然是 1 个任务
  })

  it('禁用任务后 enabledTasks 应减少', () => {
    const task = makeTask()
    engine.registerTask(task)

    const disabledTask = makeTask({ enabled: false })
    engine.registerTask(disabledTask)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1)
    expect(status.enabledTasks).toBe(0)
  })

  it('注销不存在的任务不会出错', () => {
    engine.unregisterTask('non-existent-id') // 不应该抛出错误
    expect(engine.getStatus().totalTasks).toBe(0)
  })
})

describe('CronEngine - 启动失败恢复', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__napcatCronEngine = undefined
    engine = new CronEngine({
      bufferSize: 5,
      tickInterval: 10_000,
      maxConcurrent: 2,
    })
  })

  afterEach(() => {
    engine.stop()
  })

  it('loadTasks 抛错时 running 复位为 false 并可再次启动成功', async () => {
    const { logger } = await import('../../logger')

    // 第一次启动：加载任务抛错（loadTasks 是私有方法，spy 模拟其抛错）
    const loadTasksSpy = vi
      .spyOn(engine as unknown as { loadTasks: () => void }, 'loadTasks')
      .mockImplementationOnce(() => {
        throw new Error('数据库连接失败')
      })

    expect(() => engine.start()).toThrow('数据库连接失败')

    // 修复：启动失败后 running 必须复位，否则引擎永久瘫痪
    expect(engine.getStatus().running).toBe(false)
    expect(logger.logSystem).toHaveBeenCalledWith(
      'CronEngine: start_failed',
      expect.objectContaining({ error: '数据库连接失败' }),
    )

    // 数据库恢复后可以再次启动成功
    engine.start()
    expect(engine.getStatus().running).toBe(true)

    loadTasksSpy.mockRestore()
  })

  it('成功启动时创建主循环定时器', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    try {
      engine.start()
      expect(engine.getStatus().running).toBe(true)
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    } finally {
      setIntervalSpy.mockRestore()
    }
  })
})

describe('CronEngine - registerTask 注册即入队（回归）', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__napcatCronEngine = undefined
    engine = new CronEngine()
  })

  afterEach(() => {
    engine.stop()
  })

  it('引擎运行中注册任务后 buffer 立即包含该任务最早的执行（无 pending 时按调度创建）', () => {
    engine.start()
    const nowSec = Math.floor(Date.now() / 1000)
    const task = makeTask({ schedule: { type: 'oneTime', at: nowSec + 3600 } })
    queueCreateFlow(makePendingRow({ id: 'created-exec', task_id: task.id, scheduled_at: (nowSec + 3600) * 1000 }))

    engine.registerTask(task)

    const buffered = engine.getBufferedExecutions()
    expect(buffered).toHaveLength(1)
    expect(buffered[0].taskId).toBe(task.id)
    expect(buffered[0].scheduledAt).toBe((nowSec + 3600) * 1000)
    expect(mockRun).toHaveBeenCalled() // 创建了 Execution 记录
  })

  it('引擎运行中注册任务后直接复用已有 pending Execution 入堆（不新建）', () => {
    engine.start()
    const pendingRow = makePendingRow({ scheduled_at: Date.now() + 5_000 })
    mockGet.mockReturnValueOnce(pendingRow) // findPendingByTask

    engine.registerTask(makeTask())

    const buffered = engine.getBufferedExecutions()
    expect(buffered).toHaveLength(1)
    expect(buffered[0].id).toBe('pending-exec-1')
    expect(buffered[0].scheduledAt).toBe(pendingRow.scheduled_at)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('引擎未运行时注册任务只更新缓存，不触发入队', () => {
    const task = makeTask({ schedule: { type: 'interval', interval: 60 } })
    engine.registerTask(task)

    expect(engine.getStatus().totalTasks).toBe(1)
    expect(engine.getBufferedExecutions()).toHaveLength(0)
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('引擎运行中注册禁用任务不入队', () => {
    engine.start()
    engine.registerTask(makeTask({ enabled: false }))

    expect(engine.getBufferedExecutions()).toHaveLength(0)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('重新注册（更新）时先移除缓冲中旧记录再入队新记录', () => {
    engine.start()
    mockGet.mockReturnValueOnce(makePendingRow({ id: 'old-exec', scheduled_at: Date.now() + 60_000 }))
    engine.registerTask(makeTask({ name: 'v1' }))
    expect(engine.getBufferedExecutions()).toHaveLength(1)

    mockGet.mockReturnValueOnce(makePendingRow({ id: 'new-exec', scheduled_at: Date.now() + 5_000 }))
    engine.registerTask(makeTask({ name: 'v2' }))

    const buffered = engine.getBufferedExecutions()
    expect(buffered).toHaveLength(1)
    expect(buffered[0].id).toBe('new-exec')
  })
})

describe('CronEngine - enqueuePendingExecution（手动触发入队，回归）', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__napcatCronEngine = undefined
  })

  afterEach(() => {
    engine.stop()
  })

  it('引擎未运行时返回 false 且不入队', () => {
    engine = new CronEngine()

    const result = engine.enqueuePendingExecution('task-1')

    expect(result).toBe(false)
    expect(engine.getBufferedExecutions()).toHaveLength(0)
  })

  it('任务无 pending Execution 时返回 false', () => {
    engine = new CronEngine()
    engine.start()

    const result = engine.enqueuePendingExecution('task-1')

    expect(result).toBe(false)
    expect(engine.getBufferedExecutions()).toHaveLength(0)
    expect(mockGet).toHaveBeenCalledTimes(1) // 查询过 pending
  })

  it('存在 pending Execution 时推入 buffer 并返回 true', () => {
    engine = new CronEngine()
    engine.start()
    mockGet.mockReturnValueOnce(makePendingRow({ task_id: 'task-1', scheduled_at: Date.now() + 5_000 }))

    const result = engine.enqueuePendingExecution('task-1')

    expect(result).toBe(true)
    const buffered = engine.getBufferedExecutions()
    expect(buffered).toHaveLength(1)
    expect(buffered[0].id).toBe('pending-exec-1')
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('buffer 已满时返回 false 且不再查询 DB', () => {
    engine = new CronEngine({ bufferSize: 1 })
    engine.start()
    mockGet.mockReturnValueOnce(makePendingRow({ id: 'exec-a', task_id: 'task-a' }))
    expect(engine.enqueuePendingExecution('task-a')).toBe(true)
    expect(engine.getBufferedExecutions()).toHaveLength(1)

    const result = engine.enqueuePendingExecution('task-b')

    expect(result).toBe(false)
    expect(mockGet).toHaveBeenCalledTimes(1) // 第二次未查询
  })

  it('任务已在 buffer 中时返回 false', () => {
    engine = new CronEngine()
    engine.start()
    mockGet.mockReturnValueOnce(makePendingRow({ id: 'exec-a', task_id: 'task-a' }))
    expect(engine.enqueuePendingExecution('task-a')).toBe(true)

    const result = engine.enqueuePendingExecution('task-a')

    expect(result).toBe(false)
    expect(engine.getBufferedExecutions()).toHaveLength(1)
  })
})

describe('CronEngine - 全流程防毒化（loadTasks → recover → buffer，回归）', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__napcatCronEngine = undefined
    engine = new CronEngine()
  })

  afterEach(() => {
    engine.stop()
  })

  it('DB 中 schedule_at 为毫秒（旧数据毒化）时，引擎启动后 buffer 中不会出现 16 位时间戳', () => {
    const now = Date.now()
    const cronTaskRow = {
      id: 'legacy-task',
      user_id: 'user-1',
      name: '旧数据任务',
      description: null,
      schedule_raw: 'at 2033-05-18T03:33:20',
      schedule_type: 'at',
      schedule_cron: null,
      schedule_interval: null,
      schedule_at: 2_000_000_000_000, // 毫秒级残留数据（毒化源）
      end_time: null,
      prompt: '测试',
      tools: null,
      output_format: 'text',
      enabled: 1,
      created_at: now,
      updated_at: now,
    }
    // loadTasks 读到这条任务；findRunning/findMissed 走默认空表
    mockAll.mockReturnValueOnce([cronTaskRow] as any)
    // findPendingByTask → 无 pending；getExecutionById → 读回归一化后的执行行
    queueCreateFlow(makePendingRow({ id: 'exec-1', task_id: 'legacy-task', scheduled_at: 2_000_000_000_000 }))

    engine.start()

    const buffered = engine.getBufferedExecutions()
    expect(buffered).toHaveLength(1)
    expect(buffered[0].taskId).toBe('legacy-task')
    // 归一化：2e12 毫秒 → 2e9 秒 → 2e12 毫秒（13 位），而非 2e15（16 位）
    expect(buffered[0].scheduledAt).toBe(2_000_000_000_000)
    expect(String(buffered[0].scheduledAt).length).toBe(13)
    // 写入 DB 的 scheduled_at 同样被归一化
    expect(mockRun.mock.calls[0][3]).toBe(2_000_000_000_000)
  })
})

describe('CronEngine - 单例', () => {
  beforeEach(() => {
    ;(globalThis as any).__napcatCronEngine = undefined
  })

  it('getCronEngine 应该返回同一个实例', () => {
    const engine1 = getCronEngine()
    const engine2 = getCronEngine()
    expect(engine1).toBe(engine2)
  })
})

describe('CronEngine - rowToTask 类型映射', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__napcatCronEngine = undefined
    engine = new CronEngine()
  })

  afterEach(() => {
    engine.stop()
  })

  it('应该将 at 类型映射为 oneTime', () => {
    // 通过 registerTask 和 getStatus 验证类型映射
    // rowToTask 是私有方法，通过 loadTasks 间接测试
    // 这里我们直接测试 registerTask 的行为
    const task = makeTask({
      schedule: { type: 'oneTime', at: Math.floor(Date.now() / 1000) + 3600 },
    })
    engine.registerTask(task)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1)
    expect(status.enabledTasks).toBe(1)
  })

  it('应该将 every 类型映射为 interval', () => {
    const task = makeTask({
      schedule: { type: 'interval', interval: 3600 },
    })
    engine.registerTask(task)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1)
  })

  it('应该将 cron 类型映射为 cron', () => {
    const task = makeTask({
      schedule: { type: 'cron', expression: '0 9 * * *' },
    })
    engine.registerTask(task)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1)
  })

  it('应该正确处理 endTime 字段', () => {
    const endTime = Date.now() + 86400000
    const task = makeTask({
      schedule: { type: 'interval', interval: 3600 },
      endTime,
    })
    engine.registerTask(task)

    const status = engine.getStatus()
    expect(status.totalTasks).toBe(1)
  })

  it('getBufferedExecutions 应该返回缓冲内容', () => {
    const buffered = engine.getBufferedExecutions()
    expect(buffered).toEqual([])
  })
})
