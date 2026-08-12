/**
 * 定时任务引擎 - 宕机恢复
 *
 * 启动时执行恢复流程：
 * 1. 扫描 status='running' 的记录 → 标记为 failed
 * 2. 扫描 status='pending' 且 scheduledAt < now 的记录 → 按策略处理
 * 3. 对所有 enabled 任务重新计算下一次执行，填充缓冲
 */

import type { Task, TaskExecution, MissedPolicy } from './types'
import {
  findRunningExecutions,
  findMissedExecutions,
  markFailed,
  handleMissedExecution,
  createExecution,
  findPendingByTask,
} from './processor'
import { PreFetchBuffer } from './buffer'
import { normalizeScheduleAtSeconds } from './units'
import { db } from '../../db'
import { logger } from '../../logger'

// ============ 恢复结果 ============

export interface RecoveryResult {
  /** 已恢复的 running 记录数（标记为 failed） */
  recoveredRunning: number
  /** 已处理的错过执行数 */
  handledMissed: number
  /** 已跳过的执行数 */
  skipped: number
  /** 已填充到缓冲的 Execution 数 */
  buffered: number
  /** 错误信息 */
  errors: string[]
}

// ============ 恢复函数 ============

/**
 * 执行宕机恢复
 *
 * 恢复流程：
 * 1. 将所有 running 状态的记录标记为 failed（宕机导致未完成的执行）
 * 2. 将所有 pending 且已过期的记录按策略处理
 * 3. 构建预取缓冲，填充各任务的下次执行
 *
 * @param buffer - 预取缓冲实例
 * @param enabledTasks - 所有启用的任务列表
 * @param missedPolicy - 错过执行策略
 * @returns 恢复结果统计
 */
export function recover(
  buffer: PreFetchBuffer,
  enabledTasks: Task[],
  missedPolicy: MissedPolicy = 'skip'
): RecoveryResult {
  const result: RecoveryResult = {
    recoveredRunning: 0,
    handledMissed: 0,
    skipped: 0,
    buffered: 0,
    errors: [],
  }

  const now = Date.now()

  logger.logSystem('CronEngine: recovery_start', {
    enabledTasksCount: enabledTasks.length,
    missedPolicy,
  })

  // Step 1: 恢复 running 状态的记录
  try {
    const runningExecs = findRunningExecutions()
    for (const exec of runningExecs) {
      markFailed(exec.id, '引擎宕机导致执行中断', exec.attempts)
      result.recoveredRunning++

      logger.logSystem('CronEngine: recovered_running', {
        executionId: exec.id,
        taskId: exec.taskId,
        taskName: exec.taskName,
      })
    }
  } catch (err) {
    const msg = `恢复 running 记录失败: ${err instanceof Error ? err.message : String(err)}`
    result.errors.push(msg)
    logger.logSystem(msg)
  }

  // Step 2: 处理错过的 pending 记录
  try {
    const missedExecs = findMissedExecutions(now)
    for (const exec of missedExecs) {
      // 查找关联的任务
      const task = enabledTasks.find(t => t.id === exec.taskId)
      if (!task) {
        // 任务不存在或已禁用，直接取消
        db.prepare(`
          UPDATE task_executions SET status = 'cancelled' WHERE id = ?
        `).run(exec.id)
        continue
      }

      const newExecId = handleMissedExecution(exec, missedPolicy, task)
      if (newExecId) {
        result.handledMissed++
      } else {
        result.skipped++
      }

      logger.logSystem('CronEngine: handled_missed', {
        executionId: exec.id,
        taskId: exec.taskId,
        policy: missedPolicy,
        newExecutionId: newExecId,
      })
    }
  } catch (err) {
    const msg = `处理错过的执行失败: ${err instanceof Error ? err.message : String(err)}`
    result.errors.push(msg)
    logger.logSystem(msg)
  }

  // Step 3: 填充预取缓冲
  try {
    result.buffered = fillBuffer(buffer, enabledTasks)
  } catch (err) {
    const msg = `填充缓冲失败: ${err instanceof Error ? err.message : String(err)}`
    result.errors.push(msg)
    logger.logSystem(msg)
  }

  logger.logSystem('CronEngine: recovery_complete', {
    recoveredRunning: result.recoveredRunning,
    handledMissed: result.handledMissed,
    buffered: result.buffered,
    errors: result.errors.length,
  })

  return result
}

// ============ 缓冲填充 ============

/**
 * 填充预取缓冲
 *
 * 对每个 enabled 任务：
 * 1. 检查是否已有 pending 的 Execution
 * 2. 如果没有，创建一条新的 Execution
 * 3. 推入缓冲
 *
 * @param buffer - 预取缓冲
 * @param tasks - 启用的任务列表
 * @returns 填充的 Execution 数量
 */
export function fillBuffer(buffer: PreFetchBuffer, tasks: Task[]): number {
  let count = 0

  for (const task of tasks) {
    if (buffer.isFull) break
    if (buffer.hasTask(task.id)) continue

    if (pushTaskToBuffer(buffer, task)) {
      count++
    }
  }

  return count
}

