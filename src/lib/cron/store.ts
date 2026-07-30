/**
 * 定时任务系统 - 数据库存储层
 *
 * 提供 cron_tasks 和 cron_logs 表的 CRUD 操作
 * 使用 better-sqlite3，与现有数据库模块保持一致
 */

import { db } from '../db'
import type { CronTask, CronLog, CreateTaskParams, TaskStatus, OutputFormat, ScheduleType } from './types'

// ============ 数据库行类型（snake_case） ============

interface CronTaskRow {
  id: string
  user_id: string
  name: string
  description: string | null
  schedule_raw: string
  schedule_type: string
  schedule_cron: string | null
  schedule_interval: number | null
  schedule_at: number | null
  end_time: number | null
  prompt: string
  tools: string | null
  output_format: string
  enabled: number
  next_run_at: number | null
  last_run_at: number | null
  last_run_status: string | null
  last_run_error: string | null
  run_count: number
  silent: number
  retry_count: number
  created_at: number
  updated_at: number
}

interface CronLogRow {
  id: number
  task_id: string
  user_id: string
  status: string
  result: string | null
  error: string | null
  duration: number | null
  attempts: number
  executed_at: number
}

// ============ 行 <-> 对象转换 ============

function rowToTask(row: CronTaskRow): CronTask {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || undefined,
    scheduleRaw: row.schedule_raw,
    scheduleType: row.schedule_type as ScheduleType,
    scheduleCron: row.schedule_cron || undefined,
    scheduleInterval: row.schedule_interval || undefined,
    scheduleAt: row.schedule_at || undefined,
    endTime: row.end_time || undefined,
    prompt: row.prompt,
    tools: row.tools ? JSON.parse(row.tools) : undefined,
    outputFormat: (row.output_format as OutputFormat) || 'text',
    enabled: row.enabled === 1,
    nextRunAt: row.next_run_at || undefined,
    lastRunAt: row.last_run_at || undefined,
    lastRunStatus: (row.last_run_status as TaskStatus) || undefined,
    lastRunError: row.last_run_error || undefined,
    runCount: row.run_count,
    silent: row.silent === 1,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToLog(row: CronLogRow): CronLog {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status as TaskStatus,
    result: row.result || undefined,
    error: row.error || undefined,
    duration: row.duration || undefined,
    attempts: row.attempts,
    executedAt: row.executed_at,
  }
}

// ============ 表初始化 ============

/**
 * 初始化 cron_tasks 和 cron_logs 表
 */
export function initCronTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      schedule_raw TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_cron TEXT,
      schedule_interval INTEGER,
      schedule_at INTEGER,
      end_time INTEGER,
      prompt TEXT NOT NULL,
      tools TEXT,
      output_format TEXT DEFAULT 'text',
      enabled INTEGER DEFAULT 1,
      next_run_at INTEGER,
      last_run_at INTEGER,
      last_run_status TEXT,
      last_run_error TEXT,
      run_count INTEGER DEFAULT 0,
      silent INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      duration INTEGER,
      attempts INTEGER DEFAULT 1,
      executed_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES cron_tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cron_tasks_user_id ON cron_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_cron_tasks_next_run ON cron_tasks(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_cron_tasks_enabled ON cron_tasks(enabled);
    CREATE INDEX IF NOT EXISTS idx_cron_logs_task_id ON cron_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_cron_logs_user_id ON cron_logs(user_id);
  `)

  console.log('[Cron Store] Tables initialized')

  // 初始化 task_executions 表（新架构）
  initTaskExecutionsTable()
}

// ============ CRUD 操作 ============

/**
 * 创建定时任务
 */
export function createTask(params: CreateTaskParams): CronTask {
  const now = Date.now()
  const id = crypto.randomUUID()

  db.prepare(`
    INSERT INTO cron_tasks (
      id, user_id, name, description, schedule_raw, schedule_type,
      prompt, tools, output_format, silent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.userId,
    params.name,
    params.description || null,
    params.schedule,
    'cron', // 默认类型，后续由 parser 解析后更新
    params.prompt,
    params.tools ? JSON.stringify(params.tools) : null,
    params.outputFormat || 'text',
    params.silent ? 1 : 0,
    now,
    now
  )

  const task = getTask(id)
  if (!task) throw new Error('Failed to create task')
  return task
}

/**
 * 获取单个任务
 */
export function getTask(id: string): CronTask | null {
  const row = db.prepare(
    'SELECT * FROM cron_tasks WHERE id = ?'
  ).get(id) as CronTaskRow | undefined

  return row ? rowToTask(row) : null
}

/**
 * 获取用户所有任务
 */
