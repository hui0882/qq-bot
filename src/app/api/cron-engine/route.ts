/**
 * 定时任务引擎 API - 任务列表和创建
 *
 * POST /api/cron-engine/tasks - 创建任务
 * GET /api/cron-engine/tasks - 查询任务列表
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseSchedule } from '@/lib/cron/parser'
import { getCronEngine } from '@/lib/cron/engine'
import { createExecution } from '@/lib/cron/engine/processor'
import { computeNextExecutionTime } from '@/lib/cron/engine/processor'
import type { Task, ScheduleConfig } from '@/lib/cron/engine/types'

/**
 * GET /api/cron-engine/tasks
 *
 * 查询任务列表
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    let tasks: Task[]

    if (userId) {
      const rows = db.prepare(`
        SELECT * FROM cron_tasks WHERE user_id = ? ORDER BY created_at DESC
      `).all(userId) as Array<{
        id: string
        user_id: string
        name: string
        description: string | null
        schedule_raw: string
        schedule_type: string
        schedule_cron: string | null
        schedule_interval: number | null
        schedule_at: number | null
        prompt: string
        tools: string | null
        output_format: string
        enabled: number
        created_at: number
        updated_at: number
      }>

      tasks = rows.map(rowToTask)
    } else {
      const rows = db.prepare(`
        SELECT * FROM cron_tasks ORDER BY created_at DESC
      `).all() as Array<{
        id: string
        user_id: string
        name: string
        description: string | null
        schedule_raw: string
        schedule_type: string
        schedule_cron: string | null
        schedule_interval: number | null
        schedule_at: number | null
        prompt: string
        tools: string | null
        output_format: string
        enabled: number
        created_at: number
        updated_at: number
      }>

      tasks = rows.map(rowToTask)
    }

    return NextResponse.json({
      success: true,
      data: tasks,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

/**
 * POST /api/cron-engine/tasks
 *
 * 创建任务
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, name, description, schedule, prompt, tools, outputFormat } = body

    if (!userId || !name || !schedule || !prompt) {
      return NextResponse.json(
        { success: false, message: '缺少必要字段: userId, name, schedule, prompt' },
        { status: 400 }
      )
    }

    // 解析调度规则
    let parsed: ScheduleConfig
    try {
      const legacyParsed = parseSchedule(schedule)
      parsed = legacyToEngineSchedule(legacyParsed)
    } catch (parseError) {
      return NextResponse.json(
        { success: false, message: `调度规则解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}` },
        { status: 400 }
      )
    }

    const now = Date.now()
    const taskId = crypto.randomUUID()

    // 插入任务
    db.prepare(`
      INSERT INTO cron_tasks (
        id, user_id, name, description, schedule_raw, schedule_type,
        schedule_cron, schedule_interval, schedule_at,
        prompt, tools, output_format, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      taskId,
      userId,
      name,
      description || null,
      schedule,
      getLegacyScheduleType(parsed.type),
      parsed.expression || null,
      parsed.interval || null,
      parsed.at ? parsed.at * 1000 : null,
      prompt,
      tools ? JSON.stringify(tools) : null,
      outputFormat || 'text',
      now,
      now,
    )

    // 计算首次执行时间并创建 Execution
    const task: Task = {
      id: taskId,
      userId,
      name,
      description,
      schedule: parsed,
      scheduleRaw: schedule,
      prompt,
      tools,
      outputFormat: outputFormat || 'text',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }

    const firstExecTime = computeNextExecutionTime(task, now)
    if (firstExecTime) {
      createExecution({
        taskId,
        userId,
        scheduledAt: firstExecTime,
        status: 'pending',
        scheduleType: parsed.type,
        taskName: name,
        prompt,
        tools: tools ? JSON.stringify(tools) : undefined,
        outputFormat: outputFormat || 'text',
        attempts: 0,
        maxRetries: 2,
      })
    }

    // 注册到引擎
    const engine = getCronEngine()
    engine.registerTask(task)

    return NextResponse.json({
      success: true,
      data: task,
      message: '任务创建成功',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

// ============ 辅助函数 ============

/**
 * 数据库行转 Task
 */
function rowToTask(row: {
  id: string
  user_id: string
  name: string
  description: string | null
  schedule_raw: string
  schedule_type: string
  schedule_cron: string | null
  schedule_interval: number | null
  schedule_at: number | null
  prompt: string
  tools: string | null
  output_format: string
  enabled: number
  created_at: number
  updated_at: number
}): Task {
  let schedule: ScheduleConfig

  switch (row.schedule_type) {
    case 'at':
      schedule = { type: 'oneTime', at: row.schedule_at ? Math.floor(row.schedule_at / 1000) : undefined }
      break
    case 'every':
      schedule = { type: 'interval', interval: row.schedule_interval || undefined }
      break
    case 'cron':
    default:
      schedule = { type: 'cron', expression: row.schedule_cron || row.schedule_raw }
      break
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || undefined,
    schedule,
    scheduleRaw: row.schedule_raw,
    prompt: row.prompt,
    tools: row.tools ? JSON.parse(row.tools) : undefined,
    outputFormat: (row.output_format as 'text' | 'voice') || 'text',
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 旧格式调度解析结果转新格式
 */
function legacyToEngineSchedule(legacy: { type: string; cron?: string; interval?: number; at?: number }): ScheduleConfig {
  switch (legacy.type) {
    case 'at':
      return { type: 'oneTime', at: legacy.at }
    case 'every':
      return { type: 'interval', interval: legacy.interval }
    case 'cron':
      return { type: 'cron', expression: legacy.cron }
    default:
      return { type: 'cron', expression: legacy.cron }
  }
}

/**
 * 新格式调度类型转旧格式
 */
function getLegacyScheduleType(type: string): string {
  switch (type) {
    case 'oneTime': return 'at'
    case 'interval': return 'every'
    case 'cron': return 'cron'
    default: return 'cron'
  }
}
