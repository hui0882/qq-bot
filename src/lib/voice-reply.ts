// src/lib/voice-reply.ts
// Message handler: commands, text echo, voice reply

import { textToSpeech } from './tts'
import { napcatWS } from './napcat-ws'
import { configManager } from './config'
import { getUserResponseType } from './user-config'
import { handleCommand } from './command-handler'
import { logger } from './logger'
import { readFileSync, unlinkSync } from 'fs'

const lastReplyTime = new Map<number, number>()
const REPLY_COOLDOWN = 3000

function extractText(event: Record<string, unknown>): string | null {
  const rawMessage = event.raw_message as string || ''
  let text = rawMessage
  const message = event.message as Array<Record<string, unknown>> | undefined
  if (message && Array.isArray(message)) {
    text = message
      .filter((m) => m.type === 'text')
      .map((m) => (m.data as Record<string, unknown>)?.text as string)
      .join('') || rawMessage
  }
  if (!text || text.trim().length === 0) return null
  return text.length > 500 ? text.slice(0, 500) + '...' : text
}

function getEffectiveMode(userId: number): 'off' | 'always' | 'auto' {
  const config = configManager.getConfig()
  const globalMode = config.voiceReply?.mode || 'off'

  // If user override is allowed, check per-user config
  if (config.voiceReply?.allowUserOverride) {
    const userMode = getUserResponseType(userId)
    if (userMode === 'voice') return 'always'
    if (userMode === 'text') return 'off'
    if (userMode === 'auto') return 'auto'
  }

  return globalMode
}

async function sendTextReply(userId: number, text: string): Promise<void> {
  const result = await napcatWS.sendAction('send_msg', {
    message_type: 'private',
    user_id: String(userId),
    message: [{ type: 'text', data: { text } }],
  })
  if (result.status === 'ok') {
    logger.logSystem('TextReply: sent', { userId })
  } else {
    logger.logSystem('TextReply: failed', { error: result.message })
  }
}

async function sendVoiceReply(userId: number, text: string): Promise<void> {
  const config = configManager.getConfig()
  if (!config.tts?.enabled) return

  logger.logSystem('VoiceReply: processing', { userId, text: text.slice(0, 50) })

  const ttsResult = await textToSpeech(text)
  if (!ttsResult.success || !ttsResult.audioPath) {
    logger.logSystem('VoiceReply: TTS failed', { error: ttsResult.error })
    return
  }

  try {
    const audioBuffer = readFileSync(ttsResult.audioPath)
    const base64Audio = audioBuffer.toString('base64')
    const format = config.tts.format || 'wav'
    const mimeType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`

    const result = await napcatWS.sendAction('send_msg', {
      message_type: 'private',
      user_id: String(userId),
      message: [{ type: 'record', data: { file: `data:${mimeType};base64,${base64Audio}` } }],
    })

    if (result.status === 'ok') {
      logger.logSystem('VoiceReply: sent', { userId })
    } else {
      logger.logSystem('VoiceReply: send failed', { error: result.message })
    }
  } catch (err) {
    logger.logSystem('VoiceReply: error', { error: (err as Error).message })
  } finally {
    try { unlinkSync(ttsResult.audioPath) } catch { /* ignore */ }
  }
}

export async function handleVoiceReply(event: Record<string, unknown>): Promise<void> {
  const postType = event.post_type as string
  if (postType !== 'message') return

  const userId = event.user_id as number
  const messageType = event.message_type as string
  if (userId === 0 || messageType !== 'private') return

  // Check if it's a command
  const textContent = extractText(event)
  if (!textContent) return

  if (textContent.trim().startsWith('/')) {
    await handleCommand(event)
    return
  }

  // Not a command — apply response mode
  const mode = getEffectiveMode(userId)

  // Debounce
  const now = Date.now()
  if (now - (lastReplyTime.get(userId) || 0) < REPLY_COOLDOWN) return
  lastReplyTime.set(userId, now)

  if (mode === 'off') {
    await sendTextReply(userId, textContent)
  } else if (mode === 'always') {
    await sendVoiceReply(userId, textContent)
  }
  // 'auto' — not implemented yet
}
