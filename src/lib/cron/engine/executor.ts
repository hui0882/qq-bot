/**
 * 定时任务引擎 - 执行器（新架构）
 *
 * 负责执行 TaskExecution：构建 AI 上下文 → 调用 AI → 发送结果给用户。
 * 支持多层重试机制、超时控制、静默标记。
 *
 * 与旧 executor.ts 的区别：
 * - 接受 TaskExecution 而非 CronTask
 * - 直接更新 task_executions 表，而非 cron_logs
 * - 不依赖旧的 store 函数（addTaskLog 等）
 */

import type { TaskExecution, ExecutionResult } from './types'
import { configManager } from '../../config'
import { napcatWS } from '../../napcat-ws'
import { logger } from '../../logger'
import { callLLM } from '../../ai/llm-client'
import { getUserAIConfig } from '../../db/queries/ai'
import { textToSpeech } from '../../tts'
import { readFileSync, unlinkSync } from 'fs'

// ============ 常量配置 ============

/** 默认执行超时时间（毫秒） */
const DEFAULT_TIMEOUT = 60_000

/** 任务级别最大重试次数（加上首次执行共 3 次） */
const MAX_RETRIES = 2

/** API 调用级别最大重试次数 */
const API_MAX_RETRIES = 3

/** 消息发送级别最大重试次数 */
const SEND_MAX_RETRIES = 3

/** 重试基础等待时间（毫秒），按 attempt 递增 */
const RETRY_BASE_DELAY = 2_000

/** 静默标记 */
const SILENT_MARKER = '[SILENT]'

/** 可重试的错误关键词 */
const RETRYABLE_ERRORS = [
  'fetch failed',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'socket hang up',
  'network',
  'timeout',
  '429',  // Too Many Requests
  '500',  // Internal Server Error
  '502',  // Bad Gateway
  '503',  // Service Unavailable
  '504',  // Gateway Timeout
]

// ============ 工具函数 ============

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return RETRYABLE_ERRORS.some(keyword =>
    message.toLowerCase().includes(keyword.toLowerCase())
  )
}

/**
 * 通用重试包装器
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  name: string,
  context: Record<string, unknown> = {},
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const errorMessage = error instanceof Error ? error.message : String(error)

      const canRetry = isRetryableError(error)

      logger.logSystem(`${name}: attempt_failed`, {
        ...context,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        error: errorMessage,
        canRetry,
      })

      if (!canRetry || attempt >= maxRetries) {
        throw error
      }

      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
      logger.logSystem(`${name}: retrying`, {
        ...context,
        attempt: attempt + 1,
        delay,
      })
      await sleep(delay)
    }
  }

  throw lastError
}

// ============ 主执行函数 ============

/**
 * 执行定时任务（新架构）
 *
 * 流程：
 * 1. 构建 AI 上下文
 * 2. 调用 AI（带超时和重试）
 * 3. 检查静默标记
 * 4. 发送结果给用户（带重试）
 * 5. 返回执行结果
 */
export async function executeTask(exec: TaskExecution): Promise<ExecutionResult> {
  const startTime = Date.now()
  let lastError: string | undefined
  let result: ExecutionResult | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.logSystem('CronEngine.Executor: attempt', {
        executionId: exec.id,
        taskId: exec.taskId,
        taskName: exec.taskName,
        attempt: attempt + 1,
        maxAttempts: MAX_RETRIES + 1,
      })

      // 1. 构建 AI 上下文
      const context = buildAIContext(exec)

      // 2. 调用 AI（带独立重试）
      const timeout = context.timeout || DEFAULT_TIMEOUT
      const response = await callAIWithRetry(context, timeout, exec)

      // 3. 检查静默标记并发送结果（带独立重试）
      const silent = isSilentResponse(response)
      await sendResultWithRetry(exec, response, silent)

      const duration = Date.now() - startTime
      logger.logSystem('CronEngine.Executor: success', {
        executionId: exec.id,
        taskId: exec.taskId,
        taskName: exec.taskName,
        attempts: attempt + 1,
        duration,
        silent,
      })

      result = {
        status: 'success',
        result: response,
        duration,
        attempts: attempt + 1,
      }

      return result
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)

      logger.logSystem('CronEngine.Executor: attempt_failed', {
        executionId: exec.id,
        taskId: exec.taskId,
        taskName: exec.taskName,
        attempt: attempt + 1,
        error: lastError,
      })

      // 如果还有重试机会，等待后重试
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * (attempt + 1)
        await sleep(delay)
      }
    }
  }

  // 所有重试都失败
  const duration = Date.now() - startTime
  logger.logSystem('CronEngine.Executor: all_attempts_failed', {
    executionId: exec.id,
    taskId: exec.taskId,
    taskName: exec.taskName,
    attempts: MAX_RETRIES + 1,
    error: lastError,
  })

  result = {
    status: 'failed',
    error: lastError,
    duration,
    attempts: MAX_RETRIES + 1,
  }

  return result
}

// ============ AI 调用 ============

/**
 * AI 上下文接口
 */
interface AIContext {
  systemPrompt: string
  userId: string
  tools?: string[]
  timeout?: number
}

/**
 * 构建 AI 上下文
 */
