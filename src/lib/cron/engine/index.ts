/**
 * 定时任务引擎 - 模块导出
 *
 * 新架构的统一导出入口。
 */

// 类型导出
export type {
  Task,
  TaskExecution,
  ExecutionStatus,
  ScheduleType,
  ScheduleConfig,
  MissedPolicy,
  EngineConfig,
  EngineStatus,
} from './types'

// 核心类导出
export { PreFetchBuffer } from './buffer'
export { CronEngine, getCronEngine } from './scheduler'

// 处理器函数导出
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
} from './processor'

// 恢复函数导出
export { recover, fillBuffer } from './recovery'
export type { RecoveryResult } from './recovery'
