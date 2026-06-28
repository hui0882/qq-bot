// src/app/api/logs/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { logger } from '@/lib/logger'
import { validateAuth } from '@/lib/auth'
import { queryLogs } from '@/lib/db/queries/logs'
import { configManager } from '@/lib/config'

type ExportSource = 'buffer' | 'file' | 'db'
type ExportFormat = 'json' | 'jsonl'

interface LogEntry {
  id: string
  timestamp: number
  type: string
  direction?: string
  action?: string
  echo?: string
  data: unknown
  status?: string
  response?: unknown
}

/**
 * 从内存缓冲区导出日志
 */
function exportFromBuffer(filters: {
  type?: string
  startDate?: number
  endDate?: number
  limit?: number
}): LogEntry[] {
  const logs = logger.getLogs({
    type: filters.type as 'request' | 'event' | 'system' | 'ai' | undefined,
    limit: filters.limit || 10000,
  })

  return logs.filter((log) => {
    if (filters.startDate && log.timestamp < filters.startDate) return false
    if (filters.endDate && log.timestamp > filters.endDate) return false
    return true
  })
}

/**
 * 从 JSONL 文件导出日志
 */
function exportFromFiles(filters: {
  type?: string
  startDate?: number
  endDate?: number
}): LogEntry[] {
  const config = configManager.getConfig()
  const logDir = join(process.cwd(), config.log.logDir)

  if (!existsSync(logDir)) {
    return []
  }

  const files = readdirSync(logDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()

  const results: LogEntry[] = []

  for (const file of files) {
    // 从文件名解析日期 (YYYY-MM-DD.jsonl)
    const dateStr = file.replace('.jsonl', '')
    const fileDate = new Date(dateStr).getTime()

    // 日期范围过滤
    if (filters.startDate) {
      const startDay = new Date(filters.startDate).toISOString().split('T')[0]
      if (dateStr < startDay) continue
    }
    if (filters.endDate) {
      const endDay = new Date(filters.endDate).toISOString().split('T')[0]
      if (dateStr > endDay) continue
    }

    try {
      const content = readFileSync(join(logDir, file), 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LogEntry

          // 类型过滤
          if (filters.type && entry.type !== filters.type) continue

          // 精确时间范围过滤
          if (filters.startDate && entry.timestamp < filters.startDate) continue
          if (filters.endDate && entry.timestamp > filters.endDate) continue

          results.push(entry)
        } catch {
          // 跳过无法解析的行
        }
      }
    } catch {
      // 跳过无法读取的文件
    }
  }

  return results
}

/**
 * 从 SQLite 数据库导出日志
 */
function exportFromDB(filters: {
  type?: string
  startDate?: number
  endDate?: number
  limit?: number
}): LogEntry[] {
  const dbLogs = queryLogs({
    type: filters.type,
    startTime: filters.startDate,
    endTime: filters.endDate,
    limit: filters.limit || 10000,
  })

  return dbLogs.map((log) => ({
    id: String(log.id),
    timestamp: log.timestamp,
    type: log.type,
    action: log.action,
    data: log.data ? JSON.parse(log.data) : null,
  }))
}

export async function GET(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams

  const source = (searchParams.get('source') || 'file') as ExportSource
  const format = (searchParams.get('format') || 'jsonl') as ExportFormat
  const type = searchParams.get('type') || undefined
  const startDateStr = searchParams.get('startDate')
  const endDateStr = searchParams.get('endDate')
  const limit = parseInt(searchParams.get('limit') || '10000', 10)

  // 解析日期
  const startDate = startDateStr ? new Date(startDateStr).getTime() : undefined
  const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59.999').getTime() : undefined

  let logs: LogEntry[] = []

  switch (source) {
    case 'buffer':
      logs = exportFromBuffer({ type, startDate, endDate, limit })
      break
    case 'file':
      logs = exportFromFiles({ type, startDate, endDate })
      break
    case 'db':
      logs = exportFromDB({ type, startDate, endDate, limit })
      break
    default:
      return NextResponse.json(
        { success: false, message: 'Invalid source. Use: buffer, file, db' },
        { status: 400 }
      )
  }

  // 按时间排序
  logs.sort((a, b) => a.timestamp - b.timestamp)

  // 生成文件内容
  let content: string
  let contentType: string
  let fileExtension: string

  if (format === 'json') {
    content = JSON.stringify(logs, null, 2)
    contentType = 'application/json'
    fileExtension = 'json'
  } else {
    content = logs.map((log) => JSON.stringify(log)).join('\n')
    contentType = 'application/x-ndjson'
    fileExtension = 'jsonl'
  }

  // 生成文件名
  const now = new Date().toISOString().split('T')[0]
  const filename = `napcat-logs-${source}-${now}.${fileExtension}`

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Log-Count': String(logs.length),
    },
  })
}
