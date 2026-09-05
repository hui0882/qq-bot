// src/components/user-query-panel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'

// ============ 类型定义 ============

interface UserRow {
  qq_id: string
  nickname: string | null
  remark: string | null
  created_at: number
  updated_at: number
}

interface UserListData {
  total: number
  users: UserRow[]
  stats: { withSettings: number; withAiConfig: number }
}

interface AiConfigDTO {
  enabled: boolean
  model: string | null
  maxTokens: number
  temperature: number
  maxContextRounds: number
  defaultReplyType: string
  customSystemPrompt: string | null
  baseUrl: string | null
  hasApiKey: boolean
}

interface CronTaskDTO {
  id: string
  name: string
  description: string | null
  schedule_raw: string
  schedule_type: string
  enabled: boolean
  created_at: number
}

interface MemoryDTO {
  messageCount: number
  unprocessedCount: number
  summary: string | null
  profiles: Array<{ key: string; value: string; confidence: number; updated_at: number }>
  entries: Array<{ id: number; memory_type: string; content: string; importance: number; created_at: number }>
}

interface UserDetailData {
  user: {
    qq_id: string
    nickname: string | null
    remark: string | null
    created_at: number
    updated_at: number
  } | null
  settings: Record<string, string>
  aiConfig: AiConfigDTO | null
  cronTasks: CronTaskDTO[]
  memory: MemoryDTO
}

const PAGE_SIZE = 20

const SETTING_LABELS: Record<string, string> = {
  response_type: '回复类型',
}

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  voice: '语音回复',
  text: '文本回复',
  auto: '自动（AI 判断）',
}

// ============ 工具函数 ============

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}

function getResponseTypeLabel(type: string | undefined): string {
  if (!type) return '未设置（使用全局配置）'
  return RESPONSE_TYPE_LABELS[type] || type
}

function formatConfidence(confidence: number | undefined | null): string {
  if (confidence === undefined || confidence === null) return '-'
  const pct = confidence > 1 ? confidence : confidence * 100
  return `${Math.round(pct)}%`
}

// ============ 主组件 ============