function buildAIContext(exec: TaskExecution): AIContext {
  const config = configManager.getConfig()
  const globalSystemPrompt = config.ai?.systemPrompt || '你是一个友好、有帮助的 AI 助手。请用中文回复。'

  const systemParts: string[] = [
    globalSystemPrompt,
    '',
    '---',
    '## 定时任务执行',
    '',
    '你正在执行一个定时任务。请根据以下提示词完成任务：',
    '',
    exec.prompt,
    '',
    '---',
    '## 执行规则',
    '',
    '1. 直接执行任务，不要询问用户确认',
    '2. 如果任务需要查询信息但结果为空，正常回复告知未找到结果',
    '3. 如果任务执行成功且无需通知用户（如例行检查无异常），在回复末尾添加 [SILENT] 标记',
    '4. 如果有重要信息需要告知用户，正常回复内容',
  ]

  return {
    systemPrompt: systemParts.join('\n'),
    userId: exec.userId,
    tools: exec.tools ? JSON.parse(exec.tools) : undefined,
    timeout: DEFAULT_TIMEOUT,
  }
}

/**
 * 调用 AI（带独立重试）
 */
async function callAIWithRetry(
  context: AIContext,
  timeout: number,
  exec: TaskExecution,
): Promise<string> {
  return withRetry(
    () => callAIWithTimeout(context, timeout),
    API_MAX_RETRIES,
    'CronAI',
    { executionId: exec.id, taskId: exec.taskId, taskName: exec.taskName },
  )
}

/**
 * 调用 AI（带超时控制）
 */
async function callAIWithTimeout(
  context: AIContext,
  timeout: number,
): Promise<string> {
  const config = configManager.getConfig()

  if (!config.ai?.enabled) {
    throw new Error('AI 未启用，请在配置中启用 AI')
  }

  const userIdNum = Number(context.userId)
  const userAiConfig = !isNaN(userIdNum) ? getUserAIConfig(userIdNum) : null

  const baseUrl = userAiConfig?.base_url || config.ai.baseUrl
  const apiKey = userAiConfig?.api_key || config.ai.apiKey
  const model = userAiConfig?.model || config.ai.model

  if (!baseUrl || !apiKey || !model) {
    throw new Error('AI 配置不完整，请检查 baseUrl、apiKey、model')
  }

  const messages = [
    { role: 'system' as const, content: context.systemPrompt },
    { role: 'user' as const, content: '请执行定时任务。' },
  ]

  const result = await withTimeout(
    callLLM({
      messages,
      config: {
        baseUrl,
        apiKey,
        model,
        maxTokens: userAiConfig?.max_tokens || config.ai.maxTokens || 2048,
        temperature: userAiConfig?.temperature || config.ai.temperature || 0.7,
      },
      tools: context.tools?.length ? context.tools as any : undefined,
    }),
    timeout,
    'AI 调用超时',
  )

  if (result.error) {
    throw new Error(result.error)
  }

  if (!result.content) {
    throw new Error('AI 返回空响应')
  }

  return result.content
}

/**
 * 为 Promise 添加超时控制
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise])
}

// ============ 消息发送 ============

/**
 * 发送结果给用户（带独立重试）
 */
async function sendResultWithRetry(
  exec: TaskExecution,
  response: string,
  silent: boolean,
): Promise<void> {
  const content = silent
    ? `✅ 定时任务「${exec.taskName}」已执行完成`
    : response

  return withRetry(
    () => sendToUser(exec.userId, content, exec.outputFormat),
    SEND_MAX_RETRIES,
    'CronSend',
    { executionId: exec.id, taskId: exec.taskId, taskName: exec.taskName, userId: exec.userId, format: exec.outputFormat },
  )
}

/**
 * 发送消息给用户
 *
 * 通过 WebSocket 发送私聊消息。
 * 支持纯文本和语音两种输出格式。
 */
async function sendToUser(
  userId: string,
  content: string,
  outputFormat: 'text' | 'voice' = 'text',
): Promise<void> {
  // 语音输出：先 TTS 转语音
  if (outputFormat === 'voice') {
    const ttsResult = await textToSpeech(content)
    if (ttsResult.success && ttsResult.audioPath) {
      try {
        const audioBuffer = readFileSync(ttsResult.audioPath)
        const base64Audio = audioBuffer.toString('base64')
        const config = configManager.getConfig()
        const format = config.tts?.format || 'wav'
        const mimeType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`

        const result = await napcatWS.sendAction('send_private_msg', {
          user_id: Number(userId),
          message: [
            {
              type: 'record',
              data: { file: `data:${mimeType};base64,${base64Audio}` },
            },
          ],
        })

        if (result.status !== 'ok') {
          throw new Error(`发送语音消息失败: ${result.message}`)
        }
        return
      } catch (err) {
        logger.logSystem('CronEngine.Executor: voice_fallback', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        })
        // TTS 或发送失败时回退到文本
      } finally {
        try { unlinkSync(ttsResult.audioPath) } catch { /* ignore */ }
      }
    }
  }

  // 默认：文本输出
  const result = await napcatWS.sendAction('send_private_msg', {
    user_id: Number(userId),
    message: [
      {
        type: 'text',
        data: { text: content },
      },
    ],
  })

  if (result.status !== 'ok') {
    throw new Error(`发送消息失败: ${result.message}`)
  }
}

// ============ 工具函数 ============

/**
 * 检查静默标记
 */
function isSilentResponse(response: string): boolean {
  return response.includes(SILENT_MARKER)
}
