# NapCat 管理平台 — 设计文档

> 日期：2026-06-13
> 状态：已批准
> 作者：NapCat Platform Team

## 1. 项目概述

### 1.1 背景

NapCatQQ 是一个基于 OneBot 11 协议的 QQ 机器人框架，已在远程服务器 `115.190.250.31:3001` 上运行。需要搭建一个本地管理平台（底座），用于：

- 通过 WebSocket 连接 NapCat 服务
- 提供 Web 管理界面，调试常用 API
- 记录所有请求和事件日志
- 支持配置热重载

最终目标是构建 QQ 上的个人助理，本阶段聚焦底座平台。

### 1.2 核心需求

| 需求 | 描述 |
|---|---|
| WS 连接 | 正向 WebSocket 模式，连接 `ws://115.190.250.31:3001` |
| 管理平台 | 状态监控、好友/群管理、消息调试、通用 API 调试器 |
| 配置热重载 | WS 地址、Token 等配置修改后无需重启即可生效 |
| Token 认证 | 打开页面需输入 Token 验证，存入 cookie |
| 日志系统 | 记录所有 WS 请求/事件，持久化到文件 |

## 2. 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 框架 | Next.js 15 (App Router) | 全栈框架，前端 + API Routes |
| 语言 | TypeScript | 类型安全 |
| UI | Tailwind CSS + shadcn/ui | 样式 + 组件库 |
| WS 客户端 | `ws` 库 | 连接 NapCat WebSocket |
| 实时推送 | Server-Sent Events (SSE) | NapCat 事件推送到前端 |
| 配置热重载 | `chokidar` | 监听 config.json 文件变更 |
| 日志 | 内存环形缓冲 + 文件持久化 | 请求/事件日志 |

## 3. 项目结构

```
napcat-platform/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 根布局 (侧边栏导航)
│   │   ├── page.tsx                  # 首页 → 重定向到 /dashboard
│   │   ├── login/
│   │   │   └── page.tsx              # 登录页 (Token 输入)
│   │   ├── dashboard/
│   │   │   └── page.tsx              # 状态监控面板
│   │   ├── contacts/
│   │   │   └── page.tsx              # 好友/群管理
│   │   ├── messages/
│   │   │   └── page.tsx              # 消息收发调试
│   │   ├── debugger/
│   │   │   └── page.tsx              # 通用 API 调试器
│   │   ├── logs/
│   │   │   └── page.tsx              # 日志查看
│   │   ├── settings/
│   │   │   └── page.tsx              # 配置管理
│   │   └── api/
│   │       ├── auth/
│   │       │   └── route.ts          # 登录验证 API
│   │       ├── ws/
│   │       │   └── route.ts          # WS 代理 (发送请求到 NapCat)
│   │       ├── events/
│   │       │   └── route.ts          # SSE 推送 NapCat 事件
│   │       ├── config/
│   │       │   └── route.ts          # 配置读写 API
│   │       └── logs/
│   │           └── route.ts          # 日志查询 API
│   ├── lib/
│   │   ├── napcat-ws.ts              # NapCat WebSocket 客户端 (单例)
│   │   ├── config.ts                 # 配置管理 + chokidar 热重载
│   │   ├── auth.ts                   # Token 认证中间件
│   │   └── logger.ts                 # 日志系统 (内存 + 文件)
│   ├── components/
│   │   ├── sidebar.tsx               # 侧边栏导航
│   │   ├── log-viewer.tsx            # 日志查看器组件
│   │   └── api-tester.tsx            # API 调试器组件
│   └── types/
│       └── napcat.ts                 # OneBot 11 类型定义
├── data/
│   ├── config.json                   # 配置文件
│   └── logs/                         # 日志文件目录 (按天切割)
│       ├── 2026-06-13.jsonl
│       └── 2026-06-14.jsonl
├── public/
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts
```

## 4. WebSocket 连接管理

### 4.1 连接生命周期

```
启动 → 读取 config.json → 连接 ws://115.190.250.31:3001
                              ↓
                         连接成功
                              ↓
              ┌───────────────────────────────┐
              │  接收事件 → 写入日志 → SSE 推送前端  │
              │  发送请求 → 写入日志 → 等待响应      │
              └───────────────────────────────┘
                              ↓
              配置变更(chokidar) → 断开旧连接 → 重连新地址
                              ↓
              连接异常 → 指数退避重连 (1s → 2s → 4s → ... → 30s max)
```

