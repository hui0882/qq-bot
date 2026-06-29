// src/components/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { href: '/dashboard', label: '状态监控', icon: '📊' },
  { href: '/events', label: '事件', icon: '📨' },
  { href: '/contacts', label: '联系人', icon: '👥' },
  { href: '/users', label: '用户查询', icon: '🔍' },
  { href: '/messages', label: '消息调试', icon: '💬' },
  { href: '/debugger', label: 'API 调试', icon: '🔧' },
  { href: '/logs', label: '日志', icon: '📋' },
  { href: '/settings', label: '设置', icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [connStatus, setConnStatus] = useState<string>('connecting')

  useEffect(() => {
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'connection_status') {
          setConnStatus(msg.data?.status || 'disconnected')
        }
      } catch { /* ignore */ }
    }
    eventSource.onerror = () => setConnStatus('disconnected')
    return () => eventSource.close()
  }, [])

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    connected: { color: 'bg-emerald-500', bg: 'bg-emerald-500/10', label: '已连接' },
    connecting: { color: 'bg-amber-500', bg: 'bg-amber-500/10', label: '连接中' },
    disconnected: { color: 'bg-red-500', bg: 'bg-red-500/10', label: '已断开' },
    error: { color: 'bg-red-500', bg: 'bg-red-500/10', label: '错误' },
  }

  const status = statusConfig[connStatus] || statusConfig.disconnected

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg">
          🤖
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight">NapCat</h1>
          <p className="text-[10px] text-muted-foreground">管理平台</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {NAV_ITEMS.map((item, index) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 animate-fade-in',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <span className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors',
                isActive ? 'bg-primary/10' : 'bg-transparent'
              )}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-scale-in" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Connection Status */}
      <div className="border-t p-4">
        <div className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5', status.bg)}>
          <div className="relative">
            <div className={cn('h-2.5 w-2.5 rounded-full', status.color)} />
            {connStatus === 'connected' && (
              <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium">{status.label}</p>
            <p className="text-[10px] text-muted-foreground">NapCat 服务</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
