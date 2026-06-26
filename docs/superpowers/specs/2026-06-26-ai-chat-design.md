# AI 聊天能力设计

**日期**: 2026-06-26
**状态**: 待审批

## 目标

为 NapCat 管理平台接入 AI 聊天能力，实现私聊消息自动 AI 回复，支持文本和语音两种输出方式。

## 范围

- 本次：跑通 AI 底座、基本问答、文本/语音回复、上下文记忆（10 轮）、AI 日志、设置页面
- 后续：工具调用、语调优化、上下文压缩/摘要、平台 UI 展示

## 架构

管道式处理，每层独立可替换：

```
收到私聊消息
  → 命令检测（已有 voice-reply.ts）
  → AI 管道：
      1. 上下文构建 — 从 JSON 读取最近 10 轮有效对话
      2. 系统提示词 — 根据回复模式（文本/语音）构建 system prompt
      3. 模型调用 — 纯函数：(messages, config) → response
      4. 响应处理 — 提取文本，判断是否需要后续处理
      5. 发送回复 — 文本直接发 / 语音走 TTS
      6. 记录上下文 — 写入 JSON
```

## 文件结构

```
src/lib/ai/
  ├── index.ts          # AI 管道入口，串联各模块
  ├── llm-client.ts     # 模型调用（OpenAI 兼容格式）
  ├── context.ts        # 上下文存储（JSON）+ 读写
  ├── prompt.ts         # 系统提示词构建
  └── types.ts          # AI 相关类型定义
```

## 配置

在 `config.json` 中新增 `ai` 字段：

```json
{
  "ai": {
    "enabled": false,
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "",
    "model": "gpt-4o",
    "maxTokens": 2048,
    "temperature": 0.7,
    "maxContextRounds": 10,
    "defaultReplyType": "text",
    "debugContext": false,
    "fileReplyEnabled": false
  }
}
```

- `defaultReplyType`: `"text"` | `"voice"` — 全局默认回复方式。用户可通过 `/response-type` 命令覆盖（复用已有机制）
- `debugContext`: 开启时在 AI 日志中记录发送给模型的完整上下文
- `fileReplyEnabled`: 收到文件时是否触发 AI 回复

## 上下文存储

文件：`data/ai-context.json`

```json
{
  "conversations": {
    "<userId>": {
      "messages": [
        { "role": "user", "content": "你好", "timestamp": 1719379200000 },
        { "role": "assistant", "content": "你好！有什么可以帮你的？", "timestamp": 1719379201000 }
      ],
      "lastUpdated": 1719379201000
    }
  }
}
```

有效对话过滤规则：
- 排除 `/` 开头的命令消息（用户发送的命令）
- 排除命令的回复消息（系统对命令的响应，如 `/help` 的返回结果）
- 排除工具调用相关消息（后续扩展点）
- 保留最近 N 轮有效对话（默认 10）
- 每轮 = 1 条 user + 1 条 assistant
- 无效消息（命令+命令回复）不计入轮数，也不写入上下文

## 模型调用（llm-client.ts）

纯函数，无副作用：

```typescript
interface LLMRequest {
  messages: ChatMessage[]   // system + context + user
  config: AIConfig
}

interface LLMResponse {
  content: string           // 模型回复文本
  usage?: { prompt: number; completion: number }
  finishReason?: string
}

async function callLLM(request: LLMRequest): Promise<LLMResponse>
```

- 使用 `fetch` 直接调用 OpenAI 兼容 API
- 不依赖任何第三方 SDK
- 错误处理：超时（30s）、API 错误、网络异常 → 返回错误消息文本

## 系统提示词（prompt.ts）

根据回复类型构建不同的 system prompt：

```typescript
function buildSystemPrompt(replyType: 'text' | 'voice'): ChatMessage
```

- 文本模式：正常对话提示词
- 语音模式：额外要求回复简短干净、适合语音播报、控制在 100 字以内
- 后续版本可通过配置自定义 system prompt

## 日志

在现有 Logger 中新增 `ai` 类型：

```typescript
interface AILogEntry {
  type: 'ai'
  userId: number
  direction: 'request' | 'response'
  data: {
    userMessage: string
    modelResponse?: string
    context?: ChatMessage[]  // 仅 debugContext=true 时记录
    usage?: { prompt: number; completion: number }
    duration?: number
    error?: string
  }
}
```

日志页面新增 "AI" 筛选标签。

## 设置页面

在现有设置页新增 AI 配置区域：
- AI 开关
- Base URL 输入
- API Key（掩码输入）
- 模型名称
- 回复模式选择（文本/语音/自动）
- 调试开关（debugContext）
- 文件回复开关

## 消息处理流程

修改 `voice-reply.ts` 中的 `handleVoiceReply`：

```
收到私聊消息
  → 是 / 命令？ → dispatchCommand（已有），命令及其回复不写入 AI 上下文
  → AI 未启用？ → 走原有 echo 逻辑（兼容）
  → AI 管道处理：
      1. 确定回复类型（用户设置 > 全局 defaultReplyType）
      2. 读取上下文（最近 10 轮有效对话，已排除命令和命令回复）
      3. 构建 system prompt（根据回复类型）
      4. 调用 LLM
      5. 记录 AI 日志
      6. 发送回复（文本/语音）
      7. 将本轮 user + assistant 写入上下文
```

## 分支策略

- 创建 `feature/ai-chat` 分支
- 开发完成、测试通过后合并到 `main`

## 待办（后续版本）

- [ ] 语音回复语调优化（通过 prompt 控制）
- [ ] 工具调用能力
- [ ] 上下文压缩/摘要（避免 token 浪费）
- [ ] 平台 UI AI 对话展示
- [ ] 迁移到 SQLite 存储
- [ ] 自定义 system prompt 配置
