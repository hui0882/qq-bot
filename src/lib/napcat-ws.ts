// src/lib/napcat-ws.ts
import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import type { OB11ActionResponse, WSConnectionStatus } from '@/types/napcat'
import { configManager } from './config'
import { logger } from './logger'
import { handleVoiceReply } from './voice-reply'

type ResponseCallback = (response: OB11ActionResponse) => void
type EventCallback = (event: Record<string, unknown>) => void
type StatusCallback = (status: WSConnectionStatus) => void

class NapCatWSClient {
  private ws: WebSocket | null = null
  private status: WSConnectionStatus = 'disconnected'
  private pendingRequests = new Map<string, { resolve: ResponseCallback; timer: ReturnType<typeof setTimeout>; action: string }>()
  private eventCallbacks: EventCallback[] = []
  private statusCallbacks: StatusCallback[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private connectedAt: number | null = null
  private reconnectCount = 0

  constructor() {
    configManager.onUpdate((config, keys) => {
      if (keys.some((k) => k.startsWith('ws.'))) {
        logger.logSystem('Config changed, reconnecting...', { url: config.ws.url })
        this.disconnect()
        this.connect()
      }
    })
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    const config = configManager.getConfig()
    this.setStatus('connecting')

    // Build URL with access_token if configured
    let wsUrl = config.ws.url
    if (config.ws.token) {
      const separator = wsUrl.includes('?') ? '&' : '?'
      wsUrl = `${wsUrl}${separator}access_token=${encodeURIComponent(config.ws.token)}`
    }

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.status = 'connected'
        this.connectedAt = Date.now()
        this.reconnectAttempts = 0
        this.reconnectCount++
        this.setStatus('connected')
        logger.logSystem(`WebSocket connected to ${config.ws.url}`)
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>
          const rawStr = data.toString()

          // Log raw message for debugging (truncated)
          logger.logSystem('WS received', {
            preview: rawStr.length > 200 ? rawStr.slice(0, 200) + '...' : rawStr,
            hasEcho: !!msg.echo,
            hasStatus: !!msg.status,
            postType: msg.post_type,
          })

          // Check if it's a response (has echo field)
          if (msg.echo && typeof msg.echo === 'string') {
            const pending = this.pendingRequests.get(msg.echo)
            if (pending) {
              clearTimeout(pending.timer)
              this.pendingRequests.delete(msg.echo)
              const response = msg as unknown as OB11ActionResponse
              logger.logResponse(msg.echo, response, response.status === 'ok')
              pending.resolve(response)
            } else {
              // Got a response with echo but no pending request
              logger.logSystem('Received response with unknown echo', { echo: msg.echo })
            }
          } else if (msg.status && msg.retcode !== undefined) {
            // Looks like a response but missing echo - try to match by action
            const response = msg as unknown as OB11ActionResponse
            const matched = this.tryMatchResponseByAction(response)
            if (!matched) {
              // Treat as event
              logger.logEvent(msg)
              for (const cb of this.eventCallbacks) {
                cb(msg)
              }
              handleVoiceReply(msg)
            }
          } else {
            // It's an event
            logger.logEvent(msg)
            for (const cb of this.eventCallbacks) {
              cb(msg)
            }
            handleVoiceReply(msg)
          }
        } catch {
          logger.logSystem('Failed to parse WS message', { raw: data.toString().slice(0, 200) })
        }
      })

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.setStatus('disconnected')
        this.connectedAt = null
        const reasonStr = reason?.toString() || ''
        const msg = code === 1006
          ? 'WebSocket connection failed (server unreachable or auth rejected)'
          : `WebSocket closed (code: ${code}${reasonStr ? `, reason: ${reasonStr}` : ''})`
        logger.logSystem(msg, { code, reason: reasonStr })
        this.scheduleReconnect()
      })

      this.ws.on('error', (err: Error) => {
        this.setStatus('error')
        const msg = err.message.includes('ECONNREFUSED')
          ? `Connection refused: ${config.ws.url}`
          : err.message.includes('401') || err.message.includes('403')
            ? `Authentication failed - check WS token`
            : `WebSocket error: ${err.message}`
        logger.logSystem(msg, { error: err.message })
      })
    } catch (err) {
      this.setStatus('error')
      logger.logSystem('Failed to create WebSocket', { error: (err as Error).message })
      this.scheduleReconnect()
    }
  }

  // Try to match a response that has status/retcode but no echo
  private tryMatchResponseByAction(response: OB11ActionResponse): boolean {
    // Find the oldest pending request
    const entries = Array.from(this.pendingRequests.entries())
    if (entries.length === 0) return false

    // Match the first pending request (FIFO)
    const [echo, pending] = entries[0]
    clearTimeout(pending.timer)
    this.pendingRequests.delete(echo)
    response.echo = echo
    logger.logResponse(echo, response, response.status === 'ok')
    pending.resolve(response)
    return true
  }

  private scheduleReconnect(): void {
    const config = configManager.getConfig()
    if (!config.ws.reconnect) return
    if (this.reconnectTimer) return

    const delay = Math.min(
      config.ws.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      config.ws.maxReconnectInterval,
    )
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
    this.connectedAt = null
  }

  private setStatus(status: WSConnectionStatus): void {
    this.status = status
    for (const cb of this.statusCallbacks) {
      cb(status)
    }
  }

  async sendAction(action: string, params: Record<string, unknown> = {}): Promise<OB11ActionResponse> {
    if (this.status !== 'connected' || !this.ws) {
      return { status: 'failed', retcode: -1, data: null, message: 'WebSocket not connected' }
    }

    const echo = uuidv4()
    const payload = JSON.stringify({ action, params, echo })

    logger.logRequest(action, params, echo)
    logger.logSystem(`Sending action: ${action}`, { echo, params })

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(echo)
        logger.logResponse(echo, { message: 'Request timeout (30s)' }, false)
        resolve({ status: 'failed', retcode: -1, data: null, message: 'Request timeout (30s)' })
      }, 30000)

      this.pendingRequests.set(echo, { resolve, timer, action })
      this.ws!.send(payload)
    })
  }

  getStatus(): WSConnectionStatus {
    return this.status
  }

  getConnectionInfo(): { status: WSConnectionStatus; connectedAt: number | null; reconnectCount: number } {
    return {
      status: this.status,
      connectedAt: this.connectedAt,
      reconnectCount: this.reconnectCount,
    }
  }

  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback)
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback)
    }
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.push(callback)
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback)
    }
  }
}

const globalForWS = globalThis as unknown as { __napcatWS?: NapCatWSClient }

export function getNapCatWS(): NapCatWSClient {
  if (!globalForWS.__napcatWS) {
    globalForWS.__napcatWS = new NapCatWSClient()
  }
  return globalForWS.__napcatWS
}

export const napcatWS = getNapCatWS()

// Auto-connect on server-side module load
if (typeof window === 'undefined') {
  napcatWS.connect()
}
