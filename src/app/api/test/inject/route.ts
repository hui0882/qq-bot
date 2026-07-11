import { NextRequest, NextResponse } from 'next/server'
import { handleVoiceReply } from '@/lib/voice-reply'
import { napcatWS } from '@/lib/napcat-ws'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // 验证 token
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    // 从配置读取有效的 token
    const { configManager } = await import('@/lib/config')
    const config = configManager.getConfig()
    const validToken = config.auth?.token

    if (!validToken || token !== validToken) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { text, userId = 2959411319, selfId = 2945472749 } = body

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: text' },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // 构造 OneBot 消息事件（模拟用户发送私聊消息）
    const fakeEvent = {
      self_id: selfId,
      user_id: userId,
      time: Math.floor(Date.now() / 1000),
      message_id: Math.floor(Math.random() * 1000000000),
      message_seq: Math.floor(Math.random() * 1000000),
      real_id: Math.floor(Math.random() * 1000000000),
      real_seq: String(Math.floor(Math.random() * 1000)),
      message_type: 'private',
      sender: {
        user_id: userId,
        nickname: 'Test User',
        card: ''
      },
      raw_message: text,
      font: 14,
      sub_type: 'friend',
      message: [
        {
          type: 'text',
          data: { text }
        }
      ],
      message_format: 'array',
      post_type: 'message'
    }

    logger.logSystem('Test inject: simulating user message', {
      text: text.slice(0, 100),
      userId,
      selfId
    })

    // 调用消息处理器（完整流程：命令检测 -> 防抖 -> AI处理 -> WS发送）
    await handleVoiceReply(fakeEvent)

    const duration = Date.now() - startTime

    // 获取处理后的日志
    const logs = logger.getLogs({ limit: 30 })

    return NextResponse.json({
      success: true,
      data: {
        input: { text, userId, selfId },
        duration,
        message: 'Message injected and processed',
        logs
      }
    })
  } catch (error) {
    logger.logSystem('Test inject error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  const wsStatus = napcatWS.getStatus()
  const connectionInfo = napcatWS.getConnectionInfo()

  return NextResponse.json({
    success: true,
    data: {
      wsStatus,
      connectedAt: connectionInfo.connectedAt,
      reconnectCount: connectionInfo.reconnectCount,
      message: 'Use POST with Authorization header to inject test messages'
    }
  })
}
