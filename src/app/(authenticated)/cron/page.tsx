// src/app/(authenticated)/cron/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'

interface CronTask {
  id: string
  userId: string
  name: string
  description?: string
  scheduleRaw: string
  scheduleType: string
  scheduleCron?: string
  scheduleInterval?: number
  scheduleAt?: number
  prompt: string
  tools?: string[]
  outputFormat: string
  enabled: boolean
  repeat: boolean
  nextRunAt?: number
  lastRunAt?: number
  lastRunStatus?: string
  lastRunError?: string
  runCount: number
  silent: boolean
  retryCount: number
  createdAt: number
  updatedAt: number
}

interface CronLog {
  id: number
  taskId: string
  userId: string
  status: string
  result?: string
  error?: string
  duration?: number
  attempts: number
  executedAt: number
}

interface TaskDetail {
  task: CronTask
  logs: CronLog[]
}

export default function CronPage() {
  const [tasks, setTasks] = useState<CronTask[]>([])
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [userId, setUserId] = useState<string>('')

  // 获取用户 ID（从配置或默认值）
  useEffect(() => {
    // 这里简化处理，实际应该从登录状态获取
    setUserId('2959411319') // 默认用户 ID
  }, [])

  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    if (!userId) return

    try {
      const res = await fetch(`/api/cron?userId=${userId}`)
      const data = await res.json()

      if (data.success) {
        // 按创建时间从近到远排序
        const sortedTasks = data.data.sort((a: CronTask, b: CronTask) =>
          b.createdAt - a.createdAt
        )
        setTasks(sortedTasks)
      } else {
        setMessage(data.message)
      }
    } catch (error) {
      setMessage('获取任务列表失败')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // 获取任务详情
  const fetchTaskDetail = async (taskId: string) => {
    try {
      const res = await fetch(`/api/cron?taskId=${taskId}&action=detail`)
      const data = await res.json()

      if (data.success) {
        setSelectedTask(data.data)
      } else {
        setMessage(data.message)
      }
    } catch (error) {
      setMessage('获取任务详情失败')
    }
  }

  // 操作任务
  const handleAction = async (action: string, taskId: string) => {
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, taskId }),
      })

      const data = await res.json()
      setMessage(data.message)

      if (data.success) {
        fetchTasks()
        if (selectedTask?.task.id === taskId) {
          fetchTaskDetail(taskId)
        }
      }
    } catch (error) {
      setMessage('操作失败')
    }
  }

  // 格式化时间（精确到秒）
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '-'
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // 格式化调度规则
  const formatSchedule = (task: CronTask) => {
    switch (task.scheduleType) {
      case 'cron':
        return task.scheduleCron || task.scheduleRaw
      case 'every':
        if (task.scheduleInterval) {
          const interval = task.scheduleInterval
          if (interval >= 86400) return `每 ${interval / 86400} 天`
          if (interval >= 3600) return `每 ${interval / 3600} 小时`
          return `每 ${interval / 60} 分钟`
        }
        return task.scheduleRaw
      case 'at':
        return `一次性: ${formatTime(task.scheduleAt)}`
      default:
        return task.scheduleRaw
    }
  }

  // 格式化持续时间
  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // 状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅'
      case 'failed': return '❌'
      case 'timeout': return '⏱️'
      default: return '❓'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">⏰ 定时任务管理</h1>
        <button
          onClick={fetchTasks}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          刷新
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-gray-100 rounded">
          {message}
          <button
            onClick={() => setMessage('')}
            className="ml-2 text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 任务列表 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            任务列表 ({tasks.length}/10)
          </h2>

          {tasks.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded text-center text-gray-500">
              暂无定时任务
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTask?.task.id === task.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => fetchTaskDetail(task.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{task.name}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        ⏰ {formatSchedule(task)}
                      </div>
                      <div className="text-sm text-gray-500">
                        📝 {task.prompt.slice(0, 50)}{task.prompt.length > 50 ? '...' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        task.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {task.enabled ? '启用' : '暂停'}
                      </span>
                      <span className="text-sm text-gray-500">
                        {task.runCount}次
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    {task.enabled ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAction('pause', task.id)
                        }}
                        className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                      >
                        暂停
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAction('resume', task.id)
                        }}
                        className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200"
                      >
                        恢复
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAction('run', task.id)
                      }}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                    >
                      立即执行
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`确定删除任务「${task.name}」吗？`)) {
                          handleAction('delete', task.id)
                        }
                      }}
                      className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 任务详情 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">任务详情</h2>

          {selectedTask ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📋 基本信息</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">任务名称</div>
                  <div>{selectedTask.task.name}</div>
                  <div className="text-gray-500">任务 ID</div>
                  <div className="font-mono text-xs">{selectedTask.task.id}</div>
                  <div className="text-gray-500">调度规则</div>
                  <div>{formatSchedule(selectedTask.task)}</div>
                  <div className="text-gray-500">调度类型</div>
                  <div>{selectedTask.task.scheduleType}</div>
                  <div className="text-gray-500">重复执行</div>
                  <div>{selectedTask.task.repeat ? '是' : '否'}</div>
                  <div className="text-gray-500">静默模式</div>
                  <div>{selectedTask.task.silent ? '是' : '否'}</div>
                  <div className="text-gray-500">状态</div>
                  <div>
                    <span className={`px-2 py-1 text-xs rounded ${
                      selectedTask.task.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedTask.task.enabled ? '启用' : '暂停'}
                    </span>
                  </div>
                  <div className="text-gray-500">创建时间</div>
                  <div>{formatTime(selectedTask.task.createdAt)}</div>
                  <div className="text-gray-500">下次执行</div>
                  <div>{formatTime(selectedTask.task.nextRunAt)}</div>
                  <div className="text-gray-500">上次执行</div>
                  <div>{formatTime(selectedTask.task.lastRunAt)}</div>
                  <div className="text-gray-500">执行次数</div>
                  <div>{selectedTask.task.runCount} 次</div>
                </div>
              </div>

              {/* 任务提示词 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📝 任务提示词</h3>
                <div className="text-sm whitespace-pre-wrap">
                  {selectedTask.task.prompt}
                </div>
              </div>

              {/* 执行日志 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">
                  📊 执行日志 ({selectedTask.logs.length} 条)
                </h3>

                {selectedTask.logs.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">
                    暂无执行记录
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {selectedTask.logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-white rounded border"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span>{getStatusIcon(log.status)}</span>
                            <span className="text-sm font-medium">
                              {log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : '超时'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatTime(log.executedAt)}
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-gray-600">
                          <div>耗时: {formatDuration(log.duration)}</div>
                          <div>尝试次数: {log.attempts}</div>
                        </div>

                        {log.result && (
                          <div className="mt-2 p-2 bg-green-50 rounded text-sm">
                            <div className="text-xs text-gray-500 mb-1">发送内容:</div>
                            <div className="whitespace-pre-wrap">{log.result}</div>
                          </div>
                        )}

                        {log.error && (
                          <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                            <div className="text-xs text-gray-500 mb-1">错误信息:</div>
                            <div>{log.error}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded text-center text-gray-500">
              点击左侧任务查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
