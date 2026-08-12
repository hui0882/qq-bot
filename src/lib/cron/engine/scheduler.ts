/**
 * 定时任务引擎 - 调度引擎
 *
 * 新架构的主引擎类，整合预取缓冲、CAS 抢占、执行处理、宕机恢复。
 *
 * 主循环：
 * 1. peek 查看堆顶 Execution
 * 2. 如果 scheduledAt > now，sleep 等待
 * 3. CAS 抢占 pending → running
 * 4. 执行 Execution
 * 5. 执行完成后，计算该 Task 的下一条 Execution 入堆补充
 */

import type { Task, TaskExecution, EngineConfig, EngineStatus, MissedPolicy } from './types'
import { PreFetchBuffer } from './buffer'
import {
  casRunning,
  markSuccess,
  markFailed,
  scheduleNextExecution,
  getExecution,
  findPendingByTask,
} from './processor'
import { recover, fillBuffer, pushTaskToBuffer } from './recovery'
import { normalizeScheduleAtSeconds } from './units'
import { executeTask as executeLegacyTask } from './executor'
import { db } from '../../db'
import { logger } from '../../logger'

// ============ 默认配置 ============

const DEFAULT_CONFIG: Required<EngineConfig> = {
  bufferSize: 15,
  tickInterval: 10_000,
  maxConcurrent: 3,
  executionTimeout: 60_000,
  maxRetries: 2,
  missedPolicy: 'skip',
}

// ============ 引擎类 ============

/**
 * Cron 调度引擎
 *
 * 状态机驱动 + 预取缓冲 + 宕机恢复
 */
export class CronEngine {
  /** 引擎配置 */
  private config: Required<EngineConfig>

  /** 预取缓冲 */
  private buffer: PreFetchBuffer

  /** 是否正在运行 */
  private running = false

  /** 主循环定时器 */
  private timer: ReturnType<typeof setInterval> | null = null

  /** 正在执行的 Promise 集合 */
  private executing: Map<string, Promise<void>> = new Map()

  /** 已注册的任务（内存缓存） */
  private tasks: Map<string, Task> = new Map()

  /** 上次日志记录的等待 scheduledAt（避免 tick 等待分支刷屏） */
  private lastLoggedWaitScheduledAt: number | null = null

  constructor(config?: EngineConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.buffer = new PreFetchBuffer(this.config.bufferSize)
  }

  // ============ 启动/停止 ============

  /**
   * 启动引擎
   *
   * 1. 从数据库加载所有 enabled 任务
   * 2. 执行宕机恢复
   * 3. 填充预取缓冲
   * 4. 启动主循环
   */
  start(): void {
    if (this.running) {
      logger.logSystem('CronEngine: already_running')
      return
    }

    this.running = true
    logger.logSystem('CronEngine: starting', {
      bufferSize: this.config.bufferSize,
      tickInterval: this.config.tickInterval,
      maxConcurrent: this.config.maxConcurrent,
    })

    try {
      // 1. 加载任务
      this.loadTasks()

      // 2. 宕机恢复
      const enabledTasks = this.getEnabledTasks()
      const recoveryResult = recover(this.buffer, enabledTasks, this.config.missedPolicy)

      logger.logSystem('CronEngine: recovery_done', {
        recoveredRunning: recoveryResult.recoveredRunning,
        handledMissed: recoveryResult.handledMissed,
        buffered: recoveryResult.buffered,
      })

      // 3. 启动主循环
      this.timer = setInterval(() => {
        this.tick().catch((err) => {
          logger.logSystem('CronEngine: tick_error', { error: String(err) })
        })
      }, this.config.tickInterval)

      logger.logSystem('CronEngine: started')
    } catch (err) {
      // 启动失败：复位 running，允许后续重试，避免引擎永久瘫痪
      this.running = false
      this.timer = null
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.logSystem('CronEngine: start_failed', { error: errorMessage })
      throw err
    }
  }

  /**
   * 停止引擎
   */
  stop(): void {
    if (!this.running) return

    this.running = false

    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }

