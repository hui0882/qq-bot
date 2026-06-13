# NapCat 管理平台 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个基于 Next.js 的 NapCat 管理平台，通过 WebSocket 连接远程 NapCat 服务，提供 Web 管理界面、API 调试、配置热重载和日志系统。

**Architecture:** 单体 Next.js 15 应用，后端通过 API Routes 提供 WS 代理、SSE 事件推送、配置管理和日志查询。前端使用 shadcn/ui 组件库构建管理界面。WS 连接作为全局单例管理，通过 chokidar 实现配置热重载。

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, ws, chokidar

---

## 依赖关系图

```
Task 1: 项目初始化
    ↓
Task 2: 类型定义
    ↓
    ├── Task 3: 配置系统 ──────────┐
    ├── Task 4: 日志系统 ──────────┤
    ├── Task 5: 认证系统 ──────────┤
    └── Task 6: WS 客户端 (依赖 3+4) ┘
                ↓
    ┌───────────┼───────────┐
    Task 7: API Routes      Task 8: 前端布局+登录
    (依赖 3,4,5,6)           (依赖 1,2,5)
                ↓               ↓
    ┌───────────────────────────────┐
    Task 9-14: 各页面 (并行开发)      │
    (Dashboard, Contacts, Messages,  │
     Debugger, Logs, Settings)        │
    └───────────────────────────────┘
                ↓
    Task 15: 构建验证 + 自检
                ↓
    Task 16: 提交
```

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `src/app/globals.css`
- Create: `data/config.json`
- Create: `.gitignore`

- [ ] **Step 1: 初始化 Next.js 项目**

在 `/Users/makabaka/code/napcatQQ` 目录下初始化（根目录即项目目录）：

```bash
cd /Users/makabaka/code/napcatQQ
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

如果目录非空，选择不覆盖已有文件（OpenAPI.md）。

- [ ] **Step 2: 安装核心依赖**

```bash
npm install ws chokidar uuid
npm install -D @types/ws @types/uuid
```

- [ ] **Step 3: 安装 shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input card dialog tabs table badge toast label textarea select separator scroll-area
```

- [ ] **Step 4: 创建配置文件 `data/config.json`**

```json
{
  "ws": {
    "url": "ws://115.190.250.31:3001",
    "reconnect": true,
    "reconnectInterval": 5000,
    "maxReconnectInterval": 30000
  },
  "auth": {
    "token": "napcat-admin-token"
  },
  "log": {
    "maxEntries": 5000,
    "persistToFile": true,
    "logDir": "data/logs"
  }
}
```

- [ ] **Step 5: 创建 `.gitignore` 追加项**

在已有 `.gitignore` 末尾追加：

```
# NapCat Platform
data/logs/
node_modules/
.next/
```

- [ ] **Step 6: 创建日志目录**

```bash
mkdir -p data/logs
```

- [ ] **Step 7: 验证项目启动**

```bash
npm run dev
```

确认 `http://localhost:3000` 可以访问，然后停止。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: initialize napcat-platform with Next.js 15, Tailwind, shadcn/ui"
```

---

## Task 2: OneBot 11 类型定义

**Files:**
- Create: `src/types/napcat.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
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

// ============ 平台配置 ============

export interface PlatformConfig {
  ws: {
    url: string
    reconnect: boolean
    reconnectInterval: number
    maxReconnectInterval: number
  }
  auth: {
    token: string
  }
  log: {
    maxEntries: number
    persistToFile: boolean
    logDir: string
  }
}

// ============ 日志条目 ============

