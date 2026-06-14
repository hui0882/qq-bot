// src/lib/voice-reply.ts
// Auto-reply with voice when receiving a message

import { textToSpeech } from './tts'
import { napcatApi } from './napcat-api'
import { configManager } from './config'
import { logger } from './logger'
import { readFileSync, unlinkSync } from 'fs'

// Debounce: don't reply to the same user within 3 seconds
const lastReplyTime = new Map<number, number>()
const REPLY_COOLDOWN = 3000

/**
 * Handle an incoming message event.
 * If voiceReply is enabled, convert the message to speech and send it back.
 */
export async function handleVoiceReply(event: Record<string, unknown>): Promise<void> {
  const config = configManager.getConfig()
  if (!config.voiceReply?.enabled || !config.tts?.enabled) return

  const postType = event.post_type as string
  if (postType !== 'message') return

  const userId = event.user_id as number
  const messageType = event.message_type as string
  const rawMessage = event.raw_message as string || ''

  // Don't reply to ourselves
  if (userId === 0) return

  // Don't reply to group messages (only private for now)
  if (messageType !== 'private') return

  // Extract text content
  let textContent = rawMessage
  const message = event.message as Array<Record<string, unknown>> | undefined
  if (message && Array.isArray(message)) {
    textContent = message
      .filter((m) => m.type === 'text')
      .map((m) => (m.data as Record<string, unknown>)?.text as string)
      .join('') || rawMessage
  }

  // Skip empty or very short messages
  if (!textContent || textContent.trim().length === 0) return

  // Skip very long messages (TTS has limits)
  if (textContent.length > 500) {
    textContent = textContent.slice(0, 500) + '...内容过长，已截断'
  }

  // Debounce
  const now = Date.now()
  const lastTime = lastReplyTime.get(userId) || 0
  if (now - lastTime < REPLY_COOLDOWN) return
  lastReplyTime.set(userId, now)

  logger.logSystem('VoiceReply: processing', { userId, text: textContent.slice(0, 50) })

  // Call TTS
  const ttsResult = await textToSpeech(textContent)
  if (!ttsResult.success || !ttsResult.audioPath) {
    logger.logSystem('VoiceReply: TTS failed', { error: ttsResult.error })
    return
  }

  try {
    // Read audio file and encode as base64
    const audioBuffer = readFileSync(ttsResult.audioPath)
    const base64Audio = audioBuffer.toString('base64')
    const format = config.tts.format || 'wav'
    const mimeType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`

    // Send as voice message via NapCat API
    // Use send_msg with record segment containing base64 data
    const result = await napcatApi.sendAction('send_msg', {
      message_type: 'private',
      user_id: String(userId),
      message: [{
        type: 'record',
        data: {
          file: `data:${mimeType};base64,${base64Audio}`,
        },
      }],
    })

    if (result.status === 'ok') {
      logger.logSystem('VoiceReply: sent', { userId, messageId: (result.data as Record<string, unknown>)?.message_id })
    } else {
      logger.logSystem('VoiceReply: send failed', { userId, error: result.message })
    }
  } catch (err) {
    logger.logSystem('VoiceReply: error', { error: (err as Error).message })
  } finally {
    // Clean up temp file
    try { unlinkSync(ttsResult.audioPath) } catch { /* ignore */ }
  }
}
