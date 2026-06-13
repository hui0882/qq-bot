// src/app/api/logs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { validateAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const type = searchParams.get('type') as 'request' | 'event' | 'system' | undefined
  const action = searchParams.get('action') || undefined
  const limit = parseInt(searchParams.get('limit') || '100', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const logs = logger.getLogs({ type, action, limit, offset })
  const total = logger.getTotal()

  return NextResponse.json({ success: true, data: logs, total })
}
