// src/app/(authenticated)/messages/page.tsx
'use client'

import { useState } from 'react'

type MessageType = 'private' | 'group'

interface MessageSegment {
  type: string
  data: Record<string, string>
}

interface HistoryMessage {
  message_id: number
  user_id: number
  time: number
  message: MessageSegment[]
  raw_message: string
  sender?: { nickname: string }
}

export default function MessagesPage() {
  const [msgType, setMsgType] = useState<MessageType>('private')
  const [targetId, setTargetId] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')

  const [histTargetId, setHistTargetId] = useState('')
  const [histType, setHistType] = useState<MessageType>('private')
  const [histCount, setHistCount] = useState('20')
  const [history, setHistory] = useState<HistoryMessage[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const callApi = async (action: string, params?: Record<string, unknown>) => {
    const res = await fetch('/api/ws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    })
    return res.json()
  }

  const handleSend = async () => {
    if (!targetId || !content) return
    setSending(true)
    setSendResult('')

    const params: Record<string, unknown> = {
      message_type: msgType,
      message: [{ type: 'text', data: { text: content } }],
    }
    if (msgType === 'private') params.user_id = targetId
    else params.group_id = targetId

    const res = await callApi('send_msg', params)
    setSendResult(res.status === 'ok' ? `发送成功 (message_id: ${res.data?.message_id})` : `发送失败: ${res.message}`)
    setSending(false)
  }

  const handleLoadHistory = async () => {
    if (!histTargetId) return
    setLoadingHistory(true)

    const action = histType === 'group' ? 'get_group_msg_history' : 'get_friend_msg_history'
    const params: Record<string, unknown> = {
      count: parseInt(histCount, 10),
    }
    if (histType === 'group') params.group_id = histTargetId
    else params.user_id = histTargetId

    const res = await callApi(action, params)
    if (res.data?.messages) setHistory(res.data.messages)
    else setHistory([])
    setLoadingHistory(false)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">消息调试</h1>

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">发送消息</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">消息类型</label>
            <select
              value={msgType}
              onChange={(e) => setMsgType(e.target.value as MessageType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="private">私聊</option>
              <option value="group">群聊</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {msgType === 'private' ? '用户 QQ 号' : '群号'}
            </label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={msgType === 'private' ? '输入 QQ 号' : '输入群号'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">消息内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入消息内容..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleSend}
            disabled={sending || !targetId || !content}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? '发送中...' : '发送'}
          </button>
          {sendResult && (
            <span className={`text-sm ${sendResult.startsWith('发送成功') ? 'text-green-600' : 'text-destructive'}`}>
              {sendResult}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">历史消息</h2>
        <div className="mb-4 flex items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">类型</label>
            <select
              value={histType}
              onChange={(e) => setHistType(e.target.value as MessageType)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="private">私聊</option>
              <option value="group">群聊</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ID</label>
            <input
              type="text"
              value={histTargetId}
              onChange={(e) => setHistTargetId(e.target.value)}
              placeholder="QQ 号或群号"
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">条数</label>
            <input
              type="number"
              value={histCount}
              onChange={(e) => setHistCount(e.target.value)}
              className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleLoadHistory}
            disabled={loadingHistory || !histTargetId}
            className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {loadingHistory ? '加载中...' : '查询'}
          </button>
        </div>

        <div className="max-h-[500px] space-y-2 overflow-y-auto">
          {history.map((msg) => (
            <div key={msg.message_id} className="rounded border p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{msg.sender?.nickname || 'Unknown'} ({msg.user_id})</span>
                <span>{new Date(msg.time * 1000).toLocaleString('zh-CN')}</span>
              </div>
              <p className="mt-1">{msg.raw_message}</p>
            </div>
          ))}
          {history.length === 0 && !loadingHistory && (
            <p className="text-center text-muted-foreground">无消息记录</p>
          )}
        </div>
      </div>
    </div>
  )
}