    logger.logSystem('CronEngine: stopped')
  }

  // ============ 主循环 ============

  /**
   * 单次 Tick
   *
   * 1. 查看堆顶 Execution
   * 2. 如果已到执行时间，CAS 抢占并执行
   * 3. 执行完成后补充缓冲
   */
  private async tick(): Promise<void> {
    if (!this.running) return

    const now = Date.now()
    const exec = this.buffer.peek()

    if (!exec) {
      // 缓冲为空，尝试填充
      this.refillBuffer()
      return
    }

    // 如果还没到执行时间，等待
    if (exec.scheduledAt > now) {
      // 未到期：静默等待下个 tick。
      // 仅在等待目标变化时打一条日志（避免每 10s 刷屏），
      // 便于排查"任务永不触发"类问题（如 16 位时间戳毒化）。
      if (this.lastLoggedWaitScheduledAt !== exec.scheduledAt) {
        this.lastLoggedWaitScheduledAt = exec.scheduledAt
        logger.logSystem('CronEngine: tick_waiting', {
          executionId: exec.id,
          taskId: exec.taskId,
          taskName: exec.taskName,
          scheduledAt: exec.scheduledAt,
          now,
          waitMs: exec.scheduledAt - now,
        })
      }
      return
    }

    // 弹出堆顶
    const nextExec = this.buffer.pop()
    if (!nextExec) return

    // CAS 抢占
    if (!casRunning(nextExec.id, now)) {
      // 抢占失败（可能已被其他进程抢占），跳过
      logger.logSystem('CronEngine: cas_failed', { executionId: nextExec.id })
      return
    }

    // 检查并发限制
    if (this.executing.size >= this.config.maxConcurrent) {
      // 并发已满，重新入堆（延迟执行）
      this.buffer.push(nextExec)
      logger.logSystem('CronEngine: concurrency_limit', {
        executionId: nextExec.id,
        running: this.executing.size,
      })
      return
    }

    // 异步执行
    const execPromise = this.executeExecution(nextExec)
    this.executing.set(nextExec.id, execPromise)

    execPromise.finally(() => {
      this.executing.delete(nextExec.id)
      // 执行完成后补充缓冲
      this.refillAfterExecution(nextExec)
    })
  }

  // ============ 执行逻辑 ============

  /**
   * 执行 Execution
   *
   * 调用 executor 执行 TaskExecution，然后更新执行状态。
   *
   * @param exec - 要执行的 Execution
   */
  private async executeExecution(exec: TaskExecution): Promise<void> {
    const startTime = Date.now()

    try {
      // 直接执行 TaskExecution
      const result = await executeLegacyTask(exec)

      const duration = Date.now() - startTime

      if (result.status === 'success') {
        markSuccess(exec.id, result.result || '', duration)
        logger.logSystem('CronEngine: execution_success', {
          executionId: exec.id,
          taskId: exec.taskId,
          taskName: exec.taskName,
          duration,
        })
      } else {
        markFailed(exec.id, result.error || '未知错误', result.attempts)
        logger.logSystem('CronEngine: execution_failed', {
          executionId: exec.id,
          taskId: exec.taskId,
          taskName: exec.taskName,
          error: result.error,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      markFailed(exec.id, errorMessage, 1)
      logger.logSystem('CronEngine: execution_error', {
        executionId: exec.id,
        taskId: exec.taskId,
        error: errorMessage,
      })
    }
  }

  // ============ 缓冲管理 ============

  /**
   * 执行完成后补充缓冲
   *
   * 计算该 Task 的下一条 Execution 并推入缓冲。
   */
  private refillAfterExecution(exec: TaskExecution): void {
    const task = this.tasks.get(exec.taskId)
    if (!task || !task.enabled) return

    scheduleNextExecution(task, exec, this.config.maxRetries)
  }

  /**
   * 补充缓冲
   *
   * 当缓冲未满时，为没有 pending Execution 的任务创建新的 Execution。
   */
  private refillBuffer(): void {
    if (this.buffer.isFull) return

    const enabledTasks = this.getEnabledTasks()
    const count = fillBuffer(this.buffer, enabledTasks)

    logger.logSystem('CronEngine: buffer_refilled', {
      count,
      buffered: this.buffer.size,
    })
  }

  // ============ 任务管理 ============

  /**
   * 从数据库加载任务
   */
  private loadTasks(): void {
    const rows = db.prepare(`
      SELECT * FROM cron_tasks WHERE enabled = 1
    `).all() as Array<{
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
      created_at: number
      updated_at: number
    }>

    this.tasks.clear()
    for (const row of rows) {
      const task = this.rowToTask(row)
      this.tasks.set(task.id, task)
    }

    logger.logSystem('CronEngine: tasks_loaded', { count: this.tasks.size })
  }

  /**
   * 数据库行转 Task
   */
  private rowToTask(row: {
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
    created_at: number
    updated_at: number
  }): Task {
    // 构建 ScheduleConfig
    let schedule: import('./types').ScheduleConfig

    switch (row.schedule_type) {
      case 'at':
        schedule = {
          type: 'oneTime',
          at: normalizeScheduleAtSeconds(row.schedule_at),
        }
        break
      case 'every':
        schedule = {
          type: 'interval',
          interval: row.schedule_interval || undefined,
        }
        break
      case 'cron':
      default:
        schedule = {
          type: 'cron',
          expression: row.schedule_cron || row.schedule_raw,
        }
        break
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || undefined,
      schedule,
      scheduleRaw: row.schedule_raw,
      prompt: row.prompt,
      tools: row.tools ? JSON.parse(row.tools) : undefined,
      outputFormat: (row.output_format as 'text' | 'voice') || 'text',
      enabled: row.enabled === 1,
      endTime: row.end_time || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * 获取所有启用的任务
   */
  private getEnabledTasks(): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.enabled)
  }

  /**
   * 注册任务（创建或更新时调用）
   *
   * 1. 更新内存任务缓存
   * 2. 重新注册（更新）时先移除缓冲中旧的 Execution，避免取消后的旧记录残留
   * 3. 注册后立即把该任务最早的 pending Execution 推入缓冲，
   *    使新任务无需等待下个 tick 的 refill 即可生效
   */
  registerTask(task: Task): void {
    this.tasks.set(task.id, task)

    this.buffer.removeByTask(task.id)

    if (this.running) {
      pushTaskToBuffer(this.buffer, task)
    }
  }

  /**
   * 将任务最早的 pending Execution 推入缓冲（手动触发场景）
   *
   * 用于"立即执行"等路径：执行记录已创建，但不需要更新任务定义，
   * 仅把已有 pending 记录放入调度队列即可。
   *
   * @param taskId - 任务 ID
   * @returns 是否成功入队
   */
  enqueuePendingExecution(taskId: string): boolean {
    if (!this.running || this.buffer.isFull || this.buffer.hasTask(taskId)) {
      return false
    }

    const pending = findPendingByTask(taskId)
    if (!pending) return false

    return this.buffer.push(pending)
  }

  /**
   * 注销任务（删除或禁用时调用）
   */
  unregisterTask(taskId: string): void {
    this.tasks.delete(taskId)
    this.buffer.removeByTask(taskId)
  }

  // ============ 状态查询 ============

  /**
   * 获取引擎运行状态
   */
  getStatus(): EngineStatus {
    return {
      running: this.running,
      buffered: this.buffer.size,
      runningCount: this.executing.size,
      totalTasks: this.tasks.size,
      enabledTasks: this.getEnabledTasks().length,
    }
  }

  /**
   * 获取缓冲内容（用于调试）
   */
  getBufferedExecutions(): TaskExecution[] {
    return this.buffer.toArray()
  }
}

// ============ 单例 ============

const globalForEngine = globalThis as unknown as { __napcatCronEngine?: CronEngine }

/**
 * 获取引擎单例
 *
 * 实例挂在 globalThis 上，确保多个 bundle（server/RSC/API route）共享同一实例，
 * 避免各 bundle 各自创建引擎导致重复执行/缓冲不一致。
 */
export function getCronEngine(config?: EngineConfig): CronEngine {
  if (!globalForEngine.__napcatCronEngine) {
    globalForEngine.__napcatCronEngine = new CronEngine(config)
  }
  return globalForEngine.__napcatCronEngine
}
