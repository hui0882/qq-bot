/**
 * 定时任务引擎 - 预取缓冲单元测试
 *
 * 测试 PreFetchBuffer 的堆操作、去重逻辑、容量限制
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PreFetchBuffer } from '../engine/buffer'
import type { TaskExecution } from '../engine/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExecution(overrides: Partial<TaskExecution> = {}): TaskExecution {
  return {
    id: `exec-${Math.random().toString(36).slice(2)}`,
    taskId: 'task-1',
    userId: 'user-1',
    scheduledAt: Date.now(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreFetchBuffer - 基本操作', () => {
  let buffer: PreFetchBuffer

  beforeEach(() => {
    buffer = new PreFetchBuffer(5)
  })

  it('初始状态应该为空', () => {
    expect(buffer.size).toBe(0)
    expect(buffer.isEmpty).toBe(true)
    expect(buffer.isFull).toBe(false)
  })

  it('peek 空缓冲应该返回 null', () => {
    expect(buffer.peek()).toBeNull()
  })

  it('pop 空缓冲应该返回 null', () => {
    expect(buffer.pop()).toBeNull()
  })

  it('推入元素后 size 应该增加', () => {
    const exec = makeExecution({ scheduledAt: 1000 })
    buffer.push(exec)

    expect(buffer.size).toBe(1)
    expect(buffer.isEmpty).toBe(false)
  })

  it('peek 应该返回堆顶元素（scheduledAt 最早的）', () => {
    const exec1 = makeExecution({ taskId: 'task-1', scheduledAt: 2000 })
    const exec2 = makeExecution({ taskId: 'task-2', scheduledAt: 1000 })
    const exec3 = makeExecution({ taskId: 'task-3', scheduledAt: 3000 })

    buffer.push(exec1)
    buffer.push(exec2)
    buffer.push(exec3)

    expect(buffer.peek()!.taskId).toBe('task-2') // 最早的
  })

  it('pop 应该返回并移除堆顶元素', () => {
    const exec1 = makeExecution({ taskId: 'task-1', scheduledAt: 2000 })
    const exec2 = makeExecution({ taskId: 'task-2', scheduledAt: 1000 })

    buffer.push(exec1)
    buffer.push(exec2)

    const popped = buffer.pop()
    expect(popped!.taskId).toBe('task-2')
    expect(buffer.size).toBe(1)
    expect(buffer.peek()!.taskId).toBe('task-1')
  })

  it('toArray 应该返回按 scheduledAt 排序的数组', () => {
    const exec1 = makeExecution({ taskId: 'task-1', scheduledAt: 3000 })
    const exec2 = makeExecution({ taskId: 'task-2', scheduledAt: 1000 })
    const exec3 = makeExecution({ taskId: 'task-3', scheduledAt: 2000 })

    buffer.push(exec1)
    buffer.push(exec2)
    buffer.push(exec3)

    const arr = buffer.toArray()
    expect(arr.map(e => e.taskId)).toEqual(['task-2', 'task-3', 'task-1'])
  })

  it('clear 应该清空缓冲', () => {
    buffer.push(makeExecution({ taskId: 'task-1', scheduledAt: 1000 }))
    buffer.push(makeExecution({ taskId: 'task-2', scheduledAt: 2000 }))

    buffer.clear()

    expect(buffer.size).toBe(0)
    expect(buffer.isEmpty).toBe(true)
  })
})

describe('PreFetchBuffer - 去重逻辑', () => {
  let buffer: PreFetchBuffer

  beforeEach(() => {
    buffer = new PreFetchBuffer(5)
  })

  it('同一 Task 保留 scheduledAt 更早的 Execution', () => {
    const exec1 = makeExecution({ taskId: 'task-1', scheduledAt: 2000 })
    const exec2 = makeExecution({ taskId: 'task-1', scheduledAt: 1000 })

    buffer.push(exec1)
    const result = buffer.push(exec2)

    // 新元素更早，应该替换
    expect(result).toBe(true)
    expect(buffer.size).toBe(1)
    expect(buffer.peek()!.scheduledAt).toBe(1000)
  })

  it('同一 Task 新元素更晚时应该被拒绝', () => {
    const exec1 = makeExecution({ taskId: 'task-1', scheduledAt: 1000 })
    const exec2 = makeExecution({ taskId: 'task-1', scheduledAt: 2000 })

    buffer.push(exec1)
    const result = buffer.push(exec2)

    expect(result).toBe(false)
    expect(buffer.size).toBe(1)
    expect(buffer.peek()!.scheduledAt).toBe(1000)
  })

  it('hasTask 应该正确反映 Task 是否在缓冲中', () => {
    const exec = makeExecution({ taskId: 'task-1', scheduledAt: 1000 })
    buffer.push(exec)

    expect(buffer.hasTask('task-1')).toBe(true)
    expect(buffer.hasTask('task-2')).toBe(false)
  })

  it('pop 后 hasTask 应该返回 false', () => {
    const exec = makeExecution({ taskId: 'task-1', scheduledAt: 1000 })
    buffer.push(exec)
    buffer.pop()

    expect(buffer.hasTask('task-1')).toBe(false)
  })
})

describe('PreFetchBuffer - 容量限制', () => {
  it('缓冲满时 push 应该返回 false', () => {
    const buffer = new PreFetchBuffer(2)

    buffer.push(makeExecution({ taskId: 'task-1', scheduledAt: 1000 }))
    buffer.push(makeExecution({ taskId: 'task-2', scheduledAt: 2000 }))

    expect(buffer.isFull).toBe(true)

    // 缓冲已满，新元素更晚，应该被拒绝
    const result = buffer.push(makeExecution({ taskId: 'task-3', scheduledAt: 3000 }))
    expect(result).toBe(false)
    expect(buffer.size).toBe(2)
  })

  it('removeByTask 应该移除指定 Task 的 Execution', () => {
    const buffer = new PreFetchBuffer(5)

    buffer.push(makeExecution({ taskId: 'task-1', scheduledAt: 1000 }))
    buffer.push(makeExecution({ taskId: 'task-2', scheduledAt: 2000 }))

    const removed = buffer.removeByTask('task-1')
    expect(removed).toBe(true)
    expect(buffer.size).toBe(1)
    expect(buffer.hasTask('task-1')).toBe(false)
    expect(buffer.hasTask('task-2')).toBe(true)
  })

  it('removeByTask 不存在的 Task 应该返回 false', () => {
    const buffer = new PreFetchBuffer(5)
    buffer.push(makeExecution({ taskId: 'task-1', scheduledAt: 1000 }))

    const removed = buffer.removeByTask('non-existent')
    expect(removed).toBe(false)
    expect(buffer.size).toBe(1)
  })

  it('pushBatch 应该批量推入并返回成功数量', () => {
    const buffer = new PreFetchBuffer(5)

    const executions = [
      makeExecution({ taskId: 'task-1', scheduledAt: 1000 }),
      makeExecution({ taskId: 'task-2', scheduledAt: 2000 }),
      makeExecution({ taskId: 'task-3', scheduledAt: 3000 }),
    ]

    const count = buffer.pushBatch(executions)
    expect(count).toBe(3)
    expect(buffer.size).toBe(3)
  })
})

describe('PreFetchBuffer - 堆操作正确性', () => {
  it('大量元素时堆顶应该保持最小值', () => {
    const buffer = new PreFetchBuffer(100)
    const timestamps = [500, 100, 300, 200, 400, 50, 150, 250, 350, 450]

    for (let i = 0; i < timestamps.length; i++) {
      buffer.push(makeExecution({ taskId: `task-${i}`, scheduledAt: timestamps[i] }))
    }

    expect(buffer.peek()!.scheduledAt).toBe(50)
    expect(buffer.size).toBe(10)
  })

  it('pop 顺序应该按 scheduledAt 升序', () => {
    const buffer = new PreFetchBuffer(10)
    const timestamps = [500, 100, 300, 200, 400]

    for (let i = 0; i < timestamps.length; i++) {
      buffer.push(makeExecution({ taskId: `task-${i}`, scheduledAt: timestamps[i] }))
    }

    const result: number[] = []
    while (buffer.size > 0) {
      result.push(buffer.pop()!.scheduledAt)
    }

    expect(result).toEqual([100, 200, 300, 400, 500])
  })
})
