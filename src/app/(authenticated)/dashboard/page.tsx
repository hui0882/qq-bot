// src/app/(authenticated)/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface ConnectionInfo {
  status: string
  connectedAt: number | null
  reconnectCount: number
}

interface LoginInfo {
  user_id: number
  nickname: string
}

interface StatusInfo {
  online: boolean
  good: boolean
}

interface VersionInfo {
  app_name: string
  app_version: string
  protocol_version: string
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
}

export default function DashboardPage() {
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null)
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null)
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const callApi = async (action: string) => {
    const res = await fetch('/api/ws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    return res.json()
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [loginRes, statusRes, versionRes] = await Promise.all([
        callApi('get_login_info'),
        callApi('get_status'),
        callApi('get_version_info'),
      ])
      if (loginRes?.data) setLoginInfo(loginRes.data)
      if (statusRes?.data) setStatusInfo(statusRes.data)
      if (versionRes?.data) setVersionInfo(versionRes.data)
    } catch {
      // handle error silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'connection_status') {
          setConnInfo(msg.data)
        }
      } catch {
        // ignore
      }
    }

    return () => eventSource.close()
  }, [])

  const handleReconnect = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ws: { url: 'ws://115.190.250.31:3001' } }),
    })
    setTimeout(loadData, 1000)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">状态监控</h1>
        <button
          onClick={handleReconnect}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          重连
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <StatusCard title="连接状态">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusDot online={connInfo?.status === 'connected'} />
              <span className="font-medium">{connInfo?.status || '未知'}</span>
            </div>
            {connInfo?.connectedAt && (
              <p className="text-sm text-muted-foreground">
                连接时间: {new Date(connInfo.connectedAt).toLocaleString('zh-CN')}
              </p>
            )}
            <p className="text-sm text-muted-foreground">重连次数: {connInfo?.reconnectCount || 0}</p>
          </div>
        </StatusCard>

        <StatusCard title="登录信息">
          {loginInfo ? (
            <div className="space-y-2">
              <p><span className="text-muted-foreground">QQ 号:</span> {loginInfo.user_id}</p>
              <p><span className="text-muted-foreground">昵称:</span> {loginInfo.nickname}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">未获取到登录信息</p>
          )}
        </StatusCard>

        <StatusCard title="运行状态">
          {statusInfo ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusDot online={statusInfo.online} />
                <span>{statusInfo.online ? '在线' : '离线'}</span>
              </div>
              <p className="text-sm text-muted-foreground">状态: {statusInfo.good ? '正常' : '异常'}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">未获取到运行状态</p>
          )}
        </StatusCard>

        <StatusCard title="版本信息">
          {versionInfo ? (
            <div className="space-y-2">
              <p><span className="text-muted-foreground">应用:</span> {versionInfo.app_name}</p>
              <p><span className="text-muted-foreground">版本:</span> {versionInfo.app_version}</p>
              <p><span className="text-muted-foreground">协议:</span> {versionInfo.protocol_version}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">未获取到版本信息</p>
          )}
        </StatusCard>
      </div>
    </div>
  )
}
