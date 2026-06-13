// src/app/(authenticated)/events/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface MessageEvent {
  id: string
  timestamp: number
  content: string
  rawMessage: string
  messageType: string
  groupId: number | null
  direction: 'incoming' | 'outgoing'
}

interface UserConversation {
  userId: number
  nickname: string
  card: string
  groupId: number | null
  groupName: string
  messages: MessageEvent[]
  lastMessage: string
  lastTimestamp: number
  count: number
}

export default function EventsPage() {
  const [users, setUsers] = useState<UserConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<UserConversation | null>(null)

  const loadUsers = async () => {
    const res = await fetch('/api/events/messages')
    const data = await res.json()
    if (data.data) setUsers(data.data)
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()

    // Subscribe to SSE for real-time updates
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'event' && msg.data?.post_type === 'message') {
          // Reload users when a new message arrives
          loadUsers()
        }
      } catch {
        // ignore
      }
    }

    return () => eventSource.close()
  }, [])

  const getDisplayName = (u: UserConversation) => u.card || u.nickname
  const getSubtitle = (u: UserConversation) => {
    if (u.groupId) return `群: ${u.groupName || u.groupId}`
    return '私聊'
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">消息事件</h1>
        <button
          onClick={loadUsers}
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          刷新
        </button>
      </div>

      {loading && <p className="text-muted-foreground">加载中...</p>}

      {!loading && users.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">暂无消息事件</p>
          <p className="text-sm text-muted-foreground mt-1">当有用户发送消息时，会在这里显示</p>
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <div
            key={u.userId}
            onClick={() => setSelectedUser(u)}
            className="flex items-center gap-4 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {getDisplayName(u).charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{getDisplayName(u)}</span>
                  <span className="text-xs text-muted-foreground">({u.userId})</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {getSubtitle(u)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{formatTime(u.lastTimestamp)}</span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{u.lastMessage}</p>
            </div>
            <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {u.count}
            </div>
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
            {/* Header */}
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">{getDisplayName(selectedUser)}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedUser.userId} · {getSubtitle(selectedUser)} · {selectedUser.count} 条消息
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="rounded-md p-2 hover:bg-muted"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedUser.messages
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((msg) => {
                  const isOutgoing = msg.direction === 'outgoing'
                  return (
                    <div key={msg.id} className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(msg.timestamp).toLocaleString('zh-CN')}</span>
                        {msg.groupId && (
                          <span className="rounded bg-muted px-1 py-0.5">群 {msg.groupId}</span>
                        )}
                        <span className="rounded bg-muted px-1 py-0.5">
                          {isOutgoing ? '我' : '对方'}
                        </span>
                      </div>
                      <div
                        className={`mt-1 max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          isOutgoing
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/50'
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
