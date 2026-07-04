// src/app/api/cron/route.ts
// 定时任务管理 API

import { NextResponse } from 'next/server'
import { getUserTasks, getAllTasks, getTask, deleteTask, updateTask, getTaskLogs } from '@/lib/cron/store'
import { scheduler } from '@/lib/cron/scheduler'
import { parseSchedule, calculateNextRun } from '@/lib/cron/parser'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const taskId = searchParams.get('taskId')
    const action = searchParams.get('action')

    // 获取单个任务详情
    if (taskId && action === 'detail') {
      const task = getTask(taskId)
      if (!task) {
        return NextResponse.json({ success: false, message: '任务不存在' })
      }

      const logs = getTaskLogs(taskId, 50)
      return NextResponse.json({
        success: true,
        data: {
          task,
          logs,
        },
      })
    }

    // 获取任务列表
    if (userId) {
      const tasks = getUserTasks(userId)
      return NextResponse.json({
        success: true,
        data: tasks,
      })
    }

    // 没有 userId 时返回所有任务（用于获取默认用户等场景）
    const allTasks = getAllTasks()
    return NextResponse.json({
      success: true,
      data: allTasks,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, taskId, updates } = body

    if (!taskId) {
      return NextResponse.json({ success: false, message: '缺少任务 ID' })
    }

    const task = getTask(taskId)
    if (!task) {
      return NextResponse.json({ success: false, message: '任务不存在' })
    }

    switch (action) {
      case 'delete': {
        deleteTask(taskId)
        return NextResponse.json({
          success: true,
          message: `已删除任务「${task.name}」`,
        })
      }

      case 'pause': {
        updateTask(taskId, { enabled: false })
        return NextResponse.json({
          success: true,
          message: `已暂停任务「${task.name}」`,
        })
      }

      case 'resume': {
        updateTask(taskId, { enabled: true })
        return NextResponse.json({
          success: true,
          message: `已恢复任务「${task.name}」`,
        })
      }

      case 'run': {
        await scheduler.triggerTask(taskId)
        return NextResponse.json({
          success: true,
          message: `已触发任务「${task.name}」执行`,
        })
      }

      case 'update': {
        if (!updates) {
          return NextResponse.json({ success: false, message: '缺少更新数据' })
        }

        // 处理调度规则更新
        const processedUpdates: Record<string, any> = { ...updates }

        if (updates.scheduleRaw && typeof updates.scheduleRaw === 'string') {
          try {
            const parsed = parseSchedule(updates.scheduleRaw.trim())
            processedUpdates.scheduleType = parsed.type
            processedUpdates.scheduleRaw = updates.scheduleRaw.trim()

            // 清除旧的调度字段
            processedUpdates.scheduleCron = undefined
            processedUpdates.scheduleInterval = undefined
            processedUpdates.scheduleAt = undefined

            // 设置新的调度字段
            if (parsed.type === 'cron' && parsed.cron) {
              processedUpdates.scheduleCron = parsed.cron
            } else if (parsed.type === 'every' && parsed.interval) {
              processedUpdates.scheduleInterval = parsed.interval
            } else if (parsed.type === 'at' && parsed.at) {
              processedUpdates.scheduleAt = parsed.at
            }

            // 重新计算下次执行时间
            const updatedTask = { ...task, ...processedUpdates }
            const nextRunSeconds = calculateNextRun(updatedTask as any)
            processedUpdates.nextRunAt = nextRunSeconds * 1000

            // 如果任务之前被禁用，重新启用
            if (!task.enabled) {
              processedUpdates.enabled = true
            }
          } catch (parseError) {
            const parseMessage = parseError instanceof Error ? parseError.message : String(parseError)
            return NextResponse.json({
              success: false,
              message: `调度规则解析失败: ${parseMessage}`,
            })
          }
        }

        // 移除 undefined 值
        const cleanUpdates: Record<string, any> = {}
        for (const [key, value] of Object.entries(processedUpdates)) {
          if (value !== undefined) {
            cleanUpdates[key] = value
          }
        }

        updateTask(taskId, cleanUpdates)
        scheduler.refresh()

        return NextResponse.json({
          success: true,
          message: `已更新任务「${task.name}」`,
        })
      }

      default:
        return NextResponse.json({ success: false, message: '未知操作' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message })
  }
}
