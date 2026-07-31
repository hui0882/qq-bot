/**
 * 定时任务工具函数单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Hoisted mocks for createFirstExecution test
const { mockCreateExecution, mockComputeNextExecutionTime } = vi.hoisted(() => ({
  mockCreateExecution: vi.fn(),
  mockComputeNextExecutionTime: vi.fn(),
}))

import { executeCronToolCall, CRON_TOOLS, parsedToScheduleConfig, createFirstExecution } from '../tools'

// Mock dependencies
vi.mock('../store', () => ({
  createTask: vi.fn(),
  getUserTaskCount: vi.fn(),
  updateTask: vi.fn(),
  getUserTasks: vi.fn(),
  getTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskLogs: vi.fn(),
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
  cronToReadable: vi.fn(),
}))

vi.mock('../engine/processor', () => ({
  createExecution: mockCreateExecution,
  computeNextExecutionTime: mockComputeNextExecutionTime,
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

  it('应该支持 oneTime 类型任务创建', async () => {
    const { createTask, getUserTaskCount, updateTask } = await import('../store')
    const { getCronEngine } = await import('../engine')
    const { parseSchedule, calculateNextRun } = await import('../parser')

    vi.mocked(getUserTaskCount).mockReturnValue(0)
    vi.mocked(parseSchedule).mockReturnValue({ type: 'at', at: Math.floor(Date.now() / 1000) + 3600 })
    vi.mocked(calculateNextRun).mockReturnValue(Math.floor(Date.now() / 1000) + 3600)
    vi.mocked(createTask).mockReturnValue({
      id: 'test-id',
      userId: '123456',
      name: '一次性任务',
      scheduleRaw: 'at 2026-08-01T09:00',
      prompt: '执行一次性任务',
      silent: false,
      enabled: true,
      runCount: 0,
      retryCount: 0,
      outputFormat: 'text',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '一次性任务',
      schedule_type: 'oneTime',
      schedule_config: { at: '2026-08-01T09:00' },
      prompt: '执行一次性任务',
    }, '123456')

    expect(result).toContain('定时任务创建成功')
    expect(result).toContain('一次性任务')
  })

  it('应该支持 interval 类型任务创建', async () => {
    const { createTask, getUserTaskCount, updateTask } = await import('../store')
    const { getCronEngine } = await import('../engine')
    const { parseSchedule, calculateNextRun } = await import('../parser')

    vi.mocked(getUserTaskCount).mockReturnValue(0)
    vi.mocked(parseSchedule).mockReturnValue({ type: 'at', at: Math.floor(Date.now() / 1000) + 60 })
    vi.mocked(calculateNextRun).mockReturnValue(Math.floor(Date.now() / 1000) + 60)
    vi.mocked(createTask).mockReturnValue({
      id: 'test-id',
      userId: '123456',
      name: '间隔任务',
      scheduleRaw: 'at 09:00',
      prompt: '执行间隔任务',
      silent: false,
      enabled: true,
      runCount: 0,
      retryCount: 0,
      outputFormat: 'text',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '间隔任务',
      schedule_type: 'interval',
      schedule_config: { first_run: '09:00', interval_value: 30, interval_unit: 'm' },
      prompt: '执行间隔任务',
    }, '123456')

    expect(result).toContain('定时任务创建成功')
    expect(result).toContain('间隔任务')
  })

  it('应该拒绝不支持的 schedule_type', async () => {
    const { getUserTaskCount } = await import('../store')
    vi.mocked(getUserTaskCount).mockReturnValue(0)

    const result = await executeCronToolCall('create_scheduled_task', {
      name: '测试',
      schedule_type: 'unknown_type',
      schedule_config: {},
      prompt: '测试提示词',
    }, '123456')

    expect(result).toContain('不支持的任务类型')
  })

  it('应该处理 list_scheduled_tasks 工具调用', async () => {
    const { getUserTasks } = await import('../store')
    vi.mocked(getUserTasks).mockReturnValue([])

    const result = await executeCronToolCall('list_scheduled_tasks', {}, '123456')
    expect(result).toContain('还没有定时任务')
  })

  it('应该处理 get_scheduled_task_detail 工具调用 - 缺少 task_id', async () => {
    const result = await executeCronToolCall('get_scheduled_task_detail', {}, '123456')
    expect(result).toContain('缺少任务 ID')
  })

  it('应该处理 update_scheduled_task 工具调用 - 缺少 task_id', async () => {
    const result = await executeCronToolCall('update_scheduled_task', {}, '123456')
    expect(result).toContain('缺少任务 ID')
  })

  it('应该处理 delete_scheduled_task 工具调用 - 缺少 task_id', async () => {
    const result = await executeCronToolCall('delete_scheduled_task', {}, '123456')
    expect(result).toContain('缺少任务 ID')
  })

  it('应该处理 pause_scheduled_task 工具调用 - 缺少 task_id', async () => {
    const result = await executeCronToolCall('pause_scheduled_task', {}, '123456')
    expect(result).toContain('缺少任务 ID')
  })

  it('应该处理 resume_scheduled_task 工具调用 - 缺少 task_id', async () => {
    const result = await executeCronToolCall('resume_scheduled_task', {}, '123456')
    expect(result).toContain('缺少任务 ID')
  })
})

describe('parsedToScheduleConfig', () => {
  it('应该将 at 类型映射为 oneTime', () => {
    const result = parsedToScheduleConfig({ type: 'at', at: 1234567890 })
    expect(result.type).toBe('oneTime')
    expect(result.at).toBe(1234567890)
  })

  it('应该将 every 类型映射为 interval', () => {
    const result = parsedToScheduleConfig({ type: 'every', interval: 300 })
    expect(result.type).toBe('interval')
    expect(result.interval).toBe(300)
  })

  it('应该将 cron 类型映射为 cron', () => {
    const result = parsedToScheduleConfig({ type: 'cron', cron: '0 9 * * *' })
    expect(result.type).toBe('cron')
    expect(result.expression).toBe('0 9 * * *')
  })

  it('应该将未知类型默认为 cron', () => {
    const result = parsedToScheduleConfig({ type: 'unknown', cron: '0 9 * * *' })
    expect(result.type).toBe('cron')
  })
})

describe('createFirstExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该创建第一条 Execution 并注册到引擎', async () => {
    const { getCronEngine } = await import('../engine')
    const mockRegisterTask = vi.fn()
    vi.mocked(getCronEngine).mockReturnValue({
      registerTask: mockRegisterTask,
      unregisterTask: vi.fn(),
    } as any)

    mockComputeNextExecutionTime.mockReturnValue(Date.now() + 60000)
    mockCreateExecution.mockReturnValue('exec-id')

    const task = {
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
    } as any

    const parsedSchedule = { type: 'cron', expression: '0 9 * * *' } as any

    createFirstExecution(task, parsedSchedule)

    expect(mockRegisterTask).toHaveBeenCalled()
  })
})
