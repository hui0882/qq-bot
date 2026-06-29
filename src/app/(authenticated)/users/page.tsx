// src/app/(authenticated)/users/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface User {
  qq_id: string
  created_at: number
  updated_at: number
}

interface UserSettings {
  userId: string
  userInfo: {
    qqId: string
    createdAt: number
    updatedAt: number
  }
  settings: Record<string, string>
  aiConfig: {
    enabled: boolean
    model: string | null
    maxTokens: number
    temperature: number
    maxContextRounds: number
    defaultReplyType: string
    customSystemPrompt: string | null
    baseUrl: string | null
    hasApiKey: boolean
  } | null
}

const SETTING_LABELS: Record<string, string> = {
  response_type: '回复类型',
}

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  voice: '语音回复',
  text: '文本回复',
  auto: '自动（AI 判断）',
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getResponseTypeLabel(type: string | undefined): string {
  if (!type) return '未设置（使用全局配置）'
  return RESPONSE_TYPE_LABELS[type] || type
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserSettings = async (userId: string) => {
    setSettingsLoading(true)
    try {
      const res = await fetch(`/api/users/${userId}/settings`)
      const data = await res.json()
      if (data.success) {
        setUserSettings(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch user settings:', error)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId)
    fetchUserSettings(userId)
  }

  const filteredUsers = users.filter(user =>
    user.qq_id.includes(searchQuery)
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">用户设置查询</h1>
      <p className="text-muted-foreground">查询用户的各项配置状态，包括回复设置、AI 配置等</p>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* 用户列表 */}
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h2 className="font-semibold mb-3">用户列表</h2>
            <input
              type="text"
              placeholder="搜索 QQ 号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">加载中...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchQuery ? '未找到匹配的用户' : '暂无用户数据'}
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map(user => (
                  <button
                    key={user.qq_id}
                    onClick={() => handleUserSelect(user.qq_id)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${
                      selectedUserId === user.qq_id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="font-medium">{user.qq_id}</div>
                    <div className="text-xs text-muted-foreground">
                      最后活跃: {formatTimestamp(user.updated_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 用户设置详情 */}
        <div className="rounded-lg border bg-card">
          {!selectedUserId ? (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              请从左侧选择一个用户查看设置
            </div>
          ) : settingsLoading ? (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              加载中...
            </div>
          ) : userSettings ? (
            <div className="p-6 space-y-6">
              {/* 用户基本信息 */}
              <div>
                <h2 className="text-lg font-semibold mb-4">用户信息</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-sm text-muted-foreground">QQ 号</div>
                    <div className="font-medium text-lg">{userSettings.userInfo.qqId}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-sm text-muted-foreground">首次记录</div>
                    <div className="font-medium">{formatTimestamp(userSettings.userInfo.createdAt)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-sm text-muted-foreground">最后活跃</div>
                    <div className="font-medium">{formatTimestamp(userSettings.userInfo.updatedAt)}</div>
                  </div>
                </div>
              </div>

              {/* 用户自定义设置 */}
              <div>
                <h2 className="text-lg font-semibold mb-4">用户自定义设置</h2>
                {Object.keys(userSettings.settings).length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                    该用户暂无自定义设置
                  </div>
                ) : (
                  <div className="rounded-lg border divide-y">
                    {Object.entries(userSettings.settings).map(([key, value]) => (
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
              </div>

              {/* AI 配置 */}
              <div>
                <h2 className="text-lg font-semibold mb-4">AI 配置</h2>
                {!userSettings.aiConfig ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                    该用户未启用自定义 AI 配置
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          userSettings.aiConfig.enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {userSettings.aiConfig.enabled ? '已启用' : '未启用'}
                        </span>
                        {userSettings.aiConfig.model && (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                            {userSettings.aiConfig.model}
                          </span>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-sm text-muted-foreground">回复方式</div>
                          <div className="font-medium">
                            {userSettings.aiConfig.defaultReplyType === 'voice' ? '语音回复' : '文本回复'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">最大 Token 数</div>
                          <div className="font-medium">{userSettings.aiConfig.maxTokens}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Temperature</div>
                          <div className="font-medium">{userSettings.aiConfig.temperature}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">上下文轮数</div>
                          <div className="font-medium">{userSettings.aiConfig.maxContextRounds}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">API 地址</div>
                          <div className="font-medium font-mono text-sm">
                            {userSettings.aiConfig.baseUrl || '使用全局配置'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">API Key</div>
                          <div className="font-medium">
                            {userSettings.aiConfig.hasApiKey ? '••••••••' : '使用全局配置'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 自定义系统提示词 */}
                    <div className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground mb-2">自定义系统提示词</div>
                      {userSettings.aiConfig.customSystemPrompt ? (
                        <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                          {userSettings.aiConfig.customSystemPrompt}
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-sm">使用全局系统提示词</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 设置来源说明 */}
              <div className="rounded-lg bg-muted/50 p-4">
                <h3 className="font-medium mb-2">设置优先级说明</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 用户自定义设置优先于全局配置</li>
                  <li>• 用户 AI 配置启用后，将覆盖全局 AI 设置</li>
                  <li>• 未设置的项目将使用全局配置</li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
