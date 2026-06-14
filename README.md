# NapCat 管理平台

基于 Next.js 15 的 QQ 机器人管理平台，通过 WebSocket + HTTP API 连接远程 NapCat 服务。

## 功能概览

| 模块 | 功能 |
|---|---|
| 📊 状态监控 | 连接状态、登录信息、运行状态、版本信息 |
| 📨 事件中心 | 消息/请求/通知实时推送，按用户分组，双向对话 |
| 👥 联系人管理 | 好友列表、群列表、操作菜单（发消息/踢人/禁言等） |
| 💬 消息调试 | 发送消息、查看历史消息 |
| 🔧 API 调试 | Postman 风格参数表单，30+ 接口 |
| 📋 日志系统 | 实时流，按类型筛选，降噪显示 |
| ⚙️ 设置 | WS 连接、HTTP API、语音回复、好友请求、认证 |

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装

```bash
# 克隆项目
git clone <repo-url>
cd napcatQQ

# 安装依赖
npm install

# 配置
cp data/config.example.json data/config.json
# 编辑 data/config.json 填入你的配置
```

### 配置

编辑 `data/config.json`：

```json
{
  "ws": {
    "url": "ws://你的NapCat服务器:3001",
    "token": "你的WS Token"
  },
  "api": {
    "url": "http://你的NapCat服务器:3000",
    "token": "你的API Token"
  },
  "auth": {
    "token": "管理平台登录密码"
  }
}
```

### 启动

```bash
npm run dev
```

访问 `http://localhost:3000`，输入配置的 auth token 登录。

## 项目结构

```
napcatQQ/
├── src/
│   ├── app/
│   │   ├── (authenticated)/    # 需登录的页面
│   │   │   ├── dashboard/      # 状态监控
│   │   │   ├── events/         # 事件中心
│   │   │   ├── contacts/       # 联系人管理
│   │   │   ├── messages/       # 消息调试
│   │   │   ├── debugger/       # API 调试器
│   │   │   ├── logs/           # 日志
│   │   │   └── settings/       # 设置
│   │   ├── api/                # API 路由
│   │   └── login/              # 登录页
│   ├── lib/
│   │   ├── napcat-ws.ts        # WebSocket 客户端
│   │   ├── napcat-api.ts       # HTTP API 客户端
│   │   ├── config.ts           # 配置管理
│   │   ├── logger.ts           # 日志系统
│   │   ├── tts.ts              # TTS 语音合成
│   │   ├── voice-reply.ts      # 自动回复
│   │   ├── command-handler.ts  # 命令处理
│   │   ├── user-config.ts      # 用户配置存储
│   │   └── friend-request.ts   # 好友请求处理
│   ├── components/             # 可复用组件
│   └── types/                  # TypeScript 类型
├── data/
│   ├── config.json             # 主配置（gitignore）
│   ├── user-configs.json       # 用户配置
│   └── logs/                   # 日志文件
├── docs/                       # 文档
└── OpenAPI.md                  # NapCat API 文档
```

## 文档

- [快速开始](docs/getting-started.md)
- [配置说明](docs/configuration.md)
- [功能指南](docs/features.md)
- [API 参考](docs/api-reference.md)
- [开发指南](docs/development.md)
- [命令系统](docs/dev/command-system.md)

## 技术栈

| 技术 | 用途 |
|---|---|
| Next.js 15 (App Router) | 全栈框架 |
| TypeScript | 类型安全 |
| Tailwind CSS | 样式 |
| shadcn/ui | 组件库 |
| ws | WebSocket 客户端 |
| chokidar | 配置热重载 |

## NapCat 架构

NapCat 使用双端口架构：

```
┌─────────────────┐     WS (3001)      ┌──────────────┐
│  管理平台        │ ◄───────────────── │  NapCat 服务  │
│  (本项目)        │ ──────────────────► │  (远程)       │
│                 │    HTTP (3000)      │              │
└─────────────────┘                     └──────────────┘
```

- **WS 端口 (3001)**：接收事件（消息、通知、心跳等）
- **HTTP 端口 (3000)**：发送 API 请求（发消息、获取列表等）

## 许可证

MIT
