// src/lib/tts.ts
// Decoupled TTS service - easily replaceable with any TTS provider

import { configManager } from './config'
import { logger } from './logger'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export interface TTSResult {
  success: boolean
  audioPath?: string
  error?: string
}

/**
 * Convert text to speech using the configured TTS provider.
 * Returns the path to the generated audio file.
 */
export async function textToSpeech(text: string): Promise<TTSResult> {
  const config = configManager.getConfig()
  const ttsConfig = config.tts

  if (!ttsConfig?.enabled || !ttsConfig.apiKey) {
    return { success: false, error: 'TTS not configured' }
  }

  logger.logSystem('TTS: synthesizing', { text: text.slice(0, 100), voice: ttsConfig.voice })

  try {
    // Build request for MiMo TTS API
    const styleTag = ttsConfig.style ? `(${ttsConfig.style})` : ''
    const body = {
      model: ttsConfig.model,
      messages: [
        {
          role: 'user',
          content: `用${ttsConfig.style || '自然'}的语气朗读以下内容`,
        },
        {
          role: 'assistant',
          content: `${styleTag}${text}`,
        },
      ],
      audio: {
        format: ttsConfig.format || 'wav',
        voice: ttsConfig.voice || '茉莉',
      },
    }

    const response = await fetch(ttsConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': ttsConfig.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.logSystem('TTS: API error', { status: response.status, body: errorText.slice(0, 200) })
      return { success: false, error: `TTS API error: ${response.status}` }
    }

    const data = await response.json() as Record<string, unknown>
    const choices = data.choices as Array<Record<string, unknown>> | undefined
    const message = choices?.[0]?.message as Record<string, unknown> | undefined
    const audio = message?.audio as { data?: string } | undefined

    if (!audio?.data) {
      logger.logSystem('TTS: no audio in response', { keys: Object.keys(data) })
      return { success: false, error: 'No audio data in TTS response' }
    }

    // Decode base64 audio
    const audioBuffer = Buffer.from(audio.data, 'base64')

    // Save to temp file
    const tmpDir = join(process.cwd(), 'data', 'tmp')
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
    const filename = `tts_${randomUUID().slice(0, 8)}.${ttsConfig.format || 'wav'}`
    const audioPath = join(tmpDir, filename)
    writeFileSync(audioPath, audioBuffer)

    logger.logSystem('TTS: success', { path: audioPath, size: audioBuffer.length })
    return { success: true, audioPath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.logSystem('TTS: failed', { error: msg })
    return { success: false, error: msg }
  }
}
