// src/components/log-viewer.tsx
'use client'

import React, { useEffect, useState, useRef } from 'react'

interface LogEntry {
  id: string
  timestamp: number
  type: 'request' | 'event' | 'system' | 'ai'
  direction?: 'outgoing' | 'incoming'
  action?: string
  echo?: string
  data: unknown
  status?: 'pending' | 'success' | 'error'
  response?: unknown
}

interface LogViewerProps {
  filter?: 'request' | 'event' | 'system' | 'ai'
}

export function LogViewer({ filter }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [contextExpanded, setContextExpanded] = useState<Set<string>>(new Set())
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
                      {log.type === 'ai' && log.action === 'ai_response' ? (
                        <AIDetailView log={log} contextExpanded={contextExpanded} setContextExpanded={setContextExpanded} />
                      ) : (
                        <>
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
                        </>
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

// AI 日志详情视图
function AIDetailView({
  log,
  contextExpanded,
  setContextExpanded,
}: {
  log: LogEntry
  contextExpanded: Set<string>
  setContextExpanded: React.Dispatch<React.SetStateAction<Set<string>>>
}) {
  const data = log.data as Record<string, unknown>
  const systemPrompt = data.systemPrompt as string | undefined
  const personalPrompt = data.personalPrompt as string | null | undefined
  const context = data.context as Array<{ role: string; content: string }> | undefined
  const toolCall = data.toolCall as { tool: string; args?: Record<string, unknown>; success: boolean; message: string } | undefined
  const userMessage = data.userMessage as string | undefined
  const modelResponse = data.modelResponse as string | undefined
  const usage = data.usage as { prompt: number; completion: number } | undefined
  const duration = data.duration as number | undefined
  const error = data.error as string | undefined

  const isContextOpen = contextExpanded.has(log.id)
  const toggleContext = () => {
    setContextExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(log.id)) next.delete(log.id)
      else next.add(log.id)
      return next
    })
  }

  return (
    <div className="space-y-3 text-xs">
      {/* 系统提示词 */}
      {systemPrompt && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">🔧 系统提示词（全局）</div>
          <div className="rounded border bg-background/50 p-2 whitespace-pre-wrap">{systemPrompt}</div>
        </div>
      )}

      {/* 个人提示词 */}
      {personalPrompt && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">👤 个人提示词</div>
          <div className="rounded border bg-blue-50/50 p-2 whitespace-pre-wrap">{personalPrompt}</div>
        </div>
      )}

      {/* 工具调用 */}
      {toolCall && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">🔧 工具调用</div>
          <div className={`rounded border p-2 ${toolCall.success ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{toolCall.tool}</span>
              <span className={toolCall.success ? 'text-green-600' : 'text-red-600'}>
                {toolCall.success ? '✅ 成功' : '❌ 失败'}
              </span>
            </div>
            {toolCall.args && Object.keys(toolCall.args).length > 0 && (
              <div className="mt-1 text-muted-foreground">
                <span className="font-medium">参数：</span>
                <span className="font-mono">{JSON.stringify(toolCall.args)}</span>
              </div>
            )}
            <div className="mt-1 whitespace-pre-wrap">{toolCall.message}</div>
          </div>
        </div>
      )}

      {/* 上下文（可折叠） */}
      {context && context.length > 0 && (
        <div>
          <button
            onClick={toggleContext}
            className="font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {isContextOpen ? '▼' : '▶'} 💬 上下文（{context.length} 条）
          </button>
          {isContextOpen && (
            <div className="mt-1 rounded border bg-background/50 p-2 space-y-1 max-h-40 overflow-y-auto">
              {context.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground">{msg.role === 'user' ? '👤' : '🤖'}</span>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 用户消息 */}
      {userMessage && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">👤 用户消息</div>
          <div className="rounded border bg-background/50 p-2 whitespace-pre-wrap">{userMessage}</div>
        </div>
      )}

      {/* 模型回复 */}
      {modelResponse && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">🤖 模型回复</div>
          <div className="rounded border bg-green-50/50 p-2 whitespace-pre-wrap">{modelResponse}</div>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div>
          <div className="font-medium text-red-600 mb-1">❌ 错误</div>
          <div className="rounded border border-red-200 bg-red-50/50 p-2 whitespace-pre-wrap">{error}</div>
        </div>
      )}

      {/* 元信息 */}
      <div className="flex gap-4 text-muted-foreground">
        {usage && <span>Token: {usage.prompt} + {usage.completion} = {usage.prompt + usage.completion}</span>}
        {duration != null && <span>耗时: {duration}ms</span>}
      </div>
    </div>
  )
}
