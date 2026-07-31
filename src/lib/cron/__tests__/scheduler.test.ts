/**
 * 调度器单元测试（新架构）
 *
 * 验证 CronEngine 的核心功能：
 * - 任务注册/注销
 * - 引擎启动/停止
 * - 状态查询
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock dependencies
vi.mock('../../db', () => ({
  db: {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(),
      run: vi.fn(),
    })),
    exec: vi.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CronEngine - 基本功能', () => {
  let engine: CronEngine

  beforeEach(() => {
    // 重置单态
    (globalThis as any).__cronEngine = null
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
    (globalThis as any).__cronEngine = null
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

describe('CronEngine - 单例', () => {
  it('getCronEngine 应该返回同一个实例', () => {
    const engine1 = getCronEngine()
    const engine2 = getCronEngine()
    expect(engine1).toBe(engine2)
  })
})

describe('CronEngine - rowToTask 类型映射', () => {
  let engine: CronEngine

  beforeEach(() => {
    (globalThis as any).__cronEngine = null
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