/**
 * 为单个任务填充缓冲（注册/更新/手动触发时调用）
 *
 * 与 fillBuffer 的单任务版：
 * 1. 任务已启用且缓冲未满、该任务不在缓冲中
 * 2. 查找该任务最早的 pending Execution，存在则直接入堆
 * 3. 不存在则按调度配置计算下次执行时间并创建 Execution 再入堆
 *
 * @param buffer - 预取缓冲
 * @param task - 任务定义
 * @returns 是否成功入堆
 */
export function pushTaskToBuffer(buffer: PreFetchBuffer, task: Task): boolean {
  if (!task.enabled) return false
  if (buffer.isFull || buffer.hasTask(task.id)) return false

  // 查找是否已有 pending 的 Execution
  let pending = findPendingByTask(task.id)

  if (!pending) {
    // 创建新的 Execution
    const nextTime = computeNextTimeForRecovery(task, Date.now())
    if (!nextTime) return false

    const execId = createExecutionFromTask(task, nextTime)
    pending = getExecutionById(execId)
  }

  return !!pending && buffer.push(pending)
}

/**
 * 计算任务的下次执行时间（恢复用）
 */
function computeNextTimeForRecovery(task: Task, now: number): number | null {
  const nowSec = Math.floor(now / 1000)

  switch (task.schedule.type) {
    case 'oneTime': {
      // 任务定义的 at 为秒级（DB schedule_at 一律秒），统一转毫秒与 now（毫秒）比较
      const atSec = normalizeScheduleAtSeconds(task.schedule.at)
      if (atSec && atSec * 1000 > now) {
        return atSec * 1000
      }
      return null
    }

    case 'interval':
      if (!task.schedule.interval || task.schedule.interval <= 0) return null
      return (nowSec + task.schedule.interval) * 1000

    case 'cron':
      if (!task.schedule.expression) return null
      try {
        const nextSec = calculateNextCronTime(task.schedule.expression, nowSec)
        return nextSec * 1000
      } catch {
        return null
      }

    default:
      return null
  }
}

/**
 * 创建任务的执行记录
 */
function createExecutionFromTask(task: Task, scheduledAt: number): string {
  const id = crypto.randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO task_executions (
      id, task_id, user_id, scheduled_at, status,
      schedule_type, task_name, prompt, tools, output_format,
      attempts, max_retries, created_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 0, 2, ?)
  `).run(
    id,
    task.id,
    task.userId,
    scheduledAt,
    task.schedule.type,
    task.name,
    task.prompt,
    task.tools ? JSON.stringify(task.tools) : null,
    task.outputFormat,
    now,
  )

  return id
}

/**
 * 通过 ID 获取执行记录
 */
function getExecutionById(executionId: string): TaskExecution | null {
  const row = db.prepare(
    'SELECT * FROM task_executions WHERE id = ?'
  ).get(executionId) as {
    id: string
    task_id: string
    user_id: string
    scheduled_at: number
    started_at: number | null
    completed_at: number | null
    status: string
    schedule_type: string
    task_name: string
    prompt: string
    tools: string | null
    output_format: string
    result: string | null
    error: string | null
    duration: number | null
    attempts: number
    max_retries: number
    created_at: number
  } | undefined

  if (!row) return null

  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    status: row.status as TaskExecution['status'],
    scheduleType: row.schedule_type as TaskExecution['scheduleType'],
    taskName: row.task_name,
    prompt: row.prompt,
    tools: row.tools || undefined,
    outputFormat: row.output_format as 'text' | 'voice',
    result: row.result || undefined,
    error: row.error || undefined,
    duration: row.duration || undefined,
    attempts: row.attempts,
    maxRetries: row.max_retries,
    createdAt: row.created_at,
  }
}

// ============ Cron 计算辅助 ============

/**
 * 计算 Cron 表达式的下次执行时间
 */
function calculateNextCronTime(expression: string, afterSec: number): number {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`无效的 cron 表达式: "${expression}"`)
  }

  const [minuteF, hourF, domF, monthF, dowF] = fields

  let candidate = afterSec + 60
  const maxSearch = afterSec + 366 * 86400 // 最多搜索一年

  while (candidate < maxSearch) {
    const date = new Date(candidate * 1000)
    const minute = date.getMinutes()
    const hour = date.getHours()
    const dom = date.getDate()
    const month = date.getMonth() + 1
    const dow = date.getDay()

    if (
      matchCronField(minuteF, minute, 0, 59) &&
      matchCronField(hourF, hour, 0, 23) &&
      matchCronField(domF, dom, 1, 31) &&
      matchCronField(monthF, month, 1, 12) &&
      matchCronField(dowF, dow, 0, 7)
    ) {
      return candidate
    }

    candidate += 60
  }

  throw new Error(`无法计算下次执行时间: "${expression}"`)
}

/**
 * 检查值是否匹配 cron 字段
 */
function matchCronField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true

  const parts = field.split(',')
  for (const part of parts) {
    const stepMatch = part.match(/^\*\/(\d+)$/)
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10)
      if ((value - min) % step === 0) return true
      continue
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10)
      const end = parseInt(rangeMatch[2], 10)
      if (value >= start && value <= end) return true
      continue
    }

    const num = parseInt(part, 10)
    if (!isNaN(num)) {
      if (max === 7 && num === 7 && value === 0) return true
      if (num === value) return true
    }
  }

  return false
}
