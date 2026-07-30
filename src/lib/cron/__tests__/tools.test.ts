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

vi.mock('../engine', () => ({
  getCronEngine: vi.fn(() => ({
    unregisterTask: vi.fn(),
    registerTask: vi.fn(),
  })),
}))

vi.mock('../parser', () => ({
  parseSchedule: vi.fn(),
  calculateNextRun: vi.fn(),
}))

describe('CRON_TOOLS', () => {
  it('应该定义 create_scheduled_task 工具', () => {
    expect(CRON_TOOLS.length).toBe(7)
    expect(CRON_TOOLS[0].function.name).toBe('create_scheduled_task')
  })

  it('应该有正确的参数定义', () => {
    const tool = CRON_TOOLS[0].function
    const params = tool.parameters

    expect(params.required).toContain('name')
    expect(params.required).toContain('schedule_type')
    expect(params.required).toContain('schedule_config')
    expect(params.required).toContain('prompt')

    expect(params.properties.name.type).toBe('string')
    expect(params.properties.schedule_type.type).toBe('string')
    expect(params.properties.schedule_config.type).toBe('object')
    expect(params.properties.prompt.type).toBe('string')
    expect(params.properties.silent.type).toBe('boolean')
    expect(params.properties.outputFormat.type).toBe('string')
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

  it('应该验证必需参数 - 缺少名称', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {}, '123456')
    expect(result).toContain('缺少任务名称')
  })

  it('应该验证必需参数 - 缺少 schedule_type', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
    }, '123456')
    expect(result).toContain('缺少任务类型')
  })

  it('应该验证必需参数 - 缺少 schedule_config', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule_type: 'cron',
    }, '123456')
    expect(result).toContain('缺少调度配置')
  })

  it('应该验证必需参数 - 缺少 prompt', async () => {
    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule_type: 'cron',
      schedule_config: { time: '09:00' },
    }, '123456')
    expect(result).toContain('缺少任务提示词')
  })

  it('应该检查任务数量上限', async () => {
    const { getUserTaskCount } = await import('../store')
    vi.mocked(getUserTaskCount).mockReturnValue(10)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule_type: 'cron',
      schedule_config: { time: '09:00' },
      prompt: '测试提示词',
    }, '123456')

    expect(result).toContain('达到上限')
  })

  it('应该成功创建任务', async () => {
    const { createTask, getUserTaskCount, updateTask } = await import('../store')
    const { getCronEngine } = await import('../engine')
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
      silent: false,
      enabled: true,
      runCount: 0,
      retryCount: 0,
      outputFormat: 'text',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试任务',
      schedule_type: 'cron',
      schedule_config: { time: '09:00' },
      prompt: '测试提示词',
    }, '123456')

    expect(result).toContain('定时任务创建成功')
    expect(result).toContain('测试任务')
    expect(createTask).toHaveBeenCalled()
    expect(updateTask).toHaveBeenCalled()
    expect(getCronEngine).toHaveBeenCalled()
  })
})