### 4.2 设计要点

- **单例模式**：全局一个 WS 连接实例，所有 API Route 共享
- **请求-响应匹配**：OneBot 11 协议用 `echo` 字段匹配。发送时生成唯一 echo ID，响应时按 echo 匹配
- **断线重连**：指数退避策略，最大间隔 30 秒，配置变更时立即重连
- **连接状态**：维护 `connecting | connected | disconnected | error` 四种状态

### 4.3 SSE 推送机制

前端不直接连 WS，而是：
- **发送请求**：前端调用 `POST /api/ws` → 后端通过 WS 发送到 NapCat
- **接收事件**：前端订阅 `GET /api/events` (SSE) → 后端将 NapCat 事件实时推送

好处：
- Token 认证在 HTTP 层统一处理
- 前端不需要知道 WS 连接细节
- 多个浏览器标签页可以共享同一个 WS 连接

## 5. 配置管理

### 5.1 配置文件 `data/config.json`

```json
{
  "ws": {
    "url": "ws://115.190.250.31:3001",
    "reconnect": true,
    "reconnectInterval": 5000,
    "maxReconnectInterval": 30000
  },
  "auth": {
    "token": "your-secret-token-here"
  },
  "log": {
    "maxEntries": 5000,
    "persistToFile": true,
    "logDir": "data/logs"
  }
}
```

### 5.2 热重载机制

- `chokidar` 监听 `data/config.json` 的写入事件
- 文件变更 → 读取并校验新配置 → diff 检测哪些字段变了
- `ws.url` 变更 → 断开旧连接，用新地址重连
- `auth.token` 变更 → 立即生效，后续请求用新 token 验证
- `log.*` 变更 → 更新日志行为
- 校验失败 → 忽略变更，日志记录错误，不影响当前运行

### 5.3 前端配置页面

- 表单化展示当前配置（WS 地址、Token、日志参数）
- 修改后保存 → `POST /api/config` → 写入 config.json → 触发热重载
- Token 字段显示为 `***`，点击可查看/编辑
- 保存前校验 WS 地址格式、Token 非空

## 6. 认证系统

### 6.1 认证流程

```
用户打开任意页面 → 中间件检查 cookie 中是否有 token
                        ↓
                  无 token / token 无效 → 重定向到 /login
                  有 token 有效 → 正常访问
                        ↓
/login 页面 → 输入 Token → POST /api/auth 验证
                              ↓
                        成功 → 写入 cookie → 跳转到之前要访问的页面
                        失败 → 提示"Token 错误"
```

### 6.2 实现要点

- 登录页：简洁的输入框 + 确认按钮
- 验证逻辑：前端 POST token → 后端与 `config.json` 中的 `auth.token` 比对
- 通过后写入 cookie（`httpOnly`，7 天有效）
- Next.js middleware 统一拦截：校验 cookie 中的 token 是否与当前配置一致
- 后台修改 Token 后，旧 cookie 失效，前端自动跳回登录页

## 7. 日志系统

### 7.1 日志分类

| 类型 | 方向 | 示例 |
|---|---|---|
| request | 本地 → NapCat | 调用 `send_msg`、`get_friend_list` |
| event | NapCat → 本地 | 收到私聊消息、群消息、好友请求 |
| system | 内部 | WS 连接/断开、配置变更、错误 |

### 7.2 日志条目结构

```typescript
interface LogEntry {
  id: string;           // 唯一 ID
  timestamp: number;    // 毫秒时间戳
  type: 'request' | 'event' | 'system';
  direction?: 'outgoing' | 'incoming';
  action?: string;      // 请求的 action 名
  echo?: string;        // 请求的 echo ID
  data: any;            // 完整的请求体或事件体
  status?: 'pending' | 'success' | 'error';
  response?: any;       // 对应的响应数据
}
```

### 7.3 存储策略

- **内存**：环形缓冲区，默认保留最近 5000 条，可配置
- **文件**：按天切割，存放在 `data/logs/YYYY-MM-DD.jsonl`，每行一条 JSON
- 文件持久化可配置开关，默认开启

### 7.4 前端日志页面

