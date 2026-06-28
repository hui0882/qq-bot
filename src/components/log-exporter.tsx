// src/components/log-exporter.tsx
'use client'

import { useState } from 'react'

type ExportSource = 'buffer' | 'file' | 'db'
type ExportFormat = 'json' | 'jsonl'
type LogType = '' | 'request' | 'event' | 'system' | 'ai'

export function LogExporter() {
  const [source, setSource] = useState<ExportSource>('file')
  const [format, setFormat] = useState<ExportFormat>('jsonl')
  const [logType, setLogType] = useState<LogType>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('source', source)
      params.set('format', format)
      if (logType) params.set('type', logType)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const response = await fetch(`/api/logs/export?${params.toString()}`)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || '导出失败')
      }

      // 获取文件名
      const disposition = response.headers.get('Content-Disposition')
      const filenameMatch = disposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] || `napcat-logs.${format}`

      // 下载文件
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // 显示导出数量
      const count = response.headers.get('X-Log-Count')
      if (count) {
        alert(`成功导出 ${count} 条日志`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-lg font-medium">导出日志</h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 数据源 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">数据源</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as ExportSource)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="file">日志文件</option>
            <option value="db">数据库</option>
            <option value="buffer">内存缓冲区</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {source === 'file' && '从 data/logs/ 目录读取 JSONL 文件'}
            {source === 'db' && '从 SQLite 数据库读取'}
            {source === 'buffer' && '从内存缓冲区读取（最近的日志）'}
          </p>
        </div>

        {/* 日志类型 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">日志类型</label>
          <select
            value={logType}
            onChange={(e) => setLogType(e.target.value as LogType)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">全部类型</option>
            <option value="request">请求 (request)</option>
            <option value="event">事件 (event)</option>
            <option value="system">系统 (system)</option>
            <option value="ai">AI</option>
          </select>
        </div>

        {/* 开始日期 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* 结束日期 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* 导出格式 */}
      <div className="mt-4 space-y-2">
        <label className="text-sm font-medium">导出格式</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="jsonl"
              checked={format === 'jsonl'}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            />
            <span className="text-sm">JSONL</span>
            <span className="text-xs text-muted-foreground">（每行一条 JSON，适合大数据量）</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="json"
              checked={format === 'json'}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            />
            <span className="text-sm">JSON</span>
            <span className="text-xs text-muted-foreground">（格式化 JSON 数组，便于查看）</span>
          </label>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 导出按钮 */}
      <div className="mt-4">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isExporting ? '导出中...' : '导出并下载'}
        </button>
      </div>
    </div>
  )
}
