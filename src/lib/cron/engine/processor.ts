/**
 * 定时任务引擎 - 执行处理器
 *
 * 负责：
 * 1. CAS 抢占：pending → running 的原子状态转换
 * 2. 执行 Execution 并更新状态
 * 3. 计算并创建下一条 Execution
 * 4. 处理错过的执行
 */

import type { Task, TaskExecution, MissedPolicy, ExecutionStatus } from './types'
import { db } from '../../db'
import { logger } from '../../logger'

// ============ 数据库行类型 ============

interface TaskExecutionRow {
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
}

// ============ 行 <-> 对象转换 ============

function rowToExecution(row: TaskExecutionRow): TaskExecution {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    status: row.status as ExecutionStatus,
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

// ============ CAS 抢占 ============

/**
 * CAS 抢占执行记录
 *
 * 使用 UPDATE ... WHERE status='pending' 实现原子抢占。
 * 只有状态为 pending 的记录才能被抢占为 running。
 *
 * @param executionId - 执行记录 ID
 * @param now - 当前时间戳（毫秒）
 * @returns 抢占成功返回 true，否则返回 false
 */
export function casRunning(executionId: string, now: number = Date.now()): boolean {
  const result = db.prepare(`
    UPDATE task_executions
    SET status = 'running', started_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(now, executionId)

  return result.changes > 0
}

// ============ 状态更新 ============

/**
 * 更新执行状态为成功
 *
 * @param executionId - 执行记录 ID
 * @param result - 执行结果
 * @param duration - 执行耗时（毫秒）
 */
export function markSuccess(executionId: string, result: string, duration: number): void {
  db.prepare(`
    UPDATE task_executions
    SET status = 'success', result = ?, duration = ?, completed_at = ?
    WHERE id = ?
  `).run(result, duration, Date.now(), executionId)
}

/**
 * 更新执行状态为失败
 *
 * @param executionId - 执行记录 ID
 * @param error - 错误信息
 * @param attempts - 尝试次数
 */
export function markFailed(executionId: string, error: string, attempts: number): void {
  db.prepare(`
    UPDATE task_executions
    SET status = 'failed', error = ?, attempts = ?, completed_at = ?
    WHERE id = ?
  `).run(error, attempts, Date.now(), executionId)
}

/**
 * 更新执行状态为取消
 *
 * @param executionId - 执行记录 ID
 */
export function markCancelled(executionId: string): void {
  db.prepare(`
    UPDATE task_executions
    SET status = 'cancelled', completed_at = ?
    WHERE id = ?
  `).run(Date.now(), executionId)
}

/**
 * 重置执行状态为 pending（用于重试）
 *
 * @param executionId - 执行记录 ID
 * @param scheduledAt - 新的计划执行时间
 */
export function markPending(executionId: string, scheduledAt: number): void {
  db.prepare(`
    UPDATE task_executions
    SET status = 'pending', scheduled_at = ?, started_at = NULL, completed_at = NULL
    WHERE id = ?
  `).run(scheduledAt, executionId)
}

/**
 * 更新执行状态为跳过（重试耗尽）
 *
 * @param executionId - 执行记录 ID
 */
export function markSkipped(executionId: string): void {
  db.prepare(`
    UPDATE task_executions
    SET status = 'skipped', completed_at = ?
    WHERE id = ?
  `).run(Date.now(), executionId)
}

// ============ 执行记录 CRUD ============

/**
 * 创建执行记录
 *
 * @param execution - 执行记录（不含 id 和 createdAt）
 * @returns 创建的执行记录 ID
 */
export function createExecution(execution: Omit<TaskExecution, 'id' | 'createdAt'>): string {
  const id = crypto.randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO task_executions (
      id, task_id, user_id, scheduled_at, started_at, completed_at,
      status, schedule_type, task_name, prompt, tools, output_format,
      result, error, duration, attempts, max_retries, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    execution.taskId,
    execution.userId,
    execution.scheduledAt,
    execution.startedAt || null,
    execution.completedAt || null,
    execution.status,
    execution.scheduleType,
    execution.taskName,
    execution.prompt,
    execution.tools || null,
    execution.outputFormat,
    execution.result || null,
    execution.error || null,
    execution.duration || null,
    execution.attempts,
    execution.maxRetries,
    now,
  )

  return id
}

/**
 * 获取执行记录
 */
export function getExecution(executionId: string): TaskExecution | null {
  const row = db.prepare(
    'SELECT * FROM task_executions WHERE id = ?'
  ).get(executionId) as TaskExecutionRow | undefined

  return row ? rowToExecution(row) : null
}

// ============ 计算下次执行时间 ============

/**
 * 计算任务的下次执行时间
 *
 * @param task - 任务定义
 * @param afterTime - 基于此时间计算（毫秒）
 * @returns 下次执行时间（毫秒），如果无下次则返回 null
 */
export function computeNextExecutionTime(task: Task, afterTime: number): number | null {
  const afterSec = Math.floor(afterTime / 1000)

  switch (task.schedule.type) {
    case 'oneTime':
      // 一次性任务，如果有 at 且未到期则返回
      if (task.schedule.at && task.schedule.at > afterSec) {
        return task.schedule.at * 1000
      }
      return null

    case 'interval':
      if (!task.schedule.interval || task.schedule.interval <= 0) {
        return null
      }
      const nextTime = (afterSec + task.schedule.interval) * 1000
      // 检查截止时间
      if (task.endTime && nextTime > task.endTime) {
        return null
      }
      return nextTime

    case 'cron':
      if (!task.schedule.expression) return null
      // 使用现有 parser 的 calculateNextRun 计算下次执行
      // 注意：calculateNextRun 接受秒级时间戳，返回秒级时间戳
      try {
        const nextSec = calculateNextRunForEngine(task.schedule.expression, afterSec)
        return nextSec * 1000
      } catch {
        return null
      }

    default:
      return null
  }
}

/**
 * 为引擎计算 Cron 表达式的下次执行时间
 *
 * 使用与现有 parser 相同的逻辑，但不依赖 CronTask 结构。
 *
 * @param expression - Cron 表达式（5 字段格式）
 * @param afterSec - 基于此时间计算（秒）
 * @returns 下次执行时间（秒）
 */
function calculateNextRunForEngine(expression: string, afterSec: number): number {
  // 解析 cron 字段
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`无效的 cron 表达式: "${expression}"`)
  }

  const [minuteF, hourF, domF, monthF, dowF] = fields

  // 从 afterSec 开始，逐分钟向后搜索
  let candidate = afterSec + 60 // 至少下一分钟
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
      // 将周日 7 归一化为 0 后检查
      if (dowF.includes('7') && dow === 0) {
        // 7 和 0 都代表周日，匹配
      }
      return candidate
    }

    candidate += 60 // 逐分钟搜索
  }

  throw new Error(`无法计算下次执行时间: "${expression}"`)
}

/**
 * 检查值是否匹配 cron 字段
 */
function matchCronField(field: string, value: number, min: number, max: number): boolean {
  // * 通配符
  if (field === '*') return true

  // 处理逗号分隔的多个值
  const parts = field.split(',')
  for (const part of parts) {
    // */N 格式
    const stepMatch = part.match(/^\*\/(\d+)$/)
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10)
      if ((value - min) % step === 0) return true
      continue
    }

    // N-M 格式
    const rangeMatch = part.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10)
      const end = parseInt(rangeMatch[2], 10)
      if (value >= start && value <= end) return true
      continue
    }

    // 单个数字
    const num = parseInt(part, 10)
    if (!isNaN(num)) {
      // 处理周日 7 → 0
      if (max === 7 && num === 7 && value === 0) return true
      if (num === value) return true
    }
  }

  return false
}

// ============ 创建下一条 Execution ============

/**
 * 计算并创建任务的下一条 Execution
 *
 * @param task - 任务定义
 * @param lastExec - 上一条执行记录（用于计算下次时间）
 * @param maxRetries - 最大重试次数
 * @returns 新创建的 Execution ID，如果无下次则返回 null
 */
export function scheduleNextExecution(
  task: Task,
  lastExec: TaskExecution,
  maxRetries: number = 2
): string | null {
  const nextTime = computeNextExecutionTime(task, lastExec.scheduledAt)
  if (!nextTime) return null

  return createExecution({
    taskId: task.id,
    userId: task.userId,
    scheduledAt: nextTime,
    status: 'pending',
    scheduleType: task.schedule.type,
    taskName: task.name,
    prompt: task.prompt,
    tools: task.tools ? JSON.stringify(task.tools) : undefined,
    outputFormat: task.outputFormat,
    attempts: 0,
    maxRetries,
  })
}

// ============ 处理错过的执行 ============

/**
 * 处理错过的执行
 *
 * 根据策略决定如何处理错过的 pending 执行：
 * - skip: 标记为 skipped，创建新的下次执行
 * - latest: 更新 scheduledAt 为当前时间，保留执行
 * - catchup: 立即执行（更新 scheduledAt 为当前时间）
 *
 * @param exec - 错过的执行记录
 * @param policy - 错过执行策略
 * @param task - 关联的任务定义
 * @returns 处理后的 Execution ID（可能是新的或原记录）
 */
export function handleMissedExecution(
  exec: TaskExecution,
  policy: MissedPolicy,
  task: Task
): string | null {
  const now = Date.now()

  switch (policy) {
    case 'skip': {
      // 标记为跳过
      markSkipped(exec.id)
      // 创建新的下次执行
      return scheduleNextExecution(task, exec)
    }

    case 'latest': {
      // 更新为当前时间，保留执行
      db.prepare(`
        UPDATE task_executions
        SET scheduled_at = ?
        WHERE id = ?
      `).run(now, exec.id)
      return exec.id
    }

    case 'catchup': {
      // 立即执行（更新 scheduledAt 为当前时间）
      db.prepare(`
        UPDATE task_executions
        SET scheduled_at = ?
        WHERE id = ?
      `).run(now, exec.id)
      return exec.id
    }

    default:
      return null
  }
}

// ============ 查询方法 ============

/**
 * 查找所有 pending 且 scheduledAt < now 的执行记录
 */
export function findMissedExecutions(now: number = Date.now()): TaskExecution[] {
  const rows = db.prepare(`
    SELECT * FROM task_executions
    WHERE status = 'pending' AND scheduled_at < ?
    ORDER BY scheduled_at ASC
  `).all(now) as TaskExecutionRow[]

  return rows.map(rowToExecution)
}

/**
 * 查找所有 running 状态的执行记录（用于宕机恢复）
 */
export function findRunningExecutions(): TaskExecution[] {
  const rows = db.prepare(`
    SELECT * FROM task_executions
    WHERE status = 'running'
    ORDER BY started_at ASC
  `).all() as TaskExecutionRow[]

  return rows.map(rowToExecution)
}

/**
 * 查找所有 pending 的执行记录
 */
export function findPendingExecutions(): TaskExecution[] {
  const rows = db.prepare(`
    SELECT * FROM task_executions
    WHERE status = 'pending'
    ORDER BY scheduled_at ASC
  `).all() as TaskExecutionRow[]

  return rows.map(rowToExecution)
}

/**
 * 查找指定 Task 的 pending 执行记录
 */
export function findPendingByTask(taskId: string): TaskExecution | null {
  const row = db.prepare(`
    SELECT * FROM task_executions
    WHERE task_id = ? AND status = 'pending'
    ORDER BY scheduled_at ASC
    LIMIT 1
  `).get(taskId) as TaskExecutionRow | undefined

  return row ? rowToExecution(row) : null
}

/**
 * 删除指定 Task 的所有执行记录
 */
export function deleteExecutionsByTask(taskId: string): void {
  db.prepare('DELETE FROM task_executions WHERE task_id = ?').run(taskId)
}

/**
 * 取消指定 Task 的所有 pending 执行
 */
export function cancelPendingByTask(taskId: string): void {
  db.prepare(`
    UPDATE task_executions
    SET status = 'cancelled', completed_at = ?
    WHERE task_id = ? AND status = 'pending'
  `).run(Date.now(), taskId)
}