- 实时流：通过 SSE 推送新日志，自动滚动到底部
- 筛选：按类型（request/event/system）、按 action 名、按时间范围
- 搜索：全文搜索日志内容
- 详情：点击展开查看完整 JSON 数据
- 请求配对：发送的请求自动关联对应的响应，显示耗时

## 8. 管理平台页面

### 8.1 状态监控面板 `/dashboard`

- **连接状态卡片**：WS 连接状态（绿/红灯）、连接时长、重连次数
- **登录信息卡片**：当前登录 QQ 号、昵称、头像（调用 `get_login_info`）
- **运行状态卡片**：在线状态、是否正常（调用 `get_status`）
- **版本信息卡片**：NapCat 版本号（调用 `get_version_info`）
- **快速操作**：重连按钮、清理缓存按钮

### 8.2 好友/群管理 `/contacts`

两个 Tab 页切换：

**好友列表：**
- 表格展示：QQ 号、昵称、备注
- 搜索过滤
- 点击查看详情

**群列表：**
- 表格展示：群号、群名、成员数、最大成员数
- 点击进入群详情 → 群成员列表
- 群成员表格：QQ 号、昵称、群名片、角色、入群时间

### 8.3 消息收发调试 `/messages`

- **发送消息表单**：
  - 消息类型：私聊 / 群聊
  - 目标 ID：user_id 或 group_id
  - 消息内容：文本输入，可扩展消息段
  - 发送 → 调用 send_msg 接口
- **历史消息查看**：
  - 输入 user_id/group_id + 条数
  - 展示消息列表

### 8.4 通用 API 调试器 `/debugger`

- **Action 选择**：下拉列表，包含所有 OneBot 11 接口
- **参数编辑**：JSON 编辑器，预填默认参数模板
- **发送**：通过 WS 发送请求
- **响应展示**：格式化 JSON
- **历史记录**：最近调试请求，可快速重放

### 8.5 配置管理 `/settings`

- WS 地址输入框（带连接测试按钮）
- Token 修改（掩码显示，可编辑）
- 日志配置（最大条数、是否持久化）
- 保存 → 热重载生效

### 8.6 导航布局

- 左侧固定侧边栏：Logo + 导航菜单 + 连接状态指示灯
- 移动端折叠为顶部汉堡菜单
- shadcn/ui 组件统一风格

## 9. API 设计

### 9.1 认证

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/auth` | 验证 Token，设置 cookie |

### 9.2 WS 代理

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/ws` | 发送请求到 NapCat（Body: `{ action, params }`） |
| GET | `/api/events` | SSE 订阅，接收 NapCat 事件推送 |

### 9.3 配置

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/config` | 获取当前配置（Token 掩码） |
| POST | `/api/config` | 更新配置，触发热重载 |

### 9.4 日志

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/logs` | 查询日志（支持筛选参数） |

### 9.5 WS 代理请求格式

```typescript
// POST /api/ws 请求体
{
  "action": "send_msg",        // OneBot 11 action 名
  "params": {                   // action 参数
    "message_type": "private",
    "user_id": "123456789",
    "message": [{ "type": "text", "data": { "text": "hello" } }]
  }
}

// 响应体
{
  "status": "ok",
  "retcode": 0,
  "data": { "message_id": 12345 },
  "echo": "uuid-xxx"
}
```

## 10. OneBot 11 接口清单（常用）

从 OpenAPI.md 提取的常用接口，管理平台需支持调试：

### 消息相关
- `send_msg` — 发送消息
- `delete_msg` — 撤回消息
- `get_group_msg_history` — 获取群历史消息
- `get_friend_msg_history` — 获取好友历史消息

### 好友/群管理
- `get_friend_list` — 获取好友列表
- `get_group_list` — 获取群列表
- `get_group_info` — 获取群信息
- `get_group_member_list` — 获取群成员列表
- `set_friend_add_request` — 处理加好友请求
- `set_group_kick` — 踢出群成员
- `set_group_ban` — 群禁言

### 状态查询
- `get_login_info` — 获取登录信息
- `get_status` — 获取运行状态
- `get_version_info` — 获取版本信息

### 文件操作
- `get_image` — 获取图片
- `get_record` — 获取语音
- `get_file` — 获取文件

## 11. 后续扩展方向

本阶段聚焦底座平台，后续可迭代：
- AI 消息处理 Hook（接入 OpenAI 等）
- 自动回复规则引擎
- 定时任务系统
- 多账号管理
