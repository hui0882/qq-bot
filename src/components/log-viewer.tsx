// src/components/log-viewer.tsx
'use client'

import React, { useEffect, useState, useRef } from 'react'

interface LogEntry {
  id: string
  timestamp: number
  type: 'request' | 'event' | 'system'
  direction?: 'outgoing' | 'incoming'
  action?: string
  echo?: string
  data: unknown
  status?: 'pending' | 'success' | 'error'
  response?: unknown
}

interface LogViewerProps {
  filter?: 'request' | 'event' | 'system'
}

export function LogViewer({ filter }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = filter ? `/api/logs?type=${filter}&limit=200` : '/api/logs?limit=200'
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setLogs(data.data)
      })

    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'log') {
          const entry = msg.data as LogEntry
          if (!filter || entry.type === filter) {
            setLogs((prev) => [...prev, entry].slice(-500))
          }
        }
      } catch {
        // ignore
      }
    }

    return () => eventSource.close()
  }, [filter])

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const typeColors: Record<string, string> = {
    request: 'bg-blue-100 text-blue-800',
    event: 'bg-green-100 text-green-800',
    system: 'bg-yellow-100 text-yellow-800',
  }

  const statusColors: Record<string, string> = {
    pending: 'text-yellow-600',
    success: 'text-green-600',
    error: 'text-red-600',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{logs.length} 条日志</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          自动滚动
        </label>
      </div>
      <div ref={containerRef} className="h-[600px] overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2 w-20">时间</th>
              <th className="p-2 w-16">类型</th>
              <th className="p-2 w-32">Action</th>
              <th className="p-2 w-16">方向</th>
              <th className="p-2 w-16">状态</th>
              <th className="p-2">数据</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <React.Fragment key={log.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="cursor-pointer border-b hover:bg-muted/50"
                >
                  <td className="p-2 font-mono text-xs text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                  </td>
                  <td className="p-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${typeColors[log.type] || ''}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-xs">{log.action || '-'}</td>
                  <td className="p-2 text-xs">{log.direction || '-'}</td>
                  <td className={`p-2 text-xs ${statusColors[log.status || 'pending'] || ''}`}>
                    {log.status || '-'}
                  </td>
                  <td className="p-2 max-w-xs truncate font-mono text-xs">
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data).slice(0, 100)}
                  </td>
                </tr>
                {expandedId === log.id && (
                  <tr key={`${log.id}-detail`}>
                    <td colSpan={6} className="p-4 bg-muted/30">
                      <pre className="overflow-auto max-h-60 font-mono text-xs">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                      {log.response != null && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-muted-foreground">响应:</span>
                          <pre className="overflow-auto max-h-40 mt-1 font-mono text-xs">
                            {JSON.stringify(log.response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
