// src/app/(authenticated)/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface Config {
  ws: { url: string; token: string; reconnect: boolean; reconnectInterval: number; maxReconnectInterval: number }
  api: { url: string; token: string }
  tts: { enabled: boolean; apiUrl: string; apiKey: string; model: string; voice: string; style: string; format: string }
  voiceReply: { mode: 'off' | 'always' | 'auto'; allowUserOverride: boolean }
  commands?: {
    enabled: boolean
    prefix: string
    allowUserOverride: boolean
    definitions: Array<{
      name: string
      description: string
      usage: string
      enabled: boolean
      handler: string
    }>
  }
  ai?: {
    enabled: boolean
    baseUrl: string
    apiKey: string
    model: string
    maxTokens: number
    temperature: number
    maxContextRounds: number
    defaultReplyType: 'text' | 'voice'
    debugContext: boolean
    fileReplyEnabled: boolean
    systemPrompt: string
  }
  friendRequest: { mode: 'auto' | 'manual'; welcomeMessage: string }
  auth: { token: string }
  log: { maxEntries: number; persistToFile: boolean; logDir: string }
}

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'partial' | 'error'
  message: string
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
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle', message: '' })

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

  const handleReset = async () => {
    if (!confirm('确定要恢复默认配置吗？当前所有配置将被覆盖。')) return
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/config/reset', { method: 'POST' })
    const data = await res.json()
    if (data.success && data.data) {
      setConfig(data.data)
      setMessage('已恢复默认配置')
    } else {
      setMessage(`恢复失败: ${data.message}`)
    }
    setSaving(false)
  }

  const handleRestart = async () => {
    if (!confirm('确定要重启服务吗？页面会短暂断开后自动恢复。')) return
    setMessage('服务正在重启，请稍候...')
    try {
      await fetch('/api/system/restart', { method: 'POST' })
    } catch {
      // 服务已断开，正常
    }
    // 轮询等待服务恢复
    setTimeout(() => {
      const check = setInterval(async () => {
        try {
          const res = await fetch('/api/config')
          if (res.ok) {
            clearInterval(check)
            window.location.reload()
          }
        } catch { /* 服务还没起来 */ }
      }, 2000)
    }, 3000)
  }

  const handleTestConnection = async () => {
    if (!config) return
    if (!config.ws.url) {
      setTestResult({ status: 'error', message: '请先填写 WS 地址' })
      return
    }
    setTestResult({ status: 'testing', message: '测试中...' })

    // Step 1: Test WS connection
    let testUrl = config.ws.url
    if (config.ws.token) {
      const sep = testUrl.includes('?') ? '&' : '?'
      testUrl = `${testUrl}${sep}access_token=${encodeURIComponent(config.ws.token)}`
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(testUrl)
        const timeout = setTimeout(() => { ws.close(); reject(new Error('超时')) }, 5000)
        ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve() }
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('连接失败')) }
      })
    } catch (err) {
      setTestResult({ status: 'error', message: `❌ WS 连接失败: ${(err as Error).message}` })
      return
    }

    // Step 2: Test API via WS proxy
    try {
      const res = await fetch('/api/ws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_login_info' }),
      })
      const data = await res.json()

      if (data.status === 'ok' && data.data?.user_id) {
        setTestResult({
          status: 'success',
          message: `✅ 连接正常 — ${data.data.nickname} (${data.data.user_id})`,
        })
      } else {
        setTestResult({
          status: 'partial',
          message: `⚠️ WS 已连接，但无法获取数据: ${data.message || '未知错误'}`,
        })
      }
    } catch (err) {
      setTestResult({
        status: 'partial',
        message: `⚠️ WS 已连接，但 API 请求失败: ${(err as Error).message}`,
      })
    }
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
            <button
              onClick={handleTestConnection}
              disabled={testResult.status === 'testing'}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 shrink-0"
            >
              {testResult.status === 'testing' ? '测试中...' : '测试连接'}
            </button>
          </div>
          {/* Test result shown right below the button area */}
          {testResult.status !== 'idle' && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-sm animate-fade-in ${
              testResult.status === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
              testResult.status === 'partial' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              testResult.status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-muted text-muted-foreground'
            }`}>
              {testResult.message}
            </div>
          )}
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

        <label className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.voiceReply?.allowUserOverride || false}
            onChange={(e) => setConfig({ ...config, voiceReply: { ...config.voiceReply, allowUserOverride: e.target.checked } })}
            className="h-4 w-4"
          />
          <div>
            <div className="text-sm font-medium">允许用户自定义</div>
            <div className="text-xs text-muted-foreground">用户可通过 /response-type 命令自行设置回复模式</div>
          </div>
        </label>

        <div className={`flex gap-3 ${config.voiceReply?.allowUserOverride ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.voiceReply?.mode === 'off' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="voiceReply" value="off" checked={config.voiceReply?.mode === 'off'} onChange={() => setConfig({ ...config, voiceReply: { ...config.voiceReply, mode: 'off' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">关闭</div><div className="text-xs text-muted-foreground">文本回复</div></div>
          </label>
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.voiceReply?.mode === 'always' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="voiceReply" value="always" checked={config.voiceReply?.mode === 'always'} onChange={() => setConfig({ ...config, voiceReply: { ...config.voiceReply, mode: 'always' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">始终语音回复</div><div className="text-xs text-muted-foreground">消息转语音</div></div>
          </label>
          <label className="flex items-center gap-2 rounded-lg border-2 border-muted px-4 py-3 opacity-50 cursor-not-allowed" title="需要接入大语言模型后可用">
            <input type="radio" name="voiceReply" value="auto" disabled className="h-4 w-4" />
            <div><div className="text-sm font-medium">自动</div><div className="text-xs text-muted-foreground">AI 判断</div></div>
          </label>
        </div>

        {config.voiceReply?.allowUserOverride && (
          <p className="text-xs text-amber-600">⚠️ 用户自定义已开启，全局回复模式设置已禁用</p>
        )}
        <p className="text-xs text-muted-foreground">音色: {config.tts?.voice || '茉莉'} · 风格: {config.tts?.style || '温柔'}</p>
      </div>

      {/* AI */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">AI 聊天</h2>
        <p className="text-sm text-muted-foreground">接入大语言模型，实现智能对话回复</p>

        <label className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.ai?.enabled || false}
            onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, enabled: e.target.checked } })}
            className="h-4 w-4"
          />
          <div>
            <div className="text-sm font-medium">启用 AI 回复</div>
            <div className="text-xs text-muted-foreground">开启后私聊消息将由 AI 处理回复</div>
          </div>
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium">系统提示词</label>
          <textarea
            value={config.ai?.systemPrompt || ''}
            onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, systemPrompt: e.target.value } })}
            placeholder="你是一个友好、有帮助的 AI 助手。请用中文回复。"
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[80px]"
          />
          <p className="mt-1 text-xs text-muted-foreground">定义 AI 的角色和行为规则，所有用户共享此提示词。语音模式会自动追加简洁回复规则。</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">API 地址</label>
          <input
            type="text"
            value={config.ai?.baseUrl || ''}
            onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, baseUrl: e.target.value } })}
            placeholder="https://api.openai.com/v1"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">API Key</label>
          <MaskedInput
            value={config.ai?.apiKey || ''}
            onChange={(v) => setConfig({ ...config, ai: { ...config.ai!, apiKey: v } })}
            placeholder="sk-..."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">模型名称</label>
            <input
              type="text"
              value={config.ai?.model || ''}
              onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, model: e.target.value } })}
              placeholder="gpt-4o"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">最大 Token 数</label>
            <input
              type="number"
              value={config.ai?.maxTokens || 2048}
              onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, maxTokens: parseInt(e.target.value) || 2048 } })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={config.ai?.temperature || 0.7}
              onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, temperature: parseFloat(e.target.value) || 0.7 } })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">上下文轮数</label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.ai?.maxContextRounds || 10}
              onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, maxContextRounds: parseInt(e.target.value) || 10 } })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">默认回复方式</label>
          <div className="flex gap-3">
            <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.ai?.defaultReplyType === 'text' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
              <input type="radio" name="aiReplyType" value="text" checked={config.ai?.defaultReplyType === 'text'} onChange={() => setConfig({ ...config, ai: { ...config.ai!, defaultReplyType: 'text' } })} className="h-4 w-4" />
              <div><div className="text-sm font-medium">文本</div></div>
            </label>
            <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.ai?.defaultReplyType === 'voice' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
              <input type="radio" name="aiReplyType" value="voice" checked={config.ai?.defaultReplyType === 'voice'} onChange={() => setConfig({ ...config, ai: { ...config.ai!, defaultReplyType: 'voice' } })} className="h-4 w-4" />
              <div><div className="text-sm font-medium">语音</div></div>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={config.ai?.debugContext || false}
              onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, debugContext: e.target.checked } })}
              className="h-4 w-4"
            />
            记录模型上下文（调试模式）
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={config.ai?.fileReplyEnabled || false}
              onChange={(e) => setConfig({ ...config, ai: { ...config.ai!, fileReplyEnabled: e.target.checked } })}
              className="h-4 w-4"
            />
            收到文件时触发 AI 回复
          </label>
        </div>
      </div>

      {/* 命令管理 */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-medium mb-3">命令管理</h3>

        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={config.commands?.enabled ?? true}
            onChange={(e) =>
              setConfig({
                ...config,
                commands: { ...(config.commands || { enabled: true, prefix: '/', allowUserOverride: false, definitions: [] }), enabled: e.target.checked },
              })
            }
          />
          <span>启用命令系统</span>
        </label>

        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={config.commands?.allowUserOverride ?? false}
            onChange={(e) =>
              setConfig({
                ...config,
                commands: { ...(config.commands || { enabled: true, prefix: '/', allowUserOverride: false, definitions: [] }), allowUserOverride: e.target.checked },
              })
            }
          />
          <span>允许用户自定义回复模式</span>
        </label>

        {config.commands?.definitions && config.commands.definitions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 mb-2">命令列表：</p>
            {config.commands.definitions.map((def, i) => (
              <label key={def.name} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={def.enabled}
                  onChange={(e) => {
                    const defs = [...(config.commands?.definitions || [])]
                    defs[i] = { ...defs[i], enabled: e.target.checked }
                    setConfig({
                      ...config,
                      commands: { ...(config.commands || { enabled: true, prefix: '/', allowUserOverride: false, definitions: [] }), definitions: defs },
                    })
                  }}
                />
                <span className="font-mono">/{def.name}</span>
                <span className="text-gray-400">— {def.description}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Friend Request */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">好友请求</h2>
        <p className="text-sm text-muted-foreground">收到好友申请时的处理方式</p>
        <div className="flex gap-3">
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.friendRequest?.mode === 'auto' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="friendRequest" value="auto" checked={config.friendRequest?.mode === 'auto'} onChange={() => setConfig({ ...config, friendRequest: { ...config.friendRequest, mode: 'auto' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">自动同意</div><div className="text-xs text-muted-foreground">直接添加为好友</div></div>
          </label>
          <label className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 cursor-pointer transition-colors ${config.friendRequest?.mode === 'manual' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
            <input type="radio" name="friendRequest" value="manual" checked={config.friendRequest?.mode === 'manual'} onChange={() => setConfig({ ...config, friendRequest: { ...config.friendRequest, mode: 'manual' } })} className="h-4 w-4" />
            <div><div className="text-sm font-medium">手动同意</div><div className="text-xs text-muted-foreground">在好友请求中处理</div></div>
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">欢迎消息</label>
          <textarea
            value={config.friendRequest?.welcomeMessage || ''}
            onChange={(e) => setConfig({ ...config, friendRequest: { ...config.friendRequest, welcomeMessage: e.target.value } })}
            placeholder="添加好友后自动发送的消息（留空则不发送）"
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">添加好友成功后自动发送，不调用 AI，但会记录到对话上下文</p>
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

      {/* Save & Reset & Restart */}
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button onClick={handleReset} disabled={saving} className="inline-flex items-center justify-center rounded-md border border-destructive/50 px-6 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
          恢复默认配置
        </button>
        <button onClick={handleRestart} className="inline-flex items-center justify-center rounded-md border border-orange-400/50 px-6 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50">
          重启服务
        </button>
        {message && <span className={`text-sm ${message.includes('成功') || message.includes('恢复') || message.includes('重启') ? 'text-green-600' : 'text-destructive'}`}>{message}</span>}
      </div>
    </div>
  )
}
