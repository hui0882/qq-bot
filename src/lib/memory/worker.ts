/**
 * Memory Worker
 *
 * 异步记忆整理后台任务
 *
 * 流程：
 * 1. 定时扫描未处理消息
 * 2. 按用户分组，检查是否达到触发阈值
 * 3. 调用 Memory Agent (LLM) 提取画像、摘要、记忆
 * 4. 更新数据库
 *
 * 不阻塞主消息处理流程
 */

import { memoryManager } from './manager'
import { callLLM } from '../ai/llm-client'
import { configManager } from '../config'
import { getUserAIConfig } from '../db/queries/ai'
import { logger } from '../logger'
import type { MemoryMessage } from './store'

// ============ 配置 ============

/** 触发记忆整理的未处理消息阈值 */
const TRIGGER_THRESHOLD = 5

/** Worker 扫描间隔（毫秒） */
const SCAN_INTERVAL = 2 * 60 * 1000  // 2 分钟

/** 每次处理的最大消息数 */
const MAX_MESSAGES_PER_BATCH = 30

// ============ Memory Agent Prompt ============

const MEMORY_AGENT_PROMPT = `你是一个记忆管理助手。你的任务是分析用户的对话历史，提取重要信息。

你需要输出一个 JSON 对象，包含以下字段：

{
  "profile_update": [
    {"key": "字段名", "value": "字段值"}
  ],
  "new_memory": [
    {"type": "类型", "content": "内容", "importance": 0.0-1.0}
  ],
  "summary": "对话摘要（一段话，概括用户近期关注的内容）"
}

规则：
1. profile_update: 提取稳定的用户信息，如职业、学校、专业、兴趣、偏好、宿舍号等
2. new_memory: 提取重要事件、目标、偏好等，importance 表示重要程度（0-1）
3. summary: 对近期对话的简要总结，不超过100字
4. 如果某类信息没有新内容，对应字段返回空数组
5. memory_type 只能是: profile / event / preference / goal
6. 只提取明确的信息，不要猜测

当前用户画像：
{profiles}

当前摘要：
{summary}

近期对话：
{messages}

请输出 JSON：`

// ============ Worker 状态 ============

class MemoryWorkerImpl {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private processing = new Set<string>()  // 正在处理的用户

  /**
   * 启动 Worker
   */
  start(): void {
    if (this.timer) return

    this.timer = setInterval(() => this.scan(), SCAN_INTERVAL)

    // 进程退出时清理
    process.on('exit', () => this.stop())

    console.log(`[MemoryWorker] Started with interval=${SCAN_INTERVAL / 1000}s, threshold=${TRIGGER_THRESHOLD}`)
  }

  /**
   * 停止 Worker
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[MemoryWorker] Stopped')
  }

  /**
   * 手动触发某个用户的记忆整理
   */
  async trigger(userId: string): Promise<boolean> {
    return this.processUser(userId)
  }

  /**
   * 获取 Worker 状态
   */
  getStatus(): { running: boolean; processing: string[] } {
    return {
      running: this.timer !== null,
      processing: Array.from(this.processing),
    }
  }

  // ============ 内部方法 ============

