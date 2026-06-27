/**
 * 日志查询封装
 */

import { db } from '../index'

export interface LogEntry {
  id: number
  type: 'request' | 'event' | 'system' | 'ai'
  action: string
  data: string | null
  timestamp: number
}

export interface LogQueryOptions {
  type?: string
  limit?: number
  offset?: number
  startTime?: number
  endTime?: number
}

/**
 * 添加日志
 */
export function addLog(
  type: LogEntry['type'],
  action: string,
  data?: Record<string, unknown>
): LogEntry {
  const now = Date.now()
  const dataStr = data ? JSON.stringify(data) : null

  const result = db.prepare(
    'INSERT INTO logs (type, action, data, timestamp) VALUES (?, ?, ?, ?)'
  ).run(type, action, dataStr, now)

  return {
    id: result.lastInsertRowid as number,
    type,
    action,
    data: dataStr,
    timestamp: now,
  }
}

/**
 * 查询日志
 */
export function queryLogs(options: LogQueryOptions = {}): LogEntry[] {
  const { type, limit = 100, offset = 0, startTime, endTime } = options

  let sql = 'SELECT * FROM logs WHERE 1=1'
  const params: (string | number)[] = []

  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }

  if (startTime) {
    sql += ' AND timestamp >= ?'
    params.push(startTime)
  }

  if (endTime) {
    sql += ' AND timestamp <= ?'
    params.push(endTime)
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  return db.prepare(sql).all(...params) as LogEntry[]
}

/**
 * 获取日志统计
 */
export function getLogStats(): {
  total: number
  byType: Record<string, number>
} {
  const total = db.prepare(
    'SELECT COUNT(*) as count FROM logs'
  ).get() as { count: number }

  const byType = db.prepare(
    'SELECT type, COUNT(*) as count FROM logs GROUP BY type'
  ).all() as { type: string; count: number }[]

  return {
    total: total.count,
    byType: byType.reduce((acc, { type, count }) => {
      acc[type] = count
      return acc
    }, {} as Record<string, number>),
  }
}

/**
 * 清理过期日志
 */
export function cleanupExpiredLogs(daysToKeep: number = 7): number {
  const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
  const result = db.prepare(
    'DELETE FROM logs WHERE timestamp < ?'
  ).run(cutoff)
  return result.changes
}

/**
 * 清除所有日志
 */
export function clearAllLogs(): void {
  db.prepare('DELETE FROM logs').run()
}

/**
 * 获取最近的日志
 */
export function getRecentLogs(count: number = 50): LogEntry[] {
  return db.prepare(
    'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?'
  ).all(count) as LogEntry[]
}

/**
 * 按类型获取日志
 */
export function getLogsByType(type: LogEntry['type'], limit: number = 100): LogEntry[] {
  return db.prepare(
    'SELECT * FROM logs WHERE type = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(type, limit) as LogEntry[]
}

/**
 * 解析日志数据
 */
export function parseLogData(log: LogEntry): Record<string, unknown> | null {
  if (!log.data) return null
  try {
    return JSON.parse(log.data)
  } catch {
    return null
  }
}
