/**
 * 定时任务引擎 API - 手动触发任务
 *
 * POST /api/cron-engine/tasks/[id]/run - 手动触发执行
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createExecution } from '@/lib/cron/engine/processor'
import { computeNextExecutionTime } from '@/lib/cron/engine/processor'
import { executeTask as executeLegacyTask } from '@/lib/cron/executor'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/cron-engine/tasks/[id]/run
 *
 * 手动触发任务执行
 */
export async function POST(request: Request, { params }: RouteParams) {
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

    const now = Date.now()

    // 创建即时执行的 Execution
    const execId = createExecution({
      taskId: row.id,
      userId: row.user_id,
      scheduledAt: now,
      status: 'running',
      scheduleType: row.schedule_type as 'oneTime' | 'interval' | 'cron',
      taskName: row.name,
      prompt: row.prompt,
      tools: row.tools || undefined,
      outputFormat: (row.output_format as 'text' | 'voice') || 'text',
      attempts: 1,
      maxRetries: 2,
    })

    // 构建 CronTask 执行
    const cronTask = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || undefined,
      scheduleRaw: row.schedule_raw,
      scheduleType: row.schedule_type as 'at' | 'every' | 'cron',
      scheduleCron: row.schedule_cron || undefined,
      scheduleInterval: row.schedule_interval || undefined,
      scheduleAt: row.schedule_at || undefined,
      prompt: row.prompt,
      tools: row.tools ? JSON.parse(row.tools) : undefined,
      outputFormat: (row.output_format as 'text' | 'voice') || 'text',
      enabled: true,
      repeat: true,
      nextRunAt: undefined,
      lastRunAt: undefined,
      lastRunStatus: undefined,
      lastRunError: undefined,
      runCount: 0,
      silent: false,
      retryCount: 0,
      createdAt: row.created_at,
      updatedAt: now,
    }

    try {
      const result = await executeLegacyTask(cronTask)

      if (result.status === 'success') {
        db.prepare(`
          UPDATE task_executions
          SET status = 'success', result = ?, duration = ?, completed_at = ?
          WHERE id = ?
        `).run(result.result || '', result.duration, now, execId)
      } else {
        db.prepare(`
          UPDATE task_executions
          SET status = 'failed', error = ?, completed_at = ?
          WHERE id = ?
        `).run(result.error || '未知错误', now, execId)
      }

      // 计算下次执行时间
      const nextTime = computeNextExecutionTime(
        {
          id: row.id,
          userId: row.user_id,
          name: row.name,
          description: row.description || undefined,
          schedule: {
            type: row.schedule_type === 'at' ? 'oneTime' : row.schedule_type === 'every' ? 'interval' : 'cron',
            expression: row.schedule_cron || undefined,
            interval: row.schedule_interval || undefined,
            at: row.schedule_at ? Math.floor(row.schedule_at / 1000) : undefined,
          },
          scheduleRaw: row.schedule_raw,
          prompt: row.prompt,
          tools: row.tools ? JSON.parse(row.tools) : undefined,
          outputFormat: (row.output_format as 'text' | 'voice') || 'text',
          enabled: true,
          createdAt: row.created_at,
          updatedAt: now,
        },
        now
      )

      return NextResponse.json({
        success: true,
        data: {
          executionId: execId,
          status: result.status,
          result: result.result,
          error: result.error,
          duration: result.duration,
          nextExecutionAt: nextTime,
        },
        message: '任务执行完成',
      })
    } catch (execError) {
      const errorMessage = execError instanceof Error ? execError.message : String(execError)
      db.prepare(`
        UPDATE task_executions
        SET status = 'failed', error = ?, completed_at = ?
        WHERE id = ?
      `).run(errorMessage, Date.now(), execId)

      return NextResponse.json({
        success: false,
        message: `执行失败: ${errorMessage}`,
      }, { status: 500 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
