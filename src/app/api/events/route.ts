// src/app/api/events/route.ts
import { NextRequest } from 'next/server'
import { napcatWS } from '@/lib/napcat-ws'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const statusMsg = JSON.stringify({
        type: 'connection_status',
        data: napcatWS.getConnectionInfo(),
      })
      controller.enqueue(encoder.encode(`data: ${statusMsg}\n\n`))

      const removeEvent = napcatWS.onEvent((event) => {
        try {
          const msg = JSON.stringify({ type: 'event', data: event })
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
        } catch {
          // stream closed
        }
      })

      const removeLog = logger.onLog((entry) => {
        try {
          const msg = JSON.stringify({ type: 'log', data: entry })
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
        } catch {
          // stream closed
        }
      })

      const removeStatus = napcatWS.onStatusChange((newStatus) => {
        try {
          const msg = JSON.stringify({
            type: 'connection_status',
            data: { ...napcatWS.getConnectionInfo(), status: newStatus },
          })
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
        } catch {
          // stream closed
        }
      })

      request.signal.addEventListener('abort', () => {
        removeEvent()
        removeLog()
        removeStatus()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
