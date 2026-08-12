/**
 * Logger 单元测试
 *
 * 覆盖本次「日志展示优化」改动的核心：
 * 1. logTool 工具调用日志（type='tool'，action=tool_call_start/tool_call_end）
 * 2. getLogs 的 type 过滤（'tool' 与 'ai' 及混合类型）
 *
 * 说明：mock 掉 ./config，避免初始化数据库 / chokidar / 定时任务调度器等副作用；
 * 同时关闭文件持久化（persistToFile=false），保证测试不写磁盘。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LogEntry } from '@/types/napcat'

// Mock config，避免 ConfigManager 构造时的数据库初始化与调度器副作用
const { mockGetConfig, mockOnUpdate } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockOnUpdate: vi.fn(),
}))

vi.mock('../config', () => ({
  configManager: {
    getConfig: mockGetConfig,
    onUpdate: mockOnUpdate,
  },
}))

interface LoggerInstance {
  logTool: (params: {
    action?: 'tool_call_start' | 'tool_call_end'
    userId: number
    tool: string
    args?: Record<string, unknown>
    toolCallId?: string
    success?: boolean
    resultMessage?: string
    duration?: number
  }) => LogEntry
  logSystem: (message: string, data?: unknown) => LogEntry
  logAI: (params: unknown) => LogEntry
  logEvent: (event: unknown) => LogEntry
  logRequest: (action: string, params: unknown, echo: string) => LogEntry
  getLogs: (filters?: { type?: LogEntry['type']; action?: string; limit?: number; offset?: number }) => LogEntry[]
}

/**
 * 获取一个全新的 Logger 实例（重置全局单例 + 模块缓存）
 */
async function createFreshLogger(): Promise<LoggerInstance> {
  vi.resetModules()
  ;(globalThis as { __logger?: unknown }).__logger = undefined
  const mod = await import('../logger')
  return mod.getLogger() as LoggerInstance
}

describe('Logger.logTool', () => {
  let logger: LoggerInstance

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockReturnValue({
      log: { maxEntries: 100, persistToFile: false, logDir: '/nonexistent-log-dir' },
    })
    mockOnUpdate.mockImplementation((cb: (config: unknown) => void) => {
      // 保持注册回调为空操作即可
      void cb
      return () => {}
    })
  })

  it('start 日志：type=tool、action=tool_call_start，data 只含基础字段', async () => {
    logger = await createFreshLogger()

    const entry = logger.logTool({
      action: 'tool_call_start',
      userId: 12345,
      tool: 'get_prompt',
      args: { keyword: '测试' },
      toolCallId: 'call_abc123',
    })

    expect(entry.type).toBe('tool')
    expect(entry.action).toBe('tool_call_start')
    expect(entry.id).toBeTruthy()
    expect(typeof entry.timestamp).toBe('number')

    const data = entry.data as Record<string, unknown>
    expect(data.userId).toBe(12345)
    expect(data.tool).toBe('get_prompt')
    expect(data.args).toEqual({ keyword: '测试' })
    expect(data.toolCallId).toBe('call_abc123')
    // start 日志不应包含执行结果相关字段
    expect(data).not.toHaveProperty('success')
    expect(data).not.toHaveProperty('resultMessage')
    expect(data).not.toHaveProperty('duration')
  })

  it('end 日志：action=tool_call_end，data 包含全部字段', async () => {
    logger = await createFreshLogger()

    const entry = logger.logTool({
      action: 'tool_call_end',
      userId: 12345,
      tool: 'get_prompt',
      args: {},
      toolCallId: 'call_abc123',
      success: true,
      resultMessage: '✅ 执行成功',
      duration: 320,
    })

    expect(entry.type).toBe('tool')
    expect(entry.action).toBe('tool_call_end')

    const data = entry.data as Record<string, unknown>
    expect(data.userId).toBe(12345)
    expect(data.tool).toBe('get_prompt')
    expect(data.toolCallId).toBe('call_abc123')
    expect(data.success).toBe(true)
    expect(data.resultMessage).toBe('✅ 执行成功')
    expect(data.duration).toBe(320)
  })

  it('未传 action 时默认为 undefined，data 不包含多余字段', async () => {
    logger = await createFreshLogger()

    const entry = logger.logTool({ userId: 1, tool: 'set_prompt' })

    expect(entry.type).toBe('tool')
    expect(entry.action).toBeUndefined()
    const data = entry.data as Record<string, unknown>
    expect(data.userId).toBe(1)
    expect(data.tool).toBe('set_prompt')
    expect(data).not.toHaveProperty('toolCallId')
  })
})