  /**
   * 扫描所有用户的未处理消息
   */
  private async scan(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      // 获取所有有未处理消息的用户
      const unprocessed = memoryManager.getUnprocessedMessages(undefined, 1000)

      // 按用户分组
      const userGroups = new Map<string, MemoryMessage[]>()
      for (const msg of unprocessed) {
        const group = userGroups.get(msg.user_id) || []
        group.push(msg)
        userGroups.set(msg.user_id, group)
      }

      // 检查每个用户是否达到阈值
      for (const [userId, messages] of userGroups) {
        if (messages.length >= TRIGGER_THRESHOLD && !this.processing.has(userId)) {
          console.log(`[MemoryWorker] Triggering for user ${userId} (${messages.length} unprocessed)`)
          // 异步处理，不阻塞扫描
          this.processUser(userId).catch(err => {
            console.error(`[MemoryWorker] Error processing user ${userId}:`, err)
          })
        }
      }
    } catch (err) {
      console.error('[MemoryWorker] Scan error:', err)
    } finally {
      this.running = false
    }
  }

  /**
   * 处理单个用户的记忆整理
   */
  private async processUser(userId: string): Promise<boolean> {
    if (this.processing.has(userId)) return false
    this.processing.add(userId)

    try {
      // 1. 获取未处理消息
      const messages = memoryManager.getUnprocessedMessages(userId, MAX_MESSAGES_PER_BATCH)
      if (messages.length === 0) return false

      // 2. 获取当前画像和摘要
      const profiles = memoryManager.getProfiles(userId)
      const summary = memoryManager.getSummary(userId)

      // 3. 构建 Memory Agent 输入
      const profilesStr = profiles.length > 0
        ? profiles.map(p => `${p.key}: ${p.value}`).join('\n')
        : '暂无'

      const summaryStr = summary?.summary || '暂无'

      const messagesStr = messages
        .map(m => `[${m.role}] ${m.content}`)
        .join('\n')

      const prompt = MEMORY_AGENT_PROMPT
        .replace('{profiles}', profilesStr)
        .replace('{summary}', summaryStr)
        .replace('{messages}', messagesStr)

      // 4. 获取 LLM 配置
      const globalConfig = configManager.getConfig().ai
      const userAiConfig = getUserAIConfig(userId)

      const llmConfig = {
        baseUrl: userAiConfig?.base_url || globalConfig.baseUrl,
        apiKey: userAiConfig?.api_key || globalConfig.apiKey,
        model: userAiConfig?.model || globalConfig.model,
        maxTokens: 1024,
        temperature: 0.3,  // 低温度，更确定性的输出
      }

      // 5. 调用 LLM
      const response = await callLLM({
        messages: [
          { role: 'system', content: '你是一个记忆管理助手，只输出 JSON，不要输出其他内容。' },
          { role: 'user', content: prompt },
        ],
        config: llmConfig,
      })

      if (response.error) {
        console.error(`[MemoryWorker] LLM error for user ${userId}:`, response.error)
        return false
      }

      // 6. 解析结果
      const result = this.parseResponse(response.content)
      if (!result) {
        console.error(`[MemoryWorker] Failed to parse response for user ${userId}`)
        return false
      }

      // 7. 更新数据库
      this.applyResult(userId, result, messages)

      // 8. 标记消息为已处理
      memoryManager.markProcessed(messages.map(m => m.id))

      // 9. 使缓存失效
      memoryManager.invalidateCache(userId)

      logger.logSystem('MemoryWorker: processed', {
        userId,
        messageCount: messages.length,
        profileUpdates: result.profile_update?.length || 0,
        newMemories: result.new_memory?.length || 0,
        hasSummary: !!result.summary,
      })

      console.log(`[MemoryWorker] Processed user ${userId}: ${messages.length} messages`)
      return true

    } catch (err) {
      console.error(`[MemoryWorker] Error processing user ${userId}:`, err)
      return false
    } finally {
      this.processing.delete(userId)
    }
  }

  /**
   * 解析 LLM 响应为结构化数据
   */
  private parseResponse(content: string): MemoryAgentResult | null {
    try {
      // 尝试提取 JSON（可能被包裹在 ```json ... ``` 中）
      let jsonStr = content.trim()

      // 移除 markdown 代码块标记
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }

      // 尝试找到 JSON 对象
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      if (start === -1 || end === -1) return null

      jsonStr = jsonStr.substring(start, end + 1)

      const parsed = JSON.parse(jsonStr)

      // 验证结构
      if (typeof parsed !== 'object' || parsed === null) return null

      return {
        profile_update: Array.isArray(parsed.profile_update) ? parsed.profile_update : [],
        new_memory: Array.isArray(parsed.new_memory) ? parsed.new_memory : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      }
    } catch {
      return null
    }
  }

  /**
   * 将 Memory Agent 结果应用到数据库
   */
  private applyResult(userId: string, result: MemoryAgentResult, messages: MemoryMessage[]): void {
    // 1. 更新用户画像
    if (result.profile_update && result.profile_update.length > 0) {
      memoryManager.updateProfiles(
        userId,
        result.profile_update.map(p => ({
          key: p.key,
          value: p.value,
          confidence: 0.8,
        }))
      )
    }

    // 2. 添加长期记忆
    if (result.new_memory && result.new_memory.length > 0) {
      memoryManager.addMemories(
        userId,
        result.new_memory.map(m => ({
          memory_type: m.type as 'profile' | 'event' | 'preference' | 'goal',
          content: m.content,
          importance: Math.min(1, Math.max(0, m.importance || 0.5)),
        }))
      )
    }

    // 3. 更新摘要
    if (result.summary) {
      const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : undefined
      memoryManager.updateSummary(userId, result.summary, lastMessageId)
    }
  }
}

// ============ 类型定义 ============

interface MemoryAgentResult {
  profile_update: Array<{ key: string; value: string }>
  new_memory: Array<{ type: string; content: string; importance: number }>
  summary: string
}

// ============ 单例导出 ============

const globalForWorker = globalThis as unknown as { __memoryWorker?: MemoryWorkerImpl }

export function getMemoryWorker(): MemoryWorkerImpl {
  if (!globalForWorker.__memoryWorker) {
    globalForWorker.__memoryWorker = new MemoryWorkerImpl()
  }
  return globalForWorker.__memoryWorker
}

export const memoryWorker = {
  start: () => getMemoryWorker().start(),
  stop: () => getMemoryWorker().stop(),
  trigger: (userId: string) => getMemoryWorker().trigger(userId),
  getStatus: () => getMemoryWorker().getStatus(),
}
