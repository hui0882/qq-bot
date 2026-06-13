// src/app/(authenticated)/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface Config {
  ws: {
    url: string
    token: string
    reconnect: boolean
    reconnectInterval: number
    maxReconnectInterval: number
  }
  api: {
    url: string
    token: string
  }
  auth: {
    token: string
  }
  log: {
    maxEntries: number
    persistToFile: boolean
    logDir: string
  }
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setConfig(data.data)
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setMessage('')

    // Build save payload, excluding masked tokens
    const payload: Record<string, unknown> = {
      ws: { ...config.ws },
      api: { ...config.api },
      log: { ...config.log },
    }
    // Only include auth.token if user actually changed it (not masked)
    if (config.auth.token && config.auth.token !== '***') {
      payload.auth = { token: config.auth.token }
    }
    // Only include ws.token if user actually changed it (not masked)
    if (config.ws.token === '***') {
      delete (payload.ws as Record<string, unknown>).token
    }
    // Only include api.token if user actually changed it (not masked)
    if (config.api.token === '***') {
      delete (payload.api as Record<string, unknown>).token
    }

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (data.success) {
      setMessage('保存成功，热重载已触发')
    } else {
      setMessage(`保存失败: ${data.message}`)
    }
    setSaving(false)
  }

  const handleTestConnection = async () => {
    if (!config) return
    setMessage('测试中...')
    try {
      let testUrl = config.ws.url
      if (config.ws.token && config.ws.token !== '***') {
        const sep = testUrl.includes('?') ? '&' : '?'
        testUrl = `${testUrl}${sep}access_token=${encodeURIComponent(config.ws.token)}`
      }
      const testWs = new WebSocket(testUrl)
      testWs.onopen = () => {
        setMessage('连接成功!')
        testWs.close()
      }
      testWs.onerror = () => {
        setMessage('连接失败')
      }
      setTimeout(() => {
        if (testWs.readyState !== WebSocket.OPEN) {
          testWs.close()
          setMessage('连接超时')
        }
      }, 5000)
    } catch {
      setMessage('连接失败')
    }
  }

  if (loading || !config) {
    return <div className="flex items-center justify-center h-full">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">配置管理</h1>

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">WebSocket 连接</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">WS 地址</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.ws.url}
                onChange={(e) => setConfig({ ...config, ws: { ...config.ws, url: e.target.value } })}
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
              <button
                onClick={handleTestConnection}
                className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                测试连接
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">WS Token (access_token)</label>
            <input
              type="text"
              value={config.ws.token || ''}
              onChange={(e) => setConfig({ ...config, ws: { ...config.ws, token: e.target.value } })}
              placeholder="留空表示不需要认证"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">NapCat WebSocket 的 access_token，连接时作为查询参数传递</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.ws.reconnect}
                onChange={(e) => setConfig({ ...config, ws: { ...config.ws, reconnect: e.target.checked } })}
              />
              自动重连
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">重连间隔 (ms)</label>
              <input
                type="number"
                value={config.ws.reconnectInterval}
                onChange={(e) =>
                  setConfig({ ...config, ws: { ...config.ws, reconnectInterval: parseInt(e.target.value) || 5000 } })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">最大重连间隔 (ms)</label>
              <input
                type="number"
                value={config.ws.maxReconnectInterval}
                onChange={(e) =>
                  setConfig({ ...config, ws: { ...config.ws, maxReconnectInterval: parseInt(e.target.value) || 30000 } })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">HTTP API</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">API 地址</label>
            <input
              type="text"
              value={config.api?.url || ''}
              onChange={(e) => setConfig({ ...config, api: { ...config.api, url: e.target.value } })}
              placeholder="http://115.190.250.31:3000"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">NapCat HTTP API 端口（通常比 WS 端口小 1）</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API Token</label>
            <input
              type="text"
              value={config.api?.token || ''}
              onChange={(e) => setConfig({ ...config, api: { ...config.api, token: e.target.value } })}
              placeholder="与 WS Token 相同"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">认证</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Token</label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={config.auth.token}
              onChange={(e) => setConfig({ ...config, auth: { ...config.auth, token: e.target.value } })}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {showToken ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">修改 Token 后需要重新登录</p>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">日志</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">最大日志条数</label>
            <input
              type="number"
              value={config.log.maxEntries}
              onChange={(e) =>
                setConfig({ ...config, log: { ...config.log, maxEntries: parseInt(e.target.value) || 5000 } })
              }
              className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.log.persistToFile}
              onChange={(e) => setConfig({ ...config, log: { ...config.log, persistToFile: e.target.checked } })}
            />
            持久化到文件
          </label>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
        {message && (
          <span className={`text-sm ${message.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}
