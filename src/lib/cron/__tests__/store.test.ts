/**
 * 定时任务存储层单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock db module before importing store
const { mockExec, mockPrepare, mockRun, mockGet, mockAll } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockPrepare: vi.fn(),
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockAll: vi.fn(),
}))

vi.mock('../../db', () => ({
  db: {
    exec: mockExec,
    prepare: mockPrepare,
  },
}))

// Import store after mocking
import {
  initCronTables,
  createTask,
  getTask,
  getUserTasks,
  updateTask,
  deleteTask,
  findDueTasks,
  updateTaskRunInfo,
  getUserTaskCount,
  addTaskLog,
  getTaskLogs,
} from '../store'
import type { CreateTaskParams } from '../types'

describe('Cron Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock prepare to return an object with run/get/all methods
    mockPrepare.mockReturnValue({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    })
  })

  describe('initCronTables', () => {
    it('应该初始化数据库表', () => {
      initCronTables()
      expect(mockExec).toHaveBeenCalled()
      expect(mockExec.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS cron_tasks')
      expect(mockExec.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS cron_logs')
    })
  })

  describe('createTask', () => {
    it('应该创建定时任务', () => {
      const params: CreateTaskParams = {
        userId: '123456',
        name: '测试任务',
        schedule: '0 9 * * *',
        prompt: '测试提示词',
      }

      // Mock getTask to return the created task
      mockGet.mockReturnValue({
        id: 'test-id',
        user_id: '123456',
        name: '测试任务',
        description: null,
        schedule_raw: '0 9 * * *',
        schedule_type: 'cron',
        schedule_cron: null,
        schedule_interval: null,
        schedule_at: null,
        end_time: null,
        prompt: '测试提示词',
        tools: null,
        output_format: 'text',
        enabled: 1,
        next_run_at: null,
        last_run_at: null,
        last_run_status: null,
        last_run_error: null,
        run_count: 0,
        silent: 0,
        retry_count: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const task = createTask(params)

      expect(task.id).toBeDefined()
      expect(task.userId).toBe('123456')
      expect(task.name).toBe('测试任务')
      expect(task.scheduleRaw).toBe('0 9 * * *')
      expect(task.prompt).toBe('测试提示词')
      expect(task.enabled).toBe(true)
      expect(task.runCount).toBe(0)
    })
  })

  describe('getTask', () => {
    it('应该获取任务', () => {
      mockGet.mockReturnValue({
        id: 'test-id',
        user_id: '123456',
        name: '测试任务',
        description: null,
        schedule_raw: '0 9 * * *',
        schedule_type: 'cron',
        schedule_cron: null,
        schedule_interval: null,
        schedule_at: null,
        end_time: null,
        prompt: '测试提示词',
        tools: null,
        output_format: 'text',
        enabled: 1,
        next_run_at: null,
        last_run_at: null,
        last_run_status: null,
        last_run_error: null,
        run_count: 0,
        silent: 0,
        retry_count: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      const task = getTask('test-id')

      expect(task).toBeDefined()
      expect(task!.id).toBe('test-id')
      expect(task!.name).toBe('测试任务')
    })

    it('应该返回 null 对于不存在的任务', () => {
      mockGet.mockReturnValue(undefined)
      const task = getTask('non-existent-id')
      expect(task).toBeNull()
    })
  })

  describe('getUserTasks', () => {
    it('应该获取用户的所有任务', () => {
      mockAll.mockReturnValue([
        {
          id: 'test-id-2',
          user_id: '123456',
          name: '任务2',
          description: null,
          schedule_raw: '0 18 * * *',
          schedule_type: 'cron',
          schedule_cron: null,
          schedule_interval: null,
          schedule_at: null,
          end_time: null,
          prompt: '提示词2',
          tools: null,
          output_format: 'text',
          enabled: 1,
          next_run_at: null,
          last_run_at: null,
          last_run_status: null,
          last_run_error: null,
          run_count: 0,
          silent: 0,
          retry_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: 'test-id-1',
          user_id: '123456',
          name: '任务1',
          description: null,
          schedule_raw: '0 9 * * *',
          schedule_type: 'cron',
          schedule_cron: null,
          schedule_interval: null,
          schedule_at: null,
          end_time: null,
          prompt: '提示词1',
          tools: null,
          output_format: 'text',
          enabled: 1,
          next_run_at: null,
          last_run_at: null,
          last_run_status: null,
          last_run_error: null,
          run_count: 0,
          silent: 0,
          retry_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ])

      const tasks = getUserTasks('123456')
      expect(tasks.length).toBe(2)
      expect(tasks[0].name).toBe('任务2')
      expect(tasks[1].name).toBe('任务1')
    })
  })

  describe('updateTask', () => {
    it('应该更新任务', () => {
      updateTask('test-id', {
        name: '更新后的任务',
        enabled: false,
      })

      expect(mockPrepare).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })
  })

  describe('deleteTask', () => {
    it('应该删除任务', () => {
      deleteTask('test-id')

      expect(mockPrepare).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })
  })

  describe('findDueTasks', () => {
    it('应该找到到期任务', () => {
      mockAll.mockReturnValue([
        {
          id: 'test-id',
          user_id: '123456',
          name: '测试任务',
          description: null,
          schedule_raw: '0 9 * * *',
          schedule_type: 'cron',
          schedule_cron: null,
          schedule_interval: null,
          schedule_at: null,
          end_time: null,
          prompt: '测试提示词',
          tools: null,
          output_format: 'text',
          enabled: 1,
          next_run_at: Date.now() - 1000,
          last_run_at: null,
          last_run_status: null,
          last_run_error: null,
          run_count: 0,
          silent: 0,
          retry_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ])

      const dueTasks = findDueTasks(Date.now())
      expect(dueTasks.length).toBe(1)
      expect(dueTasks[0].id).toBe('test-id')
    })
  })

  describe('getUserTaskCount', () => {
    it('应该返回用户任务数量', () => {
      mockGet.mockReturnValue({ count: 5 })

      const count = getUserTaskCount('123456')
      expect(count).toBe(5)
    })
  })

  describe('updateTaskRunInfo', () => {
    it('应该更新任务执行信息', () => {
      updateTaskRunInfo('test-id', 'success')

      expect(mockPrepare).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })
  })

  describe('addTaskLog', () => {
    it('应该添加日志', () => {
      addTaskLog({
        taskId: 'test-id',
        userId: '123456',
        status: 'success',
        result: '测试结果',
        duration: 1000,
        attempts: 1,
        executedAt: Date.now(),
      })

      expect(mockPrepare).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })
  })

  describe('getTaskLogs', () => {
    it('应该获取任务日志', () => {
      mockAll.mockReturnValue([
        {
          id: 1,
          task_id: 'test-id',
          user_id: '123456',
          status: 'success',
          result: '测试结果',
          error: null,
          duration: 1000,
          attempts: 1,
          executed_at: Date.now(),
        },
        {
          id: 2,
          task_id: 'test-id',
          user_id: '123456',
          status: 'failed',
          result: null,
          error: '测试错误',
          duration: 2000,
          attempts: 2,
          executed_at: Date.now(),
        },
      ])

      const logs = getTaskLogs('test-id')
      expect(logs.length).toBe(2)
      expect(logs[0].status).toBe('success')
      expect(logs[1].status).toBe('failed')
    })

    it('应该限制日志数量', () => {
      mockAll.mockReturnValue([
        {
          id: 1,
          task_id: 'test-id',
          user_id: '123456',
          status: 'success',
          result: '测试结果',
          error: null,
          duration: 1000,
          attempts: 1,
          executed_at: Date.now(),
        },
      ])

      const logs = getTaskLogs('test-id', 1)
      expect(logs.length).toBe(1)
    })
  })
})
