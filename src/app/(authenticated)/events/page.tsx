// src/app/(authenticated)/events/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface EventItem {
  id: string
  timestamp: number
  type: 'message' | 'request' | 'notice'
  direction: 'incoming' | 'outgoing'
  userId?: number
  nickname?: string
  card?: string
  groupId?: number | null
  groupName?: string
  content?: string
  rawMessage?: string
  requestType?: string
  flag?: string
  comment?: string
  noticeType?: string
  subType?: string
}

type FilterType = 'all' | 'message' | 'request' | 'notice'

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedUser, setSelectedUser] = useState<{ userId: number; nickname: string; events: EventItem[] } | null>(null)

  const loadEvents = async () => {
    const res = await fetch('/api/events/messages')
    const data = await res.json()
    if (data.data) setEvents(data.data)
    setLoading(false)
  }

  useEffect(() => {
    loadEvents()
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'event' && msg.data?.post_type) {
          loadEvents()
        }
      } catch { /* ignore */ }
    }
    return () => eventSource.close()
  }, [])

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter)

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const getTypeBadge = (type: string) => {
    if (type === 'message') return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">消息</span>
    if (type === 'request') return <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">请求</span>
    if (type === 'notice') return <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">通知</span>
    return null
  }

  // Group message events by user for conversation view
  const openUserConversation = (userId: number) => {
    const userEvents = events.filter((e) => e.type === 'message' && e.userId === userId)
    if (userEvents.length === 0) return
    const nickname = userEvents[0].nickname || `User ${userId}`
    setSelectedUser({ userId, nickname, events: userEvents.sort((a, b) => a.timestamp - b.timestamp) })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">事件</h1>
        <button
          onClick={loadEvents}
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          刷新
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([
          { key: 'all', label: '全部' },
          { key: 'message', label: '消息' },
          { key: 'request', label: '请求' },
          { key: 'notice', label: '通知' },
        ] as { key: FilterType; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted-foreground">加载中...</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">暂无事件</p>
        </div>
      )}

      {/* Events list */}
      <div className="rounded-lg border divide-y">
        {filtered.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer"
            onClick={() => event.type === 'message' && event.userId && openUserConversation(event.userId)}
          >
            {/* Icon */}
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm shrink-0">
              {event.type === 'message' ? (event.direction === 'outgoing' ? '📤' : '📥') :
               event.type === 'request' ? '🔔' : '📢'}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {getTypeBadge(event.type)}
                {event.direction === 'outgoing' && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">我发出</span>
                )}
                {event.type === 'message' && event.nickname && (
                  <span className="text-sm font-medium">{event.nickname}</span>
                )}
                {event.type === 'message' && event.userId && (
                  <span className="text-xs text-muted-foreground font-mono">{event.userId}</span>
                )}
                {event.groupId && (
                  <span className="text-xs text-muted-foreground">群 {event.groupId}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground truncate">{event.content}</p>
            </div>

            {/* Time */}
            <span className="text-xs text-muted-foreground shrink-0">{formatTime(event.timestamp)}</span>
          </div>
        ))}
      </div>

      {/* Conversation Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedUser(null)}>
          <div
            className="relative w-full max-w-2xl max-h-[80vh] rounded-lg border bg-background shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">{selectedUser.nickname}</h2>
                <p className="text-sm text-muted-foreground">{selectedUser.userId} · {selectedUser.events.length} 条消息</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="rounded-md p-2 hover:bg-muted">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedUser.events.map((msg) => {
                const isOutgoing = msg.direction === 'outgoing'
                return (
                  <div key={msg.id} className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(msg.timestamp).toLocaleString('zh-CN')}</span>
                      {msg.groupId && <span className="rounded bg-muted px-1 py-0.5">群 {msg.groupId}</span>}
                    </div>
                    <div
                      className={`mt-1 max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isOutgoing ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
                      }`}
                    >
                      {msg.content || msg.rawMessage || '(空消息)'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
