// src/app/api/cron/route.ts
// 定时任务管理 API

import { NextResponse } from 'next/server'
import { getUserTasks, getTask, deleteTask, updateTask, getTaskLogs } from '@/lib/cron/store'
import { scheduler } from '@/lib/cron/scheduler'

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

    return NextResponse.json({ success: false, message: '缺少参数' })
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
        if (updates) {
          updateTask(taskId, updates)
          return NextResponse.json({
            success: true,
            message: `已更新任务「${task.name}」`,
          })
        }
        return NextResponse.json({ success: false, message: '缺少更新数据' })
      }

      default:
        return NextResponse.json({ success: false, message: '未知操作' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message })
  }
}
