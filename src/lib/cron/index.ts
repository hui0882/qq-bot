/**
 * 定时任务系统 - 主入口
 *
 * Task I: 集成与主入口
 * - 统一导出所有子模块
 * - 提供 initCronSystem() 初始化函数
 * - 负责数据库表初始化和调度器启动
 */

// ============ 类型导出 ============

export * from './types'

// ============ 模块导出 ============

// 调度器
export { scheduler, CronScheduler } from './scheduler'

// 并发队列
export { taskQueue, TaskQueue } from './queue'

// 命令处理
export { handleCronCommand } from './commands'

// AI 工具
export { executeCronToolCall, CRON_TOOLS, CRON_SYSTEM_PROMPT } from './tools'

// 数据库存储
export {
  createTask,
  getTask,
  getUserTasks,
  updateTask,
  deleteTask,
  findDueTasks,
  updateTaskRunInfo,
  updateTaskRunResult,
  incrementRunCount,
  getUserTaskCount,
  addTaskLog,
  getTaskLogs,
  initCronTables,
} from './store'

// 调度解析器
export {
  parseSchedule,
  parseAtFormat,
  parseEveryFormat,
  calculateNextRun,
  cronToReadable,
  isValidCron,
} from './parser'

// 执行器
export { executeTask } from './executor'

// ============ 初始化函数 ============

import { initCronTables } from './store'
import { scheduler } from './scheduler'

/**
 * 初始化定时任务系统
 *
 * 执行顺序：
 * 1. 初始化数据库表（cron_tasks、cron_logs）
 * 2. 启动调度器（开始定时轮询到期任务）
 *
 * 应在应用启动时调用此函数。
 */
export function initCronSystem(): void {
  // 1. 初始化数据库表
  initCronTables()

  // 2. 启动调度器
  scheduler.start()

  console.log('[Cron] 定时任务系统已启动')
}
