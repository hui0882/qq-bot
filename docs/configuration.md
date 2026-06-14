# 配置说明

配置文件位于 `data/config.json`，修改后自动热重载（无需重启服务）。

## 完整配置示例

```json
{
  "ws": {
    "url": "ws://115.190.250.31:3001",
    "token": "your-ws-token",
    "reconnect": true,
    "reconnectInterval": 5000,
    "maxReconnectInterval": 30000
  },
  "api": {
    "url": "http://115.190.250.31:3000",
    "token": "your-api-token"
  },
  "tts": {
    "enabled": true,
    "apiUrl": "https://api.xiaomimimo.com/v1/chat/completions",
    "apiKey": "your-mimo-api-key",
    "model": "mimo-v2.5-tts",
    "voice": "茉莉",
    "style": "温柔",
    "format": "wav"
  },
  "voiceReply": {
    "mode": "off",
    "allowUserOverride": false
  },
  "friendRequest": {
    "mode": "auto"
  },
  "auth": {
    "token": "your-login-token"
  },
  "log": {
    "maxEntries": 5000,
    "persistToFile": true,
    "logDir": "data/logs"
  }
}
```

## 配置项详解

### WebSocket 连接 (`ws`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `url` | string | `ws://115.190.250.31:3001` | NapCat WebSocket 地址 |
| `token` | string | - | WS 认证 token（access_token） |
| `reconnect` | boolean | `true` | 是否自动重连 |
| `reconnectInterval` | number | `5000` | 重连间隔（毫秒） |
| `maxReconnectInterval` | number | `30000` | 最大重连间隔（毫秒） |

**重连策略**：指数退避，从 `reconnectInterval` 开始，每次翻倍，最大 `maxReconnectInterval`。

### HTTP API (`api`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `url` | string | `http://115.190.250.31:3000` | NapCat HTTP API 地址 |
| `token` | string | - | API 认证 token（Bearer） |

**注意**：HTTP API 端口通常比 WS 端口小 1。

### TTS 语音合成 (`tts`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否启用 TTS |
| `apiUrl` | string | - | TTS API 地址 |
| `apiKey` | string | - | TTS API Key |
| `model` | string | `mimo-v2.5-tts` | 模型 ID |
| `voice` | string | `茉莉` | 音色名称 |
| `style` | string | `温柔` | 风格标签 |
| `format` | string | `wav` | 音频格式（wav/mp3） |

**可用音色**：茉莉、冰糖、苏打、白桦、Mia、Chloe、Milo、Dean

**可用风格**：温柔、活泼、高冷、甜美、磁性、清亮 等

### 语音回复 (`voiceReply`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mode` | string | `off` | 回复模式：`off`(文本) / `always`(语音) / `auto`(AI) |
| `allowUserOverride` | boolean | `false` | 是否允许用户通过命令自定义 |

**模式说明**：
- `off`：收到消息后回显文本
- `always`：收到消息后转语音回复
- `auto`：由 AI 判断（暂不可用，需接入 LLM）

**用户自定义**：
- 开启后，用户可发送 `/response-type voice` 或 `/response-type text` 自行设置
- 关闭时，统一使用全局 `mode` 设置

### 好友请求 (`friendRequest`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mode` | string | `auto` | 处理模式：`auto`(自动同意) / `manual`(手动处理) |

**模式说明**：
- `auto`：收到好友申请自动同意
- `manual`：存入待处理列表，在「联系人 → 好友请求」中手动处理

### 平台认证 (`auth`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `token` | string | - | 管理平台登录密码 |

### 日志 (`log`)

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `maxEntries` | number | `5000` | 内存中最大日志条数 |
| `persistToFile` | boolean | `true` | 是否持久化到文件 |
| `logDir` | string | `data/logs` | 日志文件目录 |

**日志文件**：按天切割，格式为 `data/logs/YYYY-MM-DD.jsonl`

## 热重载

修改 `config.json` 后，系统自动检测变更并应用：

- `ws.*` 变更 → 断开重连
- `auth.token` 变更 → 下次请求使用新 token（已登录的 session 立即失效）
- `voiceReply.*` 变更 → 立即生效
- `friendRequest.*` 变更 → 立即生效

## 敏感信息保护

以下字段在 API 返回时自动掩码：
- `ws.token`
- `api.token`
- `tts.apiKey`
- `auth.token`

设置页面点击「查看」按钮可显示真实值。

## 数据文件

| 文件 | 说明 | 备份建议 |
|---|---|---|
| `data/config.json` | 主配置 | 必须备份 |
| `data/user-configs.json` | 用户配置 | 建议备份 |
| `data/logs/*.jsonl` | 日志文件 | 可选备份 |

**迁移**：将 `data/` 目录整体复制到新服务器即可。
