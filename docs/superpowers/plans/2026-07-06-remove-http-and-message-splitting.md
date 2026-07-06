# 移除 HTTP 配置 + 分段消息发送 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 HTTP API 相关代码，优化 AI 回复为分段消息发送

**Architecture:** 两个独立功能可并行开发。功能一清理 HTTP 相关代码（UI、客户端、类型、配置）。功能二新建 message-splitter 模块，改造 prompt 和 voice-reply 实现分段发送。

**Tech Stack:** Next.js, TypeScript, WebSocket (napcat-ws), OpenAI-compatible LLM API

## Global Constraints

- 所有通信仅通过 WebSocket（`napcat-ws.ts`）
- 分段仅应用于 AI 对话，命令和定时任务保持整条发送
- 语音和文字回复都支持分段
- 实施后需全面自测确保无功能回退

---

## 并行开发说明

本计划包含两个独立功能，建议使用两个 agent 并行开发：

- **Agent 1**：Task 1-3（移除 HTTP 相关代码）
- **Agent 2**：Task 4-6（分段消息发送）
- **合并后**：Task 7（集成自测）

---

## Task 1: 移除 HTTP API 客户端

**Files:**
- Delete: `src/lib/napcat-api.ts`

**Interfaces:**
- 无依赖，独立删除

- [ ] **Step 1: 确认无其他模块引用 napcatApi**

```bash
grep -r "napcatApi\|napcat-api" src/ --include="*.ts" --include="*.tsx" | grep -v "napcat-api.ts"
```

Expected: 无输出（如果发现引用，需要先改为走 WS）

- [ ] **Step 2: 删除 HTTP 客户端文件**

```bash
rm src/lib/napcat-api.ts
```

- [ ] **Step 3: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功，无 napcat-api 相关错误

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: 移除 HTTP API 客户端 napcat-api.ts"
```

---

## Task 2: 移除设置页面 HTTP API 区块

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`

**Interfaces:**
- 移除 Config 接口中的 `api` 字段
- 移除 HTTP API 配置 UI 区块（约 248-258 行）

- [ ] **Step 1: 移除 Config 接口中的 api 字段**

在 `src/app/(authenticated)/settings/page.tsx` 中，找到 Config 接口定义（约第 6-39 行），移除 `api: { url: string; token: string }` 这一行。

```typescript
// 移除此行：
api: { url: string; token: string }
```

- [ ] **Step 2: 移除 HTTP API UI 区块**

找到 `{/* HTTP API */}` 注释开始的整个区块（约 248-258 行），从 `<div className="rounded-lg border p-6 space-y-4">` 到对应的 `</div>`，整块删除。

```tsx
// 删除以下区块：
{/* HTTP API */}
<div className="rounded-lg border p-6 space-y-4">
  <h2 className="text-lg font-semibold">HTTP API</h2>
  ...（整个 div 块）
</div>
```

