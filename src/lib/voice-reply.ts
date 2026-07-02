// src/lib/voice-reply.ts
// Message handler: commands, text echo, voice reply

import { textToSpeech } from './tts'
import { napcatWS } from './napcat-ws'
import { configManager } from './config'
import { getUserResponseType } from './user-config'
import { dispatchCommand } from './commands'
import { logger } from './logger'
import { processAIMessage } from './ai'
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

  // Check if user override is allowed (compat: fallback to voiceReply.allowUserOverride)
  const allowOverride = config.commands?.allowUserOverride
    ?? config.voiceReply?.allowUserOverride
    ?? false

  // If user override is allowed, check user setting FIRST
  if (allowOverride) {
    const userMode = getUserResponseType(userId)
    if (userMode === 'voice') {
      if (!config.tts?.enabled) {
        logger.logSystem('VoiceReply: TTS not enabled, fallback to text', { userId })
        return 'off'
      }
      return 'always'
    }
    if (userMode === 'text') return 'off'
  }

  // Fall back to global mode
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

  // 忽略发出的消息，只处理收到的消息
  const selfId = event.self_id as number
  const userId = event.user_id as number
  if (selfId && userId === selfId) return

  const messageType = event.message_type as string
  if (userId === 0 || messageType !== 'private') return

  // 提取文本内容
  const textContent = extractText(event)
  if (!textContent) return

  // 命令处理 — 命令及其回复不写入 AI 上下文
  if (textContent.trim().startsWith('/')) {
    await dispatchCommand(event)
    return
  }

  // Debounce
  const now = Date.now()
  if (now - (lastReplyTime.get(userId) || 0) < REPLY_COOLDOWN) return
  lastReplyTime.set(userId, now)

  // 检查 AI 是否启用
  const config = configManager.getConfig()
  if (!config.ai?.enabled) {
    // AI 未启用，走原有 echo 逻辑
    const mode = getEffectiveMode(userId)
    if (mode === 'off') {
      await sendTextReply(userId, textContent)
    } else if (mode === 'always') {
      await sendVoiceReply(userId, textContent)
    }
    return
  }

  // AI 管道处理
  const startTime = Date.now()

  // 确定回复类型：用户设置 > 全局默认
  let replyType: 'text' | 'voice' = config.ai.defaultReplyType
  const userMode = getEffectiveMode(userId)
  if (userMode === 'always') replyType = 'voice'
  else if (userMode === 'off') replyType = 'text'

  // 记录 AI 请求日志
  logger.logAI({
    userId,
    direction: 'request',
    data: {
      userMessage: textContent,
    },
  })

  // 调用 AI
  const response = await processAIMessage(userId, textContent, replyType, config.ai)
  const duration = Date.now() - startTime

  if (response.error) {
    // AI 调用失败
    logger.logAI({
      userId,
      direction: 'response',
      data: {
        userMessage: textContent,
        error: response.error,
        duration,
        systemPrompt: response.promptMeta?.systemPrompt,
        personalPrompt: response.promptMeta?.personalPrompt,
        context: response.promptMeta?.context,
      },
    })
    await sendTextReply(userId, `AI 请求失败：${response.error}`)
    return
  }

  // 记录 AI 响应日志
  logger.logAI({
    userId,
    direction: 'response',
    data: {
      userMessage: textContent,
      modelResponse: response.content,
      usage: response.usage,
      duration,
      systemPrompt: response.promptMeta?.systemPrompt,
      personalPrompt: response.promptMeta?.personalPrompt,
      context: response.promptMeta?.context,
      toolCall: response.toolResult ? {
        tool: response.toolResult.tool,
        args: response.toolCalls?.[0]?.function?.arguments ? JSON.parse(response.toolCalls[0].function.arguments) : {},
        success: response.toolResult.success,
        message: response.toolResult.message,
      } : undefined,
      toolCalls: response.toolCalls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    },
  })

  // 发送回复
  if (replyType === 'voice') {
    await sendVoiceReply(userId, response.content)
  } else {
    await sendTextReply(userId, response.content)
  }
}
