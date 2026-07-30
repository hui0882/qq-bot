/**
 * 定时任务解析器单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseSchedule,
  parseAtFormat,
  parseEveryFormat,
  isValidCron,
  calculateNextRun,
  cronToReadable,
} from '../parser'
import type { CronTask } from '../types'

describe('parseSchedule', () => {
  it('应该解析 at 格式', () => {
    const result = parseSchedule('at 15:30')
    expect(result.type).toBe('at')
    expect(result.at).toBeDefined()
    expect(result.at!).toBeGreaterThan(0)
  })

  it('应该解析 every 格式', () => {
    const result = parseSchedule('every 5m')
    expect(result.type).toBe('every')
    expect(result.interval).toBe(300)
  })

  it('应该解析 cron 格式', () => {
    const result = parseSchedule('0 9 * * *')
    expect(result.type).toBe('cron')
    expect(result.cron).toBe('0 9 * * *')
  })

  it('应该抛出错误对于无效输入', () => {
    expect(() => parseSchedule('')).toThrow('调度规则不能为空')
    expect(() => parseSchedule('invalid')).toThrow('无法识别的调度规则')
  })
})

describe('parseAtFormat', () => {
  it('应该解析 HH:MM 格式', () => {
    const result = parseAtFormat('15:30')
    expect(result.type).toBe('at')
    expect(result.at).toBeDefined()
    expect(result.at!).toBeGreaterThan(0)
  })

  it('应该解析 ISO 格式', () => {
    const result = parseAtFormat('2026-07-04T09:00:00')
    expect(result.type).toBe('at')
    expect(result.at).toBeDefined()
    expect(result.at!).toBeGreaterThan(0)
  })

  it('应该抛出错误对于无效格式', () => {
    expect(() => parseAtFormat('')).toThrow('at 格式需要指定时间')
    expect(() => parseAtFormat('25:00')).toThrow('无效的时间')
    expect(() => parseAtFormat('12:60')).toThrow('无效的时间')
  })

  it('对于已过时间应该自动调整到明天', () => {
    const now = new Date()
    const pastHour = now.getHours() - 1
    const timeStr = `${pastHour}:${String(now.getMinutes()).padStart(2, '0')}`

    const result = parseAtFormat(timeStr)
    const targetDate = new Date(result.at! * 1000)

    // 应该是明天
    expect(targetDate.getDate()).toBe(now.getDate() + 1)
  })
})

describe('parseEveryFormat', () => {
  it('应该解析分钟', () => {
    const result = parseEveryFormat('5m')
    expect(result.type).toBe('every')
    expect(result.interval).toBe(300)
  })

  it('应该解析小时', () => {
    const result = parseEveryFormat('2h')
    expect(result.type).toBe('every')
    expect(result.interval).toBe(7200)
  })

  it('应该解析天', () => {
    const result = parseEveryFormat('1d')
    expect(result.type).toBe('every')
    expect(result.interval).toBe(86400)
  })

  it('应该抛出错误对于无效格式', () => {
    expect(() => parseEveryFormat('')).toThrow('every 格式需要指定间隔')
    expect(() => parseEveryFormat('5x')).toThrow('无效的 every 间隔格式')
    expect(() => parseEveryFormat('0m')).toThrow('间隔值必须大于 0')
  })
})

describe('isValidCron', () => {
  it('应该验证有效的 cron 表达式', () => {
    expect(isValidCron('0 9 * * *')).toBe(true)
    expect(isValidCron('*/15 * * * *')).toBe(true)
    expect(isValidCron('0 9 * * 1-5')).toBe(true)
    expect(isValidCron('0 0 1 * *')).toBe(true)
  })

  it('应该拒绝无效的 cron 表达式', () => {
    expect(isValidCron('')).toBe(false)
    expect(isValidCron('invalid')).toBe(false)
    expect(isValidCron('0 9 * *')).toBe(false) // 只有 4 位
    expect(isValidCron('0 9 * * * *')).toBe(false) // 6 位
  })
})

describe('calculateNextRun', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应该计算 at 类型的下次执行时间', () => {
    const task: CronTask = {
      id: 'test',
      userId: 'user',
      name: 'Test',
      scheduleRaw: 'at 15:30',
      scheduleType: 'at',
      scheduleAt: Math.floor(new Date('2026-07-03T15:30:00').getTime() / 1000),
      prompt: 'test',
      outputFormat: 'text',
      enabled: true,
      runCount: 0,
      silent: false,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const nextRun = calculateNextRun(task)
    const nextRunDate = new Date(nextRun * 1000)

    expect(nextRunDate.getHours()).toBe(15)
    expect(nextRunDate.getMinutes()).toBe(30)
  })

  it('应该计算 every 类型的下次执行时间', () => {
    const task: CronTask = {
      id: 'test',
      userId: 'user',
      name: 'Test',
      scheduleRaw: 'every 5m',
      scheduleType: 'every',
      scheduleInterval: 300,
      prompt: 'test',
      outputFormat: 'text',
      enabled: true,
      runCount: 0,
      silent: false,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const nextRun = calculateNextRun(task)
    const now = Math.floor(Date.now() / 1000)

    // 应该在 5 分钟内
    expect(nextRun).toBeGreaterThan(now)
    expect(nextRun).toBeLessThanOrEqual(now + 300)
  })

  it('应该计算 cron 类型的下次执行时间', () => {
    const task: CronTask = {
      id: 'test',
      userId: 'user',
      name: 'Test',
      scheduleRaw: '0 9 * * *',
      scheduleType: 'cron',
      scheduleCron: '0 9 * * *',
      prompt: 'test',
      outputFormat: 'text',
      enabled: true,
      runCount: 0,
      silent: false,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const nextRun = calculateNextRun(task)
    const nextRunDate = new Date(nextRun * 1000)

    // 应该是今天或明天的 9:00
    expect(nextRunDate.getHours()).toBe(9)
    expect(nextRunDate.getMinutes()).toBe(0)
  })
})

describe('cronToReadable', () => {
  it('应该转换每天定时任务', () => {
    expect(cronToReadable('0 9 * * *')).toBe('每天 09:00')
    expect(cronToReadable('0 18 * * *')).toBe('每天 18:00')
  })

  it('应该转换每周定时任务', () => {
    expect(cronToReadable('0 9 * * 1')).toBe('每周一 09:00')
    expect(cronToReadable('0 9 * * 5')).toBe('每周五 09:00')
  })

  it('应该转换每小时任务', () => {
    expect(cronToReadable('0 */1 * * *')).toBe('每 1 小时')
  })

  it('应该转换每 N 分钟任务', () => {
    expect(cronToReadable('*/15 * * * *')).toBe('每 15 分钟')
  })
})
