# 学业助手 — 作业查询功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CSUST 作业查询脚本移植为 TypeScript，集成到 NapCat 平台，支持 /命令 和 AI function calling 查询。

**Architecture:** 独立 `src/lib/school/` 模块，适配器模式（SchoolAdapter 接口），CSUST 作为第一个实现。凭据存 SQLite `school_credentials` 表，服务层统一调度。

**Tech Stack:** TypeScript, better-sqlite3, 原生 fetch, crypto (MD5), Next.js App Router, shadcn/ui

## Global Constraints

- 使用原生 `fetch` + `AbortSignal.timeout()`（不用 axios/node-fetch）
- 单例模式存 `globalThis`（与项目现有模式一致）
- 命令通过 `registerHandler()` 注册到 `src/lib/commands/registry.ts`
- AI 工具通过 `ToolDefinition` 格式定义，集成到 `src/lib/ai/tools.ts`
- API 路由使用 `validateAuth()` 验证
- 所有中文回复，emoji 风格与现有命令一致

---

### Task 1: 分支创建 + 数据库 Schema

**Files:**
- Modify: `src/lib/db/index.ts:79-160` — `initDatabase()` 追加建表

- [ ] **Step 1: 创建 feature 分支**

```bash
git checkout -b feature/school-homework-query
```

- [ ] **Step 2: 在 `initDatabase()` 中追加建表语句**

在 `src/lib/db/index.ts` 的 `initDatabase()` 函数中，`console.log('[DB] Database initialized successfully (v2 schema)')` 之前追加：

```typescript
// 7. 学校平台凭据表
database.exec(`
  CREATE TABLE IF NOT EXISTS school_credentials (
    user_id TEXT NOT NULL,
    school TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, school)
  )
`)
```

- [ ] **Step 3: 验证编译通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "feat(school): add school_credentials table schema"
```

---

### Task 2: 类型定义

**Files:**
- Create: `src/lib/school/types.ts`

**Produces:** `SchoolSession`, `HomeworkItem`, `SchoolAdapter`, `SessionExpiredError`, `ServiceDisabledError` — 被后续所有 task 使用

- [ ] **Step 1: 创建 `src/lib/school/types.ts`**

```typescript
// src/lib/school/types.ts
// 学业助手 — 类型定义

/** 学校适配器的认证会话数据 */
export interface SchoolSession {
  school: string
  [key: string]: unknown
}

/** 作业项 */
export interface HomeworkItem {
  title: string
  courseName: string
  startTime: string
  deadline: string
  remainingText: string
  detail?: string
}

/** 学校适配器接口 */
export interface SchoolAdapter {
  name: string
  displayName: string
  authenticate(username: string, password: string): Promise<SchoolSession | null>
  fetchHomework(session: SchoolSession): Promise<HomeworkItem[]>
}

