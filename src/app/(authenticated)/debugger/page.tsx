// src/app/(authenticated)/debugger/page.tsx
'use client'

import { useState } from 'react'

interface DebugEntry {
  id: number
  timestamp: number
  action: string
  params: Record<string, unknown>
  response: unknown
  duration: number
}

const COMMON_ACTIONS = [
  'get_login_info',
  'get_status',
  'get_version_info',
  'get_friend_list',
  'get_group_list',
  'get_group_info',
  'get_group_member_list',
  'get_group_msg_history',
  'get_friend_msg_history',
  'send_msg',
  'delete_msg',
  'set_friend_add_request',
  'set_group_kick',
  'set_group_ban',
  'set_group_leave',
  'set_group_name',
  'set_group_card',
  'get_image',
  'get_record',
  'get_file',
  'can_send_image',
  'can_send_record',
  'get_cookies',
  'get_csrf_token',
  'get_credentials',
  'clean_cache',
  'set_online_status',
  'get_stranger_info',
  'get_group_system_msg',
]

const PARAM_TEMPLATES: Record<string, Record<string, unknown>> = {
  get_friend_list: {},
  get_group_list: {},
  get_login_info: {},
  get_status: {},
  get_version_info: {},
  get_group_info: { group_id: '123456' },
  get_group_member_list: { group_id: '123456' },
  get_group_msg_history: { group_id: '123456', count: 20 },
  get_friend_msg_history: { user_id: '123456789', count: 20 },
  send_msg: {
    message_type: 'private',
    user_id: '123456789',
    message: [{ type: 'text', data: { text: 'hello' } }],
  },
  delete_msg: { message_id: 12345 },
  set_friend_add_request: { flag: 'flag_xxx', approve: true },
  set_group_kick: { group_id: '123456', user_id: '123456789' },
  set_group_ban: { group_id: '123456', user_id: '123456789', duration: 60 },
}

export default function DebuggerPage() {
  const [action, setAction] = useState('get_login_info')
  const [paramsStr, setParamsStr] = useState('{}')
  const [response, setResponse] = useState<unknown>(null)
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<DebugEntry[]>([])

  const handleActionChange = (newAction: string) => {
    setAction(newAction)
    const template = PARAM_TEMPLATES[newAction]
    if (template) setParamsStr(JSON.stringify(template, null, 2))
  }

  const handleSend = async () => {
    setSending(true)
    setResponse(null)
    const startTime = Date.now()

    try {
      const params = JSON.parse(paramsStr)
      const res = await fetch('/api/ws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params }),
      })
      const data = await res.json()
      const duration = Date.now() - startTime

      setResponse(data)
      setHistory((prev) => [
        { id: Date.now(), timestamp: Date.now(), action, params, response: data, duration },
        ...prev.slice(0, 49),
      ])
    } catch (err) {
      setResponse({ error: (err as Error).message })
    } finally {
      setSending(false)
    }
  }

  const replayEntry = (entry: DebugEntry) => {
    setAction(entry.action)
    setParamsStr(JSON.stringify(entry.params, null, 2))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">API 调试器</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">请求</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Action</label>
                <select
                  value={action}
                  onChange={(e) => handleActionChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {COMMON_ACTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Params (JSON)</label>
                <textarea
                  value={paramsStr}
                  onChange={(e) => setParamsStr(e.target.value)}
                  rows={12}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={sending}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? '发送中...' : '发送请求'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">响应</h2>
            {response ? (
              <pre className="max-h-[500px] overflow-auto rounded bg-muted p-4 font-mono text-sm">
                {JSON.stringify(response, null, 2)}
              </pre>
            ) : (
              <p className="text-center text-muted-foreground">发送请求后查看响应</p>
            )}
          </div>

          {history.length > 0 && (
            <div className="rounded-lg border p-6">
              <h2 className="mb-4 text-lg font-semibold">历史记录</h2>
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => replayEntry(entry)}
                    className="flex cursor-pointer items-center justify-between rounded border p-2 text-sm hover:bg-muted/50"
                  >
                    <div>
                      <span className="font-mono">{entry.action}</span>
                      <span className={`ml-2 text-xs ${
                        (entry.response as Record<string, unknown>)?.status === 'ok'
                          ? 'text-green-600'
                          : 'text-destructive'
                      }`}>
                        {(entry.response as Record<string, unknown>)?.status as string}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{entry.duration}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
