/**
 * 定时任务系统 - AI 工具定义
 *
 * 定义 AI function calling 可用的定时任务工具，
 * 包含工具定义数组、执行路由和创建任务的具体实现。
 */

import type { ToolDefinition } from '@/lib/ai/types'
import type { CreateTaskParams, CronTask } from './types'
import { createTask, getUserTaskCount, updateTask, getUserTasks, getTask, deleteTask, getTaskLogs } from './store'
import { parseSchedule, calculateNextRun, cronToReadable } from './parser'
import { logger } from '../logger'

// ============ AI 系统提示词 ============

export const CRON_SYSTEM_PROMPT = `## 定时任务管理

### 创建定时任务
当用户要求创建定时任务时：
1. 解析用户意图，提取：任务名称、执行类型、执行时间/频率、任务内容
2. 自动判断任务类型：
   - 单次执行（oneTime）：用户说"N分钟后提醒我"、"明天早上8点叫我"、"提醒我一次"
   - 循环执行（cron）：用户说"每天早上8点"、"每周一"、"每月1号"
   - 间隔执行（interval）：用户说"每隔10分钟"、"每2小时"
3. 如果用户意图模糊（如只说"定时提醒我"未说时间或类型），必须追问确认
4. 创建前必须得到用户明确确认，不得自行猜测执行
5. 调用 create_scheduled_task 工具
6. 确认创建成功，告知用户任务详情

### 时间处理规则
- 每次请求时会附带当前系统时间：[系统时间: YYYY-MM-DD HH:mm:ss]
- 所有时间计算基于此系统时间
- 单次任务的时间如果已过，询问用户是否调整为明天

### 其他操作
- 查看任务：调用 list_scheduled_tasks
- 修改任务：调用 update_scheduled_task
- 删除任务：调用 delete_scheduled_task
- 暂停/恢复：调用 pause_scheduled_task / resume_scheduled_task

注意：
- 每个用户最多 10 个定时任务
- 单次任务（oneTime）执行后会自动标记为"执行完成"
- 循环任务（cron）和间隔任务（interval）执行后会自动计算下次执行时间
- 间隔任务可设置截止时间，到了截止时间自动停止`

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
          schedule_type: {
            type: 'string',
            description: '任务类型：oneTime（单次执行）、cron（循环执行，按星期/月份/日期）、interval（间隔执行）',
            enum: ['oneTime', 'cron', 'interval'],
          },
          schedule_config: {
            type: 'object',
            description: '调度配置，根据类型不同包含不同字段',
            properties: {
              at: { type: 'string', description: '[oneTime] 执行时间，格式 "YYYY-MM-DDTHH:mm" 或 "HH:mm"' },
              time: { type: 'string', description: '[cron] 执行时间，格式 "HH:mm"' },
              weekdays: { type: 'array', items: { type: 'number' }, description: '[cron] 星期几，1=周一~7=周日' },
              months: { type: 'array', items: { type: 'number' }, description: '[cron] 月份，1-12' },
              days: { type: 'array', items: { type: 'number' }, description: '[cron] 日期，1-31' },
              first_run: { type: 'string', description: '[interval] 首次执行时间' },
              interval_value: { type: 'number', description: '[interval] 间隔数值' },
              interval_unit: { type: 'string', description: '[interval] 间隔单位：m(分钟)/h(小时)/d(天)' },
              end_time: { type: 'string', description: '[interval] 截止时间（选填），格式 "YYYY-MM-DDTHH:mm"' },
            },
          },
          prompt: {
            type: 'string',
            description: '任务提示词，执行时发送给 AI 的内容',
          },
          silent: {
            type: 'boolean',
            description: '是否静默模式，true 时只发送状态提示不发送 AI 回复',
          },
          outputFormat: {
            type: 'string',
            description: '输出格式："text"（文本）或 "voice"（语音）。不传则默认为 "text"',
          },
          tools: {
            type: 'array',
            description: '可用工具列表（字符串数组），限制任务执行时可调用的工具',
          },
        },
        required: ['name', 'schedule_type', 'schedule_config', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_scheduled_tasks',
      description: '列出当前用户的所有定时任务。当用户要求查看/列出定时任务时使用。',
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
      name: 'get_scheduled_task_detail',
      description: '获取指定定时任务的详细信息和执行日志。',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: '任务 ID（完整 ID 或前 6 位）',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_scheduled_task',
      description: '更新指定定时任务的属性（名称、调度规则、提示词等）。',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: '任务 ID（完整 ID 或前 6 位）',
          },
          name: {
            type: 'string',
            description: '新的任务名称（可选）',
          },
          schedule: {
            type: 'string',
            description: '新的调度规则（可选），格式同 create_scheduled_task',
          },
          prompt: {
            type: 'string',
            description: '新的任务提示词（可选）',
          },
          silent: {
            type: 'boolean',
            description: '是否静默模式（可选）',
          },
          output_format: {
            type: 'string',
            description: '输出格式（可选）："text" 或 "voice"',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_scheduled_task',
      description: '删除指定定时任务及其执行日志。',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: '任务 ID（完整 ID 或前 6 位）',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_scheduled_task',
      description: '暂停指定定时任务，暂停后任务将不再执行。',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: '任务 ID（完整 ID 或前 6 位）',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume_scheduled_task',
      description: '恢复已暂停的定时任务，恢复后将继续按调度规则执行。',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: '任务 ID（完整 ID 或前 6 位）',
          },
        },
        required: ['task_id'],
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
      const { name: taskName, schedule_type, schedule_config, prompt, silent, tools, outputFormat } = args

      if (!taskName || typeof taskName !== 'string') {
        return '创建失败：缺少任务名称'
      }
      if (!schedule_type || typeof schedule_type !== 'string') {
        return '创建失败：缺少任务类型'
      }
      if (!schedule_config || typeof schedule_config !== 'object') {
        return '创建失败：缺少调度配置'
      }
      if (!prompt || typeof prompt !== 'string') {
        return '创建失败：缺少任务提示词'
      }

      // outputFormat 校验：只允许 'text' 或 'voice'，默认 'text'
      const fmt = outputFormat === 'voice' ? 'voice' : 'text'

      return createScheduledTask(
        {
          userId,
          name: taskName,
          schedule: '', // 将由 schedule_type + schedule_config 构建
          prompt,
          silent: silent ?? false,
          outputFormat: fmt,
          tools,
          scheduleType: schedule_type,
          scheduleConfig: schedule_config,
        },
        userId,
      )
    }

    case 'list_scheduled_tasks': {
      return listScheduledTasks(userId)
    }

    case 'get_scheduled_task_detail': {
      const taskId = args.task_id
      if (!taskId || typeof taskId !== 'string') {
        return '查询失败：缺少任务 ID'
      }
      return getScheduledTaskDetail(userId, taskId)
    }

    case 'update_scheduled_task': {
      const taskId = args.task_id
      if (!taskId || typeof taskId !== 'string') {
        return '更新失败：缺少任务 ID'
      }
      return updateScheduledTask(userId, taskId, args)
    }

    case 'delete_scheduled_task': {
      const taskId = args.task_id
      if (!taskId || typeof taskId !== 'string') {
        return '删除失败：缺少任务 ID'
      }
      return deleteScheduledTask(userId, taskId)
    }

    case 'pause_scheduled_task': {
      const taskId = args.task_id
      if (!taskId || typeof taskId !== 'string') {
        return '暂停失败：缺少任务 ID'
      }
      return pauseScheduledTask(userId, taskId)
    }

    case 'resume_scheduled_task': {
      const taskId = args.task_id
      if (!taskId || typeof taskId !== 'string') {
        return '恢复失败：缺少任务 ID'
      }
      return resumeScheduledTask(userId, taskId)
    }

    default:
      return `未知的定时任务工具: ${name}`
  }
}

