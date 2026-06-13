// src/app/api/ws/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { napcatWS } from '@/lib/napcat-ws'
import { validateAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, params } = body as { action: string; params?: Record<string, unknown> }

    if (!action) {
      return NextResponse.json({ success: false, message: 'action is required' }, { status: 400 })
    }

    const result = await napcatWS.sendAction(action, params || {})
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
