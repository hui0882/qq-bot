/**
 * 定时任务系统 - 类型定义
 *
 * 本文件定义了定时任务系统的所有 TypeScript 类型和接口。
 * 作为基础层，供其他模块（store、parser、scheduler、executor 等）使用。
 */

/**
 * 调度类型
 * - at: 定时执行（一次性或指定时间）
 * - every: 间隔执行（每隔 N 时间）
 * - cron: Cron 表达式执行
 */
export type ScheduleType = 'at' | 'every' | 'cron';

/**
 * 任务执行状态
 * - success: 执行成功
 * - failed: 执行失败
 * - timeout: 执行超时
 */
export type TaskStatus = 'success' | 'failed' | 'timeout';

/**
 * 输出格式
 * - text: 纯文本输出
 * - voice: 语音输出
 */
export type OutputFormat = 'text' | 'voice';

/**
 * 定时任务主表接口
 * 对应数据库 cron_tasks 表
 */
export interface CronTask {
  /** 任务唯一标识（UUID） */
  id: string;
  /** 创建者用户 ID */
  userId: string;
  /** 任务名称 */
  name: string;
  /** 任务描述（可选） */
  description?: string;
  /** 原始调度字符串（用户输入的原始内容） */
  scheduleRaw: string;
  /** 调度类型 */
  scheduleType: ScheduleType;
  /** Cron 表达式（当 scheduleType 为 'cron' 时使用） */
  scheduleCron?: string;
  /** 执行间隔秒数（当 scheduleType 为 'every' 时使用） */
  scheduleInterval?: number;
  /** 定时执行时间戳（当 scheduleType 为 'at' 时使用） */
  scheduleAt?: number;
  /** 截止时间戳（当 scheduleType 为 'interval' 时可选） */
  endTime?: number;
  /** 任务提示词（发送给 AI 的内容） */
  prompt: string;
  /** 允许使用的工具列表（可选） */
  tools?: string[];
  /** 输出格式 */
  outputFormat: OutputFormat;
  /** 是否启用 */
  enabled: boolean;
  /** 下次执行时间戳 */
  nextRunAt?: number;
  /** 上次执行时间戳 */
  lastRunAt?: number;
  /** 上次执行状态 */
  lastRunStatus?: TaskStatus;
  /** 上次执行错误信息（如果有） */
  lastRunError?: string;
  /** 累计执行次数 */
  runCount: number;
  /** 是否静默模式（静默时只发送状态提示，不发送 AI 回复） */
  silent: boolean;
  /** 重试次数 */
  retryCount: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}

/**
 * 执行日志接口
 * 对应数据库 cron_logs 表
 */
export interface CronLog {
  /** 日志自增 ID */
  id: number;
  /** 关联的任务 ID */
  taskId: string;
  /** 执行者用户 ID */
  userId: string;
  /** 执行状态 */
  status: TaskStatus;
  /** 执行结果内容 */
  result?: string;
  /** 错误信息（如果失败） */
  error?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 尝试次数 */
  attempts: number;
  /** 执行时间戳 */
  executedAt: number;
}

/**
 * 创建任务参数接口
 * 用于 create_scheduled_task 工具和 AI 调用
 */
export interface CreateTaskParams {
  /** 创建者用户 ID */
  userId: string;
  /** 任务名称 */
  name: string;
  /** 任务描述（可选） */
  description?: string;
  /** 调度规则（支持 at/every/cron 格式） */
  schedule: string;
  /** 任务提示词 */
  prompt: string;
  /** 允许使用的工具列表（可选） */
  tools?: string[];
  /** 截止时间（秒，interval 类型可选） */
  endTime?: number;
  /** 是否静默模式（默认 false） */
  silent?: boolean;
  /** 输出格式（默认 'text'） */
  outputFormat?: OutputFormat;
}

/**
 * 执行结果接口
 * 任务执行完成后的返回结果
 */
export interface ExecutionResult {
  /** 执行状态 */
  status: TaskStatus;
  /** 执行结果内容（成功时） */
  result?: string;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 尝试次数 */
  attempts: number;
}

/**
 * 解析后的调度信息接口
 * 调度解析器的输出结果
 */
export interface ParsedSchedule {
  /** 调度类型 */
  type: ScheduleType;
  /** Cron 表达式（当 type 为 'cron' 时） */
  cron?: string;
  /** 执行间隔秒数（当 type 为 'every' 时） */
  interval?: number;
  /** 定时执行时间戳（当 type 为 'at' 时） */
  at?: number;
}

/**
 * AI 执行上下文接口
 * 用于构建 AI 调用的上下文信息
 */
export interface AIContext {
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户 ID */
  userId: string;
  /** 允许使用的工具列表（可选） */
  tools?: string[];
  /** 超时时间（秒，默认 60） */
  timeout?: number;
}

/**
 * 队列状态接口
 * 用于查询任务队列的状态
 */
export interface QueueStatus {
  /** 正在执行的任务数 */
  running: number;
  /** 等待执行的任务数 */
  waiting: number;
}

/**
 * 调度器配置接口
 * 调度器的配置选项
 */
export interface SchedulerConfig {
  /** 检查间隔（毫秒，默认 60000 即 1 分钟） */
  tickInterval?: number;
  /** 最大并发数（默认 3） */
  maxConcurrent?: number;
  /** 执行超时时间（秒，默认 60） */
  executionTimeout?: number;
  /** 最大重试次数（默认 2） */
  maxRetries?: number;
}