export interface LogEntry {
  id: string
  timestamp: number
  type: 'request' | 'event' | 'system'
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
```

- [ ] **Step 2: 验证类型无报错**

```bash
npx tsc --noEmit src/types/napcat.ts
```

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add src/types/napcat.ts
git commit -m "feat: add OneBot 11 type definitions"
```

---

## Task 3: 配置系统

**Files:**
- Create: `src/lib/config.ts`

- [ ] **Step 1: 实现配置管理模块**

```typescript
// src/lib/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PlatformConfig } from '@/types/napcat'

const CONFIG_PATH = join(process.cwd(), 'data', 'config.json')

const DEFAULT_CONFIG: PlatformConfig = {
  ws: {
    url: 'ws://115.190.250.31:3001',
    reconnect: true,
    reconnectInterval: 5000,
    maxReconnectInterval: 30000,
  },
  auth: {
    token: 'napcat-admin-token',
  },
  log: {
    maxEntries: 5000,
    persistToFile: true,
    logDir: 'data/logs',
  },
}

export type ConfigChangeListener = (config: PlatformConfig, changedKeys: string[]) => void

class ConfigManager {
  private config: PlatformConfig
  private listeners: ConfigChangeListener[] = []
  private watcher: import('chokidar').FSWatcher | null = null

  constructor() {
    this.config = this.loadConfig()
    this.startWatcher()
  }

  private loadConfig(): PlatformConfig {
    try {
      if (!existsSync(CONFIG_PATH)) {
        const dir = join(process.cwd(), 'data')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
        return { ...DEFAULT_CONFIG }
      }
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PlatformConfig>
      return {
        ws: { ...DEFAULT_CONFIG.ws, ...parsed.ws },
        auth: { ...DEFAULT_CONFIG.auth, ...parsed.auth },
        log: { ...DEFAULT_CONFIG.log, ...parsed.log },
      }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  private async startWatcher(): Promise<void> {
    try {
      const chokidar = await import('chokidar')
      this.watcher = chokidar.watch(CONFIG_PATH, { ignoreInitial: true })
      this.watcher.on('change', () => {
        const newConfig = this.loadConfig()
        const changedKeys = this.diffConfigs(this.config, newConfig)
        if (changedKeys.length > 0) {
          this.config = newConfig
          for (const listener of this.listeners) {
            listener(newConfig, changedKeys)
          }
        }
      })
    } catch {
      // chokidar not available, hot-reload disabled
    }
  }

  private diffConfigs(old: PlatformConfig, curr: PlatformConfig): string[] {
    const keys: string[] = []
    if (old.ws.url !== curr.ws.url) keys.push('ws.url')
    if (old.ws.reconnect !== curr.ws.reconnect) keys.push('ws.reconnect')
    if (old.auth.token !== curr.auth.token) keys.push('auth.token')
    if (old.log.maxEntries !== curr.log.maxEntries) keys.push('log.maxEntries')
    if (old.log.persistToFile !== curr.log.persistToFile) keys.push('log.persistToFile')
    return keys
  }

  getConfig(): PlatformConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<PlatformConfig>): void {
    this.config = {
      ws: { ...this.config.ws, ...partial.ws },
      auth: { ...this.config.auth, ...partial.auth },
      log: { ...this.config.log, ...partial.log },
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8')
  }

  onUpdate(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  getMaskedConfig(): Omit<PlatformConfig, 'auth'> & { auth: { token: string } } {
    return {
      ...this.config,
      auth: { token: '***' },
    }
  }

  validateToken(token: string): boolean {
    return token === this.config.auth.token
  }

  destroy(): void {
    this.watcher?.close()
  }
}

// Singleton — survives Next.js hot-reload in development
const globalForConfig = globalThis as unknown as { __configManager?: ConfigManager }

export function getConfigManager(): ConfigManager {
  if (!globalForConfig.__configManager) {
    globalForConfig.__configManager = new ConfigManager()
  }
  return globalForConfig.__configManager
}

export const configManager = getConfigManager()
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add config manager with chokidar hot-reload"
```

---

## Task 4: 日志系统

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: 实现日志模块**

```typescript
// src/lib/logger.ts
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { LogEntry } from '@/types/napcat'
import { configManager } from './config'

export type LogListener = (entry: LogEntry) => void

class Logger {
  private buffer: LogEntry[] = []
  private listeners: LogListener[] = []
  private maxEntries: number

  constructor() {
    this.maxEntries = configManager.getConfig().log.maxEntries
    configManager.onUpdate((config, keys) => {
      if (keys.includes('log.maxEntries')) {
        this.maxEntries = config.log.maxEntries
        this.trimBuffer()
      }
    })
  }

  private trimBuffer(): void {
    while (this.buffer.length > this.maxEntries) {
      this.buffer.shift()
    }
  }

  private persist(entry: LogEntry): void {
    const config = configManager.getConfig()
    if (!config.log.persistToFile) return

    const logDir = join(process.cwd(), config.log.logDir)
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

    const date = new Date().toISOString().split('T')[0]
    const filePath = join(logDir, `${date}.jsonl`)
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
  }

  add(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const full: LogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...entry,
    }
    this.buffer.push(full)
    this.trimBuffer()
    this.persist(full)
    for (const listener of this.listeners) {
      listener(full)
    }
    return full
  }

  logRequest(action: string, params: unknown, echo: string): LogEntry {
    return this.add({
      type: 'request',
      direction: 'outgoing',
      action,
      echo,
      data: params,
      status: 'pending',
    })
  }

  logResponse(echo: string, response: unknown, success: boolean): void {
    const entry = this.buffer.find((e) => e.echo === echo && e.type === 'request')
    if (entry) {
      entry.status = success ? 'success' : 'error'
      entry.response = response
    }
    this.add({
      type: 'request',
      direction: 'incoming',
      action: entry?.action,
      echo,
      data: response,
      status: success ? 'success' : 'error',
    })
  }

  logEvent(event: unknown): LogEntry {
    const ev = event as Record<string, unknown>
    return this.add({
      type: 'event',
      direction: 'incoming',
      action: ev.post_type as string,
      data: event,
    })
  }

  logSystem(message: string, data?: unknown): LogEntry {
    return this.add({
      type: 'system',
      data: { message, ...((data as object) || {}) },
    })
  }

  getLogs(filters?: {
    type?: LogEntry['type']
    action?: string
    limit?: number
    offset?: number
  }): LogEntry[] {
    let logs = [...this.buffer].reverse()
    if (filters?.type) logs = logs.filter((l) => l.type === filters.type)
    if (filters?.action) logs = logs.filter((l) => l.action?.includes(filters.action!))
    const offset = filters?.offset || 0
    const limit = filters?.limit || 100
    return logs.slice(offset, offset + limit)
  }

  onLog(listener: LogListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  getTotal(): number {
    return this.buffer.length
  }
}

const globalForLogger = globalThis as unknown as { __logger?: Logger }

export function getLogger(): Logger {
  if (!globalForLogger.__logger) {
    globalForLogger.__logger = new Logger()
  }
  return globalForLogger.__logger
}

export const logger = getLogger()
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat: add logger with ring buffer and file persistence"
```

---

## Task 5: 认证系统

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: 实现认证工具函数**

```typescript
// src/lib/auth.ts
import { cookies } from 'next/headers'
import { configManager } from './config'

const TOKEN_COOKIE = 'napcat_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function getAuthToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(TOKEN_COOKIE)?.value
}

export async function validateAuth(): Promise<boolean> {
  const token = await getAuthToken()
  if (!token) return false
  return configManager.validateToken(token)
}

export function validateTokenSync(token: string): boolean {
  return configManager.validateToken(token)
}
```

- [ ] **Step 2: 创建 Next.js 中间件**

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Check token cookie
  const token = request.cookies.get('napcat_token')?.value
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts src/middleware.ts
git commit -m "feat: add token auth with cookie-based session and middleware"
```

---

## Task 6: WebSocket 客户端

**Files:**
- Create: `src/lib/napcat-ws.ts`

- [ ] **Step 1: 实现 WS 单例客户端**

```typescript
// src/lib/napcat-ws.ts
import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import type { OB11ActionResponse, WSConnectionStatus } from '@/types/napcat'
import { configManager } from './config'
import { logger } from './logger'

type ResponseCallback = (response: OB11ActionResponse) => void
type EventCallback = (event: Record<string, unknown>) => void
type StatusCallback = (status: WSConnectionStatus) => void

class NapCatWSClient {
  private ws: WebSocket | null = null
  private status: WSConnectionStatus = 'disconnected'
  private pendingRequests = new Map<string, { resolve: ResponseCallback; timer: ReturnType<typeof setTimeout> }>()
  private eventCallbacks: EventCallback[] = []
  private statusCallbacks: StatusCallback[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private connectedAt: number | null = null
  private reconnectCount = 0

  constructor() {
    configManager.onUpdate((config, keys) => {
      if (keys.some((k) => k.startsWith('ws.'))) {
        logger.logSystem('Config changed, reconnecting...', { url: config.ws.url })
        this.disconnect()
        this.connect()
      }
    })
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    const config = configManager.getConfig()
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(config.ws.url)

      this.ws.on('open', () => {
        this.status = 'connected'
        this.connectedAt = Date.now()
        this.reconnectAttempts = 0
        this.reconnectCount++
        this.setStatus('connected')
        logger.logSystem(`WebSocket connected to ${config.ws.url}`)
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>

          // Check if it's a response (has echo field)
          if (msg.echo && typeof msg.echo === 'string') {
            const pending = this.pendingRequests.get(msg.echo)
            if (pending) {
              clearTimeout(pending.timer)
              this.pendingRequests.delete(msg.echo)
              const response = msg as unknown as OB11ActionResponse
              logger.logResponse(msg.echo, response, response.status === 'ok')
              pending.resolve(response)
            }
          } else {
            // It's an event
            logger.logEvent(msg)
            for (const cb of this.eventCallbacks) {
              cb(msg)
            }
          }
        } catch {
          logger.logSystem('Failed to parse WS message', { raw: data.toString() })
        }
      })

      this.ws.on('close', () => {
        this.setStatus('disconnected')
        this.connectedAt = null
        logger.logSystem('WebSocket disconnected')
        this.scheduleReconnect()
      })

      this.ws.on('error', (err: Error) => {
        this.setStatus('error')
        logger.logSystem('WebSocket error', { error: err.message })
      })
    } catch (err) {
      this.setStatus('error')
      logger.logSystem('Failed to create WebSocket', { error: (err as Error).message })
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    const config = configManager.getConfig()
    if (!config.ws.reconnect) return
    if (this.reconnectTimer) return

    const delay = Math.min(
      config.ws.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      config.ws.maxReconnectInterval,
    )
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
    this.connectedAt = null
  }

