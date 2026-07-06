// src/lib/ai/tools.ts
// AI 工具定义与执行（原生 function calling）

import { getUserAIConfig, upsertUserAIConfig } from '@/lib/db/queries/ai'
import type { ToolDefinition } from './types'

// 定时任务工具定义（避免循环依赖）
const CRON_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_scheduled_task',
      description: '创建定时任务。当用户要求定时执行某项操作时使用。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名称' },
          schedule: { type: 'string', description: '调度规则，支持：at（一次性，如 "at 15:30"）、every（间隔，如 "every 5m"）、cron（表达式，如 "0 9 * * *"）' },
          prompt: { type: 'string', description: '任务提示词，执行时发送给 AI 的内容' },
          repeat: { type: 'boolean', description: '是否重复执行，false 则为一次性任务。不传则默认为 true（重复执行）' },
          silent: { type: 'boolean', description: '是否静默模式，true 时只发送状态提示不发送 AI 回复' },
        },
        required: ['name', 'schedule', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_scheduled_tasks',
      description: '列出当前用户的所有定时任务。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_scheduled_task_detail',
      description: '获取指定定时任务的详细信息和执行日志。',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string', description: '任务 ID（完整 ID 或前 6 位）' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_scheduled_task',
      description: '更新指定定时任务的属性。',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务 ID' },
          name: { type: 'string', description: '新的任务名称' },
          schedule: { type: 'string', description: '新的调度规则' },
          prompt: { type: 'string', description: '新的任务提示词' },
          repeat: { type: 'boolean', description: '是否重复执行' },
          silent: { type: 'boolean', description: '是否静默模式' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_scheduled_task',
      description: '删除指定定时任务。',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string', description: '任务 ID' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_scheduled_task',
      description: '暂停指定定时任务。',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string', description: '任务 ID' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume_scheduled_task',
      description: '恢复已暂停的定时任务。',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string', description: '任务 ID' } },
        required: ['task_id'],
      },
    },
  },
]

// ============ 工具定义（OpenAI 格式） ============

export const PROMPT_TOOLS: ToolDefinition[] = [
  ...CRON_TOOLS,
  {
    type: 'function',
    function: {
      name: 'reply_in_parts',
      description: '分段回复工具。当用户的问题需要详细解释、提供建议、回答复杂问题时，必须使用此工具。' +
        '它会让回复更自然，像真人聊天一样先给出简短反应，再详细解答。' +
        '只有简单的问候、确认、简短回答（少于20字）才不需要使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          first_response: {
            type: 'string',
            description: '简短的第一反应（10-30字），表达关心和理解，如"我来帮你分析一下"、"这个问题很好"、"别担心，我来帮你看看"',
          },
        },
        required: ['first_response'],
      },
    },
  },
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
export async function executeToolCall(userId: number, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
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

    // 定时任务工具（动态导入避免循环依赖）
    case 'create_scheduled_task':
    case 'list_scheduled_tasks':
    case 'get_scheduled_task_detail':
    case 'update_scheduled_task':
    case 'delete_scheduled_task':
    case 'pause_scheduled_task':
    case 'resume_scheduled_task': {
      try {
        const { executeCronToolCall } = await import('@/lib/cron/tools')
        const message = await executeCronToolCall(toolName, args as Record<string, any>, String(userId))
        return { success: true, message }
      } catch (err) {
        return { success: false, message: `定时任务工具执行失败: ${(err as Error).message}` }
      }
    }

    default: {
      // 尝试 school 工具（动态导入避免循环依赖）
      try {
        const { executeSchoolTool } = await import('@/lib/school/tools')
        return await executeSchoolTool(userId, toolName)
      } catch {
        return { success: false, message: `未知工具: ${toolName}` }
      }
    }
  }
}
