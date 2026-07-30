import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCronEngine } from '@/lib/cron/engine'
import { cancelPendingByTask, createExecution, computeNextExecutionTime } from '@/lib/cron/engine/processor'
import type { Task } from '@/lib/cron/engine/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const row = db.prepare('SELECT * FROM cron_tasks WHERE id = ?').get(id) as any
    if (!row) {
      return NextResponse.json({ success: false, message: '任务不存在' }, { status: 404 })
    }

    const newEnabled = row.enabled === 1 ? 0 : 1

    db.prepare('UPDATE cron_tasks SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(newEnabled, Date.now(), id)

    const engine = getCronEngine()

    if (newEnabled === 0) {
      // 暂停：取消 pending 执行
      cancelPendingByTask(id)
    } else {
      // 启用：重新注册并创建 Execution
      const task = rowToTask(row)
      engine.registerTask(task)
      const nextTime = computeNextExecutionTime(task, Date.now())
      if (nextTime) {
        createExecution({
          taskId: id,
          userId: row.user_id,
          scheduledAt: nextTime,
          status: 'pending',
          scheduleType: row.schedule_type,
          taskName: row.name,
          prompt: row.prompt,
          tools: row.tools,
          outputFormat: row.output_format,
          attempts: 0,
          maxRetries: 2,
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: { enabled: newEnabled === 1 },
      message: newEnabled ? '已启用' : '已暂停',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}

function rowToTask(row: any): Task {
  let schedule: any
  switch (row.schedule_type) {
    case 'oneTime':
      schedule = { type: 'oneTime', at: row.schedule_at ? Math.floor(row.schedule_at / 1000) : undefined }
      break
    case 'interval':
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
    outputFormat: row.output_format || 'text',
    enabled: row.enabled === 1,
    endTime: row.end_time || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