// ============ 工具实现 ============

/** 每个用户最大任务数 */
const MAX_TASKS_PER_USER = 10

/**
 * 通过完整 ID 或前 6 位查找用户的任务
 */
function findUserTask(userId: string, taskIdOrPrefix: string): CronTask | null {
  // 先尝试完整 ID 匹配
  const task = getTask(taskIdOrPrefix)
  if (task && task.userId === userId) {
    return task
  }

  // 尝试前缀匹配
  const userTasks = getUserTasks(userId)
  const matched = userTasks.filter((t) => t.id.startsWith(taskIdOrPrefix))
  if (matched.length === 1) {
    return matched[0]
  }
  if (matched.length > 1) {
    throw new Error(`任务 ID 前缀 "${taskIdOrPrefix}" 匹配到多个任务，请提供更完整的 ID`)
  }

  return null
}

/**
 * 格式化调度规则为可读文本
 */
function formatScheduleReadable(task: CronTask): string {
  switch (task.scheduleType) {
    case 'cron':
      return task.scheduleCron ? cronToReadable(task.scheduleCron) : task.scheduleRaw
    case 'every': {
      if (task.scheduleInterval == null) return task.scheduleRaw
      const interval = task.scheduleInterval
      if (interval >= 86400) return `每 ${interval / 86400} 天`
      if (interval >= 3600) return `每 ${interval / 3600} 小时`
      return `每 ${interval / 60} 分钟`
    }
    case 'at': {
      if (task.scheduleAt == null) return task.scheduleRaw
      return new Date(task.scheduleAt * 1000).toLocaleString('zh-CN')
    }
    default:
      return task.scheduleRaw
  }
}

