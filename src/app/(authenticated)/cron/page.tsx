// src/app/(authenticated)/cron/page.tsx
'use client'

import { useEffect, useState } from 'react'

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
  const [editingTask, setEditingTask] = useState<CronTask | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    schedule: '',
    prompt: '',
    repeat: true,
    silent: false,
    outputFormat: 'text',
  })

  // 加载所有定时任务
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/cron')
        const data = await res.json()
        if (!cancelled && data.success) {
          setTasks((data.data || []).sort((a: CronTask, b: CronTask) => b.createdAt - a.createdAt))
        }
      } catch (e) {
        console.error('fetchTasks error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // 获取任务详情
  const fetchTaskDetail = async (taskId: string) => {
    try {
      const res = await fetch(`/api/cron?taskId=${taskId}&action=detail`)
      const data = await res.json()
      if (data.success) setSelectedTask(data.data)
      else setMessage(data.message)
    } catch {
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
        // 刷新列表
        const listRes = await fetch('/api/cron')
        const listData = await listRes.json()
        if (listData.success) setTasks((listData.data || []).sort((a: CronTask, b: CronTask) => b.createdAt - a.createdAt))
        if (selectedTask?.task.id === taskId) fetchTaskDetail(taskId)
      }
    } catch {
      setMessage('操作失败')
    }
  }

  // 打开编辑模态框
  const openEditModal = (task: CronTask) => {
    setEditingTask(task)
    setEditForm({
      name: task.name,
      schedule: task.scheduleRaw,
      prompt: task.prompt,
      repeat: task.repeat,
      silent: task.silent,
      outputFormat: task.outputFormat,
    })
  }

  // 提交编辑
  const handleEditSubmit = async () => {
    if (!editingTask) return
    try {
      const updates: Record<string, any> = {}
      if (editForm.name !== editingTask.name) updates.name = editForm.name
      if (editForm.schedule !== editingTask.scheduleRaw) updates.scheduleRaw = editForm.schedule
      if (editForm.prompt !== editingTask.prompt) updates.prompt = editForm.prompt
      if (editForm.repeat !== editingTask.repeat) updates.repeat = editForm.repeat
      if (editForm.silent !== editingTask.silent) updates.silent = editForm.silent
      if (editForm.outputFormat !== editingTask.outputFormat) updates.outputFormat = editForm.outputFormat

      if (Object.keys(updates).length === 0) {
        setMessage('没有修改任何内容')
        setEditingTask(null)
        return
      }

      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', taskId: editingTask.id, updates }),
      })
      const data = await res.json()
      setMessage(data.message)
      if (data.success) {
        const listRes = await fetch('/api/cron')
        const listData = await listRes.json()
        if (listData.success) setTasks((listData.data || []).sort((a: CronTask, b: CronTask) => b.createdAt - a.createdAt))
        if (selectedTask?.task.id === editingTask.id) fetchTaskDetail(editingTask.id)
        setEditingTask(null)
      }
    } catch {
      setMessage('更新任务失败')
    }
  }

  // 刷新按钮
  const handleRefresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cron')
      const data = await res.json()
      if (data.success) setTasks((data.data || []).sort((a: CronTask, b: CronTask) => b.createdAt - a.createdAt))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  // 判断任务是否为单次执行
  const isOneTimeTask = (task: CronTask) => {
    return task.scheduleType === 'at' || !task.repeat
  }

  // 获取任务状态文本
  const getTaskStatusText = (task: CronTask) => {
    if (isOneTimeTask(task)) {
      if (!task.enabled && task.runCount > 0) return '已执行完成'
      if (!task.enabled) return '已禁用'
      return '待执行'
    }
    // 循环/间隔任务
    if (!task.enabled) return '已暂停'
    return '运行中'
  }

  // 获取任务状态样式
  const getTaskStatusStyle = (task: CronTask) => {
    if (isOneTimeTask(task)) {
      if (!task.enabled && task.runCount > 0) return 'bg-gray-100 text-gray-600'
      if (!task.enabled) return 'bg-gray-100 text-gray-500'
      return 'bg-blue-100 text-blue-700'
    }
    if (!task.enabled) return 'bg-yellow-100 text-yellow-700'
    return 'bg-green-100 text-green-700'
  }

  const formatSchedule = (task: CronTask) => {
    // 单次任务显示执行时间
    if (isOneTimeTask(task)) {
      if (task.scheduleAt) {
        return `单次执行: ${formatTime(task.scheduleAt)}`
      }
      return `单次: ${task.scheduleRaw}`
    }

    // 循环/间隔任务
    switch (task.scheduleType) {
      case 'cron': return task.scheduleCron || task.scheduleRaw
      case 'every':
        if (task.scheduleInterval) {
          const i = task.scheduleInterval
          if (i >= 86400) return `每 ${i / 86400} 天`
          if (i >= 3600) return `每 ${i / 3600} 小时`
          return `每 ${i / 60} 分钟`
        }
        return task.scheduleRaw
      default: return task.scheduleRaw
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const getStatusIcon = (s: string) => s === 'success' ? '✅' : s === 'failed' ? '❌' : s === 'timeout' ? '⏱️' : '❓'

  return (
    <div className="container mx-auto p-6">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">⏰ 定时任务管理</h1>
        <button onClick={handleRefresh} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          刷新
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-gray-100 rounded flex justify-between items-center">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 任务列表 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            任务列表
            <span className="text-sm font-normal text-gray-500 ml-2">
              (运行中: {tasks.filter(t => !isOneTimeTask(t) && t.enabled).length} | 已完成: {tasks.filter(t => isOneTimeTask(t) && !t.enabled && t.runCount > 0).length} | 总计: {tasks.length})
            </span>
          </h2>

          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : tasks.length === 0 ? (
            <div className="p-8 bg-gray-50 rounded text-center text-gray-500">暂无定时任务</div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTask?.task.id === task.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => fetchTaskDetail(task.id)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{task.name}</div>
                      <div className="text-sm text-gray-500 mt-1">⏰ {formatSchedule(task)}</div>
                      <div className="text-sm text-gray-500">📝 {task.prompt.slice(0, 50)}{task.prompt.length > 50 ? '...' : ''}</div>
                      <div className="text-xs text-gray-400 mt-1">👤 {task.userId}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded ${getTaskStatusStyle(task)}`}>
                        {getTaskStatusText(task)}
                      </span>
                      {!isOneTimeTask(task) && (
                        <span className="text-sm text-gray-500">{task.runCount}次</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {/* 已执行完成的单次任务只显示删除按钮 */}
                    {isOneTimeTask(task) && !task.enabled && task.runCount > 0 ? (
                      <button onClick={(e) => { e.stopPropagation(); if (confirm(`确定删除「${task.name}」?`)) handleAction('delete', task.id) }} className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200">删除</button>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(task) }} className="px-3 py-1 text-xs bg-purple-100 text-purple-800 rounded hover:bg-purple-200">编辑</button>
                        {task.enabled ? (
                          <button onClick={(e) => { e.stopPropagation(); handleAction('pause', task.id) }} className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200">暂停</button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); handleAction('resume', task.id) }} className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200">恢复</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleAction('run', task.id) }} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200">立即执行</button>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm(`确定删除「${task.name}」?`)) handleAction('delete', task.id) }} className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200">删除</button>
                      </>
                    )}
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
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📋 基本信息</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">任务名称</div><div>{selectedTask.task.name}</div>
                  <div className="text-gray-500">任务 ID</div><div className="font-mono text-xs">{selectedTask.task.id}</div>
                  <div className="text-gray-500">用户 ID</div><div>{selectedTask.task.userId}</div>
                  <div className="text-gray-500">任务类型</div><div>{isOneTimeTask(selectedTask.task) ? '单次执行' : '循环执行'}</div>
                  <div className="text-gray-500">调度规则</div><div>{formatSchedule(selectedTask.task)}</div>
                  <div className="text-gray-500">静默模式</div><div>{selectedTask.task.silent ? '是' : '否'}</div>
                  <div className="text-gray-500">状态</div>
                  <div><span className={`px-2 py-1 text-xs rounded ${getTaskStatusStyle(selectedTask.task)}`}>{getTaskStatusText(selectedTask.task)}</span></div>
                  <div className="text-gray-500">创建时间</div><div>{formatTime(selectedTask.task.createdAt)}</div>
                  {!isOneTimeTask(selectedTask.task) && (
                    <>
                      <div className="text-gray-500">下次执行</div><div>{formatTime(selectedTask.task.nextRunAt)}</div>
                    </>
                  )}
                  <div className="text-gray-500">上次执行</div><div>{formatTime(selectedTask.task.lastRunAt)}</div>
                  <div className="text-gray-500">执行次数</div><div>{selectedTask.task.runCount} 次</div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📝 提示词</h3>
                <div className="text-sm whitespace-pre-wrap">{selectedTask.task.prompt}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📊 执行日志 ({selectedTask.logs.length} 条)</h3>
                {selectedTask.logs.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">暂无执行记录</div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {selectedTask.logs.map((log) => (
                      <div key={log.id} className="p-3 bg-white rounded border">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span>{getStatusIcon(log.status)}</span>
                            <span className="text-sm font-medium">{log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : '超时'}</span>
                          </div>
                          <div className="text-xs text-gray-500">{formatTime(log.executedAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">耗时: {formatDuration(log.duration)} | 尝试: {log.attempts}次</div>
                        {log.result && <div className="mt-2 p-2 bg-green-50 rounded text-sm"><div className="text-xs text-gray-500 mb-1">发送内容:</div><div className="whitespace-pre-wrap">{log.result}</div></div>}
                        {log.error && <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">{log.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded text-center text-gray-500">点击左侧任务查看详情</div>
          )}
        </div>
      </div>

      {/* 编辑模态框 */}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">编辑定时任务</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务名称</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">调度规则</label>
                <input type="text" value={editForm.schedule} onChange={(e) => setEditForm({ ...editForm, schedule: e.target.value })} placeholder="0 9 * * * / every 5m / at 15:30" className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">提示词</label>
                <textarea value={editForm.prompt} onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })} rows={3} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.repeat} onChange={(e) => setEditForm({ ...editForm, repeat: e.target.checked })} /><span className="text-sm">重复执行</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={editForm.silent} onChange={(e) => setEditForm({ ...editForm, silent: e.target.checked })} /><span className="text-sm">静默模式</span></label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingTask(null)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200">取消</button>
              <button onClick={handleEditSubmit} className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
