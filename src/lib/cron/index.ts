/**
 * 定时任务系统 - 主入口
 *
 * Task I: 集成与主入口
 * - 统一导出所有子模块
 * - 提供 initCronSystem() 初始化函数
 * - 负责数据库表初始化和引擎启动
 */

// ============ 类型导出 ============

export * from './types'

// ============ 模块导出 ============

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

// ============ 初始化函数 ============

import { initCronTables } from './store'
import { getCronEngine } from './engine'

/**
 * 初始化定时任务系统
 *
 * 执行顺序：
 * 1. 初始化数据库表（cron_tasks、cron_logs）
 * 2. 启动引擎
 *
 * 应在应用启动时调用此函数。
 */
export function initCronSystem(): void {
  // 1. 初始化数据库表
  initCronTables()

  // 2. 启动引擎
  const engine = getCronEngine()
  engine.start()

  console.log('[Cron] 定时任务系统已启动')
}

// ============ 新架构引擎导出 ============

export {
  // 类型
  type Task,
  type TaskExecution,
  type ExecutionStatus,
  type ScheduleType,
  type ScheduleConfig,
  type MissedPolicy,
  type EngineConfig,
  type EngineStatus,
} from './engine'

// 核心类
export { PreFetchBuffer } from './engine/buffer'
export { CronEngine, getCronEngine } from './engine/scheduler'

// 处理器
export {
  casRunning,
  markSuccess,
  markFailed,
  markCancelled,
  markPending,
  markSkipped,
  createExecution,
  getExecution,
  computeNextExecutionTime,
  scheduleNextExecution,
  handleMissedExecution,
  findMissedExecutions,
  findRunningExecutions,
  findPendingExecutions,
  findPendingByTask,
  deleteExecutionsByTask,
  cancelPendingByTask,
} from './engine/processor'

// 恢复
export { recover, fillBuffer } from './engine/recovery'
export type { RecoveryResult } from './engine/recovery'

// 工具函数
export { createFirstExecution, parsedToScheduleConfig } from './tools'

// 存储扩展
export { initTaskExecutionsTable } from './store'
