/**
 * 定时任务命令处理单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handleCronCommand } from '../commands'

// Mock dependencies
vi.mock('../store', () => ({
  getUserTasks: vi.fn(),
  getTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  getTaskLogs: vi.fn(),
}))

vi.mock('../parser', () => ({
  cronToReadable: vi.fn(),
}))

vi.mock('../engine', () => ({
  getCronEngine: vi.fn(() => ({
    unregisterTask: vi.fn(),
    registerTask: vi.fn(),
  })),
}))

vi.mock('../engine/processor', () => ({
  createExecution: vi.fn(),
  computeNextExecutionTime: vi.fn(),
}))

describe('handleCronCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('help', () => {
    it('应该显示帮助信息', async () => {
      const result = await handleCronCommand('123456', [])
      expect(result).toContain('定时任务命令帮助')
      expect(result).toContain('/cron list')
      expect(result).toContain('/cron delete')
    })

    it('应该显示帮助信息对于 help 子命令', async () => {
      const result = await handleCronCommand('123456', ['help'])
      expect(result).toContain('定时任务命令帮助')
    })
  })

  describe('list', () => {
    it('应该显示空列表', async () => {
      const { getUserTasks } = await import('../store')
      vi.mocked(getUserTasks).mockReturnValue([])

      const result = await handleCronCommand('123456', ['list'])
      expect(result).toContain('你还没有定时任务')
    })

    it('应该显示任务列表', async () => {
      const { getUserTasks } = await import('../store')
      const { cronToReadable } = await import('../parser')

      vi.mocked(getUserTasks).mockReturnValue([
        {
          id: 'test-id-1',
          userId: '123456',
          name: '每日早安',
          scheduleRaw: '0 9 * * *',
          scheduleType: 'cron',
          scheduleCron: '0 9 * * *',
          prompt: '早安问候',
          enabled: true,
          runCount: 5,
          silent: false,
          retryCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'test-id-2',
          userId: '123456',
          name: '喝水提醒',
          scheduleRaw: 'every 1h',
          scheduleType: 'every',
          scheduleInterval: 3600,
          prompt: '提醒喝水',
          enabled: false,
          runCount: 10,
          silent: false,
          retryCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ] as any)

      vi.mocked(cronToReadable).mockReturnValue('每天 09:00')

      const result = await handleCronCommand('123456', ['list'])
      expect(result).toContain('你的定时任务列表 (2/10)')
      expect(result).toContain('每日早安')
      expect(result).toContain('喝水提醒')
      expect(result).toContain('已执行：5次')
      expect(result).toContain('已执行：10次')
    })
  })

  describe('delete', () => {
    it('应该提示缺少任务 ID', async () => {
      const result = await handleCronCommand('123456', ['delete'])
      expect(result).toContain('请指定任务 ID')
    })

    it('应该提示任务不存在', async () => {
      const { getTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue(null)

      const result = await handleCronCommand('123456', ['delete', 'abc123'])
      expect(result).toContain('任务不存在')
    })

    it('应该检查权限', async () => {
      const { getTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '789012', // 不同的用户
        name: '测试任务',
      } as any)

      const result = await handleCronCommand('123456', ['delete', 'abc123'])
      expect(result).toContain('无权操作')
    })

    it('应该删除任务', async () => {
      const { getTask, deleteTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
      } as any)

      const result = await handleCronCommand('123456', ['delete', 'abc123'])
      expect(result).toContain('已删除任务「测试任务」')
      expect(deleteTask).toHaveBeenCalledWith('abc123')
    })
  })

  describe('pause', () => {
    it('应该提示缺少任务 ID', async () => {
      const result = await handleCronCommand('123456', ['pause'])
      expect(result).toContain('请指定任务 ID')
    })

    it('应该暂停任务', async () => {
      const { getTask, updateTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
        enabled: true,
      } as any)

      const result = await handleCronCommand('123456', ['pause', 'abc123'])
      expect(result).toContain('已暂停任务「测试任务」')
      expect(updateTask).toHaveBeenCalledWith('abc123', { enabled: false })
    })

    it('应该提示已经是暂停状态', async () => {
      const { getTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
        enabled: false,
      } as any)

      const result = await handleCronCommand('123456', ['pause', 'abc123'])
      expect(result).toContain('已经是暂停状态')
    })
  })

  describe('resume', () => {
    it('应该提示缺少任务 ID', async () => {
      const result = await handleCronCommand('123456', ['resume'])
      expect(result).toContain('请指定任务 ID')
    })

    it('应该恢复任务', async () => {
      const { getTask, updateTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
        enabled: false,
      } as any)

      const result = await handleCronCommand('123456', ['resume', 'abc123'])
      expect(result).toContain('已恢复任务「测试任务」')
      expect(updateTask).toHaveBeenCalledWith('abc123', { enabled: true })
    })

    it('应该提示已经是启用状态', async () => {
      const { getTask } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
        enabled: true,
      } as any)

      const result = await handleCronCommand('123456', ['resume', 'abc123'])
      expect(result).toContain('已经是启用状态')
    })
  })

  describe('run', () => {
    it('应该提示缺少任务 ID', async () => {
      const result = await handleCronCommand('123456', ['run'])
      expect(result).toContain('请指定任务 ID')
    })

    it('应该触发任务执行', async () => {
      const { getTask } = await import('../store')
      const { createExecution, computeNextExecutionTime } = await import('../engine/processor')

      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
        scheduleType: 'cron',
        scheduleCron: '0 9 * * *',
        prompt: '测试提示词',
        outputFormat: 'text',
      } as any)
      vi.mocked(computeNextExecutionTime).mockReturnValue(Date.now() + 1000)

      const result = await handleCronCommand('123456', ['run', 'abc123'])
      expect(result).toContain('已触发任务「测试任务」执行')
      expect(createExecution).toHaveBeenCalled()
    })

    it('应该处理执行失败', async () => {
      const { getTask } = await import('../store')

      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
        scheduleType: 'invalid',
      } as any)

      const result = await handleCronCommand('123456', ['run', 'abc123'])
      // 无效类型不会创建 Execution，但不会抛出错误
      expect(result).toContain('已触发任务')
    })
  })

  describe('logs', () => {
    it('应该提示缺少任务 ID', async () => {
      const result = await handleCronCommand('123456', ['logs'])
      expect(result).toContain('请指定任务 ID')
    })

    it('应该显示空日志', async () => {
      const { getTask, getTaskLogs } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
      } as any)
      vi.mocked(getTaskLogs).mockReturnValue([])

      const result = await handleCronCommand('123456', ['logs', 'abc123'])
      expect(result).toContain('暂无执行日志')
    })

    it('应该显示执行日志', async () => {
      const { getTask, getTaskLogs } = await import('../store')
      vi.mocked(getTask).mockReturnValue({
        id: 'test-id',
        userId: '123456',
        name: '测试任务',
      } as any)
      vi.mocked(getTaskLogs).mockReturnValue([
        {
          id: 1,
          taskId: 'test-id',
          userId: '123456',
          status: 'success',
          result: '测试结果',
          duration: 1000,
          attempts: 1,
          executedAt: Date.now(),
        },
        {
          id: 2,
          taskId: 'test-id',
          userId: '123456',
          status: 'failed',
          error: '测试错误',
          duration: 2000,
          attempts: 2,
          executedAt: Date.now(),
        },
      ] as any)

      const result = await handleCronCommand('123456', ['logs', 'abc123'])
      expect(result).toContain('执行日志')
      expect(result).toContain('✅')
      expect(result).toContain('❌')
      expect(result).toContain('测试结果')
      expect(result).toContain('测试错误')
    })
  })

  describe('unknown command', () => {
    it('应该提示未知命令', async () => {
      const result = await handleCronCommand('123456', ['unknown'])
      expect(result).toContain('未知命令')
      expect(result).toContain('定时任务命令帮助')
    })
  })
})
