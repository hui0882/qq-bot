// src/app/(authenticated)/debugger/page.tsx
'use client'

import { useState } from 'react'

interface DebugEntry {
  id: number
  timestamp: number
  action: string
  params: Record<string, unknown>
  response: unknown
  duration: number
}

interface ParamDef {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'select'
  required: boolean
  default: unknown
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[]
}

interface ActionDef {
  name: string
  label: string
  description: string
  params: ParamDef[]
}

const ACTIONS: ActionDef[] = [
  // ===== 无参数 =====
  { name: 'get_login_info', label: '获取登录信息', description: '获取当前登录帐号的信息', params: [] },
  { name: 'get_status', label: '获取运行状态', description: '获取 NapCat 运行状态', params: [] },
  { name: 'get_version_info', label: '获取版本信息', description: '获取 NapCat 版本信息', params: [] },
  { name: 'can_send_image', label: '能否发送图片', description: '检查是否可以发送图片', params: [] },
  { name: 'can_send_record', label: '能否发送语音', description: '检查是否可以发送语音', params: [] },
  { name: 'get_csrf_token', label: '获取 CSRF Token', description: '获取 CSRF Token', params: [] },
  { name: 'clean_cache', label: '清理缓存', description: '清理 NapCat 缓存', params: [] },
  { name: 'get_friend_list', label: '获取好友列表', description: '获取当前帐号的好友列表', params: [
    { key: 'no_cache', label: '不使用缓存', type: 'boolean', required: false, default: false, description: '是否不使用缓存' },
  ]},
  { name: 'get_group_list', label: '获取群列表', description: '获取当前帐号的群聊列表', params: [
    { key: 'no_cache', label: '不使用缓存', type: 'boolean', required: false, default: false, description: '是否不使用缓存' },
  ]},

  // ===== 消息 =====
  { name: 'send_msg', label: '发送消息', description: '发送消息（私聊/群聊）', params: [
    { key: 'message_type', label: '消息类型', type: 'select', required: true, default: 'private', options: [
      { value: 'private', label: '私聊' }, { value: 'group', label: '群聊' },
    ]},
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: false, default: '', placeholder: '私聊时必填', description: '私聊目标 QQ 号' },
    { key: 'group_id', label: '群号', type: 'text', required: false, default: '', placeholder: '群聊时必填', description: '群聊目标群号' },
    { key: 'message', label: '消息内容', type: 'textarea', required: true, default: '', placeholder: '输入消息文本...', description: '消息文本内容' },
    { key: 'auto_escape', label: '纯文本发送', type: 'boolean', required: false, default: false, description: '是否作为纯文本发送（不解析 CQ 码）' },
  ]},
  { name: 'delete_msg', label: '撤回消息', description: '撤回一条消息', params: [
    { key: 'message_id', label: '消息 ID', type: 'number', required: true, default: 0, placeholder: '输入消息 ID', description: '要撤回的消息 ID' },
  ]},
  { name: 'get_group_msg_history', label: '获取群历史消息', description: '获取指定群聊的历史消息', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'count', label: '消息条数', type: 'number', required: false, default: 20, placeholder: '20' },
    { key: 'message_seq', label: '起始序号', type: 'number', required: false, default: 0, placeholder: '0（从最新开始）', description: '起始消息序号' },
  ]},
  { name: 'get_friend_msg_history', label: '获取好友历史消息', description: '获取指定好友的历史消息', params: [
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'count', label: '消息条数', type: 'number', required: false, default: 20, placeholder: '20' },
    { key: 'message_seq', label: '起始序号', type: 'number', required: false, default: 0, placeholder: '0（从最新开始）' },
  ]},

  // ===== 好友 =====
  { name: 'get_stranger_info', label: '获取陌生人信息', description: '获取指定用户的信息', params: [
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'no_cache', label: '不使用缓存', type: 'boolean', required: false, default: false },
  ]},
  { name: 'set_friend_remark', label: '设置好友备注', description: '设置好友备注名', params: [
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'remark', label: '备注名', type: 'text', required: true, default: '', placeholder: '输入备注名' },
  ]},
  { name: 'delete_friend', label: '删除好友', description: '删除指定好友', params: [
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'block', label: '拉黑', type: 'boolean', required: false, default: false, description: '是否同时拉黑' },
  ]},
  { name: 'set_friend_add_request', label: '处理好友请求', description: '同意或拒绝好友请求', params: [
    { key: 'flag', label: '请求 flag', type: 'text', required: true, default: '', placeholder: '从事件中获取', description: '好友请求的 flag' },
    { key: 'approve', label: '同意', type: 'boolean', required: false, default: true, description: '是否同意请求' },
    { key: 'remark', label: '备注', type: 'text', required: false, default: '', placeholder: '添加后的备注' },
  ]},

  // ===== 群 =====
  { name: 'get_group_info', label: '获取群信息', description: '获取群聊基本信息', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
  ]},
  { name: 'get_group_member_list', label: '获取群成员列表', description: '获取群聊所有成员', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
  ]},
  { name: 'get_group_member_info', label: '获取群成员信息', description: '获取指定群成员信息', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'no_cache', label: '不使用缓存', type: 'boolean', required: false, default: false },
  ]},
  { name: 'set_group_name', label: '设置群名', description: '修改群聊名称', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'group_name', label: '新群名', type: 'text', required: true, default: '', placeholder: '输入新群名' },
  ]},
  { name: 'set_group_card', label: '设置群名片', description: '设置群成员名片', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'card', label: '群名片', type: 'text', required: false, default: '', placeholder: '留空则清除名片' },
  ]},
  { name: 'set_group_kick', label: '踢出群成员', description: '将成员踢出群聊', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'reject_add_request', label: '拒绝再次加群', type: 'boolean', required: false, default: false },
  ]},
  { name: 'set_group_ban', label: '群禁言', description: '禁言指定群成员', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'duration', label: '禁言时长(秒)', type: 'number', required: false, default: 60, placeholder: '60', description: '0 为解除禁言' },
  ]},
  { name: 'set_group_whole_ban', label: '全员禁言', description: '开启或关闭全员禁言', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'enable', label: '开启', type: 'boolean', required: false, default: true, description: '是否开启全员禁言' },
  ]},
  { name: 'set_group_leave', label: '退出群聊', description: '退出指定群聊', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'is_dismiss', label: '解散群', type: 'boolean', required: false, default: false, description: '群主是否解散群' },
  ]},
  { name: 'set_group_special_title', label: '设置专属头衔', description: '设置群成员专属头衔', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'special_title', label: '专属头衔', type: 'text', required: false, default: '', placeholder: '留空则清除' },
  ]},
  { name: '_send_group_notice', label: '发送群公告', description: '向群聊发送公告', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'content', label: '公告内容', type: 'textarea', required: true, default: '', placeholder: '输入公告内容...' },
  ]},
  { name: 'set_group_admin', label: '设置管理员', description: '设置或取消群管理员', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'enable', label: '设置为管理', type: 'boolean', required: false, default: true, description: 'true 设置，false 取消' },
  ]},

  // ===== 状态 =====
  { name: 'set_online_status', label: '设置在线状态', description: '设置机器人在线状态', params: [
    { key: 'status', label: '状态', type: 'select', required: true, default: '11', options: [
      { value: '11', label: '在线' }, { value: '31', label: '离开' }, { value: '41', label: '隐身' }, { value: '51', label: '忙碌' }, { value: '61', label: 'Q我' }, { value: '71', label: '请勿打扰' },
    ]},
    { key: 'ext_status', label: '扩展状态', type: 'select', required: false, default: '0', options: [
      { value: '0', label: '无' }, { value: '1001', label: '信号弱' }, { value: '1002', label: '忙碌中' }, { value: '1003', label: '飞行模式' },
    ]},
    { key: 'battery_status', label: '电量', type: 'number', required: false, default: 100, placeholder: '100' },
  ]},
  { name: 'get_cookies', label: '获取 Cookies', description: '获取指定域名的 Cookies', params: [
    { key: 'domain', label: '域名', type: 'text', required: true, default: 'qun.qq.com', placeholder: 'qun.qq.com' },
  ]},
  { name: 'get_credentials', label: '获取登录凭证', description: '获取登录凭证', params: [
    { key: 'domain', label: '域名', type: 'text', required: false, default: '', placeholder: '可选' },
  ]},

  // ===== 文件 =====
  { name: 'get_image', label: '获取图片', description: '获取图片文件信息', params: [
    { key: 'file', label: '文件 ID', type: 'text', required: true, default: '', placeholder: '图片 file_id' },
  ]},
  { name: 'get_record', label: '获取语音', description: '获取语音文件信息', params: [
    { key: 'file', label: '文件 ID', type: 'text', required: true, default: '', placeholder: '语音 file_id' },
    { key: 'out_format', label: '输出格式', type: 'select', required: false, default: 'mp3', options: [
      { value: 'mp3', label: 'mp3' }, { value: 'amr', label: 'amr' }, { value: 'wma', label: 'wma' }, { value: 'm4a', label: 'm4a' }, { value: 'spx', label: 'spx' }, { value: 'ogg', label: 'ogg' }, { value: 'wav', label: 'wav' }, { value: 'flac', label: 'flac' },
    ]},
  ]},
  { name: 'get_file', label: '获取文件', description: '获取文件信息', params: [
    { key: 'file', label: '文件 ID', type: 'text', required: true, default: '', placeholder: '文件 file_id' },
  ]},
  { name: 'download_file', label: '下载文件', description: '下载文件到本地', params: [
    { key: 'url', label: '下载 URL', type: 'text', required: true, default: '', placeholder: '文件下载地址' },
    { key: 'headers', label: '请求头', type: 'textarea', required: false, default: '', placeholder: '可选，JSON 格式', description: '自定义请求头' },
  ]},

  // ===== 其他 =====
  { name: 'send_poke', label: '发送戳一戳', description: '向好友或群成员发送戳一戳', params: [
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'group_id', label: '群号', type: 'text', required: false, default: '', placeholder: '群聊时填写' },
  ]},
  { name: 'set_input_status', label: '设置输入状态', description: '设置对方聊天窗口的输入状态', params: [
    { key: 'user_id', label: '用户 QQ 号', type: 'text', required: true, default: '', placeholder: '输入 QQ 号' },
    { key: 'event_type', label: '状态', type: 'select', required: true, default: '1', options: [
      { value: '1', label: '正在输入' }, { value: '2', label: '正在说话' },
    ]},
  ]},
  { name: 'get_group_honor_info', label: '获取群荣誉信息', description: '获取群荣誉信息（龙王、群聊之火等）', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
    { key: 'type', label: '荣誉类型', type: 'select', required: false, default: 'talkative', options: [
      { value: 'talkative', label: '龙王' }, { value: 'performer', label: '群聊之火' }, { value: 'legend', label: '群聊炽焰' }, { value: 'strong_newbie', label: '冒尖小春笋' }, { value: 'emotion', label: '快乐源泉' },
    ]},
  ]},
  { name: 'get_group_system_msg', label: '获取群系统消息', description: '获取群系统消息（加群请求等）', params: [] },
  { name: 'get_online_clients', label: '获取在线客户端', description: '获取当前在线客户端列表', params: [
    { key: 'no_cache', label: '不使用缓存', type: 'boolean', required: false, default: false },
  ]},
  { name: 'get_group_file_system_info', label: '群文件系统信息', description: '获取群文件系统信息', params: [
    { key: 'group_id', label: '群号', type: 'text', required: true, default: '', placeholder: '输入群号' },
  ]},
]

