/**
 * 定时任务系统 - AI 工具定义
 *
 * 定义 AI function calling 可用的定时任务工具，
 * 包含工具定义数组、执行路由和创建任务的具体实现。
 */

import type { ToolDefinition } from '@/lib/ai/types'
import type { CreateTaskParams } from './types'
import { createTask, getUserTaskCount, updateTask } from './store'
import { scheduler } from './scheduler'
import { parseSchedule, calculateNextRun } from './parser'

// ============ AI 系统提示词 ============

export const CRON_SYSTEM_PROMPT = `## 定时任务管理

当用户要求创建定时任务时：

1. 解析用户意图，提取：任务名称、执行时间、执行频率、任务内容

2. 生成调度规则：
   - 每天 X 点 → schedule = "0 {分钟} {小时} * * *"
   - 每周X Y 点 → schedule = "0 {分钟} {小时} * * {星期几}"
   - 每隔 N 天 → schedule = "every {N}d"
   - 一次性 → schedule = "at {时间}"
   - 每隔 N 分钟 → schedule = "every {N}m"

3. 调用 create_scheduled_task 工具

4. 确认创建成功，告知用户任务详情

注意：
- 每个用户最多 10 个定时任务
- 如果时间已过，自动调整为明天`

// ============ 工具定义（OpenAI 格式） ============

export const CRON_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_scheduled_task',
      description: '创建定时任务。当用户要求定时执行某项操作时使用。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '任务名称',
          },
          schedule: {
            type: 'string',
            description:
              '调度规则，支持三种格式：at（一次性，如 "at 15:30"）、every（间隔，如 "every 5m"）、cron（表达式，如 "0 9 * * *"）',
          },
          prompt: {
            type: 'string',
            description: '任务提示词，执行时发送给 AI 的内容',
          },
          repeat: {
            type: 'boolean',
            description: '是否重复执行，false 则为一次性任务。不传则默认为 true（重复执行）',
          },
          outputFormat: {
            type: 'string',
            description: '输出格式："text"（文本）或 "voice"（语音）。不传则默认为 "text"',
          },
          silent: {
            type: 'boolean',
            description: '是否静默模式，true 时只发送状态提示不发送 AI 回复',
          },
          tools: {
            type: 'array',
            description: '可用工具列表（字符串数组），限制任务执行时可调用的工具',
          },
        },
        required: ['name', 'schedule', 'prompt'],
      },
    },
  },
]

// ============ 工具执行路由 ============

/**
 * 路由并执行 cron 相关的 AI 工具调用
 *
 * @param name - 工具名称
 * @param args - 工具参数
 * @param userId - 调用者用户 ID
 * @returns 执行结果消息
 */
export async function executeCronToolCall(
  name: string,
  args: Record<string, any>,
  userId: string,
): Promise<string> {
  switch (name) {
    case 'create_scheduled_task': {
      const { name: taskName, schedule, prompt, repeat, silent, tools, outputFormat } = args

      if (!taskName || typeof taskName !== 'string') {
        return '创建失败：缺少任务名称'
      }
      if (!schedule || typeof schedule !== 'string') {
        return '创建失败：缺少调度规则'
      }
      if (!prompt || typeof prompt !== 'string') {
        return '创建失败：缺少任务提示词'
      }

      // repeat 参数：接受任何 truthy/falsy 值，默认 true（兼容 AI 漏传或传字符串的情况）
      const repeatValue = repeat === undefined || repeat === null ? true : Boolean(repeat)

      // outputFormat 校验：只允许 'text' 或 'voice'，默认 'text'
      const fmt = outputFormat === 'voice' ? 'voice' : 'text'

      return createScheduledTask(
        {
          userId,
          name: taskName,
          schedule,
          prompt,
          repeat: repeatValue,
          silent: silent ?? false,
          outputFormat: fmt,
          tools,
        },
        userId,
      )
    }

    default:
      return `未知的定时任务工具: ${name}`
  }
}

// ============ 工具实现 ============

/** 每个用户最大任务数 */
const MAX_TASKS_PER_USER = 10

/**
 * 创建定时任务
 *
 * @param args - 任务参数（已包含 userId）
 * @param userId - 调用者用户 ID（用于数量校验）
 * @returns 创建结果消息
 */
async function createScheduledTask(
  args: CreateTaskParams,
  userId: string,
): Promise<string> {
  // 检查用户任务数量上限
  const currentCount = getUserTaskCount(userId)
  if (currentCount >= MAX_TASKS_PER_USER) {
    return `创建失败：你已有 ${currentCount} 个定时任务，达到上限 ${MAX_TASKS_PER_USER} 个。请先删除不需要的任务再创建新的。`
  }

  try {
    // 解析调度规则
    const parsed = parseSchedule(args.schedule)

    // 创建任务
    const task = createTask(args)

    // 更新任务的调度信息
    const updates: Record<string, any> = {
      scheduleType: parsed.type,
    }

    if (parsed.type === 'cron' && parsed.cron) {
      updates.scheduleCron = parsed.cron
    } else if (parsed.type === 'every' && parsed.interval) {
      updates.scheduleInterval = parsed.interval
    } else if (parsed.type === 'at' && parsed.at) {
      updates.scheduleAt = parsed.at
    }

    // 计算下次执行时间
    const nextRunSeconds = calculateNextRun({ ...task, ...updates } as any)
    updates.nextRunAt = nextRunSeconds * 1000

    // 更新任务
    updateTask(task.id, updates)

    // 刷新调度器，使新任务立即生效
    scheduler.refresh()

    const repeatText = task.repeat ? '重复执行' : '一次性'
    const silentText = task.silent ? '，静默模式' : ''

    return `定时任务创建成功！

任务名称：${task.name}
调度规则：${task.scheduleRaw}
执行模式：${repeatText}${silentText}
任务 ID：${task.id}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `创建失败：${message}`
  }
}