export function UserQueryPanel() {
  // 列表状态
  const [listData, setListData] = useState<UserListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  // 详情弹窗状态
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [detailData, setDetailData] = useState<UserDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch('/api/db-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'user_list',
          params: { keyword, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setListData(data.data as UserListData)
        // 翻页越界时回退到最后一页
        const total = (data.data as UserListData).total
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
        if (page >= totalPages) {
          setPage(totalPages - 1)
        }
      } else {
        setListError(data.message || '查询失败，请稍后重试')
      }
    } catch (e) {
      setListError(`请求失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [keyword, page])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const applySearch = () => {
    setKeyword(searchInput.trim())
    setPage(0)
  }

  const openDetail = async (user: UserRow) => {
    setSelectedUser(user)
    setDetailData(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const res = await fetch('/api/db-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'user_detail',
          params: { qq_id: user.qq_id },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setDetailData(data.data as UserDetailData)
      } else {
        setDetailError(data.message || '查询失败，请稍后重试')
      }
    } catch (e) {
      setDetailError(`请求失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setSelectedUser(null)
    setDetailData(null)
    setDetailError(null)
  }

  const total = listData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">用户查询</h2>
        <p className="text-muted-foreground text-sm">
          分页浏览全部用户，查看个人配置、定时任务、记忆情况与用户画像
        </p>
      </div>

      {/* 统计条 */}
      {listData && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm">
          <span>
            共 <span className="font-semibold">{listData.total}</span> 个用户
          </span>
          <span className="text-muted-foreground">
            有自定义设置 <span className="font-semibold text-foreground">{listData.stats.withSettings}</span>
          </span>
          <span className="text-muted-foreground">
            启用 AI <span className="font-semibold text-foreground">{listData.stats.withAiConfig}</span>
          </span>
        </div>
      )}

      {/* 搜索 + 刷新 */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="搜索 QQ号/昵称/备注..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applySearch()
          }}
          className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={applySearch}
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          搜索
        </button>
        <button
          onClick={fetchList}
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          刷新
        </button>
      </div>

      {/* 错误态 */}
      {listError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{listError}</div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      ) : !listData || listData.users.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">暂无用户数据</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="p-3">QQ 号</th>
                <th className="p-3">昵称</th>
                <th className="p-3">备注</th>
                <th className="p-3 w-48">最后活跃</th>
                <th className="p-3 w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {listData.users.map((u) => (
                <tr
                  key={u.qq_id}
                  className="border-b hover:bg-muted/50 cursor-pointer"
                  onClick={() => openDetail(u)}
                >
                  <td className="p-3 font-mono text-sm">{u.qq_id}</td>
                  <td className="p-3">{u.nickname || '-'}</td>
                  <td className="p-3 text-muted-foreground">{u.remark || '-'}</td>
                  <td className="p-3 text-sm text-muted-foreground">{formatTimestamp(u.updated_at)}</td>
                  <td className="p-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openDetail(u)
                      }}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {listData && listData.users.length > 0 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page <= 0}
            className="rounded-md border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          >
            ← 上一页
          </button>
          <span className="text-muted-foreground">
            第 {page + 1} 页 / 共 {totalPages} 页
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-md border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          >
            下一页 →
          </button>
        </div>
      )}

      {/* 详情弹窗 */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeDetail}>
          <div
            className="w-full max-w-2xl max-h-[85vh] rounded-lg border bg-background shadow-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">用户详情</h2>
                <p className="text-sm text-muted-foreground font-mono">{selectedUser.qq_id}</p>
              </div>
              <button onClick={closeDetail} className="rounded-md p-2 hover:bg-muted">✕</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {detailLoading ? (
                <div className="py-12 text-center text-muted-foreground">加载中...</div>
              ) : detailError ? (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{detailError}</div>
              ) : detailData ? (
                <>
                  {/* 基础信息 */}
                  <section>
                    <h3 className="mb-3 font-semibold">基础信息</h3>
                    {detailData.user ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border p-3">
                          <div className="text-sm text-muted-foreground">QQ 号</div>
                          <div className="font-medium text-lg font-mono">{detailData.user.qq_id}</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-sm text-muted-foreground">昵称</div>
                          <div className="font-medium">{detailData.user.nickname || '-'}</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-sm text-muted-foreground">备注</div>
                          <div className="font-medium">{detailData.user.remark || '-'}</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-sm text-muted-foreground">首次记录</div>
                          <div className="font-medium">{formatTimestamp(detailData.user.created_at)}</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-sm text-muted-foreground">最后活跃</div>
                          <div className="font-medium">{formatTimestamp(detailData.user.updated_at)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                        该用户不存在于数据库中
                      </div>
                    )}
                  </section>

                  {/* 个人配置 */}
                  <section>
                    <h3 className="mb-3 font-semibold">个人配置</h3>
                    {Object.keys(detailData.settings).length === 0 && !detailData.aiConfig ? (
                      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                        暂未配置
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Object.keys(detailData.settings).length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                            该用户暂无自定义设置
                          </div>
                        ) : (
                          <div className="rounded-lg border divide-y">
                            {Object.entries(detailData.settings).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between px-4 py-3">
                                <div>
                                  <div className="font-medium">{SETTING_LABELS[key] || key}</div>
                                  <div className="text-xs text-muted-foreground font-mono">{key}</div>
                                </div>
                                <div className="text-right">
                                  {key === 'response_type' ? (
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                                      {getResponseTypeLabel(value)}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-sm">{value}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {detailData.aiConfig ? (
                          <div className="space-y-4">
                            <div className="rounded-lg border p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  detailData.aiConfig.enabled
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {detailData.aiConfig.enabled ? '已启用' : '未启用'}
                                </span>
                                {detailData.aiConfig.model && (
                                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                                    {detailData.aiConfig.model}
                                  </span>
                                )}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <div className="text-sm text-muted-foreground">回复方式</div>
                                  <div className="font-medium">{getResponseTypeLabel(detailData.aiConfig.defaultReplyType)}</div>
                                </div>
                                <div>
                                  <div className="text-sm text-muted-foreground">最大 Token 数</div>
                                  <div className="font-medium">{detailData.aiConfig.maxTokens}</div>
                                </div>
                                <div>
                                  <div className="text-sm text-muted-foreground">Temperature</div>
                                  <div className="font-medium">{detailData.aiConfig.temperature}</div>
                                </div>
                                <div>
                                  <div className="text-sm text-muted-foreground">上下文轮数</div>
                                  <div className="font-medium">{detailData.aiConfig.maxContextRounds}</div>
                                </div>
                                <div>
                                  <div className="text-sm text-muted-foreground">API 地址</div>
                                  <div className="font-medium font-mono text-sm">
                                    {detailData.aiConfig.baseUrl || '使用全局配置'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-sm text-muted-foreground">API Key</div>
                                  <div className="font-medium">
                                    {detailData.aiConfig.hasApiKey ? '••••••••' : '使用全局配置'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="rounded-lg border p-4">
                              <div className="text-sm text-muted-foreground mb-2">自定义系统提示词</div>
                              {detailData.aiConfig.customSystemPrompt ? (
                                <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                                  {detailData.aiConfig.customSystemPrompt}
                                </div>
                              ) : (
                                <div className="text-muted-foreground text-sm">使用全局系统提示词</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                            该用户未启用自定义 AI 配置
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  {/* 定时任务 */}
                  <section>
                    <h3 className="mb-3 font-semibold">定时任务</h3>
                    {detailData.cronTasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                        该用户暂无定时任务
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {detailData.cronTasks.map((task) => (
                          <div key={task.id} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{task.name}</div>
                              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                task.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {task.enabled ? '启用中' : '已停用'}
                              </span>
                            </div>
                            {task.description && (
                              <div className="mt-1 text-sm text-muted-foreground">{task.description}</div>
                            )}
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="font-mono">{task.schedule_raw}</span>
                              <span>{formatTimestamp(task.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* 记忆情况 */}
                  <section>
                    <h3 className="mb-3 font-semibold">记忆情况</h3>
                    {detailData.memory.messageCount === 0 &&
                    detailData.memory.unprocessedCount === 0 &&
                    !detailData.memory.summary &&
                    detailData.memory.entries.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                        暂无记忆数据
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border p-3">
                            <div className="text-sm text-muted-foreground">消息数</div>
                            <div className="text-2xl font-bold">{detailData.memory.messageCount}</div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="text-sm text-muted-foreground">未处理数</div>
                            <div className="text-2xl font-bold">{detailData.memory.unprocessedCount}</div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="mb-2 text-sm text-muted-foreground">对话摘要</div>
                          {detailData.memory.summary ? (
                            <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                              {detailData.memory.summary}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">暂无对话摘要</div>
                          )}
                        </div>

                        <div>
                          <div className="mb-2 text-sm text-muted-foreground">长期记忆条目</div>
                          {detailData.memory.entries.length === 0 ? (
                            <div className="text-sm text-muted-foreground">暂无长期记忆条目</div>
                          ) : (
                            <div className="space-y-2">
                              {detailData.memory.entries.map((entry) => (
                                <div key={entry.id} className="rounded-lg border p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                                      {entry.memory_type}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      重要性 {Math.round((entry.importance > 1 ? entry.importance : entry.importance * 100))}%
                                    </span>
                                  </div>
                                  <div className="mt-1 text-sm">{entry.content}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {formatTimestamp(entry.created_at)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* 用户画像 */}
                  <section>
                    <h3 className="mb-3 font-semibold">用户画像</h3>
                    {detailData.memory.profiles.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                        暂无画像
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {detailData.memory.profiles.map((p) => (
                          <div key={p.key} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm text-muted-foreground">{p.key}</div>
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                                {formatConfidence(p.confidence)}
                              </span>
                            </div>
                            <div className="mt-1 font-medium">{p.value}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              更新于 {formatTimestamp(p.updated_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