  private setStatus(status: WSConnectionStatus): void {
    this.status = status
    for (const cb of this.statusCallbacks) {
      cb(status)
    }
  }

  async sendAction(action: string, params: Record<string, unknown> = {}): Promise<OB11ActionResponse> {
    if (this.status !== 'connected' || !this.ws) {
      return { status: 'failed', retcode: -1, data: null, message: 'WebSocket not connected' }
    }

    const echo = uuidv4()
    const payload = JSON.stringify({ action, params, echo })

    logger.logRequest(action, params, echo)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(echo)
        logger.logResponse(echo, { message: 'Request timeout' }, false)
        resolve({ status: 'failed', retcode: -1, data: null, message: 'Request timeout' })
      }, 30000)

      this.pendingRequests.set(echo, { resolve, timer })
      this.ws!.send(payload)
    })
  }

  getStatus(): WSConnectionStatus {
    return this.status
  }

  getConnectionInfo(): { status: WSConnectionStatus; connectedAt: number | null; reconnectCount: number } {
    return {
      status: this.status,
      connectedAt: this.connectedAt,
      reconnectCount: this.reconnectCount,
    }
  }

  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback)
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback)
    }
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.push(callback)
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback)
    }
  }
}

const globalForWS = globalThis as unknown as { __napcatWS?: NapCatWSClient }

export function getNapCatWS(): NapCatWSClient {
  if (!globalForWS.__napcatWS) {
    globalForWS.__napcatWS = new NapCatWSClient()
  }
  return globalForWS.__napcatWS
}

