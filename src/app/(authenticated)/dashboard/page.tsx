// src/app/(authenticated)/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { PageLoading, DashboardCardSkeleton } from '@/components/loading'

interface ConnectionInfo { status: string; connectedAt: number | null; reconnectCount: number }
interface LoginInfo { user_id: number; nickname: string }
interface StatusInfo { online: boolean; good: boolean }
interface VersionInfo { app_name: string; app_version: string; protocol_version: string }

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
      const anyFailed = [loginRes, statusRes, versionRes].some(
        (r) => r.status === 'failed' || r.message?.includes('not connected'),
      )
      if (anyFailed) setApiError('无法获取数据 — WebSocket 未连接')
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
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'connection_status') {
          setConnInfo(msg.data)
          if (msg.data?.status === 'connected') loadData()
          else if (msg.data?.status === 'disconnected' || msg.data?.status === 'error') {
            setLoading(false)
            setApiError('WebSocket 未连接 — 请检查连接配置')
          }
        }
      } catch { /* ignore */ }
    }
    loadData()
    return () => eventSource.close()
  }, [])

  const isConnected = connInfo?.status === 'connected'
  const isError = connInfo?.status === 'error' || connInfo?.status === 'disconnected'

  if (loading && !connInfo) return <PageLoading text="连接 NapCat 服务中..." />

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">状态监控</h1>
          <p className="text-sm text-muted-foreground mt-1">NapCat 服务运行状态</p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          <span className={loading ? 'animate-spin' : ''}>↻</span>
          刷新
        </button>
      </div>

      {/* Connection Banner */}
      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 animate-slide-in-up">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-lg">⚠️</span>
            </div>
            <div>
              <p className="font-medium text-destructive">连接失败</p>
              <p className="text-sm text-destructive/70">无法连接到 WebSocket 服务器</p>
            </div>
          </div>
        </div>
      )}

      {connInfo?.status === 'connecting' && (
        <div className="rounded-xl border border-amber-300/30 bg-amber-500/5 p-4 animate-slide-in-up">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <span className="text-lg animate-pulse">⏳</span>
            </div>
            <div>
              <p className="font-medium text-amber-700">正在连接...</p>
              <p className="text-sm text-amber-600/70">正在尝试连接到 NapCat 服务</p>
            </div>
          </div>
        </div>
      )}

      {/* Status Cards Grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Connection Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm card-hover animate-fade-in stagger-1">
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isConnected ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <span className="text-2xl">{isConnected ? '🟢' : '🔴'}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">连接状态</h3>
              <p className={`text-xl font-bold ${isConnected ? 'text-emerald-600' : 'text-red-600'}`}>
                {isConnected ? '已连接' : connInfo?.status === 'connecting' ? '连接中' : '未连接'}
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            {connInfo?.connectedAt && (
              <p>🕐 连接时间: {new Date(connInfo.connectedAt).toLocaleString('zh-CN')}</p>
            )}
            <p>🔄 重连次数: {connInfo?.reconnectCount || 0}</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm card-hover animate-fade-in stagger-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
              <span className="text-2xl">👤</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">登录信息</h3>
              {loginInfo ? (
                <p className="text-xl font-bold">{loginInfo.nickname}</p>
              ) : (
                <p className="text-muted-foreground">未获取</p>
              )}
            </div>
          </div>
          {loginInfo && (
            <p className="text-sm text-muted-foreground">QQ 号: {loginInfo.user_id}</p>
          )}
        </div>

        {/* Status Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm card-hover animate-fade-in stagger-3">
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${statusInfo?.online ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <span className="text-2xl">{statusInfo?.online ? '✅' : '❌'}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">运行状态</h3>
              <p className="text-xl font-bold">{statusInfo?.online ? '在线' : '离线'}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            状态: {statusInfo?.good ? '正常' : '异常'}
          </p>
        </div>

        {/* Version Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm card-hover animate-fade-in stagger-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10">
              <span className="text-2xl">📦</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">版本信息</h3>
              {versionInfo ? (
                <p className="text-xl font-bold">{versionInfo.app_version}</p>
              ) : (
                <p className="text-muted-foreground">未获取</p>
              )}
            </div>
          </div>
          {versionInfo && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>应用: {versionInfo.app_name}</p>
              <p>协议: {versionInfo.protocol_version}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Info */}
      {apiError && isConnected && (
        <div className="rounded-xl border border-amber-300/30 bg-amber-500/5 p-4 animate-fade-in">
          <p className="text-sm text-amber-700">{apiError}</p>
        </div>
      )}
    </div>
  )
}
