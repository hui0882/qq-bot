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
  const [apiError, setApiError] = useState<string | null>(null)

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
    setApiError(null)
    try {
      const [loginRes, statusRes, versionRes] = await Promise.all([
        callApi('get_login_info'),
        callApi('get_status'),
        callApi('get_version_info'),
      ])

      // Check if any API call failed due to WS not connected
      const anyFailed = [loginRes, statusRes, versionRes].some(
        (r) => r.status === 'failed' || r.message?.includes('not connected'),
      )
      if (anyFailed) {
        setApiError('无法获取数据 — WebSocket 未连接')
      }

      if (loginRes?.data && loginRes.status !== 'failed') setLoginInfo(loginRes.data)
      if (statusRes?.data && statusRes.status !== 'failed') setStatusInfo(statusRes.data)
      if (versionRes?.data && versionRes.status !== 'failed') setVersionInfo(versionRes.data)
    } catch {
      setApiError('请求失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Subscribe to SSE for connection status first
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'connection_status') {
          setConnInfo(msg.data)
          // Once we get connection status, load API data
          if (msg.data?.status === 'connected') {
            loadData()
          } else if (msg.data?.status === 'disconnected' || msg.data?.status === 'error') {
            setLoading(false)
            setApiError('WebSocket 未连接 — 请检查连接配置')
          }
        }
      } catch {
        // ignore
      }
    }

    eventSource.onerror = () => {
      setLoading(false)
    }

    // Also try loading data immediately in case WS is already connected
    loadData()

    return () => eventSource.close()
  }, [])

  const handleReconnect = async () => {
    setApiError(null)
    setLoading(true)
    // Trigger reconnect by toggling config
    const res = await fetch('/api/config')
    const configData = await res.json()
    if (configData.data) {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData.data),
      })
    }
    // Wait a bit then reload
    setTimeout(loadData, 2000)
  }

  const isConnected = connInfo?.status === 'connected'
  const isError = connInfo?.status === 'error' || connInfo?.status === 'disconnected'

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

      {/* Connection Status Banner */}
      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-3">
            <StatusDot online={false} />
            <div>
              <p className="font-medium text-destructive">连接失败</p>
              <p className="text-sm text-destructive/80">
                无法连接到 WebSocket 服务器。请检查：
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-destructive/80">
                <li>服务器地址是否正确</li>
                <li>WS Token 是否正确</li>
                <li>服务器是否在线</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {connInfo?.status === 'connecting' && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-yellow-500" />
            <p className="font-medium text-yellow-700">正在连接...</p>
          </div>
        </div>
      )}

      {apiError && isConnected && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <p className="text-sm text-yellow-700">{apiError}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <StatusCard title="连接状态">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusDot online={isConnected} />
              <span className={`font-medium ${isError ? 'text-destructive' : ''}`}>
                {connInfo?.status === 'connected'
                  ? '已连接'
                  : connInfo?.status === 'connecting'
                    ? '连接中...'
                    : connInfo?.status === 'error'
                      ? '连接错误'
                      : connInfo?.status || '未知'}
              </span>
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
            <p className="text-muted-foreground">{loading ? '加载中...' : '未获取到登录信息'}</p>
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
            <p className="text-muted-foreground">{loading ? '加载中...' : '未获取到运行状态'}</p>
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
            <p className="text-muted-foreground">{loading ? '加载中...' : '未获取到版本信息'}</p>
          )}
        </StatusCard>
      </div>
    </div>
  )
}
