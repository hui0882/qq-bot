# 学业助手 — 作业查询功能设计文档

> 日期：2026-07-01
> 状态：已批准
> 分支：feature/school-homework-query

## 1. 概述

将 CSUST（长沙理工大学）作业查询 Python 脚本移植为 TypeScript，集成到 NapCat 管理平台中。支持通过 `/` 命令和 AI function calling 两种方式查询待提交作业。采用可扩展的适配器架构，便于后续接入其他学校。

### 核心需求

- 两个 `/` 命令：`/set-config`（配置账号密码）和 `/homework`（查询作业）
- AI function calling tool：`query_homework`（仅查询，不支持 AI 配置账号）
- 每个用户的账号密码独立存储在 SQLite 中
- 系统级开关控制命令和 AI 功能的启用/禁用
- Web 端独立页面管理配置（侧边栏「学业助手」）

## 2. 模块结构

```
src/lib/school/
├── types.ts              # SchoolAdapter 接口、通用类型定义
├── service.ts            # 统一服务层（开关校验、调度适配器、session 缓存）
├── credentials.ts        # 凭据 CRUD（school_credentials 表）
├── adapters/
│   ├── index.ts          # 适配器注册表 Map<string, SchoolAdapter>
│   └── csust.ts          # CSUST 适配器（完整转写 Python 脚本）
├── commands/
│   ├── set-config.ts     # /set-config 命令处理器
│   └── homework.ts       # /homework 命令处理器
└── tools.ts              # AI function calling 工具定义 + 执行
```

### 前端

```
src/app/(authenticated)/school/
└── page.tsx              # 学业助手页面（开关 + 账号配置）

src/app/api/school/
├── credentials/route.ts  # 凭据 CRUD API
└── test/route.ts         # 测试登录连接 API
```

## 3. 适配器接口

