/**
 * 定时任务引擎 - 类型定义
 *
 * 新架构的核心类型定义，包括 Task（任务定义）、TaskExecution（执行记录）、
 * 状态机类型、调度配置等。
 *
 * 架构设计：
 * - Task: 不变的配置信息（与 cron_tasks 表对应，向后兼容）
 * - TaskExecution: 每次调度生成一条，有自己的状态机
 * - 预取缓冲: 固定大小的最小堆，按 scheduledAt 排序
 * - CAS 并发控制: pending → running 用 WHERE status='pending' 原子抢占
 */

// ============ 状态机类型 ============

/**
 * 执行记录状态
 *
 * 状态转换：
 * - pending → running: CAS 抢占成功
 * - pending → cancelled: 任务被禁用或删除
 * - running → success: 执行成功
 * - running → failed: 执行失败（可重试）
 * - running → cancelled: 手动取消
 * - failed → pending: 重试（重新入队）
 * - failed → skipped: 重试耗尽
 */
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'skipped'

/**
 * 调度类型
 * - oneTime: 一次性执行
 * - interval: 间隔执行
 * - cron: Cron 表达式执行
 */
export type ScheduleType = 'oneTime' | 'interval' | 'cron'

/**
 * 调度配置
 *
 * 统一描述任务的调度规则：
 * - oneTime: 在指定时间执行一次
 * - interval: 每隔固定秒数执行
 * - cron: 按 cron 表达式执行
 */
export interface ScheduleConfig {
  /** 调度类型 */
  type: ScheduleType
  /** 执行时间戳（秒），oneTime 时使用 */
  at?: number
  /** 间隔秒数，interval 时使用 */
  interval?: number
  /** Cron 表达式，cron 时使用 */
  expression?: string
}

/**
 * 错过执行策略
 *
 * 当系统恢复时发现错过的执行，如何处理：
 * - skip: 跳过，只执行下一次
 * - latest: 只执行最近一次（合并多次错过）
 * - catchup: 补执行（可能短时间内执行大量任务）
 */
export type MissedPolicy = 'skip' | 'latest' | 'catchup'

// ============ 核心数据类型 ============

/**
 * 任务定义接口
 *
 * 对应 cron_tasks 表，存储不变的配置信息。
 * 与现有 CronTask 兼容，但使用新的 ScheduleConfig 结构。
 */
export interface Task {
  /** 任务唯一标识（UUID） */
  id: string
  /** 创建者用户 ID */
  userId: string
  /** 任务名称 */
  name: string
  /** 任务描述（可选） */
  description?: string
  /** 调度配置 */
  schedule: ScheduleConfig
  /** 原始调度字符串（用户输入） */
  scheduleRaw: string
  /** 任务提示词（发送给 AI 的内容） */
  prompt: string
  /** 允许使用的工具列表（可选） */
  tools?: string[]
  /** 输出格式 */
  outputFormat: 'text' | 'voice'
  /** 是否启用 */
  enabled: boolean
  /** 截止时间（毫秒），interval 类型可选 */
  endTime?: number
  /** 创建时间戳（毫秒） */
  createdAt: number
  /** 更新时间戳（毫秒） */
  updatedAt: number
}

/**
 * 执行记录接口
 *
 * 每次调度生成一条，有自己的状态机。
 * 对应 task_executions 表。
 */
export interface TaskExecution {
  /** 执行记录 ID（UUID） */
  id: string
  /** 关联的任务 ID */
  taskId: string
  /** 用户 ID */
  userId: string
  /** 计划执行时间（毫秒） */
  scheduledAt: number
  /** 实际开始执行时间（毫秒） */
  startedAt?: number
  /** 执行完成时间（毫秒） */
  completedAt?: number
  /** 执行状态 */
  status: ExecutionStatus
  /** 调度类型快照 */
  scheduleType: ScheduleType
  /** 任务名称快照 */
  taskName: string
  /** 任务提示词快照 */
  prompt: string
  /** 工具列表快照 */
  tools?: string
  /** 输出格式快照 */
  outputFormat: 'text' | 'voice'
  /** 执行结果内容 */
  result?: string
  /** 错误信息 */
  error?: string
  /** 执行耗时（毫秒） */
  duration?: number
  /** 尝试次数 */
  attempts: number
  /** 最大重试次数 */
  maxRetries: number
  /** 创建时间戳（毫秒） */
  createdAt: number
}

// ============ 引擎配置 ============

/**
 * 引擎配置接口
 */
export interface EngineConfig {
  /** 预取缓冲大小（默认 15） */
  bufferSize?: number
  /** 检查间隔（毫秒，默认 10000） */
  tickInterval?: number
  /** 最大并发数（默认 3） */
  maxConcurrent?: number
  /** 执行超时时间（毫秒，默认 60000） */
  executionTimeout?: number
  /** 最大重试次数（默认 2） */
  maxRetries?: number
  /** 错过执行策略（默认 'skip'） */
  missedPolicy?: MissedPolicy
}

/**
 * 引擎运行状态
 */
export interface EngineStatus {
  /** 是否正在运行 */
  running: boolean
  /** 缓冲中的执行数 */
  buffered: number
  /** 正在执行的任务数 */
  runningCount: number
  /** 总任务数 */
  totalTasks: number
  /** 启用任务数 */
  enabledTasks: number
}

/**
 * 执行结果接口
 * 任务执行完成后的返回结果
 */
export interface ExecutionResult {
  /** 执行状态 */
  status: 'success' | 'failed' | 'timeout'
  /** 执行结果内容（成功时） */
  result?: string
  /** 错误信息（失败时） */
  error?: string
  /** 执行耗时（毫秒） */
  duration: number
  /** 尝试次数 */
  attempts: number
}
