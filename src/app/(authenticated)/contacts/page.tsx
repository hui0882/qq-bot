// src/app/(authenticated)/contacts/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface Friend {
  user_id: number
  nickname: string
  remark?: string
}

interface Group {
  group_id: number
  group_name: string
  member_count?: number
  max_member_count?: number
}

interface GroupMember {
  user_id: number
  nickname: string
  card?: string
  role?: string
  join_time?: number
  shut_up_timestamp?: number
}

type Tab = 'friends' | 'groups' | 'requests'

interface ActionDef {
  label: string
  action: string
  params: Record<string, unknown>
  description: string
  needsInput?: { key: string; label: string; placeholder: string; type?: 'text' | 'textarea' | 'number' }[]
  confirm?: string
}

export default function ContactsPage() {
  const [tab, setTab] = useState<Tab>('friends')
  const [friends, setFriends] = useState<Friend[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null)
  const [selectedGroupName, setSelectedGroupName] = useState('')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<Array<{
    flag: string; userId: number; nickname: string; comment: string; timestamp: number
  }>>([])

  const loadPendingRequests = async () => {
    const res = await fetch('/api/friend-requests')
    const data = await res.json()
    if (data.data) setPendingRequests(data.data)
  }

  const handleApprove = async (flag: string) => {
    const res = await fetch('/api/friend-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', flag }),
    })
    const data = await res.json()
    if (data.success) loadPendingRequests()
  }

  const handleReject = async (flag: string) => {
    const res = await fetch('/api/friend-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', flag }),
    })
    const data = await res.json()
    if (data.success) loadPendingRequests()
  }

  // Action dialog state
  const [actionTarget, setActionTarget] = useState<{
    type: 'friend' | 'group' | 'member'
    id: number
    name: string
    groupId?: number
    groupName?: string
  } | null>(null)
  const [selectedAction, setSelectedAction] = useState<ActionDef | null>(null)
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({})
  const [actionResult, setActionResult] = useState<string>('')
  const [actionLoading, setActionLoading] = useState(false)

  const callApi = async (action: string, params?: Record<string, unknown>) => {
    const res = await fetch('/api/ws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    })
    return res.json()
  }

  const loadFriends = async () => {
    setLoading(true)
    const res = await callApi('get_friend_list')
    if (res.data) setFriends(Array.isArray(res.data) ? res.data : [])
    setLoading(false)
  }

  const loadGroups = async () => {
    setLoading(true)
    const res = await callApi('get_group_list')
    if (res.data) setGroups(Array.isArray(res.data) ? res.data : [])
    setLoading(false)
  }

  const loadMembers = async (groupId: number, groupName: string) => {
    setSelectedGroup(groupId)
    setSelectedGroupName(groupName)
    setLoading(true)
    const res = await callApi('get_group_member_list', { group_id: String(groupId) })
    if (res.data) setMembers(Array.isArray(res.data) ? res.data : [])
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'friends') loadFriends()
    else if (tab === 'groups') loadGroups()
    else if (tab === 'requests') loadPendingRequests()
  }, [tab])

  const filteredFriends = friends.filter(
    (f) =>
      f.nickname.includes(search) ||
      String(f.user_id).includes(search) ||
      (f.remark && f.remark.includes(search)),
  )

  const filteredGroups = groups.filter(
    (g) => g.group_name.includes(search) || String(g.group_id).includes(search),
  )

  // Get actions for a target
  const getActions = (target: typeof actionTarget): ActionDef[] => {
    if (!target) return []
    if (target.type === 'friend') {
      return [
        {
          label: '💬 发送消息',
          action: 'send_msg',
          params: { message_type: 'private', user_id: String(target.id) },
          description: `向 ${target.name} 发送私聊消息`,
          needsInput: [{ key: 'text', label: '消息内容', placeholder: '输入要发送的消息...', type: 'textarea' }],
        },
        {
          label: '🗑️ 删除好友',
          action: 'delete_friend',
          params: { user_id: String(target.id) },
          description: `删除好友 ${target.name} (${target.id})`,
          confirm: `确定要删除好友 ${target.name} 吗？`,
        },
        {
          label: '✏️ 设置备注',
          action: 'set_friend_remark',
          params: { user_id: String(target.id) },
          description: `设置好友 ${target.name} 的备注`,
          needsInput: [{ key: 'remark', label: '备注名', placeholder: '输入新的备注名...' }],
        },
        {
          label: 'ℹ️ 获取信息',
          action: 'get_stranger_info',
          params: { user_id: String(target.id) },
          description: `获取 ${target.name} 的详细信息`,
        },
      ]
    }
    if (target.type === 'group') {
      return [
        {
          label: '💬 发送群消息',
          action: 'send_msg',
          params: { message_type: 'group', group_id: String(target.id) },
          description: `向群 ${target.name} 发送消息`,
          needsInput: [{ key: 'text', label: '消息内容', placeholder: '输入要发送的消息...', type: 'textarea' }],
        },
        {
          label: '✏️ 设置群名',
          action: 'set_group_name',
          params: { group_id: String(target.id) },
          description: `修改群 ${target.name} 的名称`,
          needsInput: [{ key: 'group_name', label: '新群名', placeholder: '输入新的群名...' }],
        },
        {
          label: '📢 发送群公告',
          action: '_send_group_notice',
          params: { group_id: String(target.id) },
          description: `向群 ${target.name} 发送公告`,
          needsInput: [
            { key: 'content', label: '公告内容', placeholder: '输入公告内容...', type: 'textarea' },
          ],
        },
        {
          label: '🚪 退出群聊',
          action: 'set_group_leave',
          params: { group_id: String(target.id) },
          description: `退出群 ${target.name}`,
          confirm: `确定要退出群 ${target.name} 吗？`,
        },
        {
          label: '👥 获取群信息',
          action: 'get_group_info',
          params: { group_id: String(target.id) },
          description: `获取群 ${target.name} 的详细信息`,
        },
      ]
    }
    if (target.type === 'member') {
      return [
        {
          label: '💬 发送私聊消息',
          action: 'send_msg',
          params: { message_type: 'private', user_id: String(target.id) },
          description: `向 ${target.name} 发送私聊消息`,
          needsInput: [{ key: 'text', label: '消息内容', placeholder: '输入要发送的消息...', type: 'textarea' }],
        },
        {
          label: '👢 踢出群聊',
          action: 'set_group_kick',
          params: { group_id: String(target.groupId), user_id: String(target.id) },
          description: `将 ${target.name} 踢出群 ${target.groupName}`,
          confirm: `确定要将 ${target.name} 踢出群吗？`,
          needsInput: [{ key: 'reject_add_request', label: '是否拒绝再次加群', placeholder: 'false', type: 'text' }],
        },
        {
          label: '🔇 禁言',
          action: 'set_group_ban',
          params: { group_id: String(target.groupId), user_id: String(target.id) },
          description: `禁言 ${target.name}`,
          needsInput: [{ key: 'duration', label: '禁言时长(秒)', placeholder: '60', type: 'number' }],
        },
        {
          label: '✏️ 设置群名片',
          action: 'set_group_card',
          params: { group_id: String(target.groupId), user_id: String(target.id) },
          description: `设置 ${target.name} 的群名片`,
          needsInput: [{ key: 'card', label: '群名片', placeholder: '输入新的群名片...' }],
        },
        {
          label: '🏷️ 设置专属头衔',
          action: 'set_group_special_title',
          params: { group_id: String(target.groupId), user_id: String(target.id) },
          description: `设置 ${target.name} 的专属头衔`,
          needsInput: [{ key: 'special_title', label: '专属头衔', placeholder: '输入头衔...' }],
        },
        {
          label: 'ℹ️ 获取信息',
          action: 'get_stranger_info',
          params: { user_id: String(target.id) },
          description: `获取 ${target.name} 的详细信息`,
        },
      ]
    }
    return []
  }

  const handleExecute = async () => {
    if (!selectedAction) return
    setActionLoading(true)
    setActionResult('')

    // Build params
    const params: Record<string, unknown> = { ...selectedAction.params }
    for (const input of selectedAction.needsInput || []) {
      const val = actionInputs[input.key]
      if (val !== undefined && val !== '') {
        if (input.type === 'number') {
          params[input.key] = Number(val)
        } else if (input.key === 'text') {
          // Wrap text in message segment
          params.message = [{ type: 'text', data: { text: val } }]
        } else {
          params[input.key] = val
        }
      }
    }

    const res = await callApi(selectedAction.action, params)
    if (res.status === 'ok') {
      setActionResult(`✅ 成功: ${JSON.stringify(res.data).slice(0, 200)}`)
    } else {
      setActionResult(`❌ 失败: ${res.message || 'Unknown error'}`)
    }
    setActionLoading(false)
  }

  const openAction = (target: typeof actionTarget) => {
    setActionTarget(target)
    setSelectedAction(null)
    setActionInputs({})
    setActionResult('')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">好友 / 群管理</h1>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => { setTab('friends'); setSelectedGroup(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'friends' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
          }`}
        >
          好友列表 ({friends.length})
        </button>
        <button
          onClick={() => { setTab('groups'); setSelectedGroup(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
          }`}
        >
          群列表 ({groups.length})
        </button>
        <button
          onClick={() => { setTab('requests'); setSelectedGroup(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'requests' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
          }`}
        >
          好友请求 {pendingRequests.length > 0 && <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">{pendingRequests.length}</span>}
        </button>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => (tab === 'friends' ? loadFriends() : loadGroups())}
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          刷新
        </button>
      </div>

      {loading && <p className="text-muted-foreground">加载中...</p>}

      <div className="flex gap-6">
        <div className="flex-1">
          {tab === 'requests' ? (
            /* Friend Requests List */
            <div className="space-y-2">
              {pendingRequests.length === 0 ? (
                <div className="rounded-lg border p-8 text-center">
                  <p className="text-muted-foreground">暂无待处理的好友请求</p>
                </div>
              ) : (
                pendingRequests.map((req) => (
                  <div key={req.flag} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {req.nickname.charAt(0) || '?'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{req.nickname}</span>
                          <span className="text-xs text-muted-foreground font-mono">{req.userId}</span>
                        </div>
                        {req.comment && <p className="text-sm text-muted-foreground">验证信息: {req.comment}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(req.timestamp).toLocaleString('zh-CN')}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req.flag)}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        同意
                      </button>
                      <button
                        onClick={() => handleReject(req.flag)}
                        className="rounded-md border border-destructive px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
          <>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                {tab === 'friends' ? (
                  <>
                    <th className="p-3">QQ 号</th>
                    <th className="p-3">昵称</th>
                    <th className="p-3">备注</th>
                    <th className="p-3 w-20">操作</th>
                  </>
                ) : (
                  <>
                    <th className="p-3">群号</th>
                    <th className="p-3">群名</th>
                    <th className="p-3">成员数</th>
                    <th className="p-3 w-20">操作</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tab === 'friends'
                ? filteredFriends.map((f) => (
                    <tr
                      key={f.user_id}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => openAction({ type: 'friend', id: f.user_id, name: f.remark || f.nickname })}
                    >
                      <td className="p-3 font-mono text-sm">{f.user_id}</td>
                      <td className="p-3">{f.nickname}</td>
                      <td className="p-3 text-muted-foreground">{f.remark || '-'}</td>
                      <td className="p-3">
                        <span className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                          操作 ▸
                        </span>
                      </td>
                    </tr>
                  ))
                : filteredGroups.map((g) => (
                    <tr
                      key={g.group_id}
                      className={`border-b hover:bg-muted/50 cursor-pointer ${
                        selectedGroup === g.group_id ? 'bg-muted' : ''
                      }`}
                    >
                      <td
                        className="p-3 font-mono text-sm"
                        onClick={() => loadMembers(g.group_id, g.group_name)}
                      >
                        {g.group_id}
                      </td>
                      <td
                        className="p-3"
                        onClick={() => loadMembers(g.group_id, g.group_name)}
                      >
                        {g.group_name}
                      </td>
                      <td
                        className="p-3 cursor-pointer"
                        onClick={() => loadMembers(g.group_id, g.group_name)}
                      >
                        {g.member_count ?? '-'}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => openAction({ type: 'group', id: g.group_id, name: g.group_name })}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                        >
                          操作
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          </>
          )}
        </div>

        {tab === 'groups' && selectedGroup && (
          <div className="w-80">
            <h3 className="mb-3 font-semibold">群成员 ({members.length})</h3>
            <div className="max-h-[600px] space-y-1 overflow-y-auto">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded p-2 text-sm hover:bg-muted/50 cursor-pointer"
                  onClick={() => openAction({
                    type: 'member',
                    id: m.user_id,
                    name: m.card || m.nickname,
                    groupId: selectedGroup,
                    groupName: selectedGroupName,
                  })}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{m.user_id}</span>
                    <span className="ml-2 truncate">{m.card || m.nickname}</span>
                    {m.role && m.role !== 'member' && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{m.role}</span>
                    )}
                  </div>
                  <button
                    onClick={() => openAction({
                      type: 'member',
                      id: m.user_id,
                      name: m.card || m.nickname,
                      groupId: selectedGroup,
                      groupName: selectedGroupName,
                    })}
                    className="ml-2 rounded-md border px-2 py-1 text-xs hover:bg-accent shrink-0"
                  >
                    操作
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Dialog */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setActionTarget(null)}>
          <div
            className="w-full max-w-lg max-h-[85vh] rounded-lg border bg-background shadow-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">{actionTarget.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {actionTarget.type === 'friend' ? `QQ: ${actionTarget.id}` :
                   actionTarget.type === 'group' ? `群号: ${actionTarget.id}` :
                   `成员: ${actionTarget.id}`}
                  {actionTarget.groupName && ` · 群: ${actionTarget.groupName}`}
                </p>
              </div>
              <button onClick={() => setActionTarget(null)} className="rounded-md p-2 hover:bg-muted">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                {getActions(actionTarget).map((a) => (
                  <button
                    key={a.action + JSON.stringify(a.params)}
                    onClick={() => { setSelectedAction(a); setActionInputs({}); setActionResult('') }}
                    className={`rounded-md border p-3 text-left text-sm hover:bg-accent transition-colors ${
                      selectedAction === a ? 'border-primary bg-accent' : ''
                    }`}
                  >
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{a.description}</div>
                  </button>
                ))}
              </div>

              {/* Action form */}
              {selectedAction && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="font-medium">{selectedAction.label}</h3>
                  <p className="text-sm text-muted-foreground">{selectedAction.description}</p>

                  {selectedAction.needsInput?.map((input) => (
                    <div key={input.key}>
                      <label className="mb-1 block text-sm font-medium">{input.label}</label>
                      {input.type === 'textarea' ? (
                        <textarea
                          value={actionInputs[input.key] || ''}
                          onChange={(e) => setActionInputs({ ...actionInputs, [input.key]: e.target.value })}
                          placeholder={input.placeholder}
                          rows={3}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      ) : (
                        <input
                          type={input.type || 'text'}
                          value={actionInputs[input.key] || ''}
                          onChange={(e) => setActionInputs({ ...actionInputs, [input.key]: e.target.value })}
                          placeholder={input.placeholder}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  ))}

                  {selectedAction.confirm && (
                    <p className="text-sm text-destructive">⚠️ {selectedAction.confirm}</p>
                  )}

                  <button
                    onClick={handleExecute}
                    disabled={actionLoading}
                    className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {actionLoading ? '执行中...' : '执行'}
                  </button>

                  {actionResult && (
                    <div className="rounded-md bg-muted p-3 text-sm font-mono break-all">
                      {actionResult}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