/**
 * 格式化时间戳（毫秒）为本地时间字符串
 */
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
    // 根据 schedule_type + schedule_config 构建调度规则
    const scheduleType = args.scheduleType || (args as any).schedule_type
    const scheduleConfig = args.scheduleConfig || (args as any).schedule_config
    const endTime = args.endTime
    let schedule: string
    let endTimeValue: number | undefined

    if (scheduleType && scheduleConfig) {
      // 新参数结构：schedule_type + schedule_config
      switch (scheduleType) {
        case 'oneTime':
          schedule = `at ${scheduleConfig.at}`
          break
        case 'cron': {
          // 构建 cron 表达式
          const { time, weekdays, months, days } = scheduleConfig
          if (time) {
            const [hour, minute] = time.split(':')
            const cronExpr = buildCronExpression({ hour, minute, weekdays, months, days })
            schedule = cronExpr
          } else {
            schedule = `at ${scheduleConfig.at || '08:00'}`
          }
          break
        }
        case 'interval': {
          const { first_run, interval_value, interval_unit, end_time } = scheduleConfig
          schedule = `at ${first_run || '08:00'}`  // 首次执行用 at
          if (end_time) {
            endTimeValue = Math.floor(new Date(end_time).getTime() / 1000)
          }
          // interval 信息存储在 description 或单独处理
          break
        }
        default:
          return `创建失败：不支持的任务类型 "${scheduleType}"`
      }
    } else {
      // 旧参数结构：schedule 字符串
      schedule = args.schedule
    }

    // 解析调度规则
    const parsed = parseSchedule(schedule)

    // 创建任务
    const task = createTask({ ...args, schedule })

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

    if (endTimeValue || endTime) {
      updates.endTime = endTimeValue || endTime
    }

    // 计算下次执行时间
    const nextRunSeconds = calculateNextRun({ ...task, ...updates } as any)
    updates.nextRunAt = nextRunSeconds * 1000

    // 更新任务
    updateTask(task.id, updates)

    // 刷新引擎，使新任务立即生效
    const engine = getCronEngine()
    engine.unregisterTask(task.id)

    const repeatText = task.scheduleType === 'at' ? '一次性' : '重复执行'
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

/**
 * 列出用户的所有定时任务
 */
