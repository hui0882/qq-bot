/**
 * 定时任务工具函数单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { executeCronToolCall, CRON_TOOLS } from '../tools'

// Mock dependencies
vi.mock('../store', () => ({
  createTask: vi.fn(),
  getUserTaskCount: vi.fn(),
  updateTask: vi.fn(),
}))

vi.mock('../scheduler', () => ({
  scheduler: {
    refresh: vi.fn(),
  },
}))

vi.mock('../parser', () => ({
  parseSchedule: vi.fn(),
  calculateNextRun: vi.fn(),
}))

describe('CRON_TOOLS', () => {
  it('应该定义 create_scheduled_task 工具', () => {
    expect(CRON_TOOLS.length).toBe(1)
    expect(CRON_TOOLS[0].function.name).toBe('create_scheduled_task')
  })

  it('应该有正确的参数定义', () => {
    const tool = CRON_TOOLS[0].function
    const params = tool.parameters

    expect(params.required).toContain('name')
    expect(params.required).toContain('schedule')
    expect(params.required).toContain('prompt')
    expect(params.required).toContain('repeat')

    expect(params.properties.name.type).toBe('string')
    expect(params.properties.schedule.type).toBe('string')
    expect(params.properties.prompt.type).toBe('string')
    expect(params.properties.repeat.type).toBe('boolean')
  })
})

describe('executeCronToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该处理未知工具', async () => {
    const result = await executeCronToolCall('unknown_tool', {}, '123456')
    expect(result).toContain('未知的定时任务工具')
  })

  it('应该验证必需参数', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {}, '123456')
    expect(result).toContain('缺少任务名称')
  })

  it('应该验证 schedule 参数', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
    }, '123456')
    expect(result).toContain('缺少调度规则')
  })

  it('应该验证 prompt 参数', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule: '0 9 * * *',
    }, '123456')
    expect(result).toContain('缺少任务提示词')
  })

  it('应该验证 repeat 参数', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule: '0 9 * * *',
      prompt: '测试提示词',
    }, '123456')
    expect(result).toContain('缺少 repeat 参数')
  })

  it('应该检查任务数量上限', async () => {
    const { getUserTaskCount } = await import('../store')
    vi.mocked(getUserTaskCount).mockReturnValue(10)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule: '0 9 * * *',
      prompt: '测试提示词',
      repeat: true,
    }, '123456')

    expect(result).toContain('达到上限')
  })

  it('应该成功创建任务', async () => {
    const { createTask, getUserTaskCount, updateTask } = await import('../store')
    const { scheduler } = await import('../scheduler')
    const { parseSchedule, calculateNextRun } = await import('../parser')

    vi.mocked(getUserTaskCount).mockReturnValue(0)
    vi.mocked(parseSchedule).mockReturnValue({ type: 'cron', cron: '0 9 * * *' })
    vi.mocked(calculateNextRun).mockReturnValue(Math.floor(Date.now() / 1000) + 3600)
    vi.mocked(createTask).mockReturnValue({
      id: 'test-id',
      userId: '123456',
      name: '测试任务',
      scheduleRaw: '0 9 * * *',
      prompt: '测试提示词',
      repeat: true,
      silent: false,
      enabled: true,
      runCount: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试任务',
      schedule: '0 9 * * *',
      prompt: '测试提示词',
      repeat: true,
    }, '123456')

    expect(result).toContain('定时任务创建成功')
    expect(result).toContain('测试任务')
    expect(createTask).toHaveBeenCalled()
    expect(updateTask).toHaveBeenCalled()
    expect(scheduler.refresh).toHaveBeenCalled()
  })
})
