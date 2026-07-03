/**
 * 定时任务系统 - 调度规则解析器
 *
 * 负责将用户输入的调度字符串解析为结构化的 ParsedSchedule 对象。
 * 支持三种格式：
 *   - at: 指定时间执行（at 15:30 / at 2026-07-04T09:00:00）
 *   - every: 间隔执行（every 5m / every 2h / every 1d）
 *   - cron: 标准 Cron 表达式（0 9 * * *）
 */

import { validate } from 'node-cron';
import type { CronTask, ParsedSchedule } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 时间单位到秒的映射 */
const INTERVAL_UNITS: Record<string, number> = {
  m: 60,
  h: 3600,
  d: 86400,
};

// ---------------------------------------------------------------------------
// 1. 主解析函数
// ---------------------------------------------------------------------------

/**
 * 解析调度规则字符串，自动识别 at / every / cron 三种格式。
 *
 * @param input - 用户输入的调度字符串
 * @returns 解析后的 ParsedSchedule 对象
 * @throws 当输入格式无法识别时抛出错误
 */
export function parseSchedule(input: string): ParsedSchedule {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('调度规则不能为空');
  }

  // at 格式：以 "at " 开头（不区分大小写）
  if (/^at\s+/i.test(trimmed)) {
    return parseAtFormat(trimmed.replace(/^at\s+/i, '').trim());
  }

  // every 格式：以 "every " 开头（不区分大小写）
  if (/^every\s+/i.test(trimmed)) {
    return parseEveryFormat(trimmed.replace(/^every\s+/i, '').trim());
  }

  // 尝试作为 cron 表达式解析
  if (isValidCron(trimmed)) {
    return { type: 'cron', cron: trimmed };
  }

  throw new Error(
    `无法识别的调度规则: "${trimmed}"。支持的格式：` +
      'at <时间> | every <间隔> | <cron表达式>'
  );
}

// ---------------------------------------------------------------------------
// 2. at 格式解析
// ---------------------------------------------------------------------------

/**
 * 解析 "at" 格式的调度规则。
 *
 * 支持两种子格式：
 *   - "15:30"            → 今天 15:30，若已过则自动调整为明天
 *   - "2026-07-04T09:00" → 指定的完整时间
 *
 * @param timeStr - 去掉 "at " 前缀后的时间字符串
 * @returns ParsedSchedule（type 为 'at'）
 * @throws 当时间格式无效时抛出错误
 */
export function parseAtFormat(timeStr: string): ParsedSchedule {
  if (!timeStr) {
    throw new Error('at 格式需要指定时间，例如: at 15:30');
  }

  let timestamp: number;

  // 尝试解析为完整日期时间（ISO 格式或类似格式）
  const fullDateMatch = timeStr.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/
  );
  if (fullDateMatch) {
    const [, datePart, timePart, secPart] = fullDateMatch;
    const isoStr = secPart
      ? `${datePart}T${timePart}:${secPart}`
      : `${datePart}T${timePart}:00`;
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) {
      throw new Error(`无效的日期时间: "${timeStr}"`);
    }
    timestamp = Math.floor(date.getTime() / 1000);
  } else {
    // 尝试解析为 HH:MM 格式（当天时间）
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      throw new Error(
        `无效的 at 时间格式: "${timeStr}"。支持: "15:30" 或 "2026-07-04T09:00:00"`
      );
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`无效的时间: ${hours}:${minutes.toString().padStart(2, '0')}`);
    }

    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // 如果指定时间已过，自动调整为明天
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    timestamp = Math.floor(target.getTime() / 1000);
  }

  return { type: 'at', at: timestamp };
}

// ---------------------------------------------------------------------------
// 3. every 格式解析
// ---------------------------------------------------------------------------

/**
 * 解析 "every" 格式的调度规则。
 *
 * 支持的单位：
 *   - m: 分钟（最小单位）
 *   - h: 小时
 *   - d: 天
 *
 * @param intervalStr - 去掉 "every " 前缀后的间隔字符串，如 "5m"、"2h"、"1d"
 * @returns ParsedSchedule（type 为 'every'，interval 为秒数）
 * @throws 当间隔格式无效或小于 1 分钟时抛出错误
 */
