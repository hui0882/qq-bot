/**
 * 定时任务系统 - 命令处理
 *
 * 处理 /cron 子命令，包括任务列表、删除、暂停、恢复、立即执行、查看日志。
 */

import type { CronTask, CronLog } from './types'
import { getUserTasks, getTask, deleteTask, updateTask, getTaskLogs } from './store'
import { cronToReadable } from './parser'
import { getCronEngine } from './engine'
import { createExecution, computeNextExecutionTime } from './engine/processor'
import type { Task } from './engine/types'

// ============ 命令路由 ============

/**
 * 路由 /cron 命令到对应子命令处理函数
 *
 * @param userId - 当前用户 ID
 * @param args - 命令参数（不含 /cron 前缀），例如 ['list'] 或 ['delete', 'abc123']
 * @returns 命令执行结果的文本
 */
export async function handleCronCommand(userId: string, args: string[]): Promise<string> {
  const subCommand = args[0]?.toLowerCase()

  if (!subCommand || subCommand === 'help') {
    return formatHelp()
  }

  switch (subCommand) {
    case 'list':
      return handleList(userId)

    case 'delete': {
      const taskId = args[1]
      if (!taskId) {
        return '❌ 请指定任务 ID，例如: /cron delete abc123'
      }
      return handleDelete(userId, taskId)
    }

    case 'pause': {
      const taskId = args[1]
      if (!taskId) {
        return '❌ 请指定任务 ID，例如: /cron pause abc123'
      }
      return handlePause(userId, taskId)
    }

    case 'resume': {
      const taskId = args[1]
      if (!taskId) {
        return '❌ 请指定任务 ID，例如: /cron resume abc123'
      }
      return handleResume(userId, taskId)
    }

    case 'run': {
      const taskId = args[1]
      if (!taskId) {
        return '❌ 请指定任务 ID，例如: /cron run abc123'
      }
      return handleRun(userId, taskId)
    }

    case 'logs': {
      const taskId = args[1]
      if (!taskId) {
        return '❌ 请指定任务 ID，例如: /cron logs abc123'
      }
      return handleLogs(userId, taskId)
    }

    default:
      return `❌ 未知命令: /cron ${subCommand}\n\n${formatHelp()}`
  }
}

// ============ 子命令实现 ============

/**
 * 查看当前用户的所有定时任务
 */
async function handleList(userId: string): Promise<string> {
  const tasks = getUserTasks(userId)

  if (tasks.length === 0) {
    return '📋 你还没有定时任务\n\n💡 创建定时任务：直接告诉我你想定时做什么'
  }

  const MAX_TASKS = 10
  const lines: string[] = []
  lines.push(`📋 你的定时任务列表 (${tasks.length}/${MAX_TASKS})`)
  lines.push('')

  tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.name} [ID: ${task.id.slice(0, 6)}]`)
    lines.push(`   ⏰ ${formatSchedule(task)}`)
    lines.push(`   📝 ${task.description || task.prompt.slice(0, 50)}`)
    lines.push(`   🔄 类型：${task.scheduleType === 'at' ? '单次' : '循环'} | ${task.enabled ? '✅ 状态：启用' : '⏸️ 状态：暂停'}`)

    const runInfo = `   📊 已执行：${task.runCount}次`
    if (task.lastRunAt) {
      lines.push(`${runInfo} | 上次：${formatTimestamp(task.lastRunAt)}`)
    } else {
      lines.push(runInfo)
    }

    if (index < tasks.length - 1) {
      lines.push('')
    }
  })

  lines.push('')
  lines.push('---')
  lines.push('💡 创建定时任务：直接告诉我你想定时做什么')

  return lines.join('\n')
}

/**
 * 删除指定任务
 */
async function handleDelete(userId: string, taskId: string): Promise<string> {
  const task = getTask(taskId)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (task.userId !== userId) {
    return '❌ 无权操作：该任务不属于你'
  }

  deleteTask(taskId)
  return `✅ 已删除任务「${task.name}」`
}

/**
 * 暂停指定任务
 */
async function handlePause(userId: string, taskId: string): Promise<string> {
  const task = getTask(taskId)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (task.userId !== userId) {
    return '❌ 无权操作：该任务不属于你'
  }

  if (!task.enabled) {
    return `⚠️ 任务「${task.name}」已经是暂停状态`
  }

  updateTask(taskId, { enabled: false })
  return `⏸️ 已暂停任务「${task.name}」\n💡 使用 /cron resume ${taskId.slice(0, 6)} 恢复`
}

/**
 * 恢复指定任务
 */
async function handleResume(userId: string, taskId: string): Promise<string> {
  const task = getTask(taskId)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (task.userId !== userId) {
    return '❌ 无权操作：该任务不属于你'
  }

  if (task.enabled) {
    return `⚠️ 任务「${task.name}」已经是启用状态`
  }

  updateTask(taskId, { enabled: true })
  return `✅ 已恢复任务「${task.name}」`
}

/**
 * 立即执行指定任务
 */
async function handleRun(userId: string, taskId: string): Promise<string> {
  const task = getTask(taskId)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (task.userId !== userId) {
    return '❌ 无权操作：该任务不属于你'
  }

  try {
    // 使用新引擎创建即时执行
    const engine = getCronEngine()
    const nextTime = computeNextExecutionTime({
      id: task.id,
      userId: task.userId,
      name: task.name,
      description: task.description,
      schedule: { type: task.scheduleType === 'at' ? 'oneTime' : task.scheduleType === 'every' ? 'interval' : 'cron', at: task.scheduleAt, interval: task.scheduleInterval, expression: task.scheduleCron },
      scheduleRaw: task.scheduleRaw,
      prompt: task.prompt,
      tools: task.tools,
      outputFormat: task.outputFormat,
      enabled: true,
      endTime: task.endTime,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }, Date.now())

    if (nextTime) {
      createExecution({
        taskId: task.id,
        userId: task.userId,
        scheduledAt: Date.now(), // 立即执行
        status: 'pending',
        scheduleType: task.scheduleType === 'at' ? 'oneTime' : task.scheduleType === 'every' ? 'interval' : 'cron',
        taskName: task.name,
        prompt: task.prompt,
        tools: task.tools ? JSON.stringify(task.tools) : undefined,
        outputFormat: task.outputFormat,
        attempts: 0,
        maxRetries: 2,
      })

      // 立即入队到引擎缓冲，使本次触发的执行尽快被调度（不修改任务定义）
      engine.enqueuePendingExecution(task.id)
    }

    return `🚀 已触发任务「${task.name}」执行\n稍后将收到执行结果`
  } catch (err) {
    return `❌ 执行失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * 查看指定任务的执行日志
 */
