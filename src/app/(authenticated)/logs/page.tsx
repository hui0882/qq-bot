// src/app/(authenticated)/logs/page.tsx
'use client'

import { useState } from 'react'
import { LogViewer } from '@/components/log-viewer'
import { LogExporter } from '@/components/log-exporter'

type LogFilter = 'request' | 'event' | 'system' | 'ai' | undefined

export default function LogsPage() {
  const [filter, setFilter] = useState<LogFilter>(undefined)
  const [showExporter, setShowExporter] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">日志</h1>
        <button
          onClick={() => setShowExporter(!showExporter)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {showExporter ? '关闭导出' : '导出日志'}
        </button>
      </div>

      {showExporter && <LogExporter />}

      <div className="flex gap-2">
        {([undefined, 'request', 'event', 'system', 'ai'] as LogFilter[]).map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'
            }`}
          >
            {f === undefined ? '全部' : f === 'request' ? '请求' : f === 'event' ? '事件' : f === 'system' ? '系统' : 'AI'}
          </button>
        ))}
      </div>

      <LogViewer filter={filter} />
    </div>
  )
}