export function getUserTasks(userId: string): CronTask[] {
  const rows = db.prepare(
    'SELECT * FROM cron_tasks WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as CronTaskRow[]

  return rows.map(rowToTask)
}

/**
 * 获取所有任务（不限用户）
 */
export function getAllTasks(): CronTask[] {
  const rows = db.prepare(
    'SELECT * FROM cron_tasks ORDER BY created_at DESC'
  ).all() as CronTaskRow[]

  return rows.map(rowToTask)
}

/**
 * 更新任务
 */
export function updateTask(id: string, updates: Partial<CronTask>): void {
  const fields: string[] = []
  const values: (string | number | null)[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description || null)
  }
  if (updates.scheduleRaw !== undefined) {
    fields.push('schedule_raw = ?')
    values.push(updates.scheduleRaw)
  }
  if (updates.scheduleType !== undefined) {
    fields.push('schedule_type = ?')
    values.push(updates.scheduleType)
  }
  if (updates.scheduleCron !== undefined) {
    fields.push('schedule_cron = ?')
    values.push(updates.scheduleCron || null)
  }
  if (updates.scheduleInterval !== undefined) {
    fields.push('schedule_interval = ?')
    values.push(updates.scheduleInterval || null)
  }
  if (updates.scheduleAt !== undefined) {
    fields.push('schedule_at = ?')
    values.push(updates.scheduleAt || null)
  }
  if (updates.prompt !== undefined) {
    fields.push('prompt = ?')
    values.push(updates.prompt)
  }
  if (updates.tools !== undefined) {
    fields.push('tools = ?')
    values.push(updates.tools ? JSON.stringify(updates.tools) : null)
  }
  if (updates.outputFormat !== undefined) {
    fields.push('output_format = ?')
    values.push(updates.outputFormat)
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?')
    values.push(updates.enabled ? 1 : 0)
  }
  if (updates.endTime !== undefined) {
    fields.push('end_time = ?')
    values.push(updates.endTime || null)
  }
  if (updates.nextRunAt !== undefined) {
    fields.push('next_run_at = ?')
    values.push(updates.nextRunAt || null)
  }
  if (updates.lastRunStatus !== undefined) {
    fields.push('last_run_status = ?')
    values.push(updates.lastRunStatus || null)
  }
  if (updates.lastRunError !== undefined) {
    fields.push('last_run_error = ?')
    values.push(updates.lastRunError || null)
  }
  if (updates.runCount !== undefined) {
    fields.push('run_count = ?')
    values.push(updates.runCount)
  }
  if (updates.silent !== undefined) {
    fields.push('silent = ?')
    values.push(updates.silent ? 1 : 0)
  }

  if (fields.length === 0) return

  fields.push('updated_at = ?')
  values.push(Date.now())
  values.push(id)

  db.prepare(
    `UPDATE cron_tasks SET ${fields.join(', ')} WHERE id = ?`
  ).run(...values)
}

/**
 * 删除任务（同时删除关联日志）
 */
export function deleteTask(id: string): void {
  db.prepare('DELETE FROM cron_logs WHERE task_id = ?').run(id)
  db.prepare('DELETE FROM cron_tasks WHERE id = ?').run(id)
}

// ============ 调度相关查询 ============

/**
 * 查找到期任务（enabled=1 且 next_run_at <= now）
 */
export function findDueTasks(now: number): CronTask[] {
  const rows = db.prepare(
    'SELECT * FROM cron_tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?'
  ).all(now) as CronTaskRow[]

  return rows.map(rowToTask)
}

/**
 * 更新任务执行结果（不修改 runCount，由调用方在适当时机递增）
 *
 * @param id     - 任务 ID
 * @param status - 执行状态 ('success' | 'failed' | 'timeout')
 * @param error  - 错误信息（可选）
 */
export function updateTaskRunResult(id: string, status: string, error?: string): void {
  const now = Date.now()

  db.prepare(`
    UPDATE cron_tasks SET
      last_run_at = ?,
      last_run_status = ?,
      last_run_error = ?,
      updated_at = ?
    WHERE id = ?
  `).run(now, status, error || null, now, id)
}

/**
 * 递增任务执行计数
 *
 * @param id - 任务 ID
 */
export function incrementRunCount(id: string): void {
  db.prepare(`
    UPDATE cron_tasks SET run_count = run_count + 1 WHERE id = ?
  `).run(id)
}

/**
 * @deprecated 使用 updateTaskRunResult + incrementRunCount 代替
 */
export function updateTaskRunInfo(id: string, status: string, error?: string): void {
  updateTaskRunResult(id, status, error)
  incrementRunCount(id)
}

// ============ 任务数量检查 ============

/**
 * 获取用户任务数量
 */
export function getUserTaskCount(userId: string): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM cron_tasks WHERE user_id = ?'
  ).get(userId) as { count: number }

  return result.count
}

// ============ 日志操作 ============

/**
 * 添加执行日志
 */
export function addTaskLog(log: Omit<CronLog, 'id'>): void {
  db.prepare(`
    INSERT INTO cron_logs (task_id, user_id, status, result, error, duration, attempts, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log.taskId,
    log.userId,
    log.status,
    log.result || null,
    log.error || null,
    log.duration || null,
    log.attempts,
    log.executedAt
  )
}

/**
 * 获取任务日志
 */
export function getTaskLogs(taskId: string, limit: number = 20): CronLog[] {
  const rows = db.prepare(
    'SELECT * FROM cron_logs WHERE task_id = ? ORDER BY executed_at DESC LIMIT ?'
  ).all(taskId, limit) as CronLogRow[]

  return rows.map(rowToLog)
}

// ============ task_executions 表（新架构） ============

/**
 * 初始化 task_executions 表（新架构执行记录表）
 */
export function initTaskExecutionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_executions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      schedule_type TEXT NOT NULL,
      task_name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      tools TEXT,
      output_format TEXT DEFAULT 'text',
      result TEXT,
      error TEXT,
      duration INTEGER,
      attempts INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES cron_tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
    CREATE INDEX IF NOT EXISTS idx_task_executions_scheduled_at ON task_executions(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_task_executions_task_status ON task_executions(task_id, status);
  `)

  console.log('[Cron Store] task_executions table initialized')
}
