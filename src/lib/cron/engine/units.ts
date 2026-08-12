/**
 * 定时任务引擎 - 单位换算工具
 *
 * 全链路单位约定：
 * - cron_tasks.schedule_at / Task.schedule.at：秒
 * - task_executions.scheduled_at / EngineExecution.scheduledAt：毫秒
 * - 引擎内部时间比较：统一毫秒
 *
 * 历史 Bug（schedule_at 单位混乱）曾导致 API 路径写入毫秒，
 * 引擎按秒读取后生成 16 位时间戳，任务永不触发。
 * 此处提供防御性归一化，避免残留的毫秒/异常数据再次毒化引擎。
 */

/**
 * 归一化 schedule_at 到秒
 *
 * 合法秒级时间戳（当前约 1.7e9，10 位）远小于 1e12；
 * 毫秒级时间戳（13 位，约 1.7e12）必然大于 1e12，
 * 因此以 1e12 为阈值做防御性换算。
 *
 * @param value - 原始 schedule_at（可能为 null）
 * @returns 秒级时间戳；无效输入返回 undefined
 */
export function normalizeScheduleAtSeconds(value?: number | null): number | undefined {
  if (!value || value <= 0) return undefined
  if (value > 1_000_000_000_000) {
    return Math.floor(value / 1000)
  }
  return value
}
