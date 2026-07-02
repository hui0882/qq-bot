// src/app/(authenticated)/school/page.tsx
'use client'

import { useEffect, useState } from 'react'

export default function SchoolPage() {
  const [enabledCommands, setEnabledCommands] = useState(true)
  const [enabledAI, setEnabledAI] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [hasCredentials, setHasCredentials] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveMsg, setSaveMsg] = useState('')

  // Load config
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.school) {
          setEnabledCommands(data.data.school.enabledCommands !== false)
          setEnabledAI(data.data.school.enabledAI !== false)
        }
      })
      .catch(() => {})

    fetch('/api/school/credentials')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setSchoolName(data.data.schoolName || '')
          setUsername(data.data.username || '')
          setHasCredentials(data.data.hasCredentials || false)
        }
      })
      .catch(() => {})
  }, [])

  // Save feature toggles
  async function handleToggleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school: { enabledCommands, enabledAI },
        }),
      })
      const data = await resp.json()
      setSaveMsg(data.success ? '开关配置已保存' : '保存失败')
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  // Save credentials
  async function handleCredentialsSave() {
    if (!username || !password) {
      setSaveMsg('账号和密码不能为空')
      return
    }
    setSaving(true)
    setSaveMsg('')
    try {
      const resp = await fetch('/api/school/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await resp.json()
      if (data.success) {
        setSaveMsg('账号密码已保存')
        setHasCredentials(true)
      } else {
        setSaveMsg(data.message || '保存失败')
      }
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  // Test connection
  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('/api/school/test', { method: 'POST' })
      const data = await resp.json()
      setTestResult(data)
    } catch {
      setTestResult({ success: false, message: '连接测试失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">学业助手</h1>
        <p className="text-muted-foreground mt-1">配置学校平台账号，查询待提交作业</p>
      </div>

      {/* Feature Toggles */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">功能开关</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabledCommands}
            onChange={e => setEnabledCommands(e.target.checked)}
            className="h-4 w-4"
          />
          <div>
            <div className="text-sm font-medium">允许命令查询</div>
            <div className="text-xs text-muted-foreground">用户可通过 /homework 命令查询作业</div>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabledAI}
            onChange={e => setEnabledAI(e.target.checked)}
            className="h-4 w-4"
          />
          <div>
            <div className="text-sm font-medium">允许 AI 查询</div>
            <div className="text-xs text-muted-foreground">AI 对话中可自动查询作业</div>
          </div>
        </label>

        <button
          onClick={handleToggleSave}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存开关配置'}
        </button>
      </div>

      {/* Account Configuration */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">账号配置</h2>

        <div>
          <label className="mb-1 block text-sm font-medium">学校</label>
          <input
            type="text"
            value={schoolName}
            disabled
            className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">账号（学号）</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="请输入学号"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">密码</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={hasCredentials ? '已设置（留空不修改）' : '请输入密码'}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCredentialsSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存账号密码'}
          </button>

          <button
            onClick={handleTest}
            disabled={testing || !hasCredentials}
            className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
        </div>

        {testResult && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            testResult.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {testResult.message}
          </div>
        )}
      </div>

      {/* Status Message */}
      {saveMsg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${
          saveMsg.includes('已保存') || saveMsg.includes('已保存')
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMsg}
        </div>
      )}

      {/* Usage Instructions */}
      <div className="rounded-lg border p-6 space-y-2">
        <h2 className="text-lg font-semibold">使用说明</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>命令方式：发送 <code className="bg-muted px-1 rounded">/set-config &lt;账号&gt; &lt;密码&gt;</code> 配置账号</p>
          <p>命令方式：发送 <code className="bg-muted px-1 rounded">/homework</code> 查询作业</p>
          <p>AI 方式：直接对 AI 说{'“'}查一下作业{'”'}即可自动查询</p>
        </div>
      </div>
    </div>
  )
}
