/**
 * AI 工具执行单元测试
 *
 * 重点覆盖 executeToolCall 对定时任务工具结果的真实成败判定：
 * 修复前 cron 分支无条件返回 success: true，导致"创建成功"假消息被当成成功。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted mocks
const { mockExecuteCronToolCall } = vi.hoisted(() => ({
  mockExecuteCronToolCall: vi.fn(),
}))

// Mock 定时任务工具模块（executeToolCall 中动态导入）
vi.mock('@/lib/cron/tools', () => ({
  executeCronToolCall: mockExecuteCronToolCall,
}))

// Mock AI 配置查询，避免引入真实 db
vi.mock('@/lib/db/queries/ai', () => ({
  getUserAIConfig: vi.fn(),
  upsertUserAIConfig: vi.fn(),
}))

import { executeToolCall } from '../tools'

describe('executeToolCall - 定时任务工具成功判定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    '创建失败：缺少任务名称',
    '更新失败：任务不存在',
    '删除失败：数据库错误',
    '暂停失败：未知错误',
    '恢复失败：计算错误',
    '查询失败：缺少任务 ID',
  ])('消息以"X失败："开头（%s）应判定为失败', async (message) => {
    mockExecuteCronToolCall.mockResolvedValue(message)

    const result = await executeToolCall(123, 'create_scheduled_task', {})

    expect(result.success).toBe(false)
    expect(result.message).toBe(message)
  })

  it('以"❌"开头的消息（任务不存在）应判定为失败', async () => {
    mockExecuteCronToolCall.mockResolvedValue('❌ 任务不存在，请检查任务 ID')

    const result = await executeToolCall(123, 'get_scheduled_task_detail', {})

    expect(result.success).toBe(false)
    expect(result.message).toBe('❌ 任务不存在，请检查任务 ID')
  })

  it('"未知的定时任务工具"消息应判定为失败', async () => {
    mockExecuteCronToolCall.mockResolvedValue('未知的定时任务工具: foo_tool')

    const result = await executeToolCall(123, 'foo_tool', {})

    expect(result.success).toBe(false)
  })

  it('正常创建成功消息应判定为成功', async () => {
    mockExecuteCronToolCall.mockResolvedValue(
      '定时任务创建成功！\n\n任务名称：测试任务\n任务 ID：abc123',
    )

    const result = await executeToolCall(123, 'create_scheduled_task', {})

    expect(result.success).toBe(true)
  })

  it('暂停/恢复等成功提示（emoji 前缀）应判定为成功', async () => {
    mockExecuteCronToolCall.mockResolvedValue('⏸️ 已暂停任务「测试」')

    const result = await executeToolCall(123, 'pause_scheduled_task', {})

    expect(result.success).toBe(true)
  })

  it('警示类消息（⚠️ 开头，非失败）应判定为成功', async () => {
    mockExecuteCronToolCall.mockResolvedValue('⚠️ 任务「测试」已经是暂停状态')

    const result = await executeToolCall(123, 'pause_scheduled_task', {})

    expect(result.success).toBe(true)
  })

  it('executeCronToolCall 抛异常时判定为失败', async () => {
    mockExecuteCronToolCall.mockRejectedValue(new Error('boom'))

    const result = await executeToolCall(123, 'resume_scheduled_task', {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('定时任务工具执行失败')
    expect(result.message).toContain('boom')
  })
})