```typescript
// src/lib/school/types.ts

/** 学校适配器的认证会话数据 */
export interface SchoolSession {
  school: string
  [key: string]: unknown  // 各适配器自定义（如 cookie、session token）
}

/** 作业项 */
export interface HomeworkItem {
  title: string           // 作业标题
  courseName: string      // 课程名称
  startTime: string       // 开始时间
  deadline: string        // 截止时间
  remainingText: string   // 剩余时间文字（"🔴 仅剩 5 小时"）
  detail?: string         // 截止 < 3 天时获取的详细内容
}

/** 学校适配器接口 */
export interface SchoolAdapter {
  name: string            // 内部标识，如 'csust'
  displayName: string     // 显示名称，如 '长沙理工大学'

  /**
   * 认证：使用账号密码登录，返回 session 数据
   * 登录失败返回 null
   */
  authenticate(username: string, password: string): Promise<SchoolSession | null>

  /**
   * 查询：使用已有 session 获取待提交作业列表
   * session 过期/无效时抛出 SessionExpiredError
   */
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

## 4. CSUST 适配器

完整转写 Python 脚本 `csust_homework_checker.py` 的逻辑，使用原生 `fetch` + `AbortSignal.timeout()` 实现。

### API 流程

1. **获取 SessionId** — `POST /mobile/getSessionId.do`
   - 请求体：`deviceUuid`, `appVersion`, `devicePlatform`, `deviceVersion`, `deviceName`
   - 响应：`{ status: 1, sessionid: "..." }`
   - 将 JSESSIONID 存入 cookie

2. **登录** — `POST /mobile/login_check.do`
   - 请求体：`j_username`, `j_password`（MD5 加密）, 设备信息
   - 响应：`{ status: 1, datas: { userinfo: { user: { realname } } } }`

3. **获取作业列表** — `POST /mobile/hw/stu/findStuUnDoHwTaskList.do`
   - 请求体：`{ context: "" }`
   - 响应：`{ status: 1, datas: { hwtList: [...] } }`

4. **获取作业详情** — `POST /mobile/hw/stu/hwStuSubmit.do`
   - 请求体：`{ hwtId, courseId }`
   - 响应：`{ status: 1, datas: { content: "HTML内容" } }`
   - 去除 HTML 标签，解码实体

### 密码加密

```typescript
import { createHash } from 'crypto'
function encryptPassword(password: string): string {
  return createHash('md5').update(password).digest('hex').toLowerCase()
}
```

### 格式化输出

复用 Python 脚本的 `format_homework_message` 逻辑：
- 无作业：`🎉 当前没有待提交的作业，可以放心休息！`
- 有作业：按截止时间排序，显示课程名、开始/截止时间、剩余天数
- 截止 < 3 天的作业自动获取详细内容
- 紧急程度标识：⛔ 已过期 / 🔴 < 24h / 🟠 < 72h / 🟡 其他

## 5. 凭据存储

### 数据库表

```sql
CREATE TABLE IF NOT EXISTS school_credentials (
  user_id TEXT NOT NULL,      -- QQ ID
  school TEXT NOT NULL,        -- 学校标识，如 'csust'
  username TEXT NOT NULL,      -- 学号
  password TEXT NOT NULL,      -- 明文密码（暂不加密）
  updated_at INTEGER NOT NULL, -- 更新时间戳
  PRIMARY KEY (user_id, school)
)
```

在 `src/lib/db/index.ts` 的 `initDatabase()` 中追加建表语句。

### CRUD 函数（`credentials.ts`）

```typescript
saveCredentials(userId: string, school: string, username: string, password: string): void
getCredentials(userId: string, school: string): { username: string; password: string } | null
deleteCredentials(userId: string, school: string): void
```

### Session 缓存

- 内存 `Map<string, SchoolSession>`，key 为 `${userId}:${school}`
- 不持久化到数据库，服务重启后需重新认证
- 认证失败时自动清除对应缓存

## 6. 服务层

`src/lib/school/service.ts` 提供统一的查询服务：

### 开关检查

```typescript
function checkServiceEnabled(userId: string, channel: 'command' | 'ai'): void
// channel='command' → 检查 school.enabledCommands
// channel='ai' → 检查 school.enabledAI
// 关闭时抛出 ServiceDisabledError（系统级拒绝，非提示词级）
```

### 主查询流程

```typescript
async function queryHomework(
  userId: string,
  channel: 'command' | 'ai'
): Promise<{ success: boolean; message: string }>
```

流程：
1. `checkServiceEnabled(userId, channel)` — 系统级开关检查
2. `getCredentials(userId, 'csust')` — 获取凭据
3. 查找适配器（当前只有 CSUST）
4. 检查 session 缓存 → 有则复用，无则 `authenticate()`
5. `fetchHomework(session)` → 格式化输出
6. `SessionExpiredError` → 清除缓存，重新认证一次
7. 认证仍失败 → 返回错误提示

## 7. 命令系统

### 命令定义

在 `src/lib/config.ts` 的 `DEFAULT_CONFIG.commands.definitions` 中注册：

```typescript
{
  name: 'set-config',
  description: '配置学校平台账号密码',
  usage: '/set-config <账号> <密码>',
  enabled: true,
  handler: 'builtin:set-homework-config',
  args: [
    { name: 'username', required: true, description: '学号/用户名' },
    { name: 'password', required: true, description: '密码' },
  ],
},
{
  name: 'homework',
  description: '查询待提交作业',
  usage: '/homework',
  enabled: true,
  handler: 'builtin:homework',
}
```

### `/set-config` 命令处理器

```typescript
// src/lib/school/commands/set-config.ts
registerHandler('builtin:set-homework-config', async (ctx) => {
  const [username, password] = ctx.args
  // 无参数：显示当前配置（密码脱敏）
  // 有参数：保存凭据，回复确认
})
```

- 无参数时：显示当前配置的学校和账号（密码显示 `****`）
- 有参数时：保存到 `school_credentials` 表，回复确认信息
- 回复示例：`✅ 学校平台账号已配置！\n📖 学校：长沙理工大学\n👤 账号：202301150****`

### `/homework` 命令处理器

```typescript
// src/lib/school/commands/homework.ts
registerHandler('builtin:homework', async (ctx) => {
  // 调用 service.queryHomework(userId, 'command')
  // 根据结果返回格式化消息
})
```

错误处理：
- 未配置凭据：`❌ 请先使用 /set-config <账号> <密码> 配置学校平台账号`
- 登录失败：`❌ 登录失败，请检查账号密码是否正确。\n使用 /set-config <账号> <密码> 重新配置`
- 功能关闭：`❌ 作业查询功能已关闭，请联系管理员开启`

### Handler 注册

在 `src/lib/commands/handlers/index.ts` 中追加：
```typescript
import '../../school/commands/set-config'
import '../../school/commands/homework'
```

## 8. AI Function Calling

### 工具定义（`tools.ts`）

仅注册一个工具 — `query_homework`：

```typescript
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
```

### 工具执行

```typescript
export async function executeSchoolTool(
  userId: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (toolName) {
    case 'query_homework':
      return await queryHomework(String(userId), 'ai')
    default:
      return { success: false, message: `未知工具: ${toolName}` }
  }
}
```

### 集成到 AI 模块

在 `src/lib/ai/index.ts` 的 `processAIMessage` 中：
- 合并 `SCHOOL_TOOLS` 到工具列表
- 在 `executeToolCall` 中调用 `executeSchoolTool`

在 `src/lib/ai/tools.ts` 的 `executeToolCall` 中追加：
```typescript
import { executeSchoolTool } from '@/lib/school/tools'
// 在 switch 中 fallback 到 executeSchoolTool
```

## 9. 配置扩展

### PlatformConfig 新增字段

```typescript
// src/types/napcat.ts
export interface PlatformConfig {
  // ... 现有字段 ...
  school?: {
    enabledCommands: boolean  // 是否允许通过命令查询作业
    enabledAI: boolean        // 是否允许通过 AI 查询作业
  }
}
```

### 默认值

```typescript
// src/lib/config.ts DEFAULT_CONFIG
school: {
  enabledCommands: true,
  enabledAI: true,
},
```

### diffConfigs 扩展

在 `ConfigManager.diffConfigs` 中追加：
```typescript
if (old.school?.enabledCommands !== curr.school?.enabledCommands) keys.push('school.enabledCommands')
if (old.school?.enabledAI !== curr.school?.enabledAI) keys.push('school.enabledAI')
```

## 10. Web 界面

### 侧边栏

在 `src/components/sidebar.tsx` 的 `NAV_ITEMS` 中新增：
```typescript
{ href: '/school', label: '学业助手', icon: '📚' },
```

### 页面（`/school`）

`src/app/(authenticated)/school/page.tsx` — `'use client'` 组件

**布局：**
1. **功能开关区**
   - 「允许命令查询」开关 → `school.enabledCommands`
   - 「允许 AI 查询」开关 → `school.enabledAI`
   
2. **账号配置区**
   - 学校选择（当前只有「长沙理工大学」，disabled 下拉框）
   - 账号输入框
   - 密码输入框（MaskedInput 组件）
   - 保存按钮 + 测试连接按钮

### API 端点

**`GET /api/school/credentials`**
- 需要 auth 验证
- 返回当前用户的凭据（密码脱敏为 `****`）
- 响应：`{ school: 'csust', username: '202301150520', password: '****' }`

**`POST /api/school/credentials`**
- 需要 auth 验证
- 请求体：`{ school: 'csust', username: '...', password: '...' }`
- 保存到 `school_credentials` 表

**`POST /api/school/test`**
- 需要 auth 验证
- 使用保存的凭据尝试登录
- 响应：`{ success: true, message: '登录成功，欢迎 xxx' }` 或 `{ success: false, message: '登录失败' }`

## 11. 文件变更清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `src/lib/school/types.ts` | 接口和类型定义 |
| `src/lib/school/service.ts` | 统一服务层 |
| `src/lib/school/credentials.ts` | 凭据 CRUD |
| `src/lib/school/adapters/index.ts` | 适配器注册表 |
| `src/lib/school/adapters/csust.ts` | CSUST 适配器 |
| `src/lib/school/commands/set-config.ts` | /set-config 命令 |
| `src/lib/school/commands/homework.ts` | /homework 命令 |
| `src/lib/school/tools.ts` | AI 工具定义+执行 |
| `src/app/(authenticated)/school/page.tsx` | 学业助手页面 |
| `src/app/api/school/credentials/route.ts` | 凭据 API |
| `src/app/api/school/test/route.ts` | 测试连接 API |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/lib/db/index.ts` | `initDatabase()` 追加 `school_credentials` 建表 |
| `src/lib/config.ts` | `DEFAULT_CONFIG` 追加 `school` 配置、`diffConfigs` 扩展 |
| `src/types/napcat.ts` | `PlatformConfig` 追加 `school` 字段 |
| `src/lib/commands/handlers/index.ts` | 追加 import 两个新 handler |
| `src/lib/ai/tools.ts` | 追加 school tools 导入和执行 |
| `src/lib/ai/index.ts` | 合并 `SCHOOL_TOOLS` 到工具列表 |
| `src/components/sidebar.tsx` | `NAV_ITEMS` 追加学业助手 |

### 删除文件

无。`csust_homework_checker.py` 保留在项目根目录作为参考。

## 12. 验收标准

1. `/set-config <账号> <密码>` 成功保存凭据，无参数显示当前配置
2. `/homework` 成功查询并格式化输出待提交作业
3. 凭据错误时提示重新配置
4. AI 对话中说"查作业"能触发 `query_homework` 工具
5. Web `/school` 页面可配置开关和账号密码
6. 开关关闭时系统级拒绝（命令和 AI 都不可用）
7. 未配置凭据时提示先配置
