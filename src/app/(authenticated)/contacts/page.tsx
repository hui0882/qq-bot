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
}

type Tab = 'friends' | 'groups'

export default function ContactsPage() {
  const [tab, setTab] = useState<Tab>('friends')
  const [friends, setFriends] = useState<Friend[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

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

  const loadMembers = async (groupId: number) => {
    setSelectedGroup(groupId)
    setLoading(true)
    const res = await callApi('get_group_member_list', { group_id: String(groupId) })
    if (res.data) setMembers(Array.isArray(res.data) ? res.data : [])
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'friends') loadFriends()
    else loadGroups()
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
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                {tab === 'friends' ? (
                  <>
                    <th className="p-3">QQ 号</th>
                    <th className="p-3">昵称</th>
                    <th className="p-3">备注</th>
                  </>
                ) : (
                  <>
                    <th className="p-3">群号</th>
                    <th className="p-3">群名</th>
                    <th className="p-3">成员数</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tab === 'friends'
                ? filteredFriends.map((f) => (
                    <tr key={f.user_id} className="border-b hover:bg-muted/50 cursor-pointer">
                      <td className="p-3 font-mono text-sm">{f.user_id}</td>
                      <td className="p-3">{f.nickname}</td>
                      <td className="p-3 text-muted-foreground">{f.remark || '-'}</td>
                    </tr>
                  ))
                : filteredGroups.map((g) => (
                    <tr
                      key={g.group_id}
                      onClick={() => loadMembers(g.group_id)}
                      className={`border-b hover:bg-muted/50 cursor-pointer ${
                        selectedGroup === g.group_id ? 'bg-muted' : ''
                      }`}
                    >
                      <td className="p-3 font-mono text-sm">{g.group_id}</td>
                      <td className="p-3">{g.group_name}</td>
                      <td className="p-3">{g.member_count ?? '-'}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {tab === 'groups' && selectedGroup && (
          <div className="w-80">
            <h3 className="mb-3 font-semibold">群成员 ({members.length})</h3>
            <div className="max-h-[600px] space-y-1 overflow-y-auto">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between rounded p-2 text-sm hover:bg-muted/50">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">{m.user_id}</span>
                    <span className="ml-2">{m.card || m.nickname}</span>
                  </div>
                  {m.role && m.role !== 'member' && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{m.role}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