- [ ] **Step 3: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add src/app/\(authenticated\)/settings/page.tsx
git commit -m "refactor: 移除设置页面 HTTP API 配置区块"
```

---

## Task 3: 清理类型定义和配置管理中的 HTTP 相关代码

**Files:**
- Modify: `src/types/napcat.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/app/api/config/route.ts`

**Interfaces:**
- `PlatformConfig` 移除 `api` 字段
- `configManager` 移除 `api` 相关默认值和 diff 逻辑
- Config API 路由移除 `api` 字段处理

- [ ] **Step 1: 修改 PlatformConfig 类型**

在 `src/types/napcat.ts` 中找到 `PlatformConfig` 接口（约 232-250 行），移除 `api` 字段：

```typescript
export interface PlatformConfig {
  ws: {
    url: string
    token: string
    reconnect: boolean
    reconnectInterval: number
    maxReconnectInterval: number
  }
  // 移除 api 字段
  tts: {
    // ... 保持不变
  }
  // ... 其他字段保持不变
}
```

- [ ] **Step 2: 修改 config.ts 默认配置**

在 `src/lib/config.ts` 中找到默认配置（约 30-36 行），移除 `api` 相关默认值：

```typescript
// 移除：
api: {
  url: '',
  token: '',
},
```

- [ ] **Step 3: 修改 config.ts diffConfigs 方法**

在 `src/lib/config.ts` 的 `diffConfigs` 方法中（约 261-262 行），移除 `api` 相关的 diff 逻辑：

```typescript
// 移除：
if (old.api?.url !== curr.api?.url) keys.push('api.url')
if (old.api?.token !== curr.api?.token) keys.push('api.token')
```

- [ ] **Step 4: 修改 config API 路由**

在 `src/app/api/config/route.ts` 中（约 34-41 行），移除 `api` 字段的特殊处理逻辑：

```typescript
// 移除：
if (body.api) {
  const api = body.api as Record<string, unknown>
  const apiClean: Record<string, unknown> = { ...api }
  if (api.token === '***' || api.token === '••••••••' || api.token === undefined) {
    delete apiClean.token
  }
  safePartial.api = apiClean
}
```

- [ ] **Step 5: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功

- [ ] **Step 6: 提交**

```bash
git add src/types/napcat.ts src/lib/config.ts src/app/api/config/route.ts
git commit -m "refactor: 清理类型定义和配置管理中的 HTTP 相关代码"
```

---

## Task 4: 新建 message-splitter 模块

**Files:**
- Create: `src/lib/message-splitter.ts`

**Interfaces:**
- 供 Task 5 和 Task 6 使用

```typescript
/**
 * 消息分段发送模块
 * 将 AI 回复按分隔符拆分为多段，支持动态延迟发送
 */

/** 分隔符常量 */
const SEGMENT_DELIMITER = '|||'

/**
 * 按分隔符拆分消息
 * @param text AI 回复的完整文本
 * @returns 拆分后的消息段数组（过滤空段）
 */
export function splitMessage(text: string): string[] {
  const segments = text
    .split(SEGMENT_DELIMITER)
    .map(s => s.trim())
    .filter(s => s.length > 0)
  return segments
}

/**
 * 计算动态延迟（毫秒）
 * 公式: clamp(字符数 × 50ms, 1000ms, 5000ms)
 * @param text 消息文本
 * @returns 延迟毫秒数
 */
export function calculateDelay(text: string): number {
  const charCount = text.length
  const delay = charCount * 50
  return Math.max(1000, Math.min(5000, delay))
}

/**
 * 延迟等待
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

- [ ] **Step 1: 创建 message-splitter.ts**

创建文件 `src/lib/message-splitter.ts`，写入上述代码。

- [ ] **Step 2: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/lib/message-splitter.ts
git commit -m "feat: 新建 message-splitter 消息分段模块"
```

---

## Task 5: 改造 system prompt 增加分段指示

**Files:**
- Modify: `src/lib/ai/prompt.ts`

**Interfaces:**
- `buildSystemPrompt` 函数返回的 system prompt 增加分段规则

- [ ] **Step 1: 修改 buildSystemPrompt 函数**

在 `src/lib/ai/prompt.ts` 中，修改 text 模式的返回值，增加分段规则：

```typescript
export function buildSystemPrompt(
  replyType: 'text' | 'voice',
  customSystemPrompt?: string,
): ChatMessage {
  const base = customSystemPrompt || '你是一个友好、有帮助的 AI 助手。请用中文回复。'

  // 分段规则（文字和语音都适用）
  const splitRules = '\n\n回复规则：\n' +
    '1. 第一条回复要体现关心和快速应答，表达你正在认真帮助对方\n' +
    '2. 之后用 ||| 分隔符将主要内容拆分为多条消息\n' +
    '3. 每条消息应该是一个完整的思维单元，像人发消息一样自然'

  if (replyType === 'voice') {
    return {
      role: 'system',
      content: `${base}\n\n你的回复将通过语音播报，请遵守以下规则：\n` +
        '1. 回复简洁干净，控制在 100 字以内\n' +
        '2. 不使用 markdown 格式、代码块、列表符号\n' +
        '3. 不使用括号注释、表情符号\n' +
        '4. 语句通顺自然，适合朗读\n' +
        '5. 直接回答问题，不要说"好的""没问题"等开场白' +
        splitRules,
    }
  }

  return {
    role: 'system',
    content: base + splitRules,
  }
}
```

- [ ] **Step 2: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add src/lib/ai/prompt.ts
git commit -m "feat: system prompt 增加分段指示规则"
```

---

## Task 6: 改造 voice-reply 实现分段发送

**Files:**
- Modify: `src/lib/voice-reply.ts`

**Interfaces:**
- 消费: `splitMessage`, `calculateDelay`, `sleep` from `message-splitter.ts`
- 改造: `handleVoiceReply` 中的发送逻辑

- [ ] **Step 1: 添加 import**

在 `src/lib/voice-reply.ts` 顶部添加：

```typescript
import { splitMessage, calculateDelay, sleep } from './message-splitter'
```

- [ ] **Step 2: 新增分段发送函数**

在 `sendVoiceReply` 函数之后添加新函数：

```typescript
/**
 * 分段发送文字消息
 * 首段立即发送，后续段按动态延迟发送
 */
