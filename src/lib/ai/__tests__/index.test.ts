/**
 * AI 主流程（processAIMessage）工具调用日志单元测试
 *
 * 覆盖本次「日志展示优化」改动：
 * - 工具调用成功/失败时产生一对 logTool(tool_call_start / tool_call_end) 日志
 * - 不再产生 'AI: tool_call_start' 的 system 日志
 *
 * 通过 vi.mock 完整 mock LLM 调用链（callLLM / executeToolCall / memoryManager / logger），
 * 不发起任何真实网络请求。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AIConfig } from '@/types/napcat'
import type { LLMResponse } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCallLLM,
  mockGetUserAIConfig,
  mockBuildSystemPrompt,
  mockExecuteToolCall,
  mockLogTool,
  mockLogSystem,
  mockLogAI,
  mockBuildContext,
  mockSaveConversation,
} = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockGetUserAIConfig: vi.fn(),
  mockBuildSystemPrompt: vi.fn(),
  mockExecuteToolCall: vi.fn(),
  mockLogTool: vi.fn(),
  mockLogSystem: vi.fn(),
  mockLogAI: vi.fn(),
  mockBuildContext: vi.fn(),
  mockSaveConversation: vi.fn(),
}))

vi.mock('../llm-client', () => ({ callLLM: mockCallLLM }))
vi.mock('@/lib/db/queries/ai', () => ({ getUserAIConfig: mockGetUserAIConfig }))
vi.mock('../prompt', () => ({ buildSystemPrompt: mockBuildSystemPrompt }))
vi.mock('../tools', () => ({
  PROMPT_TOOLS: [],
  executeToolCall: mockExecuteToolCall,
}))
vi.mock('@/lib/school/tools', () => ({ SCHOOL_TOOLS: [] }))
vi.mock('@/lib/logger', () => ({
  logger: {
    logTool: mockLogTool,
    logSystem: mockLogSystem,
    logAI: mockLogAI,
  },
}))
vi.mock('@/lib/memory', () => ({
  memoryManager: {
    buildContext: mockBuildContext,
    saveConversation: mockSaveConversation,
    clearAll: vi.fn(),
    clearConversation: vi.fn(),
    getStats: vi.fn(),
  },
}))

// Import after mocking
import { processAIMessage } from '../index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const globalConfig: AIConfig = {
  enabled: true,
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'test-key',
  model: 'test-model',
  maxTokens: 2048,
  temperature: 0.7,
  maxContextRounds: 10,
  defaultReplyType: 'text',
  debugContext: false,
  fileReplyEnabled: false,
  systemPrompt: '你是一个测试助手',
}

function toolCallResponse(id = 'call_abc123', name = 'get_prompt'): LLMResponse {
  return {
    content: '让我查一下你的提示词',
    toolCalls: [
      { id, type: 'function', function: { name, arguments: '{}' } },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processAIMessage 工具调用日志', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    mockGetUserAIConfig.mockReturnValue(undefined)
    mockBuildSystemPrompt.mockReturnValue({ role: 'system', content: '系统提示词' })
    mockBuildContext.mockReturnValue({
      userProfiles: {},
      conversationSummary: '',
      recentMessages: [],
      relatedMemories: [],
    })
  })

  it('工具调用成功时产生 tool_call_start / tool_call_end 一对日志，且无 AI system 日志', async () => {
    mockCallLLM
      .mockResolvedValueOnce(toolCallResponse())
      .mockResolvedValueOnce({
        content: '最终回复内容',
        usage: { prompt: 15, completion: 8 },
      })
    mockExecuteToolCall.mockResolvedValue({ success: true, message: '✅ 当前无个人提示词' })

    const response = await processAIMessage(42, '我的提示词是什么？', 'text', globalConfig)

    // 1. logTool 恰好被调用两次（start + end）
    expect(mockLogTool).toHaveBeenCalledTimes(2)

    // 2. start 日志字段
    expect(mockLogTool).toHaveBeenNthCalledWith(1, {
      action: 'tool_call_start',
      userId: 42,
      tool: 'get_prompt',
      args: {},
      toolCallId: 'call_abc123',
    })

    // 3. end 日志字段（含执行结果与耗时）
    const endCall = mockLogTool.mock.calls[1][0]
    expect(endCall.action).toBe('tool_call_end')
    expect(endCall.userId).toBe(42)
    expect(endCall.tool).toBe('get_prompt')
    expect(endCall.toolCallId).toBe('call_abc123')
    expect(endCall.success).toBe(true)
    expect(endCall.resultMessage).toBe('✅ 当前无个人提示词')
    expect(endCall.duration).toEqual(expect.any(Number))

    // 4. 不再产生 'AI: tool_call_start' 的 system 日志
    const systemMessages = mockLogSystem.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('AI: tool_call_start'))
    expect(systemMessages).toHaveLength(0)

    // 5. 最终回复来自第二次 callLLM
    expect(response.content).toBe('最终回复内容')
    expect(mockCallLLM).toHaveBeenCalledTimes(2)
  })

  it('工具执行失败时 end 日志带 success=false 与失败信息', async () => {
    mockCallLLM
      .mockResolvedValueOnce(toolCallResponse('call_xyz', 'set_prompt'))
      .mockResolvedValueOnce({ content: '', error: 'API 错误 (500): boom' })
    mockExecuteToolCall.mockResolvedValue({ success: false, message: '提示词内容不能为空' })

    const response = await processAIMessage(7, '设置提示词', 'text', globalConfig)

    expect(mockLogTool).toHaveBeenCalledTimes(2)
    const startCall = mockLogTool.mock.calls[0][0]
    const endCall = mockLogTool.mock.calls[1][0]

    expect(startCall.action).toBe('tool_call_start')
    expect(startCall.tool).toBe('set_prompt')
    expect(startCall.toolCallId).toBe('call_xyz')

    expect(endCall.action).toBe('tool_call_end')
    expect(endCall.success).toBe(false)
    expect(endCall.resultMessage).toBe('提示词内容不能为空')
    expect(endCall.duration).toEqual(expect.any(Number))

    // 第二次 LLM 失败时回退使用工具结果作为回复内容
    expect(response.content).toBe('提示词内容不能为空')
  })

  it('无工具调用时不产生 logTool 日志', async () => {
    mockCallLLM.mockResolvedValueOnce({ content: '普通回答，不需要工具' })

    const response = await processAIMessage(42, '你好', 'text', globalConfig)

    expect(response.error).toBeUndefined()
    expect(response.content).toBe('普通回答，不需要工具')
    expect(mockLogTool).not.toHaveBeenCalled()
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
  })

  it('start 与 end 日志共享同一 toolCallId（同一工具调用配对）', async () => {
    mockCallLLM
      .mockResolvedValueOnce(toolCallResponse('call_pair_1', 'get_prompt'))
      .mockResolvedValueOnce({ content: 'ok' })
    mockExecuteToolCall.mockResolvedValue({ success: true, message: 'ok' })

    await processAIMessage(99, '查提示词', 'text', globalConfig)

    const startCall = mockLogTool.mock.calls[0][0]
    const endCall = mockLogTool.mock.calls[1][0]
    expect(startCall.toolCallId).toBe('call_pair_1')
    expect(endCall.toolCallId).toBe('call_pair_1')
    expect(startCall.tool).toBe('get_prompt')
    expect(endCall.tool).toBe('get_prompt')
  })
})
