// src/types/napcat.ts

// ============ OneBot 11 消息段类型 ============

export interface OB11MessageText {
  type: 'text'
  data: { text: string }
}

export interface OB11MessageFace {
  type: 'face'
  data: { id: string; resultId?: string; chainCount?: number }
}

export interface OB11MessageAt {
  type: 'at'
  data: { qq: string; name?: string }
}

export interface OB11MessageReply {
  type: 'reply'
  data: { id?: string; seq?: number }
}

export interface OB11MessageImage {
  type: 'image'
  data: {
    file: string
    path?: string
    url?: string
    name?: string
    thumb?: string
    summary?: string
    sub_type?: number
  }
}

export interface OB11MessageRecord {
  type: 'record'
  data: { file: string; path?: string; url?: string; name?: string; thumb?: string }
}

export interface OB11MessageVideo {
  type: 'video'
  data: { file: string; path?: string; url?: string; name?: string; thumb?: string }
}

export type OB11MessageSegment =
  | OB11MessageText
  | OB11MessageFace
  | OB11MessageAt
  | OB11MessageReply
  | OB11MessageImage
  | OB11MessageRecord
  | OB11MessageVideo
  | { type: string; data: Record<string, unknown> }

export type OB11MessageMixType = string | OB11MessageSegment[]

// ============ 发送者 ============

export interface OB11Sender {
  user_id: number | string
  nickname: string
  card?: string
  role?: string
  sex?: string
  age?: number
  area?: string
  level?: string
  title?: string
}

// ============ 群信息 ============

export interface OB11Group {
  group_id: number
  group_name: string
  member_count?: number
  max_member_count?: number
  group_all_shut?: number
  group_remark?: string
}

// ============ 群成员 ============

export interface OB11GroupMember {
  group_id: number
  user_id: number
  nickname: string
  card?: string
  sex?: string
  age?: number
  join_time?: number
  last_sent_time?: number
  level?: string
  qq_level?: number
  role?: 'owner' | 'admin' | 'member'
  title?: string
  area?: string
  unfriendly?: boolean
  title_expire_time?: number
  card_changeable?: boolean
  shut_up_timestamp?: number
  is_robot?: boolean
  qage?: number
}

// ============ 好友 ============

export interface OB11Friend {
  user_id: number
  nickname: string
  remark?: string
}

// ============ 消息 ============

export interface OB11Message {
  self_id: number
  user_id: number
  time: number
  message_id: number
  message_seq?: number
  real_id?: number
  message_type: 'private' | 'group'
  sub_type?: string
  sender: OB11Sender
  raw_message: string
  message: OB11MessageSegment[]
  message_format?: string
  post_type: 'message'
  group_id?: number
  group_name?: string
  font?: number
}

// ============ 事件 ============

export interface OB11NoticeEvent {
  post_type: 'notice'
  notice_type: string
  user_id: number
  group_id?: number
  [key: string]: unknown
}

export interface OB11RequestEvent {
  post_type: 'request'
  request_type: string
  user_id: number
  group_id?: number
  flag?: string
  comment?: string
  [key: string]: unknown
}

export interface OB11MetaEvent {
  post_type: 'meta_event'
  meta_event_type: string
  [key: string]: unknown
}

export type OB11Event = OB11Message | OB11NoticeEvent | OB11RequestEvent | OB11MetaEvent

// ============ API 请求/响应 ============

export interface OB11ActionRequest {
  action: string
  params?: Record<string, unknown>
  echo?: string
}

export interface OB11ActionResponse {
  status: 'ok' | 'failed'
  retcode: number
  data: unknown
  message?: string
  wording?: string
  echo?: string
}

// ============ 命令系统 ============

export interface CommandArg {
  name: string
  required: boolean
  values?: string[]
  description?: string
}

export interface CommandConditions {
  requireAllowUserOverride?: boolean
  requireTtsEnabled?: boolean
}

export interface CommandDefinition {
  name: string
  description: string
  usage: string
  enabled: boolean
  handler: string
  args?: CommandArg[]
  conditions?: CommandConditions
}

export interface CommandsConfig {
  enabled: boolean
  prefix: string
  allowUserOverride: boolean
  definitions: CommandDefinition[]
}

// ============ AI 配置 ============

export interface AIConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  maxContextRounds: number
  defaultReplyType: 'text' | 'voice'
  debugContext: boolean
  fileReplyEnabled: boolean
  systemPrompt: string
}

// ============ 平台配置 ============

export interface PlatformConfig {
  ws: {
    url: string
    token: string
    reconnect: boolean
    reconnectInterval: number
    maxReconnectInterval: number
  }
  api: {
    url: string
    token: string
  }
  tts: {
    enabled: boolean
    apiUrl: string
    apiKey: string
    model: string
    voice: string
    style: string
    format: 'wav' | 'mp3'
  }
  auth: {
    token: string
  }
  voiceReply: {
    mode: 'off' | 'always' | 'auto'
    allowUserOverride: boolean
  }
  friendRequest: {
    mode: 'auto' | 'manual'
    welcomeMessage: string
  }
  log: {
    maxEntries: number
    persistToFile: boolean
    logDir: string
  }
  commands: CommandsConfig
  ai: AIConfig
  school?: {
    enabledCommands: boolean
    enabledAI: boolean
  }
}

// ============ 日志条目 ============

export interface LogEntry {
  id: string
  timestamp: number
  type: 'request' | 'event' | 'system' | 'ai'
  direction?: 'outgoing' | 'incoming'
  action?: string
  echo?: string
  data: unknown
  status?: 'pending' | 'success' | 'error'
  response?: unknown
}

// ============ 连接状态 ============

export type WSConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// ============ API 调试器历史 ============

export interface DebugHistoryEntry {
  id: string
  timestamp: number
  action: string
  params: Record<string, unknown>
  response: OB11ActionResponse | null
  duration: number
}
