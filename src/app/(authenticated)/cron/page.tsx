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
  endTime?: number
  prompt: string
  tools?: string[]
  outputFormat: string
  enabled: boolean
  nextRunAt?: number
  lastRunAt?: number
  lastRunStatus?: string
  lastRunError?: string
  runCount: number
  silent: boolean
  createdAt: number
  updatedAt: number
}

interface TaskExecution {
  id: string
  task_id: string
  status: string
  result?: string
  error?: string
  duration?: number
  attempts: number
  scheduled_at: number
  started_at?: number
  completed_at?: number
}

type TabType = 'all' | 'oneTime' | 'cron' | 'interval'

export default function CronPage() {
  const [tasks, setTasks] = useState<CronTask[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<CronTask | null>(null)
  const [executions, setExecutions] = useState<TaskExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [editingTask, setEditingTask] = useState<CronTask | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    schedule: '',
    prompt: '',
    silent: false,
    outputFormat: 'text',
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    schedule: '',
    prompt: '',
    silent: false,
    outputFormat: 'text',
    endTime: '',
  })

  // 加载所有定时任务
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/cron-engine/tasks')
      const data = await res.json()
      if (data.success) {
        setTasks(data.data || [])
      }
    } catch (e) {
      console.error('fetchTasks error:', e)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        await loadTasks()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [loadTasks])

  // 获取任务详情
  const fetchTaskDetail = async (taskId: string) => {
    try {
      const res = await fetch(`/api/cron-engine/tasks/${taskId}`)
      const data = await res.json()
      if (data.success) {
        setSelectedTask(data.data.task)
        setSelectedTaskId(taskId)
        setExecutions(data.data.executions || [])
      } else {
        setMessage(data.message)
        setSelectedTask(null)
        setSelectedTaskId(null)
      }
    } catch {
      setMessage('获取任务详情失败')
    }
  }

  // 操作任务
  const handleToggle = async (taskId: string) => {
    try {
      const res = await fetch(`/api/cron-engine/tasks/${taskId}/toggle`, {
        method: 'POST',
      })
      const data = await res.json()
      setMessage(data.message)
      if (data.success) {
        await loadTasks()
        if (selectedTaskId === taskId) fetchTaskDetail(taskId)
      }
    } catch {
      setMessage('操作失败')
    }
  }

  // 立即执行
  const handleRun = async (taskId: string) => {
    try {
      const res = await fetch(`/api/cron-engine/tasks/${taskId}/run`, {
        method: 'POST',
      })
      const data = await res.json()
      setMessage(data.message)
      if (data.success) {
        await loadTasks()
        if (selectedTaskId === taskId) fetchTaskDetail(taskId)
      }
    } catch {
      setMessage('执行失败')
    }
  }

  // 删除任务
  const handleDelete = async (taskId: string, taskName: string) => {
    if (!confirm(`确定删除「${taskName}」?`)) return
    try {
      const res = await fetch(`/api/cron-engine/tasks/${taskId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      setMessage(data.message)
      if (data.success) {
        await loadTasks()
        if (selectedTaskId === taskId) {
          setSelectedTask(null)
          setSelectedTaskId(null)
          setExecutions([])
        }
      }
    } catch {
      setMessage('删除失败')
    }
  }

  // 打开编辑模态框
  const openEditModal = (task: CronTask) => {
    setEditingTask(task)
    setEditForm({
      name: task.name,
      schedule: task.scheduleRaw,
      prompt: task.prompt,
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
      if (editForm.schedule !== editingTask.scheduleRaw) updates.schedule = editForm.schedule
      if (editForm.prompt !== editingTask.prompt) updates.prompt = editForm.prompt
      if (editForm.silent !== editingTask.silent) updates.silent = editForm.silent
      if (editForm.outputFormat !== editingTask.outputFormat) updates.outputFormat = editForm.outputFormat

      if (Object.keys(updates).length === 0) {
        setMessage('没有修改任何内容')
        setEditingTask(null)
        return
      }

      const res = await fetch(`/api/cron-engine/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      setMessage(data.message)
      if (data.success) {
        await loadTasks()
        if (selectedTaskId === editingTask.id) fetchTaskDetail(editingTask.id)
        setEditingTask(null)
      }
    } catch {
      setMessage('更新任务失败')
    }
  }

  // 提交创建
  const handleCreateSubmit = async () => {
    if (!createForm.name || !createForm.schedule || !createForm.prompt) {
      setMessage('请填写必要字段: 名称、调度规则、提示词')
      return
    }
    try {
      const body: Record<string, any> = {
        userId: 'admin',
        name: createForm.name,
        schedule: createForm.schedule,
        prompt: createForm.prompt,
        silent: createForm.silent,
        outputFormat: createForm.outputFormat,
      }
      if (createForm.endTime) {
        body.endTime = Math.floor(new Date(createForm.endTime).getTime() / 1000)
      }

      const res = await fetch('/api/cron-engine/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setMessage(data.message)
      if (data.success) {
        await loadTasks()
        setShowCreateModal(false)
        setCreateForm({ name: '', schedule: '', prompt: '', silent: false, outputFormat: 'text', endTime: '' })
      }
    } catch {
      setMessage('创建任务失败')
    }
  }

  // 刷新按钮
  const handleRefresh = async () => {
    setLoading(true)
    try {
      await loadTasks()
    } finally {
      setLoading(false)
    }
  }

  // 判断任务类型
  const getTaskType = (task: CronTask): 'oneTime' | 'cron' | 'interval' => {
    if (task.scheduleType === 'at') return 'oneTime'
    if (task.scheduleType === 'every') return 'interval'
    return 'cron'
  }

  // 判断是否为单次任务
  const isOneTimeTask = (task: CronTask) => getTaskType(task) === 'oneTime'

  // 获取任务状态
  const getTaskStatus = (task: CronTask): string => {
    if (isOneTimeTask(task)) {
      if (task.runCount > 0) return 'completed'
      if (!task.enabled) return 'disabled'
      return 'pending'
    }
    return task.enabled ? 'enabled' : 'paused'
  }

  // 获取任务状态文本
  const getTaskStatusText = (task: CronTask) => {
    const status = getTaskStatus(task)
    const map: Record<string, string> = {
      pending: '待执行',
      completed: '执行完成',
      disabled: '未启用',
      enabled: '已启用',
      paused: '已暂停',
    }
    return map[status] || status
  }

  // 获取任务状态样式
  const getTaskStatusStyle = (task: CronTask) => {
    const status = getTaskStatus(task)
    const map: Record<string, string> = {
      pending: 'bg-blue-100 text-blue-700',
      completed: 'bg-gray-100 text-gray-500',
      disabled: 'bg-gray-100 text-gray-400',
      enabled: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
    }
    return map[status] || 'bg-gray-100 text-gray-600'
  }

  // 获取任务卡片边框样式（置灰规则）
  const getCardBorderStyle = (task: CronTask) => {
    const status = getTaskStatus(task)
    const isGray = status === 'completed' || status === 'disabled'
    if (selectedTaskId === task.id) return 'border-blue-500 bg-blue-50'
    return isGray ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 hover:border-gray-300'
  }

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  // 格式化调度规则
  const formatSchedule = (task: CronTask) => {
    if (isOneTimeTask(task)) {
      if (task.scheduleAt) {
        return `单次执行: ${formatTime(task.scheduleAt)}`
      }
      return `单次: ${task.scheduleRaw}`
    }
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

  // 格式化耗时
  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // 获取状态图标
  const getStatusIcon = (s: string) => s === 'success' ? '✅' : s === 'failed' ? '❌' : s === 'timeout' ? '⏱️' : '❓'

  // 筛选任务
  const filteredTasks = tasks.filter(task => {
    if (activeTab === 'all') return true
    return getTaskType(task) === activeTab
  })

  // 统计数据
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => getTaskStatus(t) === 'pending').length,
    completed: tasks.filter(t => getTaskStatus(t) === 'completed').length,
    enabled: tasks.filter(t => getTaskStatus(t) === 'enabled').length,
    paused: tasks.filter(t => getTaskStatus(t) === 'paused').length,
  }

  return (
    <div className="container mx-auto p-6">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">⏰ 定时任务管理</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
            + 新建任务
          </button>
          <button onClick={handleRefresh} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            刷新
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-gray-100 rounded flex justify-between items-center">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
      )}

      {/* 标签页 */}
      <div className="flex gap-2 mb-4 border-b pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-t ${activeTab === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          全部 ({stats.total})
        </button>
        <button
          onClick={() => setActiveTab('oneTime')}
          className={`px-4 py-2 rounded-t ${activeTab === 'oneTime' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          单次任务 ({tasks.filter(t => getTaskType(t) === 'oneTime').length})
        </button>
        <button
          onClick={() => setActiveTab('cron')}
          className={`px-4 py-2 rounded-t ${activeTab === 'cron' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          循环任务 ({tasks.filter(t => getTaskType(t) === 'cron').length})
        </button>
        <button
          onClick={() => setActiveTab('interval')}
          className={`px-4 py-2 rounded-t ${activeTab === 'interval' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          间隔任务 ({tasks.filter(t => getTaskType(t) === 'interval').length})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 任务列表 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            任务列表
            <span className="text-sm font-normal text-gray-500 ml-2">
              (已启用: {stats.enabled} | 已暂停: {stats.paused} | 待执行: {stats.pending} | 已完成: {stats.completed})
            </span>
          </h2>

          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-8 bg-gray-50 rounded text-center text-gray-500">暂无定时任务</div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const status = getTaskStatus(task)
                const isLocked = status === 'completed' // 单次任务执行完成后锁定
                return (
                  <div
                    key={task.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${getCardBorderStyle(task)}`}
                    onClick={() => fetchTaskDetail(task.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{task.name}</div>
                        <div className="text-sm text-gray-500 mt-1">⏰ {formatSchedule(task)}</div>
                        <div className="text-sm text-gray-500 truncate">📝 {task.prompt.slice(0, 50)}{task.prompt.length > 50 ? '...' : ''}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className={`px-2 py-1 text-xs rounded whitespace-nowrap ${getTaskStatusStyle(task)}`}>
                          {getTaskStatusText(task)}
                        </span>
                        {!isOneTimeTask(task) && (
                          <span className="text-sm text-gray-500">{task.runCount}次</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                      {/* 编辑按钮 */}
                      <button onClick={() => openEditModal(task)} className="px-3 py-1 text-xs bg-purple-100 text-purple-800 rounded hover:bg-purple-200">编辑</button>
                      {/* 开关按钮 */}
                      {isLocked ? (
                        <button disabled className="px-3 py-1 text-xs bg-gray-200 text-gray-400 rounded cursor-not-allowed">已锁定</button>
                      ) : task.enabled ? (
                        <button onClick={() => handleToggle(task.id)} className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200">暂停</button>
                      ) : (
                        <button onClick={() => handleToggle(task.id)} className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200">启用</button>
                      )}
                      {/* 立即执行 */}
                      <button onClick={() => handleRun(task.id)} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200">立即执行</button>
                      {/* 删除 */}
                      <button onClick={() => handleDelete(task.id, task.name)} className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200">删除</button>
                    </div>
                  </div>
                )
              })}
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
                  <div className="text-gray-500">任务名称</div><div>{selectedTask.name}</div>
                  <div className="text-gray-500">任务 ID</div><div className="font-mono text-xs">{selectedTask.id}</div>
                  <div className="text-gray-500">用户 ID</div><div>{selectedTask.userId}</div>
                  <div className="text-gray-500">任务类型</div><div>{isOneTimeTask(selectedTask) ? '单次执行' : selectedTask.scheduleType === 'every' ? '间隔执行' : '循环执行'}</div>
                  <div className="text-gray-500">调度规则</div><div>{formatSchedule(selectedTask)}</div>
                  <div className="text-gray-500">静默模式</div><div>{selectedTask.silent ? '是' : '否'}</div>
                  <div className="text-gray-500">状态</div>
                  <div><span className={`px-2 py-1 text-xs rounded ${getTaskStatusStyle(selectedTask)}`}>{getTaskStatusText(selectedTask)}</span></div>
                  <div className="text-gray-500">创建时间</div><div>{formatTime(selectedTask.createdAt)}</div>
                  {!isOneTimeTask(selectedTask) && (
                    <>
                      <div className="text-gray-500">下次执行</div><div>{formatTime(selectedTask.nextRunAt)}</div>
                    </>
                  )}
                  <div className="text-gray-500">上次执行</div><div>{formatTime(selectedTask.lastRunAt)}</div>
                  <div className="text-gray-500">执行次数</div><div>{selectedTask.runCount} 次</div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📝 提示词</h3>
                <div className="text-sm whitespace-pre-wrap">{selectedTask.prompt}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-3">📊 执行日志 ({executions.length} 条)</h3>
                {executions.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">暂无执行记录</div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {executions.map((exec) => (
                      <div key={exec.id} className="p-3 bg-white rounded border">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span>{getStatusIcon(exec.status)}</span>
                            <span className="text-sm font-medium">{exec.status === 'success' ? '成功' : exec.status === 'failed' ? '失败' : exec.status}</span>
                          </div>
                          <div className="text-xs text-gray-500">{formatTime(exec.scheduled_at)}</div>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">耗时: {formatDuration(exec.duration)} | 尝试: {exec.attempts}次</div>
                        {exec.result && <div className="mt-2 p-2 bg-green-50 rounded text-sm"><div className="text-xs text-gray-500 mb-1">执行结果:</div><div className="whitespace-pre-wrap">{exec.result}</div></div>}
                        {exec.error && <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">{exec.error}</div>}
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

      {/* 创建模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">新建定时任务</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务名称 *</label>
                <input type="text" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">调度规则 *</label>
                <input type="text" value={createForm.schedule} onChange={(e) => setCreateForm({ ...createForm, schedule: e.target.value })} placeholder="0 9 * * * / every 5m / at 15:30" className="w-full px-3 py-2 border rounded-lg" />
                <p className="text-xs text-gray-400 mt-1">支持: at（单次）、every（间隔）、cron（表达式）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">提示词 *</label>
                <textarea value={createForm.prompt} onChange={(e) => setCreateForm({ ...createForm, prompt: e.target.value })} rows={3} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">截止时间（间隔任务选填）</label>
                <input type="datetime-local" value={createForm.endTime} onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={createForm.silent} onChange={(e) => setCreateForm({ ...createForm, silent: e.target.checked })} /><span className="text-sm">静默模式</span></label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setCreateForm({ name: '', schedule: '', prompt: '', silent: false, outputFormat: 'text', endTime: '' }) }} className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200">取消</button>
              <button onClick={handleCreateSubmit} className="px-4 py-2 text-white bg-green-500 rounded hover:bg-green-600">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
