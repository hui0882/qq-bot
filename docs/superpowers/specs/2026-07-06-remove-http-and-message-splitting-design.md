# 移除 HTTP 配置 + 分段消息发送 设计文档

## 概述

两个独立功能：
1. 完全移除项目中的 HTTP 请求相关代码，仅保留 WebSocket 通信
2. 优化 AI 回复体验，将整条回复拆分为多段消息发送，模拟人类聊天节奏

## 功能一：移除 HTTP 相关代码

### 目标

项目已全面采用 WebSocket，HTTP API 配置和客户端代码不再需要。

### 涉及文件

| 文件 | 操作 |
|---|---|
| `src/lib/napcat-api.ts` | 整个删除 |
| `src/app/(authenticated)/settings/page.tsx` | 移除 "HTTP API" 配置区块 |
| `src/types/napcat.ts` | 从 `PlatformConfig` 移除 `api` 字段 |
| `src/lib/config.ts` | 移除 `api` 相关默认值、diff 逻辑、热重载监听 |
| `src/app/api/config/route.ts` | 移除 `api` 字段的特殊处理逻辑 |

### 注意事项

- 实施后需全面自测，确保其他业务功能不受影响
- 已有的 `data/config.json` 中的 `api` 字段在读取时忽略，不需要迁移脚本
- 确认无其他模块引用 `napcatApi`（HTTP 客户端），如有需改为走 WS

## 功能二：分段消息发送

### 目标

将 AI 回复从一次性发送改为分段发送，提升聊天体验：
- 首条消息快速响应，体现关心
- 后续消息按思维单元拆分，带动态延迟

### 范围

- **适用**：AI 对话（`voice-reply.ts` 中的 `handleVoiceReply`）
- **不适用**：命令回复（`/` 开头）、定时任务结果

### 分段策略

**Prompt 指示**：在 system prompt 中增加规则，指示 AI 用 `|||` 分隔符划分消息段。

```
回复规则：
1. 第一条回复要体现关心和快速应答，表达你正在认真帮助对方
2. 之后用 ||| 分隔符将主要内容拆分为多条消息
3. 每条消息应该是一个完整的思维单元，像人发消息一样自然
```

**分段解析**：按 `|||` 分隔符拆分，过滤空段。

**Fallback 逻辑**：如果 AI 回复中没有 `|||` 分隔符（AI 未遵守规则），则：
- 整条回复作为单条消息发送（保持现有行为）
- 不会因为解析失败导致消息丢失或异常

### 延迟策略

```
延迟 = clamp(字符数 × 50ms, 1000ms, 5000ms)
```

示例：
- 10 字符 → 500ms → clamp 到 1000ms
- 30 字符 → 1500ms
- 100 字符 → 5000ms（封顶）

### 发送流程

```
AI 回复完整文本
  → message-splitter 按 "|||" 拆分
  → segments[0]: 立即发送（首条快速响应）
  → segments[1]: 延迟 len×50ms 后发送
  → segments[2]: 延迟 len×50ms 后发送
  → ...
```

### 语音模式

每段分别 TTS 转语音后发送，延迟逻辑与文字模式相同。

### 新建模块

**`src/lib/message-splitter.ts`**

职责：
1. `splitMessage(text: string): string[]` — 按分隔符拆分消息
2. `calculateDelay(text: string): number` — 计算动态延迟（毫秒）
3. `sendMessageSegments(userId, segments, sendFn, isVoice)` — 按序发送消息段，带延迟

### 改造文件

| 文件 | 改动 |
|---|---|
| `src/lib/voice-reply.ts` | `handleVoiceReply` 中调用分段发送逻辑 |
| `src/lib/ai/prompt.ts` | system prompt 增加分段指示规则 |
| `src/lib/message-splitter.ts` | 新建，分段和延迟逻辑 |

## 验收标准

1. Web 设置页面不再显示 HTTP API 配置区块
2. 后端无 HTTP 客户端代码，所有通信走 WebSocket
3. AI 对话回复自动分段发送，首条快速响应
4. 后续消息带动态延迟，模拟人类聊天节奏
5. 语音回复也支持分段发送
6. 命令回复和定时任务不受影响，保持整条发送
7. 全量自测通过，无功能回退
