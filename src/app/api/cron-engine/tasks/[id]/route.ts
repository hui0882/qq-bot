/**
 * 定时任务引擎 API - 单个任务操作
 *
 * GET /api/cron-engine/tasks/[id] - 查询任务详情
 * PUT /api/cron-engine/tasks/[id] - 更新任务
 * DELETE /api/cron-engine/tasks/[id] - 删除任务
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseSchedule } from '@/lib/cron/parser'
import { getCronEngine } from '@/lib/cron/engine'
import { cancelPendingByTask, deleteExecutionsByTask } from '@/lib/cron/engine/processor'
import type { Task, ScheduleConfig } from '@/lib/cron/engine/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/cron-engine/tasks/[id]
 *
 * 查询任务详情
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const row = db.prepare(`
      SELECT * FROM cron_tasks WHERE id = ?
    `).get(id) as {
      id: string
      user_id: string
      name: string
      description: string | null
      schedule_raw: string
      schedule_type: string
      schedule_cron: string | null
      schedule_interval: number | null
      schedule_at: number | null
      end_time: number | null
      prompt: string
      tools: string | null
      output_format: string
      enabled: number
      created_at: number
      updated_at: number
    } | undefined

    if (!row) {
      return NextResponse.json({ success: false, message: '任务不存在' }, { status: 404 })
    }

    const task = rowToTask(row)

    // 获取执行记录
    const executions = db.prepare(`
      SELECT * FROM task_executions WHERE task_id = ? ORDER BY scheduled_at DESC LIMIT 20
    `).all(id) as Array<{
      id: string
      task_id: string
      user_id: string
      scheduled_at: number
      started_at: number | null
      completed_at: number | null
      status: string
      schedule_type: string
      task_name: string
      prompt: string
      tools: string | null
      output_format: string
      result: string | null
      error: string | null
      duration: number | null
      attempts: number
      max_retries: number
      created_at: number
    }>

    return NextResponse.json({
      success: true,
      data: {
        task,
        executions: executions.map(rowToExecution),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

/**
 * PUT /api/cron-engine/tasks/[id]
 *
 * 更新任务
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = db.prepare(`
      SELECT * FROM cron_tasks WHERE id = ?
    `).get(id) as {
      id: string
      user_id: string
      name: string
      description: string | null
      schedule_raw: string
      schedule_type: string
      schedule_cron: string | null
      schedule_interval: number | null
      schedule_at: number | null
      end_time: number | null
      prompt: string
      tools: string | null
      output_format: string
      enabled: number
      created_at: number
      updated_at: number
    } | undefined

    if (!existing) {
      return NextResponse.json({ success: false, message: '任务不存在' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    const now = Date.now()

    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.prompt !== undefined) updates.prompt = body.prompt
    if (body.tools !== undefined) updates.tools = JSON.stringify(body.tools)
    if (body.outputFormat !== undefined) updates.output_format = body.outputFormat
    if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0
    if (body.endTime !== undefined) updates.end_time = body.endTime || null

    // 处理调度规则更新
    if (body.schedule !== undefined && typeof body.schedule === 'string') {
      try {
        const legacyParsed = parseSchedule(body.schedule)
        const newSchedule = legacyToEngineSchedule(legacyParsed)

        updates.schedule_raw = body.schedule
        updates.schedule_type = getLegacyScheduleType(newSchedule.type)
        updates.schedule_cron = newSchedule.expression || null
        updates.schedule_interval = newSchedule.interval || null
        updates.schedule_at = newSchedule.at ? newSchedule.at * 1000 : null
      } catch (parseError) {
        return NextResponse.json(
          { success: false, message: `调度规则解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}` },
          { status: 400 }
        )
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: '没有要更新的内容' }, { status: 400 })
    }

    updates.updated_at = now

    // 构建更新 SQL
    const fields = Object.keys(updates).map(k => `${k} = ?`)
    const values = [...Object.values(updates), id]

    db.prepare(`
      UPDATE cron_tasks SET ${fields.join(', ')} WHERE id = ?
    `).run(...values)

    // 取消旧的 pending 执行，重新计算
    cancelPendingByTask(id)

    // 重新注册到引擎
    const engine = getCronEngine()
    const updatedRow = db.prepare('SELECT * FROM cron_tasks WHERE id = ?').get(id) as typeof existing
    const updatedTask = rowToTask(updatedRow)
    engine.registerTask(updatedTask)

    return NextResponse.json({
      success: true,
      data: updatedTask,
      message: '任务更新成功',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

/**
 * DELETE /api/cron-engine/tasks/[id]
 *
 * 删除任务
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const existing = db.prepare(`
      SELECT * FROM cron_tasks WHERE id = ?
    `).get(id) as { id: string; name: string } | undefined

    if (!existing) {
      return NextResponse.json({ success: false, message: '任务不存在' }, { status: 404 })
    }

    // 删除执行记录
    deleteExecutionsByTask(id)
    // 删除 cron_logs（旧架构兼容，避免外键约束失败）
    db.prepare('DELETE FROM cron_logs WHERE task_id = ?').run(id)


    // 删除任务
    db.prepare('DELETE FROM cron_tasks WHERE id = ?').run(id)

    // 从引擎注销
    const engine = getCronEngine()
    engine.unregisterTask(id)

    return NextResponse.json({
      success: true,
      message: `已删除任务「${existing.name}」`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

// ============ 辅助函数 ============

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
  end_time: number | null
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
    endTime: row.end_time || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToExecution(row: {
  id: string
  task_id: string
  user_id: string
  scheduled_at: number
  started_at: number | null
  completed_at: number | null
  status: string
  schedule_type: string
  task_name: string
  prompt: string
  tools: string | null
  output_format: string
  result: string | null
  error: string | null
  duration: number | null
  attempts: number
  max_retries: number
  created_at: number
}) {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    status: row.status,
    scheduleType: row.schedule_type,
    taskName: row.task_name,
    prompt: row.prompt,
    tools: row.tools || undefined,
    outputFormat: row.output_format,
    result: row.result || undefined,
    error: row.error || undefined,
    duration: row.duration || undefined,
    attempts: row.attempts,
    maxRetries: row.max_retries,
    createdAt: row.created_at,
  }
}

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

function getLegacyScheduleType(type: string): string {
  switch (type) {
    case 'oneTime': return 'at'
    case 'interval': return 'every'
    case 'cron': return 'cron'
    default: return 'cron'
  }
}