export const napcatWS = getNapCatWS()
```

- [ ] **Step 2: 在应用启动时连接 WS**

编辑 `src/app/layout.tsx`，在服务端初始化 WS 连接。在文件顶部导入：

```typescript
import { napcatWS } from '@/lib/napcat-ws'
```

由于 layout.tsx 是服务端组件，导入时 napcatWS 模块会被执行，单例会被创建。但我们还需要在模块加载时自动连接。修改 `src/lib/napcat-ws.ts` 的末尾：

```typescript
// 在 napcatWS 导出之后添加：
if (typeof window === 'undefined') {
  // Server-side: auto-connect on module load
  napcatWS.connect()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/napcat-ws.ts src/app/layout.tsx
git commit -m "feat: add WebSocket client singleton with auto-reconnect"
```

---

## Task 7: API Routes

**Files:**
- Create: `src/app/api/auth/route.ts`
- Create: `src/app/api/ws/route.ts`
- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/config/route.ts`
- Create: `src/app/api/logs/route.ts`

- [ ] **Step 1: 认证 API**

```typescript
// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { configManager } from '@/lib/config'
import { setAuthCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body as { token: string }

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, message: 'Token is required' }, { status: 400 })
    }

    if (!configManager.validateToken(token)) {
      return NextResponse.json({ success: false, message: 'Token incorrect' }, { status: 401 })
    }

    await setAuthCookie(token)
    return NextResponse.json({ success: true, message: 'Login successful' })
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
```

- [ ] **Step 2: WS 代理 API**

```typescript
// src/app/api/ws/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { napcatWS } from '@/lib/napcat-ws'
import { validateAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, params } = body as { action: string; params?: Record<string, unknown> }

    if (!action) {
      return NextResponse.json({ success: false, message: 'action is required' }, { status: 400 })
    }

    const result = await napcatWS.sendAction(action, params || {})
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
```

- [ ] **Step 3: SSE 事件推送 API**

```typescript
// src/app/api/events/route.ts
import { NextRequest } from 'next/server'
import { napcatWS } from '@/lib/napcat-ws'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send connection status immediately
      const statusMsg = JSON.stringify({
        type: 'connection_status',
        data: napcatWS.getConnectionInfo(),
      })
      controller.enqueue(encoder.encode(`data: ${statusMsg}\n\n`))

      // Listen for events
      const removeEvent = napcatWS.onEvent((event) => {
        try {
          const msg = JSON.stringify({ type: 'event', data: event })
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
        } catch {
          // stream closed
        }
      })

      // Listen for logs
      const removeLog = logger.onLog((entry) => {
        try {
          const msg = JSON.stringify({ type: 'log', data: entry })
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
        } catch {
          // stream closed
        }
      })

      // Listen for status changes
      const removeStatus = napcatWS.onStatusChange((status) => {
        try {
          const msg = JSON.stringify({
            type: 'connection_status',
            data: { status, ...napcatWS.getConnectionInfo() },
          })
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
        } catch {
          // stream closed
        }
      })

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        removeEvent()
        removeLog()
        removeStatus()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 4: 配置 API**

```typescript
// src/app/api/config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { configManager } from '@/lib/config'
import { validateAuth } from '@/lib/auth'
import type { PlatformConfig } from '@/types/napcat'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ success: true, data: configManager.getMaskedConfig() })
}

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const partial = body as Partial<PlatformConfig>

    // Validate WS URL format if provided
    if (partial.ws?.url && !partial.ws.url.startsWith('ws://') && !partial.ws.url.startsWith('wss://')) {
      return NextResponse.json({ success: false, message: 'Invalid WebSocket URL' }, { status: 400 })
    }

    // Validate token not empty if provided
    if (partial.auth?.token !== undefined && partial.auth.token.trim() === '') {
      return NextResponse.json({ success: false, message: 'Token cannot be empty' }, { status: 400 })
    }

    configManager.updateConfig(partial)
    return NextResponse.json({ success: true, message: 'Config updated, hot-reload triggered' })
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
```

- [ ] **Step 5: 日志 API**

```typescript
// src/app/api/logs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { validateAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const type = searchParams.get('type') as 'request' | 'event' | 'system' | undefined
  const action = searchParams.get('action') || undefined
  const limit = parseInt(searchParams.get('limit') || '100', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const logs = logger.getLogs({ type, action, limit, offset })
  const total = logger.getTotal()

  return NextResponse.json({ success: true, data: logs, total })
}
```

- [ ] **Step 6: 验证 API 路由编译**

```bash
npm run build 2>&1 | head -50
```

Expected: 无 TypeScript 编译错误

- [ ] **Step 7: Commit**

```bash
git add src/app/api/
git commit -m "feat: add API routes (auth, ws proxy, events SSE, config, logs)"
```

---

## Task 8: 前端布局与登录页

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/components/sidebar.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 创建侧边栏组件**

```tsx
// src/components/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: '状态监控', icon: '📊' },
  { href: '/contacts', label: '好友/群管理', icon: '👥' },
  { href: '/messages', label: '消息调试', icon: '💬' },
  { href: '/debugger', label: 'API 调试器', icon: '🔧' },
  { href: '/logs', label: '日志', icon: '📋' },
  { href: '/settings', label: '配置', icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-background flex flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <span>🤖</span>
          <span>NapCat Platform</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
              pathname === item.href ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" id="ws-status-dot" />
          <span>连接状态</span>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: 修改根布局**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NapCat Platform',
  description: 'NapCat QQ 管理平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: 创建认证布局（带侧边栏）**

```tsx
// src/app/(authenticated)/layout.tsx
import { Sidebar } from '@/components/sidebar'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: 创建路由组目录**

```bash
mkdir -p "src/app/(authenticated)/dashboard"
mkdir -p "src/app/(authenticated)/contacts"
mkdir -p "src/app/(authenticated)/messages"
mkdir -p "src/app/(authenticated)/debugger"
mkdir -p "src/app/(authenticated)/logs"
mkdir -p "src/app/(authenticated)/settings"
```

注意：Task 9-14 的页面直接在 `src/app/(authenticated)/` 路由组下创建，共享侧边栏布局。

- [ ] **Step 5: 创建登录页**

```tsx
// src/app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()

      if (data.success) {
        router.push(from)
        router.refresh()
      } else {
        setError(data.message || 'Token 错误')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold">🤖 NapCat Platform</h1>
          <p className="mt-2 text-sm text-muted-foreground">请输入 Token 以登录</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="输入 Token..."
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? '验证中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 修改首页重定向**

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
```

- [ ] **Step 7: 验证页面可访问**

```bash
npm run dev
```

访问 `http://localhost:3000`，应重定向到登录页。输入 `napcat-admin-token` 登录后看到带侧边栏的布局。

- [ ] **Step 8: Commit**

```bash
git add src/app/ src/components/sidebar.tsx
git commit -m "feat: add root layout, sidebar navigation, and login page"
```

---

## Task 9: 状态监控面板 `/dashboard`

**Files:**
- Create: `src/app/(authenticated)/dashboard/page.tsx`

- [ ] **Step 1: 创建 Dashboard 页面**

```tsx
// src/app/(authenticated)/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface ConnectionInfo {
  status: string
  connectedAt: number | null
  reconnectCount: number
}

interface LoginInfo {
  user_id: number
  nickname: string
}

interface StatusInfo {
  online: boolean
  good: boolean
}

interface VersionInfo {
  app_name: string
  app_version: string
  protocol_version: string
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
}

export default function DashboardPage() {
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null)
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null)
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchWithAuth = async (action: string) => {
    const res = await fetch('/api/ws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    return res.json()
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [connRes, loginRes, statusRes, versionRes] = await Promise.all([
        fetch('/api/events').then(() => fetch('/api/ws', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_status' }),
        })).catch(() => null),
        fetchWithAuth('get_login_info'),
        fetchWithAuth('get_status'),
        fetchWithAuth('get_version_info'),
      ])

      if (loginRes?.data) setLoginInfo(loginRes.data)
      if (statusRes?.data) setStatusInfo(statusRes.data)
      if (versionRes?.data) setVersionInfo(versionRes.data)
    } catch {
      // handle error silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Subscribe to SSE for connection status
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'connection_status') {
          setConnInfo(msg.data)
        }
      } catch {
        // ignore
      }
    }

    return () => eventSource.close()
  }, [])

  const handleReconnect = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ws: { url: connInfo ? undefined : 'ws://115.190.250.31:3001' } }),
    })
    setTimeout(loadData, 1000)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">状态监控</h1>
        <button
          onClick={handleReconnect}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          重连
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <StatusCard title="连接状态">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusDot online={connInfo?.status === 'connected'} />
              <span className="font-medium">{connInfo?.status || '未知'}</span>
            </div>
            {connInfo?.connectedAt && (
              <p className="text-sm text-muted-foreground">
                连接时间: {new Date(connInfo.connectedAt).toLocaleString('zh-CN')}
              </p>
            )}
            <p className="text-sm text-muted-foreground">重连次数: {connInfo?.reconnectCount || 0}</p>
          </div>
        </StatusCard>

        <StatusCard title="登录信息">
          {loginInfo ? (
            <div className="space-y-2">
              <p><span className="text-muted-foreground">QQ 号:</span> {loginInfo.user_id}</p>
              <p><span className="text-muted-foreground">昵称:</span> {loginInfo.nickname}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">未获取到登录信息</p>
          )}
        </StatusCard>

        <StatusCard title="运行状态">
          {statusInfo ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusDot online={statusInfo.online} />
                <span>{statusInfo.online ? '在线' : '离线'}</span>
              </div>
              <p className="text-sm text-muted-foreground">状态: {statusInfo.good ? '正常' : '异常'}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">未获取到运行状态</p>
          )}
        </StatusCard>

        <StatusCard title="版本信息">
          {versionInfo ? (
            <div className="space-y-2">
              <p><span className="text-muted-foreground">应用:</span> {versionInfo.app_name}</p>
              <p><span className="text-muted-foreground">版本:</span> {versionInfo.app_version}</p>
              <p><span className="text-muted-foreground">协议:</span> {versionInfo.protocol_version}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">未获取到版本信息</p>
          )}
        </StatusCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(authenticated)/dashboard/"
git commit -m "feat: add dashboard with connection status, login info, and version info"
```

---

## Task 10: 好友/群管理 `/contacts`

**Files:**
- Create: `src/app/(authenticated)/contacts/page.tsx`

- [ ] **Step 1: 创建 Contacts 页面**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(authenticated)/contacts/"
git commit -m "feat: add contacts page with friends and groups management"
```

---

## Task 11: 消息收发调试 `/messages`

**Files:**
- Create: `src/app/(authenticated)/messages/page.tsx`

- [ ] **Step 1: 创建 Messages 页面**

```tsx
// src/app/(authenticated)/messages/page.tsx
'use client'

import { useState } from 'react'

type MessageType = 'private' | 'group'

interface MessageSegment {
  type: string
  data: Record<string, string>
}

interface HistoryMessage {
  message_id: number
  user_id: number
  time: number
  message: MessageSegment[]
  raw_message: string
  sender?: { nickname: string }
}

export default function MessagesPage() {
  // Send form state
  const [msgType, setMsgType] = useState<MessageType>('private')
  const [targetId, setTargetId] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string>('')

  // History state
  const [histTargetId, setHistTargetId] = useState('')
  const [histType, setHistType] = useState<MessageType>('private')
  const [histCount, setHistCount] = useState('20')
  const [history, setHistory] = useState<HistoryMessage[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const callApi = async (action: string, params?: Record<string, unknown>) => {
    const res = await fetch('/api/ws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    })
    return res.json()
  }

  const handleSend = async () => {
    if (!targetId || !content) return
    setSending(true)
    setSendResult('')

    const params: Record<string, unknown> = {
      message_type: msgType,
      message: [{ type: 'text', data: { text: content } }],
    }
    if (msgType === 'private') params.user_id = targetId
    else params.group_id = targetId

    const res = await callApi('send_msg', params)
    setSendResult(res.status === 'ok' ? `发送成功 (message_id: ${res.data?.message_id})` : `发送失败: ${res.message}`)
    setSending(false)
  }

  const handleLoadHistory = async () => {
    if (!histTargetId) return
    setLoadingHistory(true)

    const action = histType === 'group' ? 'get_group_msg_history' : 'get_friend_msg_history'
    const params: Record<string, unknown> = {
      count: parseInt(histCount, 10),
    }
    if (histType === 'group') params.group_id = histTargetId
    else params.user_id = histTargetId

    const res = await callApi(action, params)
    if (res.data?.messages) setHistory(res.data.messages)
    else setHistory([])
    setLoadingHistory(false)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">消息调试</h1>

      {/* Send Message */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">发送消息</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">消息类型</label>
            <select
              value={msgType}
              onChange={(e) => setMsgType(e.target.value as MessageType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="private">私聊</option>
              <option value="group">群聊</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {msgType === 'private' ? '用户 QQ 号' : '群号'}
            </label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={msgType === 'private' ? '输入 QQ 号' : '输入群号'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">消息内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入消息内容..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleSend}
            disabled={sending || !targetId || !content}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? '发送中...' : '发送'}
          </button>
          {sendResult && (
            <span className={`text-sm ${sendResult.startsWith('发送成功') ? 'text-green-600' : 'text-destructive'}`}>
              {sendResult}
            </span>
          )}
        </div>
      </div>

      {/* History */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">历史消息</h2>
        <div className="mb-4 flex items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">类型</label>
            <select
              value={histType}
              onChange={(e) => setHistType(e.target.value as MessageType)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="private">私聊</option>
              <option value="group">群聊</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ID</label>
            <input
              type="text"
              value={histTargetId}
              onChange={(e) => setHistTargetId(e.target.value)}
              placeholder="QQ 号或群号"
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">条数</label>
            <input
              type="number"
              value={histCount}
              onChange={(e) => setHistCount(e.target.value)}
              className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleLoadHistory}
            disabled={loadingHistory || !histTargetId}
            className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {loadingHistory ? '加载中...' : '查询'}
          </button>
        </div>

        <div className="max-h-[500px] space-y-2 overflow-y-auto">
          {history.map((msg) => (
            <div key={msg.message_id} className="rounded border p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{msg.sender?.nickname || 'Unknown'} ({msg.user_id})</span>
                <span>{new Date(msg.time * 1000).toLocaleString('zh-CN')}</span>
              </div>
              <p className="mt-1">{msg.raw_message}</p>
            </div>
          ))}
          {history.length === 0 && !loadingHistory && (
            <p className="text-center text-muted-foreground">无消息记录</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(authenticated)/messages/"
git commit -m "feat: add messages page with send and history viewing"
```

---

## Task 12: 通用 API 调试器 `/debugger`

**Files:**
- Create: `src/app/(authenticated)/debugger/page.tsx`

- [ ] **Step 1: 创建 Debugger 页面**

```tsx
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

const COMMON_ACTIONS = [
  'get_login_info',
  'get_status',
  'get_version_info',
  'get_friend_list',
  'get_group_list',
  'get_group_info',
  'get_group_member_list',
  'get_group_msg_history',
  'get_friend_msg_history',
  'send_msg',
  'delete_msg',
  'set_friend_add_request',
  'set_group_kick',
  'set_group_ban',
  'set_group_leave',
  'set_group_name',
  'set_group_card',
  'get_image',
  'get_record',
  'get_file',
  'can_send_image',
  'can_send_record',
  'get_cookies',
  'get_csrf_token',
  'get_credentials',
  'clean_cache',
  'set_online_status',
  'get_stranger_info',
  'get_group_system_msg',
]

const PARAM_TEMPLATES: Record<string, Record<string, unknown>> = {
  get_friend_list: {},
  get_group_list: {},
  get_login_info: {},
  get_status: {},
  get_version_info: {},
  get_group_info: { group_id: '123456' },
  get_group_member_list: { group_id: '123456' },
  get_group_msg_history: { group_id: '123456', count: 20 },
  get_friend_msg_history: { user_id: '123456789', count: 20 },
  send_msg: {
    message_type: 'private',
    user_id: '123456789',
    message: [{ type: 'text', data: { text: 'hello' } }],
  },
  delete_msg: { message_id: 12345 },
  set_friend_add_request: { flag: 'flag_xxx', approve: true },
  set_group_kick: { group_id: '123456', user_id: '123456789' },
  set_group_ban: { group_id: '123456', user_id: '123456789', duration: 60 },
}

export default function DebuggerPage() {
  const [action, setAction] = useState('get_login_info')
  const [paramsStr, setParamsStr] = useState('{}')
  const [response, setResponse] = useState<unknown>(null)
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<DebugEntry[]>([])

  const handleActionChange = (newAction: string) => {
    setAction(newAction)
    const template = PARAM_TEMPLATES[newAction]
    if (template) setParamsStr(JSON.stringify(template, null, 2))
  }

  const handleSend = async () => {
    setSending(true)
    setResponse(null)
    const startTime = Date.now()

    try {
      const params = JSON.parse(paramsStr)
      const res = await fetch('/api/ws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params }),
      })
      const data = await res.json()
      const duration = Date.now() - startTime

      setResponse(data)
      setHistory((prev) => [
        { id: Date.now(), timestamp: Date.now(), action, params, response: data, duration },
        ...prev.slice(0, 49),
      ])
    } catch (err) {
      setResponse({ error: (err as Error).message })
    } finally {
      setSending(false)
    }
  }

  const replayEntry = (entry: DebugEntry) => {
    setAction(entry.action)
    setParamsStr(JSON.stringify(entry.params, null, 2))
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
              <div>
                <label className="mb-1 block text-sm font-medium">Action</label>
                <select
                  value={action}
                  onChange={(e) => handleActionChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {COMMON_ACTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Params (JSON)</label>
                <textarea
                  value={paramsStr}
                  onChange={(e) => setParamsStr(e.target.value)}
                  rows={12}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
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
              <pre className="max-h-[500px] overflow-auto rounded bg-muted p-4 font-mono text-sm">
                {JSON.stringify(response, null, 2)}
              </pre>
            ) : (
              <p className="text-center text-muted-foreground">发送请求后查看响应</p>
            )}
          </div>

          {/* History */}
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
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(authenticated)/debugger/"
git commit -m "feat: add API debugger with action selector and history"
```

---

## Task 13: 日志查看页面 `/logs`

**Files:**
- Create: `src/app/(authenticated)/logs/page.tsx`
- Create: `src/components/log-viewer.tsx`

- [ ] **Step 1: 创建日志查看器组件**

```tsx
// src/components/log-viewer.tsx
'use client'

import { useEffect, useState, useRef } from 'react'

interface LogEntry {
  id: string
  timestamp: number
  type: 'request' | 'event' | 'system'
  direction?: 'outgoing' | 'incoming'
  action?: string
  echo?: string
  data: unknown
  status?: 'pending' | 'success' | 'error'
  response?: unknown
}

interface LogViewerProps {
  filter?: 'request' | 'event' | 'system'
}

export function LogViewer({ filter }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load initial logs
    const url = filter ? `/api/logs?type=${filter}&limit=200` : '/api/logs?limit=200'
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setLogs(data.data)
      })

    // Subscribe to SSE for real-time logs
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'log') {
          const entry = msg.data as LogEntry
          if (!filter || entry.type === filter) {
            setLogs((prev) => [...prev, entry].slice(-500))
          }
        }
      } catch {
        // ignore
      }
    }

    return () => eventSource.close()
  }, [filter])

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const typeColors = {
    request: 'bg-blue-100 text-blue-800',
    event: 'bg-green-100 text-green-800',
    system: 'bg-yellow-100 text-yellow-800',
  }

  const statusColors = {
    pending: 'text-yellow-600',
    success: 'text-green-600',
    error: 'text-red-600',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{logs.length} 条日志</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          自动滚动
        </label>
      </div>
      <div ref={containerRef} className="h-[600px] overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2 w-20">时间</th>
              <th className="p-2 w-16">类型</th>
              <th className="p-2 w-32">Action</th>
              <th className="p-2 w-16">方向</th>
              <th className="p-2 w-16">状态</th>
              <th className="p-2">数据</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <>
                <tr
                  key={log.id}
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="cursor-pointer border-b hover:bg-muted/50"
                >
                  <td className="p-2 font-mono text-xs text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                  </td>
                  <td className="p-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${typeColors[log.type]}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-xs">{log.action || '-'}</td>
                  <td className="p-2 text-xs">{log.direction || '-'}</td>
                  <td className={`p-2 text-xs ${statusColors[log.status || 'pending']}`}>
                    {log.status || '-'}
                  </td>
                  <td className="p-2 max-w-xs truncate font-mono text-xs">
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data).slice(0, 100)}
                  </td>
                </tr>
                {expandedId === log.id && (
                  <tr key={`${log.id}-detail`}>
                    <td colSpan={6} className="p-4 bg-muted/30">
                      <pre className="overflow-auto max-h-60 font-mono text-xs">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                      {log.response && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-muted-foreground">响应:</span>
                          <pre className="overflow-auto max-h-40 mt-1 font-mono text-xs">
                            {JSON.stringify(log.response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建日志页面**

```tsx
// src/app/(authenticated)/logs/page.tsx
'use client'

import { useState } from 'react'
import { LogViewer } from '@/components/log-viewer'

type LogFilter = 'request' | 'event' | 'system' | undefined

export default function LogsPage() {
  const [filter, setFilter] = useState<LogFilter>(undefined)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">日志</h1>

      <div className="flex gap-2">
        {([undefined, 'request', 'event', 'system'] as LogFilter[]).map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'
            }`}
          >
            {f === undefined ? '全部' : f === 'request' ? '请求' : f === 'event' ? '事件' : '系统'}
          </button>
        ))}
      </div>

      <LogViewer filter={filter} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authenticated)/logs/" src/components/log-viewer.tsx
git commit -m "feat: add logs page with real-time viewer and filters"
```

---

## Task 14: 配置管理页面 `/settings`

**Files:**
- Create: `src/app/(authenticated)/settings/page.tsx`

- [ ] **Step 1: 创建 Settings 页面**

```tsx
// src/app/(authenticated)/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'

interface Config {
  ws: {
    url: string
    reconnect: boolean
    reconnectInterval: number
    maxReconnectInterval: number
  }
  auth: {
    token: string
  }
  log: {
    maxEntries: number
    persistToFile: boolean
    logDir: string
  }
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setConfig(data.data)
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setMessage('')

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const data = await res.json()

    if (data.success) {
      setMessage('保存成功，热重载已触发')
    } else {
      setMessage(`保存失败: ${data.message}`)
    }
    setSaving(false)
  }

  const handleTestConnection = async () => {
    if (!config) return
    setMessage('测试中...')
    try {
      const testWs = new WebSocket(config.ws.url)
      testWs.onopen = () => {
        setMessage('连接成功!')
        testWs.close()
      }
      testWs.onerror = () => {
        setMessage('连接失败')
      }
      setTimeout(() => {
        if (testWs.readyState !== WebSocket.OPEN) {
          testWs.close()
          setMessage('连接超时')
        }
      }, 5000)
    } catch {
      setMessage('连接失败')
    }
  }

  if (loading || !config) {
    return <div className="flex items-center justify-center h-full">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">配置管理</h1>

      {/* WS Config */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">WebSocket 连接</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">WS 地址</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.ws.url}
                onChange={(e) => setConfig({ ...config, ws: { ...config.ws, url: e.target.value } })}
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
              <button
                onClick={handleTestConnection}
                className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                测试连接
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.ws.reconnect}
                onChange={(e) => setConfig({ ...config, ws: { ...config.ws, reconnect: e.target.checked } })}
              />
              自动重连
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">重连间隔 (ms)</label>
              <input
                type="number"
                value={config.ws.reconnectInterval}
                onChange={(e) =>
                  setConfig({ ...config, ws: { ...config.ws, reconnectInterval: parseInt(e.target.value) || 5000 } })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">最大重连间隔 (ms)</label>
              <input
                type="number"
                value={config.ws.maxReconnectInterval}
                onChange={(e) =>
                  setConfig({ ...config, ws: { ...config.ws, maxReconnectInterval: parseInt(e.target.value) || 30000 } })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Auth Config */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">认证</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Token</label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={config.auth.token}
              onChange={(e) => setConfig({ ...config, auth: { ...config.auth, token: e.target.value } })}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {showToken ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">修改 Token 后需要重新登录</p>
        </div>
      </div>

      {/* Log Config */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">日志</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">最大日志条数</label>
            <input
              type="number"
              value={config.log.maxEntries}
              onChange={(e) =>
                setConfig({ ...config, log: { ...config.log, maxEntries: parseInt(e.target.value) || 5000 } })
              }
              className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.log.persistToFile}
              onChange={(e) => setConfig({ ...config, log: { ...config.log, persistToFile: e.target.checked } })}
            />
            持久化到文件
          </label>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
        {message && (
          <span className={`text-sm ${message.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(authenticated)/settings/"
git commit -m "feat: add settings page with WS, auth, and log config"
```

---

## Task 15: 构建验证与自检

**Files:**
- None (verification only)

- [ ] **Step 1: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误。如有错误，修复后重新运行。

- [ ] **Step 2: ESLint 检查**

```bash
npm run lint
```

Expected: 无错误。如有警告可忽略，错误需修复。

- [ ] **Step 3: 生产构建**

```bash
npm run build
```

Expected: 构建成功，无错误。记录构建输出确认所有页面都正确生成。

- [ ] **Step 4: 功能自检清单**

启动开发服务器 `npm run dev`，逐项验证：

- [ ] 访问 `http://localhost:3000` → 重定向到 `/login`
- [ ] 输入错误 Token → 显示"Token 错误"
- [ ] 输入正确 Token (`napcat-admin-token`) → 跳转到 Dashboard
- [ ] Dashboard 显示连接状态卡片（应显示 connecting 或 connected）
- [ ] 侧边栏导航可点击切换页面
- [ ] `/contacts` 好友/群 Tab 切换正常
- [ ] `/messages` 发送消息表单可填写
- [ ] `/debugger` Action 下拉列表显示所有接口
- [ ] `/logs` 日志页面显示实时日志
- [ ] `/settings` 配置页面加载当前配置
- [ ] 修改 WS 地址 → 保存 → 热重载生效
- [ ] 修改 Token → 保存 → 旧 session 失效 → 跳转登录页

- [ ] **Step 5: 修复发现的问题**

如有任何检查失败，修复后从 Step 1 重新开始。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: resolve build and type check issues"
```

---

## Task 16: 最终提交

- [ ] **Step 1: 确认所有文件已提交**

```bash
git status
```

Expected: 工作区干净，无未提交文件。

- [ ] **Step 2: 查看完整提交历史**

```bash
git log --oneline
```

确认提交历史清晰，每步都有对应的 commit。

- [ ] **Step 3: 提交用户测试**

通知用户：开发完成，自检通过，可以开始最终测试。

---
