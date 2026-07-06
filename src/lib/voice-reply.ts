// src/lib/voice-reply.ts
// Message handler: commands, text echo, voice reply

import { textToSpeech } from './tts'
import { napcatWS } from './napcat-ws'
import { configManager } from './config'
import { getUserResponseType } from './user-config'
import { dispatchCommand } from './commands'
import { logger } from './logger'
import { processAIMessage } from './ai'
import { callLLM } from './ai/llm-client'
import { readFileSync, unlinkSync } from 'fs'
import { splitMessage, calculateDelay, sleep } from './message-splitter'
import type { AIConfig } from '@/types/napcat'

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

/**
 * 分段发送文字消息
 * 首段立即发送，后续段按动态延迟发送
 */
async function sendTextReplySplit(userId: number, text: string): Promise<void> {
  const segments = splitMessage(text)

  // 如果没有分隔符，fallback 为整条发送
  if (segments.length <= 1) {
    await sendTextReply(userId, text)
    return
  }

  for (let i = 0; i < segments.length; i++) {
    try {
      if (i > 0) {
        const delay = calculateDelay(segments[i - 1])
        await sleep(delay)
      }
      await sendTextReply(userId, segments[i])
    } catch (err) {
      logger.logSystem('TextReplySplit: segment send failed', {
        userId,
        segment: i,
        total: segments.length,
        error: (err as Error).message,
      })
      // Abort remaining segments on failure
      return
    }
  }
}

/**
 * 分段发送语音消息
 * 首段立即发送，后续段按动态延迟发送
 */
async function sendVoiceReplySplit(userId: number, text: string): Promise<void> {
  const segments = splitMessage(text)

  // 如果没有分隔符，fallback 为整条发送
  if (segments.length <= 1) {
    await sendVoiceReply(userId, text)
    return
  }

  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const delay = calculateDelay(segments[i - 1])
      await sleep(delay)
    }
    try {
      await sendVoiceReply(userId, segments[i])
    } catch (err) {
      logger.logSystem('VoiceReplySplit: segment failed', {
        userId,
        segment: i,
        error: (err as Error).message,
      })
      break
    }
  }
}

/**
 * 快速首条响应：调用 AI 生成简短的第一反应
 * 使用精简的系统提示词，要求快速给出关心的回应
 */
async function getQuickFirstResponse(
  userId: number,
  userMessage: string,
  aiConfig: AIConfig,
): Promise<string | null> {
  try {
    const quickPrompt = '你正在和用户聊天。用户刚发来一条消息，你需要快速给出一个简短的第一反应（15-30字），表达你在认真倾听和关心对方。' +
      '不要详细回答问题，只需要表达关注和理解。例如："我在听呢，说说看"、"嗯嗯，我理解你的感受"、"别担心，我来帮你看看"。' +
      '直接回复反应内容，不要加任何前缀或解释。'

    const response = await callLLM({
      messages: [
        { role: 'system', content: quickPrompt },
        { role: 'user', content: userMessage },
      ],
      config: {
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        maxTokens: 100,
        temperature: 0.7,
      },
    })

    if (response.content) {
      return response.content.trim()
    }
    return null
  } catch (err) {
    logger.logSystem('QuickFirstResponse: failed', { error: (err as Error).message })
    return null
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

  // AI 管道处理 — 双阶段调用
  const startTime = Date.now()

  // 确定回复类型：用户设置 > 全局默认
  let replyType: 'text' | 'voice' = config.ai.defaultReplyType
  const userMode = getEffectiveMode(userId)
  if (userMode === 'always') replyType = 'voice'
  else if (userMode === 'off') replyType = 'text'

  // ====== 阶段一：快速首条响应 ======
  const quickResponse = await getQuickFirstResponse(userId, textContent, config.ai)
  if (quickResponse) {
    // 立即发送首条快速响应
    if (replyType === 'voice') {
      await sendVoiceReply(userId, quickResponse)
    } else {
      await sendTextReply(userId, quickResponse)
    }
    // 短暂延迟后继续获取完整回复
    await sleep(800)
  }

  // ====== 阶段二：获取完整回复 ======
  // 记录 AI 请求日志
  logger.logAI({
    userId,
    direction: 'request',
    data: {
      userMessage: textContent,
    },
  })

  // 调用 AI 获取完整回复
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

  // 发送完整回复（分段）
  if (replyType === 'voice') {
    await sendVoiceReplySplit(userId, response.content)
  } else {
    await sendTextReplySplit(userId, response.content)
  }
}
