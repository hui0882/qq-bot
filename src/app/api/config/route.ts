// src/app/api/config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { configManager } from '@/lib/config'
import { validateAuth } from '@/lib/auth'
import type { PlatformConfig } from '@/types/napcat'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ success: true, data: configManager.getMaskedConfig() })
}

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const partial = body as Partial<PlatformConfig>

    if (partial.ws?.url && !partial.ws.url.startsWith('ws://') && !partial.ws.url.startsWith('wss://')) {
      return NextResponse.json({ success: false, message: 'Invalid WebSocket URL' }, { status: 400 })
    }

    if (partial.auth?.token !== undefined && partial.auth.token.trim() === '') {
      return NextResponse.json({ success: false, message: 'Token cannot be empty' }, { status: 400 })
    }

    configManager.updateConfig(partial)
    return NextResponse.json({ success: true, message: 'Config updated, hot-reload triggered' })
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