/** Session 过期错误 */
export class SessionExpiredError extends Error {
  constructor(message = '会话已过期，请重新登录') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

/** 服务禁用错误 */
export class ServiceDisabledError extends Error {
  constructor(message = '该功能已关闭') {
    super(message)
    this.name = 'ServiceDisabledError'
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit src/lib/school/types.ts 2>&1
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/lib/school/types.ts
git commit -m "feat(school): add type definitions for school module"
```

---

### Task 3: 凭据 CRUD

**Files:**
- Create: `src/lib/school/credentials.ts`

**Consumes:** 无（仅用 better-sqlite3）
**Produces:** `saveCredentials()`, `getCredentials()`, `deleteCredentials()` — 被 Task 5/6/7/9 使用

- [ ] **Step 1: 创建 `src/lib/school/credentials.ts`**

```typescript
// src/lib/school/credentials.ts
// 学业助手 — 凭据 CRUD

import { db } from '@/lib/db'

export function saveCredentials(
  userId: string,
  school: string,
  username: string,
  password: string,
): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO school_credentials (user_id, school, username, password, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, school) DO UPDATE SET username = ?, password = ?, updated_at = ?`,
  ).run(userId, school, username, password, now, username, password, now)
}

export function getCredentials(
  userId: string,
  school: string,
): { username: string; password: string } | null {
  const row = db.prepare(
    'SELECT username, password FROM school_credentials WHERE user_id = ? AND school = ?',
  ).get(userId, school) as { username: string; password: string } | undefined
  return row || null
}

export function deleteCredentials(userId: string, school: string): void {
  db.prepare('DELETE FROM school_credentials WHERE user_id = ? AND school = ?').run(userId, school)
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit src/lib/school/credentials.ts 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/school/credentials.ts
git commit -m "feat(school): add credentials CRUD operations"
```

---

### Task 4: CSUST 适配器

**Files:**
- Create: `src/lib/school/adapters/csust.ts`
- Create: `src/lib/school/adapters/index.ts`

**Consumes:** `SchoolSession`, `HomeworkItem`, `SchoolAdapter`, `SessionExpiredError` (Task 2)
**Produces:** `getAdapter()`, `CSUSTAdapter` — 被 Task 5 service 层使用

- [ ] **Step 1: 创建 `src/lib/school/adapters/csust.ts`**

完整转写 Python 脚本逻辑：

```typescript
// src/lib/school/adapters/csust.ts
// CSUST 长沙理工大学适配器 — 移植自 csust_homework_checker.py

import { createHash } from 'crypto'
import type { SchoolAdapter, SchoolSession, HomeworkItem } from '../types'
import { SessionExpiredError } from '../types'

const BASE_URL = 'http://pt.csust.edu.cn/mobile'

const MOBILE_HEADERS: Record<string, string> = {
  'Accept-Charset': 'UTF-8',
  'Authorization': 'OAuth2: token',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; 22127RK46C Build/AQ3A.250226.002)',
  'Connection': 'Keep-Alive',
  'Accept-Encoding': 'gzip',
}

const DEVICE_PARAMS = {
  deviceUuid: 'ecaac38cae77d5f1',
  appVersion: '1.7.9',
  devicePlatform: 'Android',
  deviceVersion: '15',
  deviceName: '22127RK46C',
}

interface CSUSTSession extends SchoolSession {
  school: 'csust'
  cookies: string // JSESSIONID cookie
}

function encryptPassword(password: string): string {
  return createHash('md5').update(password).digest('hex').toLowerCase()
}

function parseCookies(setCookieHeaders: string[]): string {
  const cookies: string[] = []
  for (const header of setCookieHeaders) {
    const parts = header.split(';')[0]
    if (parts) cookies.push(parts)
  }
  return cookies.join('; ')
}

async function getSessionId(): Promise<{ sessionId: string; cookies: string } | null> {
  try {
    const body = new URLSearchParams(DEVICE_PARAMS as Record<string, string>)
    const resp = await fetch(`${BASE_URL}/getSessionId.do`, {
      method: 'POST',
      headers: MOBILE_HEADERS,
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = await resp.json() as { status: number; sessionid?: string }
    if (result.status === 1 && result.sessionid) {
      const setCookies = resp.headers.getSetCookie?.() || []
      const cookies = parseCookies(setCookies) || `JSESSIONID=${result.sessionid}`
      return { sessionId: result.sessionid, cookies }
    }
  } catch { /* ignore */ }
  return null
}

async function login(
  username: string,
  password: string,
  existingCookies: string,
): Promise<{ success: boolean; cookies: string; realname?: string }> {
  const encryptedPwd = encryptPassword(password)
  const body = new URLSearchParams({
    ...DEVICE_PARAMS,
    j_username: username,
    j_password: encryptedPwd,
  })
  try {
    const resp = await fetch(`${BASE_URL}/login_check.do`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, Cookie: existingCookies },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = await resp.json() as {
      status: number
      datas?: { userinfo?: { user?: { realname?: string } } }
    }
    if (result.status === 1) {
      const setCookies = resp.headers.getSetCookie?.() || []
      const newCookies = setCookies.length > 0 ? parseCookies(setCookies) : existingCookies
      const realname = result.datas?.userinfo?.user?.realname || username
      return { success: true, cookies: newCookies, realname }
    }
  } catch { /* ignore */ }
  return { success: false, cookies: existingCookies }
}

async function getHomeworkList(cookies: string): Promise<unknown[]> {
  try {
    const body = new URLSearchParams({ context: '' })
    const resp = await fetch(`${BASE_URL}/hw/stu/findStuUnDoHwTaskList.do`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, Cookie: cookies },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = await resp.json() as { status: number; datas?: { hwtList?: unknown[] } }
    if (result.status === 1) {
      return result.datas?.hwtList || []
    }
  } catch { /* ignore */ }
  return []
}

async function getHomeworkDetail(
  cookies: string,
  hwtId: number,
  courseId: number,
): Promise<string> {
  try {
    const body = new URLSearchParams({
      hwtId: String(hwtId),
      courseId: String(courseId),
    })
    const resp = await fetch(`${BASE_URL}/hw/stu/hwStuSubmit.do`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, Cookie: cookies },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = await resp.json() as { status: number; datas?: { content?: string } }
    if (result.status === 1 && result.datas?.content) {
      let content = result.datas.content
      content = content.replace(/<[^>]+>/g, '')
      content = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\\\//g, '/')
      content = content.replace(/\s+/g, ' ').trim()
      return content
    }
  } catch { /* ignore */ }
  return ''
}

function calcRemainingDays(deadlineStr: string): string {
  try {
    const deadline = new Date(deadlineStr.replace(' ', 'T'))
    const now = new Date()
    const totalHours = (deadline.getTime() - now.getTime()) / 3600000
    if (totalHours < 0) return '⛔ 已过期'
    if (totalHours < 24) return `🔴 仅剩 ${Math.floor(totalHours)} 小时！！`
    if (totalHours < 72) {
      const days = Math.floor(totalHours / 24)
      const hours = Math.floor(totalHours % 24)
      return `🟠 仅剩 ${days} 天 ${hours} 小时`
    }
    return `🟡 剩余 ${Math.floor(totalHours / 24)} 天`
  } catch {
    return ''
  }
}

function calcRemainingDaysNumeric(deadlineStr: string): number {
  try {
    const deadline = new Date(deadlineStr.replace(' ', 'T'))
    const now = new Date()
    return (deadline.getTime() - now.getTime()) / 86400000
  } catch {
    return 999
  }
}

export const CSUSTAdapter: SchoolAdapter = {
  name: 'csust',
  displayName: '长沙理工大学',

  async authenticate(username: string, password: string): Promise<SchoolSession | null> {
    const sessionResult = await getSessionId()
    if (!sessionResult) return null

    const loginResult = await login(username, password, sessionResult.cookies)
    if (!loginResult.success) return null

    return {
      school: 'csust',
      cookies: loginResult.cookies,
      realname: loginResult.realname,
    } as CSUSTSession
  },

  async fetchHomework(session: SchoolSession): Promise<HomeworkItem[]> {
    const { cookies } = session as CSUSTSession
    const hwList = await getHomeworkList(cookies)

    // 按截止时间排序
    hwList.sort((a: unknown, b: unknown) => {
      const da = (a as Record<string, string>).deadline || '9999-99-99 99:99'
      const db = (b as Record<string, string>).deadline || '9999-99-99 99:99'
      return da.localeCompare(db)
    })

    const items: HomeworkItem[] = []
    for (const hw of hwList) {
      const h = hw as Record<string, unknown>
      const deadline = (h.deadline as string) || ''
      const hwtId = h.id as number
      const courseId = h.courseId as number
      const daysLeft = calcRemainingDaysNumeric(deadline)

      let detail: string | undefined
      if (daysLeft < 3 && hwtId && courseId) {
        detail = await getHomeworkDetail(cookies, hwtId, courseId)
      }

      items.push({
        title: (h.title as string) || '未知作业',
        courseName: (h.courseName as string) || '未知课程',
        startTime: (h.startDateTime as string) || '',
        deadline,
        remainingText: calcRemainingDays(deadline),
        detail: detail || undefined,
      })
    }
    return items
  },
}
```

- [ ] **Step 2: 创建 `src/lib/school/adapters/index.ts`**

```typescript
// src/lib/school/adapters/index.ts
// 适配器注册表

import type { SchoolAdapter } from '../types'
import { CSUSTAdapter } from './csust'

const adapters = new Map<string, SchoolAdapter>()

// 注册所有适配器
adapters.set(CSUSTAdapter.name, CSUSTAdapter)

export function getAdapter(school: string): SchoolAdapter | undefined {
  return adapters.get(school)
}

export function listAdapters(): SchoolAdapter[] {
  return Array.from(adapters.values())
}

export function getDefaultSchool(): string {
  return 'csust'
}
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit src/lib/school/adapters/csust.ts src/lib/school/adapters/index.ts 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/school/adapters/
git commit -m "feat(school): add CSUST adapter and adapter registry"
```

---

### Task 5: 服务层

**Files:**
- Create: `src/lib/school/service.ts`

**Consumes:** `getCredentials` (Task 3), `getAdapter` (Task 4), `SessionExpiredError`, `ServiceDisabledError` (Task 2)
**Produces:** `queryHomework()`, `checkServiceEnabled()` — 被 Task 6/7 命令和工具使用

- [ ] **Step 1: 创建 `src/lib/school/service.ts`**

```typescript
// src/lib/school/service.ts
// 学业助手 — 统一服务层

import { configManager } from '@/lib/config'
import type { SchoolSession } from './types'
import { SessionExpiredError, ServiceDisabledError } from './types'
import { getCredentials } from './credentials'
import { getAdapter, getDefaultSchool } from './adapters'

// Session 缓存（内存，不持久化）
const sessionCache = new Map<string, SchoolSession>()

export function checkServiceEnabled(userId: string, channel: 'command' | 'ai'): void {
  const config = configManager.getConfig()
  const schoolConfig = config.school
  if (!schoolConfig) return // 未配置时默认允许

  if (channel === 'command' && !schoolConfig.enabledCommands) {
    throw new ServiceDisabledError('作业查询命令功能已关闭，请联系管理员开启')
  }
  if (channel === 'ai' && !schoolConfig.enabledAI) {
    throw new ServiceDisabledError('作业查询 AI 功能已关闭，请联系管理员开启')
  }
}

export async function queryHomework(
  userId: string,
  channel: 'command' | 'ai',
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. 系统级开关检查
    checkServiceEnabled(userId, channel)

    // 2. 获取凭据
    const school = getDefaultSchool()
    const creds = getCredentials(userId, school)
    if (!creds) {
      return {
        success: false,
        message: '❌ 请先使用 /set-config <账号> <密码> 配置学校平台账号',
      }
    }

    // 3. 查找适配器
    const adapter = getAdapter(school)
    if (!adapter) {
      return { success: false, message: `❌ 不支持的学校: ${school}` }
    }

    // 4. 获取 session（缓存或重新认证）
    const cacheKey = `${userId}:${school}`
    let session = sessionCache.get(cacheKey)

    try {
      if (!session) {
        session = await adapter.authenticate(creds.username, creds.password) || undefined
        if (!session) {
          return {
            success: false,
            message: '❌ 登录失败，请检查账号密码是否正确。\n使用 /set-config <账号> <密码> 重新配置',
          }
        }
        sessionCache.set(cacheKey, session)
      }

      // 5. 查询作业
      const homeworks = await adapter.fetchHomework(session)

      // 6. 格式化输出
      const message = formatHomeworkMessage(homeworks)
      return { success: true, message }
    } catch (error) {
      // Session 过期 → 清除缓存，重试一次
      if (error instanceof SessionExpiredError) {
        sessionCache.delete(cacheKey)
        const newSession = await adapter.authenticate(creds.username, creds.password)
        if (!newSession) {
          return {
            success: false,
            message: '❌ 会话已过期且重新登录失败，请检查账号密码。\n使用 /set-config <账号> <密码> 重新配置',
          }
        }
        sessionCache.set(cacheKey, newSession)
        const homeworks = await adapter.fetchHomework(newSession)
        const message = formatHomeworkMessage(homeworks)
        return { success: true, message }
      }
      throw error
    }
  } catch (error) {
    if (error instanceof ServiceDisabledError) {
      return { success: false, message: `❌ ${error.message}` }
    }
    return { success: false, message: `❌ 查询失败: ${error instanceof Error ? error.message : '未知错误'}` }
  }
}

export function formatHomeworkMessage(
  homeworks: import('./types').HomeworkItem[],
): string {
  if (homeworks.length === 0) {
    return '🎉 当前没有待提交的作业，可以放心休息！'
  }

  const lines = [`📚 当前有 ${homeworks.length} 个待提交作业：\n`]

  for (let i = 0; i < homeworks.length; i++) {
    const hw = homeworks[i]
    lines.push('─'.repeat(30))
    lines.push(`【${i + 1}】${hw.title}`)
    lines.push(`  📖 课程：${hw.courseName}`)
    lines.push(`  📅 开始：${hw.startTime}`)
    lines.push(`  ⏰ 截止：${hw.deadline}  ${hw.remainingText}`)

    if (hw.detail) {
      lines.push(`  📝 内容：${hw.detail}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit src/lib/school/service.ts 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/school/service.ts
git commit -m "feat(school): add service layer with session caching and retry"
```

---

### Task 6: 命令处理器 + 配置注册

**Files:**
- Create: `src/lib/school/commands/set-config.ts`
- Create: `src/lib/school/commands/homework.ts`
- Modify: `src/lib/commands/handlers/index.ts` — 追加 import
- Modify: `src/types/napcat.ts` — `PlatformConfig` 追加 `school` 字段
- Modify: `src/lib/config.ts` — `DEFAULT_CONFIG` 追加 `school` 默认值 + `diffConfigs` 扩展

**Consumes:** `saveCredentials`, `getCredentials` (Task 3), `queryHomework` (Task 5)
**Produces:** 两个命令 handler，被 dispatcher 调用

- [ ] **Step 1: 创建 `src/lib/school/commands/set-config.ts`**

```typescript
// src/lib/school/commands/set-config.ts
// /set-config 命令 — 配置学校平台账号密码

import { registerHandler } from '@/lib/commands/registry'
import { saveCredentials, getCredentials } from '../credentials'
import { getDefaultSchool, getAdapter } from '../adapters'
import type { CommandHandler } from '@/lib/commands/types'

const handler: CommandHandler = async (ctx) => {
  const userId = ctx.userId
  const args = ctx.args

  const school = getDefaultSchool()
  const adapter = getAdapter(school)
  const schoolName = adapter?.displayName || school

  // 无参数：显示当前配置
  if (args.length === 0) {
    const creds = getCredentials(userId, school)
    if (!creds) {
      return {
        reply: `📝 你还没有配置学校平台账号。\n\n💡 配置：/set-config <账号> <密码>`,
        handled: true,
      }
    }
    const maskedPwd = '****'
    return {
      reply: `📝 当前学校平台配置：\n\n📖 学校：${schoolName}\n👤 账号：${creds.username}\n🔑 密码：${maskedPwd}\n\n💡 修改：/set-config <新账号> <新密码>`,
      handled: true,
    }
  }

  // 参数不足
  if (args.length < 2) {
    return {
      reply: '❌ 参数不足，请按格式输入：\n/set-config <账号> <密码>',
      handled: true,
    }
  }

  const [username, password] = args
  saveCredentials(userId, school, username, password)

  // 截取账号后4位以外的部分做脱敏
  const maskedUser = username.length > 4
    ? username.slice(0, -4) + '****'
    : username

  return {
    reply: `✅ 学校平台账号已配置！\n\n📖 学校：${schoolName}\n👤 账号：${maskedUser}`,
    handled: true,
  }
}

registerHandler('builtin:set-homework-config', handler)
```

- [ ] **Step 2: 创建 `src/lib/school/commands/homework.ts`**

```typescript
// src/lib/school/commands/homework.ts
// /homework 命令 — 查询待提交作业

import { registerHandler } from '@/lib/commands/registry'
import { queryHomework } from '../service'
import type { CommandHandler } from '@/lib/commands/types'

const handler: CommandHandler = async (ctx) => {
  const result = await queryHomework(ctx.userId, 'command')
  return { reply: result.message, handled: true }
}

registerHandler('builtin:homework', handler)
```

- [ ] **Step 3: 在 `src/lib/commands/handlers/index.ts` 中追加 import**

在文件末尾追加：

```typescript
import '../../school/commands/set-config'
import '../../school/commands/homework'
```

- [ ] **Step 4: 在 `src/types/napcat.ts` 的 `PlatformConfig` 中追加 `school` 字段**

在 `PlatformConfig` 接口中 `ai: AIConfig` 之后追加：

```typescript
  school?: {
    enabledCommands: boolean
    enabledAI: boolean
  }
```

- [ ] **Step 5: 在 `src/lib/config.ts` 的 `DEFAULT_CONFIG` 中追加 `school` 默认值**

在 `ai: { ... }` 块之后追加：

```typescript
  school: {
    enabledCommands: true,
    enabledAI: true,
  },
```

- [ ] **Step 6: 在 `src/lib/config.ts` 的 `diffConfigs` 中追加 school 字段检测**

在 `diffConfigs` 方法末尾（`return keys` 之前）追加：

```typescript
    if (old.school?.enabledCommands !== curr.school?.enabledCommands) keys.push('school.enabledCommands')
    if (old.school?.enabledAI !== curr.school?.enabledAI) keys.push('school.enabledAI')
```

- [ ] **Step 7: 在 `src/lib/config.ts` 的 `updateConfig` 和 `loadConfig` 中确保 school 被正确合并**

在 `loadConfig` 的 return 语句中追加 school 合并：

```typescript
      school: { ...DEFAULT_CONFIG.school, ...parsed.school },
```

在 `updateConfig` 中追加：

```typescript
      school: { ...this.config.school, ...partial.school },
```

- [ ] **Step 8: 验证编译**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/school/commands/ src/lib/commands/handlers/index.ts src/types/napcat.ts src/lib/config.ts
git commit -m "feat(school): add /set-config and /homework commands with config integration"
```

---

### Task 7: AI Function Calling 工具

**Files:**
- Create: `src/lib/school/tools.ts`
- Modify: `src/lib/ai/tools.ts` — 追加 school tool 执行
- Modify: `src/lib/ai/index.ts` — 合并 SCHOOL_TOOLS 到工具列表

**Consumes:** `queryHomework` (Task 5)
**Produces:** `SCHOOL_TOOLS`, `executeSchoolTool()` — 被 AI 模块调用

- [ ] **Step 1: 创建 `src/lib/school/tools.ts`**

```typescript
// src/lib/school/tools.ts
// 学业助手 — AI function calling 工具

import { queryHomework } from './service'
import type { ToolDefinition, ToolResult } from '@/lib/ai/tools'

export const SCHOOL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'query_homework',
      description: '查询用户当前待提交的作业列表。当用户问"有什么作业"、"作业做完了没"、"查一下作业"、"作业截止时间"时使用。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

export async function executeSchoolTool(
  userId: number,
  toolName: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'query_homework': {
      const result = await queryHomework(String(userId), 'ai')
      return { success: result.success, message: result.message }
    }
    default:
      return { success: false, message: `未知工具: ${toolName}` }
  }
}
```

- [ ] **Step 2: 修改 `src/lib/ai/tools.ts` — 追加 school tool fallback**

在 `executeToolCall` 函数的 `default` 分支中，将：

```typescript
    default:
      return { success: false, message: `未知工具: ${toolName}` }
```

改为：

```typescript
    default: {
      // 尝试 school 工具（动态导入避免循环依赖）
      try {
        const { executeSchoolTool } = await import('@/lib/school/tools')
        return await executeSchoolTool(userId, toolName)
      } catch {
        return { success: false, message: `未知工具: ${toolName}` }
      }
    }
```

注意：`executeToolCall` 函数签名需要改为 `async`（当前不是 async）。将函数改为：

```typescript
export async function executeToolCall(userId: number, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
```

- [ ] **Step 3: 修改 `src/lib/ai/index.ts` — 合并 SCHOOL_TOOLS**

在文件顶部 import 区追加：

```typescript
import { SCHOOL_TOOLS } from '@/lib/school/tools'
```

在 `processAIMessage` 函数中，将 `tools: PROMPT_TOOLS` 改为：

```typescript
    tools: [...PROMPT_TOOLS, ...SCHOOL_TOOLS],
```

- [ ] **Step 4: 验证编译**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/school/tools.ts src/lib/ai/tools.ts src/lib/ai/index.ts
git commit -m "feat(school): add query_homework AI tool and integrate into AI pipeline"
```

---

### Task 8: API 端点

**Files:**
- Create: `src/app/api/school/credentials/route.ts`
- Create: `src/app/api/school/test/route.ts`

**Consumes:** `saveCredentials`, `getCredentials` (Task 3), `CSUSTAdapter` (Task 4)
**Produces:** REST API — 被前端页面 (Task 9) 调用

- [ ] **Step 1: 创建 `src/app/api/school/credentials/route.ts`**

```typescript
// src/app/api/school/credentials/route.ts
import { NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { saveCredentials, getCredentials } from '@/lib/school/credentials'
import { getDefaultSchool, getAdapter } from '@/lib/school/adapters'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 使用一个默认的 admin userId 来获取凭据（Web 端配置用）
    // 实际上 Web 端配置的是管理员的凭据
    const school = getDefaultSchool()
    const adapter = getAdapter(school)

    // 从 cookie 中获取当前登录用户的标识
    // 由于 Web 端是管理员操作，使用 'admin' 作为 userId
    const userId = 'admin'
    const creds = getCredentials(userId, school)

    return NextResponse.json({
      success: true,
      data: {
        school,
        schoolName: adapter?.displayName || school,
        username: creds?.username || '',
        password: creds ? '****' : '',
        hasCredentials: !!creds,
      },
    })
  } catch (error) {
    console.error('[API] Error fetching credentials:', error)
    return NextResponse.json({ success: false, message: 'Failed to fetch credentials' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { school: schoolInput, username, password } = body

    if (!username || !password) {
      return NextResponse.json({ success: false, message: '账号和密码不能为空' }, { status: 400 })
    }

    const school = schoolInput || getDefaultSchool()
    const userId = 'admin'
    saveCredentials(userId, school, username, password)

    return NextResponse.json({ success: true, message: '凭据已保存' })
  } catch (error) {
    console.error('[API] Error saving credentials:', error)
    return NextResponse.json({ success: false, message: 'Failed to save credentials' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 创建 `src/app/api/school/test/route.ts`**

```typescript
// src/app/api/school/test/route.ts
import { NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { getCredentials } from '@/lib/school/credentials'
import { getDefaultSchool, getAdapter } from '@/lib/school/adapters'

export async function POST() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const school = getDefaultSchool()
    const userId = 'admin'
    const creds = getCredentials(userId, school)

    if (!creds) {
      return NextResponse.json({
        success: false,
        message: '请先保存账号密码',
      })
    }

    const adapter = getAdapter(school)
    if (!adapter) {
      return NextResponse.json({
        success: false,
        message: `不支持的学校: ${school}`,
      })
    }

    const session = await adapter.authenticate(creds.username, creds.password)
    if (!session) {
      return NextResponse.json({
        success: false,
        message: '登录失败，请检查账号密码是否正确',
      })
    }

    const realname = (session as Record<string, unknown>).realname as string || creds.username
    return NextResponse.json({
      success: true,
      message: `登录成功，欢迎 ${realname}`,
    })
  } catch (error) {
    console.error('[API] Error testing connection:', error)
    return NextResponse.json({ success: false, message: '连接测试失败' }, { status: 500 })
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/school/
git commit -m "feat(school): add credentials and test connection API endpoints"
```

---

### Task 9: Web 前端页面

**Files:**
- Create: `src/app/(authenticated)/school/page.tsx`
- Modify: `src/components/sidebar.tsx` — 追加学业助手菜单项

**Consumes:** `/api/school/credentials`, `/api/school/test` (Task 8), `/api/config` (existing)
**Produces:** 可交互的学业助手配置页面

- [ ] **Step 1: 在 `src/components/sidebar.tsx` 的 `NAV_ITEMS` 中追加菜单项**

在 `settings` 之前插入：

```typescript
  { href: '/school', label: '学业助手', icon: '📚' },
```

- [ ] **Step 2: 创建 `src/app/(authenticated)/school/page.tsx`**

```typescript
// src/app/(authenticated)/school/page.tsx
'use client'

import { useEffect, useState } from 'react'

export default function SchoolPage() {
  const [enabledCommands, setEnabledCommands] = useState(true)
  const [enabledAI, setEnabledAI] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [hasCredentials, setHasCredentials] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveMsg, setSaveMsg] = useState('')

  // 加载配置
  useEffect(() => {
    // 加载功能开关
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.school) {
          setEnabledCommands(data.data.school.enabledCommands !== false)
          setEnabledAI(data.data.school.enabledAI !== false)
        }
      })
      .catch(() => {})

    // 加载凭据
    fetch('/api/school/credentials')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setSchoolName(data.data.schoolName || '')
          setUsername(data.data.username || '')
          setHasCredentials(data.data.hasCredentials || false)
        }
      })
      .catch(() => {})
  }, [])

  // 保存功能开关
  async function handleToggleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school: { enabledCommands, enabledAI },
        }),
      })
      const data = await resp.json()
      setSaveMsg(data.success ? '✅ 开关配置已保存' : '❌ 保存失败')
    } catch {
      setSaveMsg('❌ 保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 保存凭据
  async function handleCredentialsSave() {
    if (!username || !password) {
      setSaveMsg('❌ 账号和密码不能为空')
      return
    }
    setSaving(true)
    setSaveMsg('')
    try {
      const resp = await fetch('/api/school/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await resp.json()
      if (data.success) {
        setSaveMsg('✅ 账号密码已保存')
        setHasCredentials(true)
      } else {
        setSaveMsg(`❌ ${data.message || '保存失败'}`)
      }
    } catch {
      setSaveMsg('❌ 保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 测试连接
  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('/api/school/test', { method: 'POST' })
      const data = await resp.json()
      setTestResult(data)
    } catch {
      setTestResult({ success: false, message: '连接测试失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📚 学业助手</h1>
        <p className="text-muted-foreground mt-1">配置学校平台账号，查询待提交作业</p>
      </div>

      {/* 功能开关 */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">功能开关</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabledCommands}
            onChange={e => setEnabledCommands(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <div className="text-sm font-medium">允许命令查询</div>
            <div className="text-xs text-muted-foreground">用户可通过 /homework 命令查询作业</div>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabledAI}
            onChange={e => setEnabledAI(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <div className="text-sm font-medium">允许 AI 查询</div>
            <div className="text-xs text-muted-foreground">AI 对话中可自动查询作业</div>
          </div>
        </label>

        <button
          onClick={handleToggleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存开关配置'}
        </button>
      </div>

      {/* 账号配置 */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">账号配置</h2>

        <div>
          <label className="text-sm font-medium">学校</label>
          <input
            type="text"
            value={schoolName}
            disabled
            className="mt-1 w-full px-3 py-2 border rounded-md bg-muted text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium">账号（学号）</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="请输入学号"
            className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium">密码</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={hasCredentials ? '已设置（留空不修改）' : '请输入密码'}
            className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCredentialsSave}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存账号密码'}
          </button>

          <button
            onClick={handleTest}
            disabled={testing || !hasCredentials}
            className="px-4 py-2 border rounded-md text-sm font-medium disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
        </div>

        {testResult && (
          <div className={`p-3 rounded-md text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.message}
          </div>
        )}
      </div>

      {/* 状态提示 */}
      {saveMsg && (
        <div className="p-3 rounded-md text-sm bg-blue-50 text-blue-700">
          {saveMsg}
        </div>
      )}

      {/* 使用说明 */}
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="text-lg font-semibold">使用说明</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>📌 命令方式：发送 <code className="bg-muted px-1 rounded">/set-config &lt;账号&gt; &lt;密码&gt;</code> 配置账号</p>
          <p>📌 命令方式：发送 <code className="bg-muted px-1 rounded">/homework</code> 查询作业</p>
          <p>📌 AI 方式：直接对 AI 说"查一下作业"即可自动查询</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 验证编译**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(authenticated\)/school/page.tsx src/components/sidebar.tsx
git commit -m "feat(school): add school assistant web page and sidebar navigation"
```

---

### Task 10: 自测验证

- [ ] **Step 1: 完整编译检查**

```bash
npm run build 2>&1
```

Expected: 编译成功，无错误

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

Expected: 服务启动在 http://localhost:8090

- [ ] **Step 3: 验证 Web 页面**

浏览器访问 http://localhost:8090/school，检查：
- 侧边栏显示「📚 学业助手」
- 功能开关可切换
- 账号密码输入框可填写
- 保存按钮可点击
- 测试连接按钮可点击

- [ ] **Step 4: 验证命令（模拟）**

在 QQ 中发送：
- `/set-config 202301150520 Xh@20050109` → 应返回配置成功消息
- `/set-config` → 应显示当前配置（密码脱敏）
- `/homework` → 应返回作业列表或错误提示

- [ ] **Step 5: 验证 AI 工具**

在 AI 对话中发送"查一下作业"，检查是否触发 `query_homework` 工具。

- [ ] **Step 6: 验证开关拒绝**

在 Web 端关闭「允许命令查询」开关，再发送 `/homework`，应返回"功能已关闭"错误。

- [ ] **Step 7: 最终 Commit**

```bash
git add -A
git commit -m "feat(school): complete homework query feature with commands, AI tools, and web UI"
```