async function sendTextReplySplit(userId: number, text: string): Promise<void> {
  const segments = splitMessage(text)

  // 如果没有分隔符，fallback 为整条发送
  if (segments.length <= 1) {
    await sendTextReply(userId, text)
    return
  }

  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const delay = calculateDelay(segments[i])
      await sleep(delay)
    }
    await sendTextReply(userId, segments[i])
  }
}

/**
 * 分段发送语音消息
 * 首段立即发送，后续段按动态延迟发送
 */
async function sendVoiceReplySplit(userId: number, text: string): Promise<void> {
  const segments = splitMessage(text)

  // 如果没有分隔符，fallback 为整条发送
  if (segments.length <= 1) {
    await sendVoiceReply(userId, text)
    return
  }

  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const delay = calculateDelay(segments[i])
      await sleep(delay)
    }
    await sendVoiceReply(userId, segments[i])
  }
}
```

- [ ] **Step 3: 修改 handleVoiceReply 发送逻辑**

在 `handleVoiceReply` 函数末尾（约 212-216 行），将原来的直接发送改为分段发送：

```typescript
// 修改前：
if (replyType === 'voice') {
  await sendVoiceReply(userId, response.content)
} else {
  await sendTextReply(userId, response.content)
}

// 修改后：
if (replyType === 'voice') {
  await sendVoiceReplySplit(userId, response.content)
} else {
  await sendTextReplySplit(userId, response.content)
}
```

- [ ] **Step 4: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add src/lib/voice-reply.ts
git commit -m "feat: 实现 AI 回复分段发送"
```

---

## Task 7: 集成自测

**Files:**
- 无新建/修改文件，仅测试

**Interfaces:**
- 验证所有改动的功能完整性

- [ ] **Step 1: 确认构建通过**

```bash
npm run build 2>&1 | tail -20
```

Expected: 构建成功，无错误

- [ ] **Step 2: 启动服务并测试 HTTP 移除**

```bash
npm run dev
```

手动验证：
1. 打开设置页面，确认 HTTP API 区块已消失
2. 确认 WebSocket 配置正常显示
3. 确认其他配置项（TTS、AI、语音回复等）正常

- [ ] **Step 3: 测试分段消息发送**

手动验证：
1. 发送一条 AI 对话消息
2. 确认收到多条分段回复（而非一条完整回复）
3. 确认首条回复快速到达
4. 确认后续回复有明显延迟
5. 测试语音回复是否也分段发送

- [ ] **Step 4: 测试 fallback 逻辑**

手动验证：
1. 如果 AI 未使用 `|||` 分隔符，确认消息作为单条发送（不丢失）
2. 确认命令回复（`/` 开头）保持整条发送

- [ ] **Step 5: 测试定时任务不受影响**

手动验证：
1. 触发一个定时任务
2. 确认结果消息为整条发送（非分段）

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "chore: 完成 HTTP 移除和分段消息发送功能自测"
```
