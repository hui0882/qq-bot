// src/lib/voice-reply.ts
// Message handler: commands, text echo, voice reply

import { textToSpeech } from './tts'
import { napcatWS } from './napcat-ws'
import { configManager } from './config'
import { getUserResponseType } from './user-config'
import { dispatchCommand } from './commands'
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

  // Global mode=off → always text, ignore user settings
  if (globalMode === 'off') return 'off'

  // Check if user override is allowed (compat: fallback to voiceReply.allowUserOverride)
  const allowOverride = config.commands?.allowUserOverride
    ?? config.voiceReply?.allowUserOverride
    ?? false

  if (!allowOverride) return globalMode

  // Read user setting
  const userMode = getUserResponseType(userId)
  if (!userMode || userMode === 'auto') return globalMode

  // User chose voice — validate TTS availability
  if (userMode === 'voice') {
    if (!config.tts?.enabled) {
      logger.logSystem('VoiceReply: TTS not enabled, fallback to text', { userId })
      return 'off'
    }
    return 'always'
  }

  // User chose text
  return 'off'
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

  // 忽略发出的消息，只处理收到的消息
  const selfId = event.self_id as number
  const userId = event.user_id as number
  if (selfId && userId === selfId) return

  const messageType = event.message_type as string
  if (userId === 0 || messageType !== 'private') return

  // Check if it's a command
  const textContent = extractText(event)
  if (!textContent) return

  if (textContent.trim().startsWith('/')) {
    await dispatchCommand(event)
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
