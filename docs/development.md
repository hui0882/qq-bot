# 开发指南

## 开发环境

### 依赖

- Node.js 18+
- npm 9+
- Git

### 安装

```bash
git clone <repo-url>
cd napcatQQ
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`

## 项目架构

### 双端口架构

```
┌─────────────────┐     WS (3001)      ┌──────────────┐
│  Next.js 应用    │ ◄───────────────── │  NapCat 服务  │
│  localhost:3000  │ ──────────────────► │  远程服务器    │
│                 │    HTTP (3000)      │              │
└─────────────────┘                     └──────────────┘
```

- **WS (3001)**：接收事件（心跳、消息、通知）
- **HTTP (3000)**：发送 API 请求

### 核心模块

| 文件 | 职责 |
|---|---|
| `lib/napcat-ws.ts` | WebSocket 客户端（单例，自动重连） |
| `lib/napcat-api.ts` | HTTP API 客户端（发送请求） |
| `lib/config.ts` | 配置管理（热重载） |
| `lib/logger.ts` | 日志系统（内存环形缓冲 + 文件） |
| `lib/tts.ts` | TTS 语音合成（解耦） |
| `lib/voice-reply.ts` | 消息处理入口（命令/回复） |
| `lib/command-handler.ts` | 命令解析和处理 |
| `lib/user-config.ts` | 用户配置存储 |
| `lib/friend-request.ts` | 好友请求处理 |

### 数据流

```
收到消息
    ↓
napcat-ws.ts (WS 事件)
    ↓
voice-reply.ts (消息处理入口)
    ├── / 开头 → command-handler.ts (命令处理)
    └── 普通消息 → 检查回复模式
                    ├── off → 文本回显
                    ├── always → tts.ts → 语音回复
                    └── auto → 暂不处理
```

### 单例模式

以下模块使用 `globalThis` 持久化，避免 Next.js HMR 重复创建：

```typescript
const globalForXxx = globalThis as unknown as { __xxx?: XxxClass }

export function getXxx(): XxxClass {
  if (!globalForXxx.__xxx) {
    globalForXxx.__xxx = new XxxClass()
  }
  return globalForXxx.__xxx
}
```

## 添加新功能

### 添加新页面

1. 在 `src/app/(authenticated)/` 下创建目录和 `page.tsx`
2. 在 `src/components/sidebar.tsx` 的 `NAV_ITEMS` 中添加导航项
3. 页面使用 `'use client'` 指令（需要客户端交互时）

### 添加新 API

1. 在 `src/app/api/` 下创建目录和 `route.ts`
2. 导出 `GET`/`POST` 等函数
3. 使用 `validateAuth()` 验证认证

### 添加新命令

1. 在 `src/lib/command-handler.ts` 中：
   - 在 `COMMANDS` 对象添加命令定义
   - 在 `handleCommand` 函数添加处理逻辑
2. 命令处理完成后调用 `sendReply(userId, text)` 回复

### 添加新配置项

1. 在 `src/types/napcat.ts` 的 `PlatformConfig` 接口添加字段
2. 在 `src/lib/config.ts` 的 `DEFAULT_CONFIG` 添加默认值
3. 在 `src/lib/config.ts` 的 `diffConfigs` 添加变更检测
4. 在 `src/lib/config.ts` 的 `updateConfig` 添加合并逻辑
5. 在设置页面添加 UI

## 测试

### 手动测试

```bash
# 启动开发服务器
npm run dev

# 运行 E2E 测试脚本
bash scripts/e2e-test.sh
```

### API 测试

```bash
# 登录
curl -c cookies.txt -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"token":"your-token"}'

# 调用 API
curl -b cookies.txt -X POST http://localhost:3000/api/ws \
  -H "Content-Type: application/json" \
  -d '{"action":"get_login_info"}'
```

### TypeScript 检查

```bash
npx tsc --noEmit
```

### 生产构建

```bash
npm run build
```

## 代码规范

### 文件命名

- 页面：`page.tsx`
- 布局：`layout.tsx`
- API 路由：`route.ts`
- 组件：`kebab-case.tsx`
- 工具模块：`kebab-case.ts.ts`

### 导入顺序

```typescript
// 1. 外部依赖
import { useEffect, useState } from 'react'

// 2. 内部模块
import { configManager } from '@/lib/config'
import { logger } from '@/lib/logger'

// 3. 组件
import { Sidebar } from '@/components/sidebar'

// 4. 类型
import type { PlatformConfig } from '@/types/napcat'
```

### 错误处理

```typescript
try {
  const result = await someApiCall()
  if (result.status !== 'ok') {
    logger.logSystem('Operation failed', { error: result.message })
    return { success: false, message: result.message }
  }
  return { success: true, data: result.data }
} catch (err) {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  logger.logSystem('Operation error', { error: msg })
  return { success: false, message: msg }
}
```

## 部署

### 生产构建

```bash
npm run build
npm start
```

### 环境变量

在 `.env.local` 中设置：

```env
MIMO_API_KEY=your-mimo-api-key
```

### 数据迁移

将 `data/` 目录复制到新服务器：
- `config.json` — 主配置
- `user-configs.json` — 用户配置
- `logs/` — 日志文件（可选）

## 分支策略

| 分支 | 用途 |
|---|---|
| `main` | 稳定版本 |
| `dev` | 开发中的功能 |
| `feature/*` | 功能分支 |
| `ui/*` | UI 优化分支 |

### 提交规范

```
feat: 新功能
fix: 修复
docs: 文档
style: 样式
refactor: 重构
test: 测试
chore: 构建/工具
```

示例：
```
feat: add voice reply with MiMo TTS
fix: config save token corruption
docs: add API reference
```