export function parseEveryFormat(intervalStr: string): ParsedSchedule {
  if (!intervalStr) {
    throw new Error('every 格式需要指定间隔，例如: every 5m');
  }

  const match = intervalStr.match(/^(\d+)\s*([mhd])$/i);
  if (!match) {
    throw new Error(
      `无效的 every 间隔格式: "${intervalStr}"。支持: "5m"、"2h"、"1d"`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (value <= 0) {
    throw new Error('间隔值必须大于 0');
  }

  // 最小单位为分钟（不支持秒级）
  if (unit === 'm' && value < 1) {
    throw new Error('every 格式最小单位为分钟');
  }

  const interval = value * INTERVAL_UNITS[unit];

  return { type: 'every', interval };
}

// ---------------------------------------------------------------------------
// 4. Cron 表达式验证
// ---------------------------------------------------------------------------

/**
 * 验证是否为合法的标准 5 位 Cron 表达式。
 *
 * 使用 node-cron 库进行验证。
 *
 * @param expression - 待验证的 cron 表达式
 * @returns 合法则返回 true，否则返回 false
 */
export function isValidCron(expression: string): boolean {
  if (!expression || typeof expression !== 'string') {
    return false;
  }

  const fields = expression.trim().split(/\s+/);

  // 标准 cron 必须是 5 位
  if (fields.length !== 5) {
    return false;
  }

  try {
    return validate(expression);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 5. 计算下次执行时间
// ---------------------------------------------------------------------------

/**
 * 根据任务的调度配置计算下次执行时间戳（秒）。
 *
 * - at 类型：返回 scheduleAt（一次性任务，不再重复）
 * - every 类型：基于 lastRunAt 或 createdAt + interval 计算
 * - cron 类型：遍历未来 7 天找到下一个匹配时间
 *
 * @param task - CronTask 任务对象
 * @returns 下次执行的 Unix 时间戳（秒）
 * @throws 当调度类型未知时抛出错误
 */
export function calculateNextRun(task: CronTask): number {
  const now = Math.floor(Date.now() / 1000);

  switch (task.scheduleType) {
    case 'at':
      return calculateNextAt(task, now);
    case 'every':
      return calculateNextEvery(task, now);
    case 'cron':
      return calculateNextCron(task, now);
    default:
      throw new Error(`未知的调度类型: ${(task as CronTask).scheduleType}`);
  }
}

/**
 * 计算 at 类型的下次执行时间。
 * 一次性任务：如果 scheduleAt 已过则返回当前时间（立即执行/标记过期）。
 */
function calculateNextAt(task: CronTask, now: number): number {
  if (task.scheduleAt == null) {
    throw new Error('at 类型任务缺少 scheduleAt 字段');
  }

  // 如果目标时间已过，返回当前时间（由调度器决定是否跳过）
  if (task.scheduleAt <= now) {
    return now;
  }

  return task.scheduleAt;
}

/**
 * 计算 every 类型的下次执行时间。
 * 从 lastRunAt（或 createdAt）开始，叠加 interval 直到超过当前时间。
 */
function calculateNextEvery(task: CronTask, now: number): number {
  if (task.scheduleInterval == null || task.scheduleInterval <= 0) {
    throw new Error('every 类型任务缺少有效的 scheduleInterval 字段');
  }

  // 注意：lastRunAt 和 createdAt 是毫秒级，需要转换为秒级
  const baseMs = task.lastRunAt ?? task.createdAt;
  const base = Math.floor(baseMs / 1000);
  const interval = task.scheduleInterval;

  // 从 base 开始，按 interval 递增直到超过 now
  if (base + interval <= now) {
    // 计算需要跳过多少个完整周期
    const elapsed = now - base;
    const periods = Math.ceil(elapsed / interval);
    return base + periods * interval;
  }

  return base + interval;
}

/**
 * 计算 cron 类型的下次执行时间。
 * 从下一分钟开始遍历，最多查找 7 天内的下一个匹配时间点。
 */
function calculateNextCron(task: CronTask, now: number): number {
  if (!task.scheduleCron) {
    throw new Error('cron 类型任务缺少 scheduleCron 字段');
  }

  const cron = parseCronExpression(task.scheduleCron);

  // 从下一分钟的第 0 秒开始查找
  const startDate = new Date(now * 1000);
  startDate.setSeconds(0);
  startDate.setMilliseconds(0);
  startDate.setMinutes(startDate.getMinutes() + 1);

  // 最多查找 7 天（10080 分钟）
  const maxIterations = 7 * 24 * 60;
  const candidate = new Date(startDate.getTime());

  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(cron, candidate)) {
      return Math.floor(candidate.getTime() / 1000);
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // 找不到匹配时间，返回 7 天后（兜底，实际不应到达此处）
  return now + 7 * 86400;
}

// ---------------------------------------------------------------------------
// 6. Cron 表达式转可读文本
// ---------------------------------------------------------------------------

/**
 * 将标准 5 位 Cron 表达式转换为中文可读文本。
 *
 * 支持的模式：每天固定时间、每周固定时间、每月固定日期、每 N 分钟、每 N 小时。
 *
 * @param expression - 标准 5 位 cron 表达式
 * @returns 中文可读描述
 */
export function cronToReadable(expression: string): string {
  if (!isValidCron(expression)) {
    return `无效的 cron 表达式: ${expression}`;
  }

  const fields = expression.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  // 每 N 分钟
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*') {
    const n = minute.slice(2);
    return `每 ${n} 分钟`;
  }

  // 每 N 小时（整点）
  if (
    minute === '0' &&
    hour.startsWith('*/') &&
    dayOfMonth === '*' &&
    month === '*'
  ) {
    const n = hour.slice(2);
    return `每 ${n} 小时`;
  }

  // 每天固定时间
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每天 ${padTime(hour)}:${padTime(minute)}`;
  }

  // 每周固定时间
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const dow = dayOfWeekToChinese(dayOfWeek);
    return `每${dow} ${padTime(hour)}:${padTime(minute)}`;
  }

  // 每月固定日期
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${padTime(hour)}:${padTime(minute)}`;
  }

  // 每年固定日期
  if (dayOfMonth !== '*' && month !== '*' && dayOfWeek === '*') {
    return `每年 ${month} 月 ${dayOfMonth} 日 ${padTime(hour)}:${padTime(minute)}`;
  }

  // 兜底：返回原始表达式
  return expression;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** 解析后的 cron 字段结构 */
interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

/**
 * 解析 cron 表达式的各个字段为数字集合。
 * 支持: 星号(*), 星号斜杠N(* /N), N, N-M, N,M, 以及组合。
 */
function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`无效的 cron 表达式: "${expression}"`);
  }

  return {
    minutes: parseCronField(fields[0], 0, 59),
    hours: parseCronField(fields[1], 0, 23),
    daysOfMonth: parseCronField(fields[2], 1, 31),
    months: parseCronField(fields[3], 1, 12),
    daysOfWeek: parseCronField(fields[4], 0, 7),
  };
}