describe('Logger.getLogs type 过滤', () => {
  let logger: LoggerInstance

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockReturnValue({
      log: { maxEntries: 100, persistToFile: false, logDir: '/nonexistent-log-dir' },
    })
  })

  it('type=tool 只返回 tool 条目', async () => {
    logger = await createFreshLogger()

    // 混入多种类型日志
    logger.logTool({ action: 'tool_call_start', userId: 1, tool: 'get_prompt', toolCallId: 'c1' })
    logger.logTool({ action: 'tool_call_end', userId: 1, tool: 'get_prompt', toolCallId: 'c1', success: true, resultMessage: 'ok', duration: 10 })
    logger.logAI({ userId: 1, direction: 'request', data: { userMessage: 'hi' } })
    logger.logSystem('AI: tool_call_start')
    logger.logEvent({ post_type: 'message', message_type: 'private', raw_message: 'hi' })
    logger.logRequest('send_msg', { user_id: 1 }, 'echo-1')

    const toolLogs = logger.getLogs({ type: 'tool' })
    expect(toolLogs).toHaveLength(2)
    for (const l of toolLogs) {
      expect(l.type).toBe('tool')
    }
    // 倒序返回：最新的在前
    expect(toolLogs[0].action).toBe('tool_call_end')
    expect(toolLogs[1].action).toBe('tool_call_start')
  })

  it('type=ai 回归：只返回 ai 条目', async () => {
    logger = await createFreshLogger()

    logger.logTool({ action: 'tool_call_start', userId: 1, tool: 'get_prompt', toolCallId: 'c1' })
    logger.logAI({ userId: 1, direction: 'request', data: { userMessage: 'hi' } })
    logger.logAI({ userId: 1, direction: 'response', data: { userMessage: 'hi', modelResponse: 'hello' } })
    logger.logSystem('普通系统日志')

    const aiLogs = logger.getLogs({ type: 'ai' })
    expect(aiLogs).toHaveLength(2)
    for (const l of aiLogs) {
      expect(l.type).toBe('ai')
    }
  })

  it('混合类型下过滤互不干扰', async () => {
    logger = await createFreshLogger()

    logger.logTool({ action: 'tool_call_start', userId: 1, tool: 'get_prompt', toolCallId: 'c1' })
    logger.logAI({ userId: 1, direction: 'request', data: { userMessage: 'hi' } })
    logger.logSystem('AI: tool_call_start')
    logger.logEvent({ post_type: 'message', message_type: 'private', raw_message: 'hi' })

    // tool + action 组合过滤
    const endLogs = logger.getLogs({ type: 'tool', action: 'tool_call_end' })
    expect(endLogs).toHaveLength(0)

    logger.logTool({ action: 'tool_call_end', userId: 1, tool: 'get_prompt', toolCallId: 'c1', success: true, resultMessage: 'ok', duration: 5 })
    const endLogs2 = logger.getLogs({ type: 'tool', action: 'tool_call_end' })
    expect(endLogs2).toHaveLength(1)
    expect(endLogs2[0].type).toBe('tool')
    expect(endLogs2[0].action).toBe('tool_call_end')

    // 不带过滤时返回全部（按时间倒序）
    const all = logger.getLogs({ limit: 100 })
    expect(all).toHaveLength(5)
    // ai 过滤不受 tool 日志影响
    expect(logger.getLogs({ type: 'ai' })).toHaveLength(1)
  })

  it('limit/offset 分页对 type 过滤后的结果生效', async () => {
    logger = await createFreshLogger()

    for (let i = 0; i < 5; i++) {
      logger.logTool({ action: 'tool_call_start', userId: 1, tool: `tool_${i}`, toolCallId: `c${i}` })
    }

    const page = logger.getLogs({ type: 'tool', limit: 2, offset: 1 })
    expect(page).toHaveLength(2)
    // 倒序后取 offset=1 起 2 条：最新是 tool_4，取 tool_3、tool_2
    const data = page.map((l) => (l.data as { tool: string }).tool)
    expect(data).toEqual(['tool_3', 'tool_2'])
  })
})
