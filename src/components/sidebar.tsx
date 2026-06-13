// src/components/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: '状态监控', icon: '📊' },
  { href: '/contacts', label: '好友/群管理', icon: '👥' },
  { href: '/messages', label: '消息调试', icon: '💬' },
  { href: '/debugger', label: 'API 调试器', icon: '🔧' },
  { href: '/logs', label: '日志', icon: '📋' },
  { href: '/settings', label: '配置', icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background flex flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <span>🤖</span>
          <span>NapCat Platform</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
              pathname === item.href ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" id="ws-status-dot" />
          <span>连接状态</span>
        </div>
      </div>
    </aside>
  )
}
