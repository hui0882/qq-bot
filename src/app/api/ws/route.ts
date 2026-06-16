// src/app/api/ws/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { napcatWS } from '@/lib/napcat-ws'
import { logger } from '@/lib/logger'
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

    // Log outgoing message for send_msg action
    if (action === 'send_msg' && params) {
      const message = params.message as Array<Record<string, unknown>> | string | undefined
      let textContent = ''
      if (typeof message === 'string') {
        textContent = message
      } else if (Array.isArray(message)) {
        textContent = message
          .filter((m) => m.type === 'text')
          .map((m) => (m.data as Record<string, unknown>)?.text as string)
          .join('')
      }
      if (textContent) {
        logger.logOutgoingMessage({
          userId: params.user_id as string,
          groupId: params.group_id as string,
          messageType: (params.message_type as string) || 'private',
          content: textContent,
          echo: '',
        })
      }
    }

    // 通过 WS 连接发送 API 请求
    const result = await napcatWS.sendAction(action, params || {})
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, message: `Invalid request: ${msg}` }, { status: 400 })
  }
}