async function listScheduledTasks(userId: string): Promise<string> {
  const tasks = getUserTasks(userId)

  if (tasks.length === 0) {
    return '你还没有定时任务。\n\n💡 直接告诉我你想定时做什么，我来帮你创建～'
  }

  const lines: string[] = []
  lines.push(`📋 你的定时任务列表（${tasks.length}/${MAX_TASKS_PER_USER}）`)
  lines.push('')

  tasks.forEach((task, index) => {
    const statusIcon = task.enabled ? '✅' : '⏸️'
    const repeatIcon = task.scheduleType === 'at' ? '1️⃣' : '🔁'
    lines.push(`${index + 1}. ${statusIcon} ${repeatIcon} ${task.name}`)
    lines.push(`   ⏰ ${formatScheduleReadable(task)}`)
    lines.push(`   📝 ${task.prompt.slice(0, 40)}${task.prompt.length > 40 ? '...' : ''}`)
    lines.push(`   🆔 ${task.id.slice(0, 8)} | 已执行 ${task.runCount} 次`)
    if (index < tasks.length - 1) {
      lines.push('')
    }
  })

  lines.push('')
  lines.push('---')
  lines.push('💡 可以对我说：')
  lines.push('  • "修改任务 xxx 的名称为..."')
  lines.push('  • "删除任务 xxx"')
  lines.push('  • "暂停/恢复任务 xxx"')
  lines.push('  • "查看任务 xxx 的详情"')

  return lines.join('\n')
}

/**
 * 获取任务详情和执行日志
 */
async function getScheduledTaskDetail(userId: string, taskIdOrPrefix: string): Promise<string> {
  const task = findUserTask(userId, taskIdOrPrefix)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  const logs = getTaskLogs(task.id, 5)
  const lines: string[] = []

  lines.push(`📋 任务详情：${task.name}`)
  lines.push('')
  lines.push(`🆔 任务 ID：${task.id}`)
  lines.push(`⏰ 调度规则：${formatScheduleReadable(task)}`)
  lines.push(`📝 提示词：${task.prompt}`)
  lines.push(`🔁 重复执行：${task.scheduleType === 'at' ? '否' : '是'}`)
  lines.push(`🔕 静默模式：${task.silent ? '是' : '否'}`)
  lines.push(`📤 输出格式：${task.outputFormat}`)
  lines.push(`📊 状态：${task.enabled ? '✅ 启用' : '⏸️ 暂停'}`)
  lines.push(`📈 已执行：${task.runCount} 次`)
  lines.push(`🕐 创建时间：${formatTimestamp(task.createdAt)}`)

  if (task.nextRunAt) {
    lines.push(`⏭️ 下次执行：${formatTimestamp(task.nextRunAt)}`)
  }
  if (task.lastRunAt) {
    lines.push(`⏮️ 上次执行：${formatTimestamp(task.lastRunAt)}`)
    if (task.lastRunStatus) {
      const statusIcon = task.lastRunStatus === 'success' ? '✅' : task.lastRunStatus === 'timeout' ? '⏱️' : '❌'
      lines.push(`   结果：${statusIcon} ${task.lastRunStatus}`)
    }
  }

  if (logs.length > 0) {
    lines.push('')
    lines.push(`📜 最近 ${logs.length} 条执行日志：`)
    logs.forEach((log, index) => {
      const statusIcon = log.status === 'success' ? '✅' : log.status === 'timeout' ? '⏱️' : '❌'
      lines.push(`  ${index + 1}. ${statusIcon} ${formatTimestamp(log.executedAt)} | 尝试 ${log.attempts} 次`)
    })
  }

  return lines.join('\n')
}

/**
 * 更新定时任务
 */
