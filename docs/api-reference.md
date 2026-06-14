# API 参考

所有 API 都需要认证（cookie 中的 `napcat_token`）。

## 认证

### POST /api/auth

验证 token 并设置 cookie。

**请求：**
```json
{
  "token": "your-auth-token"
}
```

**响应：**
```json
{
  "success": true,
  "message": "Login successful"
}
```

## WebSocket 代理

### POST /api/ws

通过 HTTP API 发送请求到 NapCat。

**请求：**
```json
{
  "action": "get_login_info",
  "params": {}
}
```

**响应：**
```json
{
  "status": "ok",
  "retcode": 0,
  "data": {
    "user_id": 123456789,
    "nickname": "机器人"
  }
}
```

### GET /api/events

SSE 订阅，接收实时事件推送。

**事件格式：**
```
data: {"type":"connection_status","data":{"status":"connected"}}
data: {"type":"event","data":{"post_type":"message",...}}
data: {"type":"log","data":{"type":"request","action":"send_msg",...}}
```

## 配置

### GET /api/config

获取当前配置（敏感字段掩码）。

**响应：**
```json
{
  "success": true,
  "data": {
    "ws": { "url": "ws://...", "token": "***" },
    "api": { "url": "http://...", "token": "***" },
    "voiceReply": { "mode": "off", "allowUserOverride": false },
    "auth": { "token": "***" }
  }
}
```

### POST /api/config

更新配置（触发热重载）。

**请求：**
```json
{
  "ws": { "url": "ws://new-url:3001" },
  "voiceReply": { "mode": "always" }
}
```

只传需要修改的字段，未传的字段保持不变。

## 好友请求

### GET /api/friend-requests

获取待处理的好友请求列表。

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "flag": "flag_xxx",
      "userId": 123456789,
      "nickname": "张三",
      "comment": "我是李四的朋友",
      "timestamp": 1718000000000
    }
  ]
}
```

### POST /api/friend-requests

处理好友请求。

**请求：**
```json
{
  "action": "approve",  // 或 "reject"
  "flag": "flag_xxx",
  "remark": "备注名"    // 可选，仅 approve 时有效
}
```

## 用户配置

### GET /api/user-configs

导出所有用户配置（用于迁移）。

**响应：**
```json
{
  "success": true,
  "data": {
    "users": {
      "123456789": { "responseType": "voice" },
      "987654321": { "responseType": "text" }
    }
  }
}
```

### POST /api/user-configs

导入用户配置。

**请求：**
```json
{
  "users": {
    "123456789": { "responseType": "voice" }
  }
}
```

## 日志

### GET /api/logs

查询日志。

**参数：**
| 参数 | 类型 | 说明 |
|---|---|---|
| `type` | string | 筛选类型：`request`/`event`/`system` |
| `action` | string | 筛选 action 名（模糊匹配） |
| `limit` | number | 返回条数（默认 100） |
| `offset` | number | 偏移量 |

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "timestamp": 1718000000000,
      "type": "request",
      "direction": "outgoing",
      "action": "send_msg",
      "echo": "uuid",
      "data": { "action": "send_msg", "params": {} },
      "status": "success",
      "response": { "status": "ok" }
    }
  ],
  "total": 150
}
```

## NapCat API 常用接口

通过 `POST /api/ws` 调用。

### 消息

| 接口 | 说明 |
|---|---|
| `send_msg` | 发送消息 |
| `delete_msg` | 撤回消息 |
| `get_group_msg_history` | 获取群历史消息 |
| `get_friend_msg_history` | 获取好友历史消息 |

### 好友/群

| 接口 | 说明 |
|---|---|
| `get_friend_list` | 获取好友列表 |
| `get_group_list` | 获取群列表 |
| `get_group_info` | 获取群信息 |
| `get_group_member_list` | 获取群成员列表 |
| `get_stranger_info` | 获取用户信息 |
| `set_friend_remark` | 设置好友备注 |
| `delete_friend` | 删除好友 |

### 群管理

| 接口 | 说明 |
|---|---|
| `set_group_name` | 设置群名 |
| `set_group_card` | 设置群名片 |
| `set_group_kick` | 踢出成员 |
| `set_group_ban` | 禁言 |
| `set_group_whole_ban` | 全员禁言 |
| `set_group_leave` | 退出群聊 |
| `set_group_admin` | 设置管理员 |

### 状态

| 接口 | 说明 |
|---|---|
| `get_login_info` | 获取登录信息 |
| `get_status` | 获取运行状态 |
| `get_version_info` | 获取版本信息 |

### 文件

| 接口 | 说明 |
|---|---|
| `get_image` | 获取图片 |
| `get_record` | 获取语音 |
| `get_file` | 获取文件 |

详细接口文档参见项目根目录的 `OpenAPI.md`。