// Category grouping for the action selector
const ACTION_GROUPS = [
  { label: '基础', actions: ['get_login_info', 'get_status', 'get_version_info', 'can_send_image', 'can_send_record', 'get_csrf_token', 'clean_cache'] },
  { label: '消息', actions: ['send_msg', 'delete_msg', 'get_group_msg_history', 'get_friend_msg_history'] },
  { label: '好友', actions: ['get_friend_list', 'get_stranger_info', 'set_friend_remark', 'delete_friend', 'set_friend_add_request'] },
  { label: '群管理', actions: ['get_group_list', 'get_group_info', 'get_group_member_list', 'get_group_member_info', 'set_group_name', 'set_group_card', 'set_group_kick', 'set_group_ban', 'set_group_whole_ban', 'set_group_leave', 'set_group_special_title', 'set_group_admin', '_send_group_notice'] },
  { label: '状态', actions: ['set_online_status', 'get_cookies', 'get_credentials', 'get_group_system_msg', 'get_online_clients'] },
  { label: '文件', actions: ['get_image', 'get_record', 'get_file', 'download_file'] },
  { label: '互动', actions: ['send_poke', 'set_input_status', 'get_group_honor_info', 'get_group_file_system_info'] },
]

export default function DebuggerPage() {
  const [selectedAction, setSelectedAction] = useState<ActionDef>(ACTIONS[0])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [includedOptional, setIncludedOptional] = useState<Record<string, boolean>>({})
  const [response, setResponse] = useState<unknown>(null)
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<DebugEntry[]>([])
  const [showRawJson, setShowRawJson] = useState(false)

  const handleActionChange = (actionName: string) => {
    const action = ACTIONS.find((a) => a.name === actionName)
    if (!action) return
    setSelectedAction(action)

    // Initialize form values with defaults
    const values: Record<string, unknown> = {}
    const included: Record<string, boolean> = {}
    for (const p of action.params) {
      values[p.key] = p.default
      if (!p.required) {
        included[p.key] = p.default !== '' && p.default !== 0 && p.default !== false
      }
    }
    setFormValues(values)
    setIncludedOptional(included)
    setResponse(null)
  }

  // Initialize on first render
  useState(() => {
    handleActionChange(ACTIONS[0].name)
  })

  const buildParams = (): Record<string, unknown> => {
    const params: Record<string, unknown> = {}
    for (const p of selectedAction.params) {
      if (p.required) {
        // Always include required params
        const val = formValues[p.key]
        if (p.key === 'message' && typeof val === 'string' && val) {
          // Special handling: wrap text in message segment
          params.message = [{ type: 'text', data: { text: val } }]
        } else if (val !== '' && val !== undefined) {
          params[p.key] = val
        }
      } else if (includedOptional[p.key]) {
        const val = formValues[p.key]
        if (val !== '' && val !== undefined && val !== null) {
          params[p.key] = val
        }
      }
    }
    return params
  }

  const handleSend = async () => {
    setSending(true)
    setResponse(null)
    const startTime = Date.now()

    try {
      const params = buildParams()
      const res = await fetch('/api/ws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: selectedAction.name, params }),
      })
      const data = await res.json()
      const duration = Date.now() - startTime

      setResponse(data)
      setHistory((prev) => [
        { id: Date.now(), timestamp: Date.now(), action: selectedAction.name, params, response: data, duration },
        ...prev.slice(0, 49),
      ])
    } catch (err) {
      setResponse({ error: (err as Error).message })
    } finally {
      setSending(false)
    }
  }

  const replayEntry = (entry: DebugEntry) => {
    const action = ACTIONS.find((a) => a.name === entry.action)
    if (action) {
      setSelectedAction(action)
      setFormValues(entry.params as Record<string, unknown>)
      // Enable all optional params that were in the replayed request
      const included: Record<string, boolean> = {}
      for (const p of action.params) {
        if (!p.required) {
          included[p.key] = entry.params[p.key] !== undefined
        }
      }
      setIncludedOptional(included)
    }
    setResponse(entry.response)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">API 调试器</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Request Panel */}
        <div className="space-y-4">
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">请求</h2>
            <div className="space-y-4">
              {/* Action selector */}
              <div>
                <label className="mb-1 block text-sm font-medium">接口</label>
                <select
                  value={selectedAction.name}
                  onChange={(e) => handleActionChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {ACTION_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.actions.map((name) => {
                        const action = ACTIONS.find((a) => a.name === name)
                        return action ? (
                          <option key={name} value={name}>{action.label} ({name})</option>
                        ) : null
                      })}
                    </optgroup>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{selectedAction.description}</p>
              </div>

              {/* Param fields */}
              {selectedAction.params.length > 0 && (
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-4 py-2">
                    <h3 className="text-sm font-medium">参数</h3>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={showRawJson}
                        onChange={(e) => setShowRawJson(e.target.checked)}
                        className="h-3 w-3"
                      />
                      显示原始 JSON
                    </label>
                  </div>

                  <div className="divide-y">
                    {selectedAction.params.map((p) => {
                      const isRequired = p.required
                      const isIncluded = isRequired || includedOptional[p.key]

                      return (
                        <div key={p.key} className={`flex items-start gap-3 px-4 py-3 ${!isIncluded ? 'opacity-50' : ''}`}>
                          {/* Checkbox */}
                          <div className="pt-0.5">
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              disabled={isRequired}
                              onChange={(e) => setIncludedOptional({ ...includedOptional, [p.key]: e.target.checked })}
                              className={`h-4 w-4 ${isRequired ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                            />
                          </div>

                          {/* Label + Input */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <label className={`text-sm font-medium leading-none ${!isIncluded ? 'text-muted-foreground' : ''}`}>
                                {p.label}
                              </label>
                              <span className="text-xs text-muted-foreground font-mono">{p.key}</span>
                              {isRequired && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">必填</span>}
                            </div>

                            {isIncluded && (
                              <>
                                {p.type === 'select' ? (
                                  <select
                                    value={String(formValues[p.key] ?? p.default)}
                                    onChange={(e) => setFormValues({ ...formValues, [p.key]: e.target.value })}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                                  >
                                    {p.options?.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                ) : p.type === 'boolean' ? (
                                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues[p.key]}
                                      onChange={(e) => setFormValues({ ...formValues, [p.key]: e.target.checked })}
                                      className="h-4 w-4"
                                    />
                                    {p.description || p.label}
                                  </label>
                                ) : p.type === 'textarea' ? (
                                  <textarea
                                    value={String(formValues[p.key] ?? '')}
                                    onChange={(e) => setFormValues({ ...formValues, [p.key]: e.target.value })}
                                    placeholder={p.placeholder}
                                    rows={3}
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  />
                                ) : p.type === 'number' ? (
                                  <input
                                    type="number"
                                    value={String(formValues[p.key] ?? '')}
                                    onChange={(e) => setFormValues({ ...formValues, [p.key]: Number(e.target.value) || 0 })}
                                    placeholder={p.placeholder}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={String(formValues[p.key] ?? '')}
                                    onChange={(e) => setFormValues({ ...formValues, [p.key]: e.target.value })}
                                    placeholder={p.placeholder}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                                  />
                                )}
                                {p.description && p.type !== 'boolean' && (
                                  <p className="text-xs text-muted-foreground">{p.description}</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Raw JSON preview */}
              {showRawJson && (
                <div className="rounded-lg border p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">发送的 JSON</p>
                  <pre className="text-xs font-mono overflow-auto max-h-40">
                    {JSON.stringify({ action: selectedAction.name, params: buildParams() }, null, 2)}
                  </pre>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={sending}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? '发送中...' : '发送请求'}
              </button>
            </div>
          </div>
        </div>

        {/* Response Panel */}
        <div className="space-y-4">
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">响应</h2>
            {response ? (
              <div className="space-y-2">
                {(response as Record<string, unknown>)?.status === 'ok' ? (
                  <div className="rounded-md bg-green-50 border border-green-200 p-2 text-sm text-green-800">✅ 成功</div>
                ) : (
                  <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800">
                    ❌ 失败: {(response as Record<string, unknown>)?.message as string || 'Unknown error'}
                  </div>
                )}
                <pre className="max-h-[500px] overflow-auto rounded bg-muted p-4 font-mono text-sm">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-center text-muted-foreground">发送请求后查看响应</p>
            )}
          </div>

          {history.length > 0 && (
            <div className="rounded-lg border p-6">
              <h2 className="mb-4 text-lg font-semibold">历史记录</h2>
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => replayEntry(entry)}
                    className="flex cursor-pointer items-center justify-between rounded border p-2 text-sm hover:bg-muted/50"
                  >
                    <div>
                      <span className="font-mono">{entry.action}</span>
                      <span className={`ml-2 text-xs ${
                        (entry.response as Record<string, unknown>)?.status === 'ok'
                          ? 'text-green-600'
                          : 'text-destructive'
                      }`}>
                        {(entry.response as Record<string, unknown>)?.status as string}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{entry.duration}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
