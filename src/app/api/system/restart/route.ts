// src/app/api/system/restart/route.ts
import { NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'

export async function POST() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  // 延迟退出，让响应先发出去
  setTimeout(() => {
    process.exit(0)
  }, 1000)

  return NextResponse.json({ success: true, message: '服务正在重启...' })
}
