# 快速开始

## 环境准备

### 安装 Node.js

前往 [nodejs.org](https://nodejs.org) 下载安装 Node.js 18 或更高版本。

验证安装：
```bash
node --version  # 应显示 v18.x.x 或更高
npm --version   # 应显示 9.x.x 或更高
```

### 准备 NapCat 服务

确保你的 NapCat 服务已在远程服务器上运行，并获取以下信息：

| 信息 | 示例 | 说明 |
|---|---|---|
| WS 地址 | `ws://115.190.250.31:3001` | WebSocket 端口，用于接收事件 |
| HTTP API 地址 | `http://115.190.250.31:3000` | HTTP 端口，用于发送请求 |
| Token | `your-token` | NapCat 认证 token |

## 安装步骤

### 1. 克隆项目

```bash
git clone <repo-url>
cd napcatQQ
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置

创建配置文件：

```bash
cp data/config.example.json data/config.json
```

编辑 `data/config.json`：

```json
{
  "ws": {
    "url": "ws://你的服务器IP:3001",
    "token": "你的WS Token",
    "reconnect": true,
    "reconnectInterval": 5000,
    "maxReconnectInterval": 30000
  },
  "api": {
    "url": "http://你的服务器IP:3000",
    "token": "你的API Token"
  },
  "auth": {
    "token": "设置一个登录密码"
  }
}
```

### 4. 启动

```bash
npm run dev
```

### 5. 访问

打开浏览器访问 `http://localhost:3000`，输入配置的 `auth.token` 登录。

## 首次使用

### 查看连接状态

登录后默认进入 Dashboard，查看：
- **连接状态**：应显示"已连接"（绿色）
- **登录信息**：显示当前登录的 QQ 号和昵称
- **运行状态**：显示"在线"和"正常"

### 发送测试消息

1. 进入「消息调试」页面
2. 选择消息类型（私聊/群聊）
3. 输入目标 ID 和消息内容
4. 点击「发送」

### 查看事件

进入「事件」页面，可以看到：
- 收到的消息
- 好友请求
- 系统通知

## 常见问题

### 连接失败

**问题**：Dashboard 显示"连接失败"

**排查**：
1. 检查 `config.json` 中的 WS 地址是否正确
2. 检查服务器是否可达（`ping` 或 `telnet`）
3. 检查 Token 是否正确
4. 查看日志页面的错误信息

### 无法发送消息

**问题**：发送消息返回失败

**排查**：
1. 确认 HTTP API 地址正确（通常比 WS 端口小 1）
2. 确认 API Token 正确
3. 在 API 调试器中测试 `get_login_info` 接口

### 页面无法访问

**问题**：登录后页面空白或报错

**排查**：
1. 检查浏览器控制台是否有错误
2. 尝试清除浏览器缓存
3. 重启开发服务器

## 下一步

- [配置说明](configuration.md) — 了解所有配置项
- [功能指南](features.md) — 了解各功能模块
- [API 参考](api-reference.md) — 了解可用的 API 接口
