// src/lib/napcat-api.ts
import { v4 as uuidv4 } from 'uuid'
import type { OB11ActionResponse } from '@/types/napcat'
import { configManager } from './config'
import { logger } from './logger'

/**
 * NapCat HTTP API client.
 * Sends API requests via HTTP POST to the NapCat HTTP endpoint.
 * The WS client is only used for receiving events.
 */
class NapCatApiClient {
  async sendAction(action: string, params: Record<string, unknown> = {}): Promise<OB11ActionResponse> {
    const config = configManager.getConfig()
    const apiUrl = config.api?.url || 'http://115.190.250.31:3000'
    const apiToken = config.api?.token || config.ws.token || ''

    const echo = uuidv4()
    const url = `${apiUrl}/${action}`

    logger.logRequest(action, params, echo)
    logger.logSystem(`HTTP API: POST ${url}`, { echo, params })

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.logSystem(`HTTP API error: ${response.status}`, { body: errorText })
        return {
          status: 'failed',
          retcode: response.status,
          data: null,
          message: `HTTP ${response.status}: ${errorText}`,
          echo,
        }
      }

      const data = await response.json() as OB11ActionResponse
      data.echo = echo
      logger.logResponse(echo, data, data.status === 'ok')
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      logger.logSystem(`HTTP API request failed: ${msg}`, {
        action,
        apiUrl,
        apiToken: apiToken ? `${apiToken.slice(0, 6)}...` : 'empty',
      })
      return {
        status: 'failed',
        retcode: -1,
        data: null,
        message: `API 请求失败: ${msg} (目标: ${apiUrl})`,
        echo,
      }
    }
  }
}

const globalForApi = globalThis as unknown as { __napcatApi?: NapCatApiClient }

export function getNapCatApi(): NapCatApiClient {
  if (!globalForApi.__napcatApi) {
    globalForApi.__napcatApi = new NapCatApiClient()
  }
  return globalForApi.__napcatApi
}

export const napcatApi = getNapCatApi()
