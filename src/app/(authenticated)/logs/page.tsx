// src/app/(authenticated)/logs/page.tsx
'use client'

import { useState } from 'react'
import { LogViewer } from '@/components/log-viewer'

type LogFilter = 'request' | 'event' | 'system' | 'ai' | undefined

export default function LogsPage() {
  const [filter, setFilter] = useState<LogFilter>(undefined)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">日志</h1>

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