/**
 * 解析单个 cron 字段为数字集合。
 * 将 7（周日）归一化为 0。
 */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  // 处理逗号分隔的多个值
  const parts = field.split(',');
  for (const part of parts) {
    // */N 格式
    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10);
      for (let i = min; i <= max; i += step) {
        result.add(i);
      }
      continue;
    }

    // N-M 格式
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = Math.max(start, min); i <= Math.min(end, max); i++) {
        result.add(i);
      }
      continue;
    }

    // * 格式
    if (part === '*') {
      for (let i = min; i <= max; i++) {
        result.add(i);
      }
      continue;
    }

    // 单个数字
    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      // 将周日 7 归一化为 0
      if (max === 7 && num === 7) {
        result.add(0);
      } else {
        result.add(num);
      }
    }
  }

  return result;
}

/**
 * 检查给定日期是否匹配解析后的 cron 规则。
 */
function matchesCron(cron: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JS 的月份从 0 开始
  const dayOfWeek = date.getDay(); // 0 = 周日

  if (!cron.minutes.has(minute)) return false;
  if (!cron.hours.has(hour)) return false;
  if (!cron.months.has(month)) return false;

  // dayOfMonth 和 dayOfWeek 是 OR 关系（标准 cron 行为）
  // 除非其中一个为 *，则只检查另一个
  const domIsWildcard = cron.daysOfMonth.size > 28; // 近似判断 *
  const dowIsWildcard = cron.daysOfWeek.size >= 7;

  if (domIsWildcard && dowIsWildcard) return true;
  if (domIsWildcard) return cron.daysOfWeek.has(dayOfWeek);
  if (dowIsWildcard) return cron.daysOfMonth.has(dayOfMonth);
  // 两者都不是通配符，满足任一即可
  return cron.daysOfMonth.has(dayOfMonth) || cron.daysOfWeek.has(dayOfWeek);
}

/**
 * 将小时/分钟字段补零为两位字符串。
 */
function padTime(field: string): string {
  const num = parseInt(field, 10);
  if (isNaN(num)) return field;
  return num.toString().padStart(2, '0');
}

/**
 * 将 cron 星期字段转换为中文描述。
 */
function dayOfWeekToChinese(field: string): string {
  const map: Record<string, string> = {
    '0': '周日',
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六',
    '7': '周日',
  };

  // 单个值
  if (map[field]) {
    return map[field];
  }

  // 多个值：1,3,5 → "周一/周三/周五"
  if (field.includes(',')) {
    return field
      .split(',')
      .map((v) => map[v.trim()] ?? v)
      .join('/');
  }

  return `星期 ${field}`;
}
