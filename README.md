# NapCat 管理平台

基于 Next.js 15 的 QQ 机器人管理平台，通过 WebSocket 连接远程 NapCat 服务。

## 功能概览

| 模块 | 功能 |
|---|---|
| 📊 状态监控 | 连接状态、登录信息、运行状态、版本信息 |
| 📨 事件中心 | 消息/请求/通知实时推送，按用户分组，双向对话 |
| 👥 联系人管理 | 好友列表、群列表、操作菜单（发消息/踢人/禁言等） |
| 💬 消息调试 | 发送消息、查看历史消息 |
| 🔧 API 调试 | Postman 风格参数表单，30+ 接口 |
| 📋 日志系统 | 实时流，按类型筛选，降噪显示 |
| ⚙️ 设置 | WS 连接、语音回复、好友请求、认证配置 |
| 🤖 命令系统 | /help、/response-type 等用户命令 |
| 🎙️ TTS 语音 | MiMo TTS 集成，自动语音回复 |

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

访问 `http://localhost:8090`，输入配置的 auth token 登录。

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
│   │   ├── napcat-ws.ts        # WebSocket 客户端（事件接收 + API 请求）
│   │   ├── config.ts           # 配置管理（热重载）
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

## NapCat 架构

```
┌─────────────────┐     WS (3001)      ┌──────────────┐
│  管理平台        │ ◄───────────────── │  NapCat 服务  │
│  (本项目)        │ ──────────────────► │  (远程)       │
│                 │  事件接收 + API请求  │              │
└─────────────────┘                     └──────────────┘
```

- **WS 端口 (3001)**：接收事件（消息、通知、心跳等）+ 发送 API 请求
- **HTTP 端口 (3000)**：可选，当前未使用

## 命令系统

用户可发送以下命令与机器人交互：

| 命令 | 说明 |
|---|---|
| `/help` | 查看所有可用命令 |
| `/response-type voice` | 设置回复模式为语音 |
| `/response-type text` | 设置回复模式为文本 |
| `/response-type auto` | AI 自动判断（暂不可用） |

## TTS 语音回复

支持小米 MiMo TTS 语音合成：

- **音色**：茉莉、冰糖、苏打、白桦等
- **风格**：温柔、活泼、高冷、甜美等
- **模式**：关闭（文本回显）/ 始终语音 / 自动（AI 判断，暂不可用）

## 部署

### GitHub Actions 自动部署

Push 到 `main` 分支自动触发部署：

1. SSH 登录服务器
2. 拉取最新代码
3. 安装依赖
4. 构建项目
5. PM2 重启服务

需要在 GitHub Secrets 中配置：

| Secret | 说明 |
|---|---|
| `DEPLOY_HOST` | 服务器 IP |
| `DEPLOY_USER` | SSH 用户名 |
| `DEPLOY_KEY` | SSH 私钥 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_PATH` | 项目路径 |
| `CONFIG_JSON` | 配置文件内容 |

### 手动部署

```bash
# 服务器上
git clone <repo-url> ~/qq_bot
cd qq_bot
npm install
npm run build
pm2 start npm --name napcat-platform -- start
```

## 文档

- [快速开始](docs/getting-started.md)
- [配置说明](docs/configuration.md)
- [功能指南](docs/features.md)
- [API 参考](docs/api-reference.md)
- [开发指南](docs/development.md)

## 技术栈

| 技术 | 用途 |
|---|---|
| Next.js 15 (App Router) | 全栈框架 |
| TypeScript | 类型安全 |
| Tailwind CSS | 样式 |
| shadcn/ui | 组件库 |
| Node.js WebSocket | WS 客户端 |
| chokidar | 配置热重载 |

## 许可证

MIT
