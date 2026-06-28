// src/lib/ai/tools.ts
// AI 工具定义与执行（原生 function calling）

import { getUserAIConfig, upsertUserAIConfig } from '@/lib/db/queries/ai'
import type { ToolDefinition } from './types'

// ============ 工具定义（OpenAI 格式） ============

export const PROMPT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'set_prompt',
      description: '设置或修改用户的个人提示词。当用户表达任何关于回复风格、角色设定、行为偏好的要求时使用此工具。例如："以后回答要简洁"、"你是一个猫娘"、"记住用幽默风格"、"以后你的回答风格能更加可爱"等。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '完整的提示词内容，需要将用户的偏好转化为清晰的提示词语句',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prompt',
      description: '查看用户当前的个人提示词。当用户询问"我的提示词是什么"、"你现在是什么设定"时使用。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_prompt',
      description: '清除用户的个人提示词，恢复使用全局默认提示词。当用户说"清除提示词"、"恢复默认"、"去掉提示词"时使用。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

// ============ 工具执行结果 ============

export interface ToolResult {
  success: boolean
  message: string
}

/**
 * 执行工具调用，返回结果
 */
export function executeToolCall(userId: number, toolName: string, args: Record<string, unknown>): ToolResult {
  switch (toolName) {
    case 'set_prompt': {
      const content = args.content as string
      if (!content || content.trim().length === 0) {
        return { success: false, message: '提示词内容不能为空' }
      }
      if (content.length > 2000) {
        return { success: false, message: '提示词过长，请控制在 2000 字以内' }
      }
      upsertUserAIConfig(userId, {
        enabled: 1,
        custom_system_prompt: content.trim(),
      })
      return { success: true, message: `✅ 好的，我已经记住了你的偏好！以后会按照这个风格回复你。` }
    }

    case 'get_prompt': {
      const config = getUserAIConfig(userId)
      if (config?.custom_system_prompt) {
        return { success: true, message: `📝 当前个人提示词：${config.custom_system_prompt}` }
      }
      return { success: true, message: '📝 你还没有设置个人提示词，当前使用全局默认提示词。' }
    }

    case 'clear_prompt': {
      upsertUserAIConfig(userId, {
        enabled: 1,
        custom_system_prompt: null,
      })
      return { success: true, message: '✅ 个人提示词已清除，将使用全局默认提示词。' }
    }

    default:
      return { success: false, message: `未知工具: ${toolName}` }
  }
}
