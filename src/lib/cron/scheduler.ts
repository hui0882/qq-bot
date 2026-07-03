/**
 * 定时任务系统 - 调度器
 *
 * 负责定时轮询到期任务，提交到并发队列执行，并更新任务的执行时间。
 * 使用 setInterval 实现定时间隔，支持手动触发和热加载。
 */

import type { CronTask, SchedulerConfig } from './types'
import { findDueTasks, updateTask, updateTaskRunInfo } from './store'
import { calculateNextRun } from './parser'
import { taskQueue } from './queue'

/** 调度器默认配置 */
const DEFAULT_CONFIG: Required<SchedulerConfig> = {
  tickInterval: 60_000, // 60 秒
  maxConcurrent: 3,
  executionTimeout: 60,
  maxRetries: 2,
}

/**
 * Cron 调度器
 *
 * 定期扫描到期任务并提交到队列执行。保证：
 * - 单个任务异常不会导致调度器崩溃
 * - 支持优雅关闭（停止时清理定时器）
 * - 支持热加载（refresh 重新加载任务状态）
 */
export class CronScheduler {
  /** 定时器句柄 */
  private timer: ReturnType<typeof setInterval> | null = null

  /** 调度器配置 */
  private config: Required<SchedulerConfig>

  /** 是否正在运行 */
  private running = false

  /** 是否正在 tick 中（防止重叠） */
  private ticking = false

  constructor(config?: SchedulerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 启动调度器
   *
   * 立即执行一次 tick，然后按配置的间隔周期性执行。
   * 重复调用不会创建多个定时器。
   */
  start(): void {
    if (this.running) {
      console.log('[CronScheduler] 调度器已在运行中，忽略重复启动')
      return
    }

    this.running = true
    console.log(
      `[CronScheduler] 启动调度器，Tick 间隔: ${this.config.tickInterval / 1000}s`
    )

    // 立即执行一次 tick
    this.tick().catch((err) => {
      console.error('[CronScheduler] 首次 tick 异常:', err)
    })

    // 设置周期性 tick
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[CronScheduler] tick 异常:', err)
      })
    }, this.config.tickInterval)
  }

  /**
   * 停止调度器
   *
   * 清除定时器，等待当前 tick 完成后标记为已停止。
   */
  stop(): void {
    if (!this.running) {
      console.log('[CronScheduler] 调度器未在运行，忽略停止操作')
      return
    }

    this.running = false

    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }

    console.log('[CronScheduler] 调度器已停止')
  }

  /**
   * 单次 Tick
   *
   * 1. 获取当前时间戳
   * 2. 查询到期任务
   * 3. 对每个到期任务：提交队列、计算下次执行时间、更新任务数据
   *
   * 单个任务的异常不会影响其他任务的处理。
   */
  private async tick(): Promise<void> {
    if (this.ticking) {
      console.log('[CronScheduler] 上一次 tick 尚未完成，跳过')
      return
    }

    this.ticking = true

    try {
      const now = Date.now()
      const dueTasks = findDueTasks(now)

      if (dueTasks.length === 0) {
        return
      }

      console.log(`[CronScheduler] 发现 ${dueTasks.length} 个到期任务`)

      for (const task of dueTasks) {
        try {
          await this.processTask(task, now)
        } catch (err) {
          console.error(
            `[CronScheduler] 处理任务 ${task.id}（${task.name}）失败:`,
            err
          )
        }
      }
    } catch (err) {
      console.error('[CronScheduler] tick 整体异常:', err)
    } finally {
      this.ticking = false
    }
  }

  /**
   * 处理单个到期任务
   *
   * 提交到队列执行，然后计算并更新下次执行时间。
   * 对于不重复的一次性任务（at 类型且 repeat=false），执行后自动禁用。
   *
   * @param task - 到期的定时任务
   * @param now  - 当前时间戳（毫秒）
   */
  private async processTask(task: CronTask, now: number): Promise<void> {
    // 提交到并发队列执行
    await taskQueue.enqueue(task)

    // 更新 lastRunAt（当前时间戳，毫秒）和 runCount
    const updatedTask: CronTask = {
      ...task,
      lastRunAt: now,
      runCount: task.runCount + 1,
    }
    updateTask(task.id, { lastRunAt: now })

    // 计算下次执行时间（使用更新后的任务数据）
    try {
      const nextRunSeconds = calculateNextRun(updatedTask)

      // calculateNextRun 返回秒级时间戳，转为毫秒后更新
      const nextRunAtMs = nextRunSeconds * 1000

      // 如果是不重复的一次性任务（at 类型且 repeat=false），执行后禁用
      if (task.scheduleType === 'at' && !task.repeat) {
        updateTask(task.id, {
          nextRunAt: undefined,
          enabled: false,
        })
        console.log(
          `[CronScheduler] 一次性任务 ${task.id}（${task.name}）已执行，自动禁用`
        )
      } else {
        updateTask(task.id, { nextRunAt: nextRunAtMs })
        console.log(
          `[CronScheduler] 任务 ${task.id}（${task.name}）下次执行时间: ${new Date(nextRunAtMs).toISOString()}`
        )
      }
    } catch (err) {
      console.error(
        `[CronScheduler] 计算任务 ${task.id}（${task.name}）下次执行时间失败:`,
        err
      )
    }
  }

  /**
   * 刷新任务（热加载）
   *
   * 强制执行一次 tick，从数据库重新读取到期任务。
   * 适用于任务被外部修改后需要立即生效的场景。
   */
  refresh(): void {
    console.log('[CronScheduler] 刷新任务，强制执行 tick')
    this.tick().catch((err) => {
      console.error('[CronScheduler] 刷新 tick 异常:', err)
    })
  }

  /**
   * 手动触发指定任务
   *
   * 跳过到期检查，直接执行任务。
   * 执行后同样计算并更新下次执行时间。
   *
   * @param taskId - 要触发的任务 ID
   */
  async triggerTask(taskId: string): Promise<void> {
    const { getTask } = await import('./store')
    const { executeTask } = await import('./executor')
    const task = getTask(taskId)

    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    console.log(`[CronScheduler] 手动触发任务 ${task.id}（${task.name}）`)

    const now = Date.now()

    try {
      // 直接执行任务（不经过队列）
      const result = await executeTask(task)

      // 计算下次执行时间
      const updatedTask: CronTask = {
        ...task,
        lastRunAt: now,
        runCount: task.runCount + 1,
      }
      const nextRunSeconds = calculateNextRun(updatedTask)
      const nextRunAtMs = nextRunSeconds * 1000

      // 对于不重复的一次性任务，手动触发后也自动禁用
      if (task.scheduleType === 'at' && !task.repeat) {
        updateTask(task.id, {
          nextRunAt: undefined,
          enabled: false,
        })
      } else {
        updateTask(task.id, { nextRunAt: nextRunAtMs })
      }

      if (result.status === 'failed') {
        throw new Error(result.error || '任务执行失败')
      }
    } catch (err) {
      throw err
    }
  }

  /**
   * 获取调度器运行状态
   */
  isRunning(): boolean {
    return this.running
  }
}

/**
 * 调度器单例实例
 *
 * 整个定时任务系统共用此实例。
 * 使用默认配置：60 秒 tick 间隔。
 */
export const scheduler = new CronScheduler()
