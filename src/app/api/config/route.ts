// src/app/api/config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { configManager } from '@/lib/config'
import { validateAuth } from '@/lib/auth'

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
    const body = (await request.json()) as Record<string, unknown>

    // Build safe partial config, filtering out masked tokens
    const safePartial: Record<string, unknown> = {}

    if (body.ws) {
      const ws = body.ws as Record<string, unknown>
      const wsClean: Record<string, unknown> = { ...ws }
      // Only include token if it's provided and not masked
      if (ws.token === '***' || ws.token === undefined) {
        delete wsClean.token
      }
      safePartial.ws = wsClean
    }

    if (body.api) {
      const api = body.api as Record<string, unknown>
      const apiClean: Record<string, unknown> = { ...api }
      if (api.token === '***' || api.token === undefined) {
        delete apiClean.token
      }
      safePartial.api = apiClean
    }

    if (body.tts) {
      const tts = body.tts as Record<string, unknown>
      const ttsClean: Record<string, unknown> = { ...tts }
      if (tts.apiKey === '***' || tts.apiKey === undefined) {
        delete ttsClean.apiKey
      }
      safePartial.tts = ttsClean
    }

    if (body.voiceReply) {
      safePartial.voiceReply = body.voiceReply
    }

    if (body.friendRequest) {
      safePartial.friendRequest = body.friendRequest
    }

    if (body.auth) {
      const auth = body.auth as Record<string, unknown>
      // Only include auth if token is not masked
      if (auth.token && auth.token !== '***') {
        safePartial.auth = auth
      }
    }

    if (body.log) {
      safePartial.log = body.log
    }

    if (body.commands) {
      safePartial.commands = body.commands
    }

    // Validate WS URL
    const wsData = safePartial.ws as Record<string, unknown> | undefined
    if (wsData?.url && typeof wsData.url === 'string' && !wsData.url.startsWith('ws://') && !wsData.url.startsWith('wss://')) {
      return NextResponse.json({ success: false, message: 'Invalid WebSocket URL' }, { status: 400 })
    }

    // Validate token not empty
    const authData = safePartial.auth as Record<string, unknown> | undefined
    if (authData?.token !== undefined && typeof authData.token === 'string' && authData.token.trim() === '') {
      return NextResponse.json({ success: false, message: 'Token cannot be empty' }, { status: 400 })
    }

    configManager.updateConfig(safePartial as Parameters<typeof configManager.updateConfig>[0])
    return NextResponse.json({ success: true, message: 'Config updated, hot-reload triggered' })
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