async function updateScheduledTask(
  userId: string,
  taskIdOrPrefix: string,
  args: Record<string, any>,
): Promise<string> {
  const task = findUserTask(userId, taskIdOrPrefix)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  try {
    const updates: Record<string, any> = {}
    const changes: string[] = []

    // 更新名称
    if (args.name !== undefined && typeof args.name === 'string' && args.name.trim()) {
      updates.name = args.name.trim()
      changes.push(`名称 → "${args.name.trim()}"`)
    }

    // 更新提示词
    if (args.prompt !== undefined && typeof args.prompt === 'string' && args.prompt.trim()) {
      updates.prompt = args.prompt.trim()
      changes.push('提示词已更新')
    }

    // 更新重复标志
    if (args.repeat !== undefined) {
      updates.repeat = Boolean(args.repeat)
      changes.push(`重复执行 → ${updates.repeat ? '是' : '否'}`)
    }

    // 更新静默模式
    if (args.silent !== undefined) {
      updates.silent = Boolean(args.silent)
      changes.push(`静默模式 → ${updates.silent ? '是' : '否'}`)
    }

    // 更新输出格式
    if (args.output_format !== undefined) {
      updates.outputFormat = args.output_format === 'voice' ? 'voice' : 'text'
      changes.push(`输出格式 → ${updates.outputFormat}`)
    }

    // 更新调度规则（需要重新解析和计算下次执行时间）
    if (args.schedule !== undefined && typeof args.schedule === 'string' && args.schedule.trim()) {
      const parsed = parseSchedule(args.schedule.trim())
      updates.scheduleType = parsed.type
      updates.scheduleRaw = args.schedule.trim()

      if (parsed.type === 'cron' && parsed.cron) {
        updates.scheduleCron = parsed.cron
        updates.scheduleInterval = undefined
        updates.scheduleAt = undefined
      } else if (parsed.type === 'every' && parsed.interval) {
        updates.scheduleInterval = parsed.interval
        updates.scheduleCron = undefined
        updates.scheduleAt = undefined
      } else if (parsed.type === 'at' && parsed.at) {
        updates.scheduleAt = parsed.at
        updates.scheduleCron = undefined
        updates.scheduleInterval = undefined
      }

      changes.push(`调度规则 → "${args.schedule.trim()}"`)

      // 重新计算下次执行时间
      const updatedTask = { ...task, ...updates }
      const nextRunSeconds = calculateNextRun(updatedTask as any)
      updates.nextRunAt = nextRunSeconds * 1000

      // 如果任务之前被禁用了（一次性任务执行后），但用户修改了调度规则，重新启用
      if (!task.enabled) {
        updates.enabled = true
        changes.push('状态 → 重新启用')
      }
    }

    if (Object.keys(updates).length === 0) {
      return '⚠️ 没有提供任何要修改的内容。可以修改：名称(name)、调度规则(schedule)、提示词(prompt)、是否重复(repeat)、静默模式(silent)、输出格式(output_format)'
    }

    updateTask(task.id, updates)

    // 刷新引擎，使更新立即生效
    const engine = getCronEngine()
    engine.unregisterTask(task.id)

    logger.logSystem('定时任务已更新', {
      taskId: task.id,
      taskName: task.name,
      changes,
    })

    return `✅ 任务「${task.name}」已更新：\n${changes.map((c) => `  • ${c}`).join('\n')}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `更新失败：${message}`
  }
}

/**
 * 删除定时任务
 */
async function deleteScheduledTask(userId: string, taskIdOrPrefix: string): Promise<string> {
  const task = findUserTask(userId, taskIdOrPrefix)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  const taskName = task.name
  const taskId = task.id

  deleteTask(taskId)

  logger.logSystem('定时任务已删除', { taskId, taskName })

  return `✅ 已删除任务「${taskName}」`
}

/**
 * 暂停定时任务
 */
async function pauseScheduledTask(userId: string, taskIdOrPrefix: string): Promise<string> {
  const task = findUserTask(userId, taskIdOrPrefix)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (!task.enabled) {
    return `⚠️ 任务「${task.name}」已经是暂停状态`
  }

  updateTask(task.id, { enabled: false })

  logger.logSystem('定时任务已暂停', { taskId: task.id, taskName: task.name })

  return `⏸️ 已暂停任务「${task.name}」\n💡 对我说"恢复任务 ${task.id.slice(0, 8)}"可以重新启用`
}

/**
 * 恢复定时任务
 */
async function resumeScheduledTask(userId: string, taskIdOrPrefix: string): Promise<string> {
  const task = findUserTask(userId, taskIdOrPrefix)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (task.enabled) {
    return `⚠️ 任务「${task.name}」已经是启用状态`
  }

  // 对于一次性任务（repeat=false），如果已经执行过，恢复时需要重新计算下次执行时间
  const updates: Record<string, any> = { enabled: true }

  if (task.scheduleType === 'at' && task.runCount > 0) {
    // 一次性任务已执行过，需要重新计算下次执行时间
    try {
      const nextRunSeconds = calculateNextRun(task)
      updates.nextRunAt = nextRunSeconds * 1000
    } catch {
      // 如果计算失败（如 at 类型时间已过），重置为 every 1d 避免无限循环
      updates.repeat = true
    }
  }

  // 如果 nextRunAt 为空或已过，重新计算
  if (!task.nextRunAt || task.nextRunAt < Date.now()) {
    try {
      const nextRunSeconds = calculateNextRun({ ...task, ...updates })
      updates.nextRunAt = nextRunSeconds * 1000
    } catch {
      return `❌ 无法恢复任务「${task.name}」：下次执行时间计算失败，请尝试修改调度规则`
    }
  }

  updateTask(task.id, updates)

  // 刷新引擎，使恢复立即生效
  const engine = getCronEngine()
  engine.unregisterTask(task.id)

  logger.logSystem('定时任务已恢复', { taskId: task.id, taskName: task.name })

  return `✅ 已恢复任务「${task.name}」`
}

// ============ 新架构引擎集成 ============

import { getCronEngine } from './engine'
import { createExecution, computeNextExecutionTime } from './engine/processor'
import type { ScheduleConfig } from './engine/types'

/**
 * 创建任务后生成第一条 Execution（新架构）
 *
 * 当 createTask 成功后，计算首次执行时间并创建 Execution 记录。
 * 同时注册到引擎。
 *
 * @param task - 创建的 CronTask
 * @param parsedSchedule - 解析后的调度配置
 */
export function createFirstExecution(
  task: CronTask,
  parsedSchedule: ScheduleConfig
): void {
  const engine = getCronEngine()

  // 构建引擎 Task 对象
  const engineTask = {
    id: task.id,
    userId: task.userId,
    name: task.name,
    description: task.description,
    schedule: parsedSchedule,
    scheduleRaw: task.scheduleRaw,
    prompt: task.prompt,
    tools: task.tools,
    outputFormat: task.outputFormat,
    enabled: task.enabled,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }

  // 计算首次执行时间
  const firstExecTime = computeNextExecutionTime(engineTask, Date.now())
  if (firstExecTime) {
    createExecution({
      taskId: task.id,
      userId: task.userId,
      scheduledAt: firstExecTime,
      status: 'pending',
      scheduleType: parsedSchedule.type,
      taskName: task.name,
      prompt: task.prompt,
      tools: task.tools ? JSON.stringify(task.tools) : undefined,
      outputFormat: task.outputFormat,
      attempts: 0,
      maxRetries: 2,
    })
  }

  // 注册到引擎
  engine.registerTask(engineTask)
}

/**
 * 解析后的调度转引擎 ScheduleConfig
 */
export function parsedToScheduleConfig(parsed: { type: string; cron?: string; interval?: number; at?: number }): ScheduleConfig {
  switch (parsed.type) {
    case 'at':
      return { type: 'oneTime', at: parsed.at }
    case 'every':
      return { type: 'interval', interval: parsed.interval }
    case 'cron':
      return { type: 'cron', expression: parsed.cron }
    default:
      return { type: 'cron', expression: parsed.cron }
  }
}

/**
 * 根据 AI 提供的参数构建 cron 表达式
 */
function buildCronExpression(config: {
  hour?: string
  minute?: string
  weekdays?: number[]
  months?: number[]
  days?: number[]
}): string {
  const hour = config.hour || '8'
  const minute = config.minute || '0'

  // 星期字段
  let dow = '*'
  if (config.weekdays && config.weekdays.length > 0) {
    // 转换：AI 使用 1=周一~7=周日，cron 使用 0=周日, 1=周一~6=周六
    const cronDays = config.weekdays.map(d => d % 7)
    dow = cronDays.join(',')
  }

  // 月份字段
  let month = '*'
  if (config.months && config.months.length > 0) {
    month = config.months.join(',')
  }

  // 日期字段
  let dom = '*'
  if (config.days && config.days.length > 0) {
    dom = config.days.join(',')
  }

  return `${minute} ${hour} ${dom} ${month} ${dow}`
}
