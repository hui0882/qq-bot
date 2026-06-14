// src/app/(authenticated)/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface Config {
  ws: { url: string; token: string; reconnect: boolean; reconnectInterval: number; maxReconnectInterval: number }
  api: { url: string; token: string }
  tts: { enabled: boolean; apiUrl: string; apiKey: string; model: string; voice: string; style: string; format: string }
  voiceReply: { mode: 'off' | 'always' | 'auto' }
  friendRequest: { mode: 'auto' | 'manual' }
  auth: { token: string }
  log: { maxEntries: number; persistToFile: boolean; logDir: string }
}

function MaskedInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [revealed, setRevealed] = useState(false)
  const masked = value ? '•'.repeat(Math.min(value.length, 20)) : ''
  return (
    <div className="flex gap-2">
      <input
        type={revealed ? 'text' : 'password'}
        value={revealed ? value : masked}
        onChange={(e) => onChange(e.target.value)}
        readOnly={revealed ? false : true}
        onClick={() => { if (!revealed) setRevealed(true) }}
        placeholder={placeholder}
        className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer"
      />
      <button
        type="button"
        onClick={() => setRevealed(!revealed)}
        className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent shrink-0"
      >
        {revealed ? '隐藏' : '查看'}
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const data = await res.json()
    setMessage(data.success ? '保存成功，热重载已触发' : `保存失败: ${data.message}`)
    setSaving(false)
  }

  const handleTestConnection = () => {
    if (!config) return
    setMessage('测试中...')
    let testUrl = config.ws.url
    if (config.ws.token) {
      const sep = testUrl.includes('?') ? '&' : '?'
      testUrl = `${testUrl}${sep}access_token=${encodeURIComponent(config.ws.token)}`
    }
    const testWs = new WebSocket(testUrl)
    testWs.onopen = () => { setMessage('连接成功!'); testWs.close() }
    testWs.onerror = () => setMessage('连接失败')
    setTimeout(() => { if (testWs.readyState !== WebSocket.OPEN) { testWs.close(); setMessage('连接超时') } }, 5000)
  }

  if (loading || !config) return <div className="flex items-center justify-center h-full">加载中...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">配置管理</h1>

      {/* WS */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">WebSocket 连接</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">WS 地址</label>
          <div className="flex gap-2">
            <input type="text" value={config.ws.url} onChange={(e) => setConfig({ ...config, ws: { ...config.ws, url: e.target.value } })} className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm" />
            <button onClick={handleTestConnection} className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent">测试连接</button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">WS Token</label>
          <MaskedInput value={config.ws.token} onChange={(v) => setConfig({ ...config, ws: { ...config.ws, token: v } })} placeholder="access_token" />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.ws.reconnect} onChange={(e) => setConfig({ ...config, ws: { ...config.ws, reconnect: e.target.checked } })} className="h-4 w-4" />
            自动重连
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">重连间隔 (ms)</label>
            <input type="number" value={config.ws.reconnectInterval} onChange={(e) => setConfig({ ...config, ws: { ...config.ws, reconnectInterval: parseInt(e.target.value) || 5000 } })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">最大重连间隔 (ms)</label>
            <input type="number" value={config.ws.maxReconnectInterval} onChange={(e) => setConfig({ ...config, ws: { ...config.ws, maxReconnectInterval: parseInt(e.target.value) || 30000 } })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* HTTP API */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">HTTP API</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">API 地址</label>
          <input type="text" value={config.api?.url || ''} onChange={(e) => setConfig({ ...config, api: { ...config.api, url: e.target.value } })} placeholder="http://115.190.250.31:3000" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">API Token</label>
          <MaskedInput value={config.api?.token || ''} onChange={(v) => setConfig({ ...config, api: { ...config.api, token: v } })} placeholder="与 WS Token 相同" />
        </div>
      </div>

      {/* Voice Reply */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">语音回复</h2>
        <p className="text-sm text-muted-foreground">收到私聊消息时的回复方式</p>
        <div className="flex gap-3">
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.voiceReply?.mode === 'off' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="voiceReply" value="off" checked={config.voiceReply?.mode === 'off'} onChange={() => setConfig({ ...config, voiceReply: { mode: 'off' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">关闭</div><div className="text-xs text-muted-foreground">文本回复</div></div>
          </label>
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.voiceReply?.mode === 'always' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="voiceReply" value="always" checked={config.voiceReply?.mode === 'always'} onChange={() => setConfig({ ...config, voiceReply: { mode: 'always' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">始终语音回复</div><div className="text-xs text-muted-foreground">消息转语音</div></div>
          </label>
          <label className="flex items-center gap-2 rounded-lg border-2 border-muted px-4 py-3 opacity-50 cursor-not-allowed" title="需要接入大语言模型后可用">
            <input type="radio" name="voiceReply" value="auto" disabled className="h-4 w-4" />
            <div><div className="text-sm font-medium">自动</div><div className="text-xs text-muted-foreground">AI 判断</div></div>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">音色: {config.tts?.voice || '茉莉'} · 风格: {config.tts?.style || '温柔'}</p>
      </div>

      {/* Friend Request */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">好友请求</h2>
        <p className="text-sm text-muted-foreground">收到好友申请时的处理方式</p>
        <div className="flex gap-3">
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.friendRequest?.mode === 'auto' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="friendRequest" value="auto" checked={config.friendRequest?.mode === 'auto'} onChange={() => setConfig({ ...config, friendRequest: { mode: 'auto' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">自动同意</div><div className="text-xs text-muted-foreground">直接添加为好友</div></div>
          </label>
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.friendRequest?.mode === 'manual' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="friendRequest" value="manual" checked={config.friendRequest?.mode === 'manual'} onChange={() => setConfig({ ...config, friendRequest: { mode: 'manual' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">手动同意</div><div className="text-xs text-muted-foreground">在好友请求中处理</div></div>
          </label>
        </div>
      </div>

      {/* Auth */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">平台认证</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">登录 Token</label>
          <MaskedInput value={config.auth.token} onChange={(v) => setConfig({ ...config, auth: { ...config.auth, token: v } })} placeholder="登录凭证" />
          <p className="mt-1 text-xs text-muted-foreground">修改后需要重新登录</p>
        </div>
      </div>

      {/* Log */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">日志</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">最大日志条数</label>
          <input type="number" value={config.log.maxEntries} onChange={(e) => setConfig({ ...config, log: { ...config.log, maxEntries: parseInt(e.target.value) || 5000 } })} className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={config.log.persistToFile} onChange={(e) => setConfig({ ...config, log: { ...config.log, persistToFile: e.target.checked } })} className="h-4 w-4" />
          持久化到文件
        </label>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? '保存中...' : '保存配置'}
        </button>
        {message && <span className={`text-sm ${message.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>{message}</span>}
      </div>
    </div>
  )
}