async function handleLogs(userId: string, taskId: string): Promise<string> {
  const task = getTask(taskId)
  if (!task) {
    return '❌ 任务不存在，请检查任务 ID'
  }

  if (task.userId !== userId) {
    return '❌ 无权操作：该任务不属于你'
  }

  const logs = getTaskLogs(taskId, 10)

  if (logs.length === 0) {
    return `📋 任务「${task.name}」暂无执行日志`
  }

  const lines: string[] = []
  lines.push(`📋 任务「${task.name}」执行日志（最近 ${logs.length} 条）`)
  lines.push('')

  logs.forEach((log, index) => {
    const statusIcon = log.status === 'success' ? '✅' : log.status === 'timeout' ? '⏱️' : '❌'
    const time = formatTimestamp(log.executedAt)
    const duration = log.duration != null ? ` (${formatDuration(log.duration)})` : ''

    lines.push(`${index + 1}. ${statusIcon} ${time}${duration}`)

    if (log.status === 'success' && log.result) {
      const preview = log.result.length > 80 ? log.result.slice(0, 80) + '...' : log.result
      lines.push(`   💬 ${preview}`)
    }

    if (log.status === 'failed' && log.error) {
      lines.push(`   ❌ ${log.error.slice(0, 100)}`)
    }

    if (log.attempts > 1) {
      lines.push(`   🔁 重试 ${log.attempts} 次`)
    }
  })

  return lines.join('\n')
}

// ============ 格式化工具函数 ============

/**
 * 格式化帮助信息
 */
function formatHelp(): string {
  return [
    '📖 定时任务命令帮助',
    '',
    '/cron list            查看所有任务',
    '/cron delete <id>     删除任务',
    '/cron pause <id>      暂停任务',
    '/cron resume <id>     恢复任务',
    '/cron run <id>        立即执行任务',
    '/cron logs <id>       查看执行日志',
    '',
    '💡 创建定时任务：直接告诉我你想定时做什么',
  ].join('\n')
}

/**
 * 格式化任务的调度规则为可读文本
 */
function formatSchedule(task: CronTask): string {
  switch (task.scheduleType) {
    case 'cron':
      return task.scheduleCron ? cronToReadable(task.scheduleCron) : task.scheduleRaw

    case 'every': {
      if (task.scheduleInterval == null) return task.scheduleRaw
      const interval = task.scheduleInterval
      if (interval >= 86400) {
        return `每 ${interval / 86400} 天`
      }
      if (interval >= 3600) {
        return `每 ${interval / 3600} 小时`
      }
      return `每 ${interval / 60} 分钟`
    }

    case 'at': {
      if (task.scheduleAt == null) return task.scheduleRaw
      return formatTimestamp(task.scheduleAt)
    }

    default:
      return task.scheduleRaw
  }
}

/**
 * 格式化 Unix 时间戳（毫秒）为本地时间字符串
 */
function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化耗时（毫秒）为可读文本
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
