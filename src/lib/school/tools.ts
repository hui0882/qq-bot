// src/lib/school/tools.ts
// 学业助手 — AI function calling 工具

import { queryHomework } from './service'
import type { ToolDefinition } from '@/lib/ai/types'
import type { ToolResult } from '@/lib/ai/tools'

export const SCHOOL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'query_homework',
      description: '查询用户当前待提交的作业列表。当用户问"有什么作业"、"作业做完了没"、"查一下作业"、"作业截止时间"时使用。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

export async function executeSchoolTool(
  userId: number,
  toolName: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'query_homework': {
      const result = await queryHomework(String(userId), 'ai')
      return { success: result.success, message: result.message }
    }
    default:
      return { success: false, message: `未知工具: ${toolName}` }
  }
}
