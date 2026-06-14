# 命令系统开发文档

## 概述

用户通过发送 `/` 开头的消息与机器人交互，进行配置和查询操作。

## 命令触发规则

| 用户输入 | 机器人响应 |
|---|---|
| `/` | 提示：输入 `/help` 查看所有命令 |
| `/help` | 返回所有可用命令列表 |
| `/response-type` | 返回用法说明（缺少参数） |
| `/response-type voice` | 设置当前用户回复模式为语音 |
| `/response-type text` | 设置当前用户回复模式为文本 |
| `/response-type auto` | 提示：自动模式暂不可用 |
| `/response-type xxx` | 错误：无效参数，返回用法示例 |
| `/xxx` | 错误：未知命令，返回 `/help` 提示 |

## 命令列表

### /help
返回所有可用命令及说明。

### /response-type
设置当前用户的回复模式。

**语法：** `/response-type <voice|text|auto>`

**参数：**
- `voice` — 始终语音回复
- `text` — 始终文本回复
- `auto` — AI 自动判断（暂不可用）

**响应：**
- 成功：`✅ 回复模式已切换为：语音/文本`
- 参数缺失：显示用法示例
- 参数无效：显示错误 + 用法示例
- auto 模式：提示暂不支持

## 用户配置存储

### 存储方式
JSON 文件：`data/user-configs.json`

### 数据结构
```json
{
  "users": {
    "123456789": {
      "responseType": "voice"
    },
    "987654321": {
      "responseType": "text"
    }
  }
}
```

### 操作接口
- `getUserConfig(userId)` — 获取用户配置
- `setUserConfig(userId, config)` — 设置用户配置
- `exportUserConfigs()` — 导出全部配置（用于迁移）
- `importUserConfigs(data)` — 导入配置

### 回复模式优先级
1. 全局开关「允许用户自定义」为关 → 使用全局配置
2. 全局开关为开 + 用户已配置 → 使用用户配置
3. 全局开关为开 + 用户未配置 → 使用全局配置

## 全局配置变更

### data/config.json 新增字段
```json
{
  "voiceReply": {
    "mode": "off",
    "allowUserOverride": false
  }
}
```

- `allowUserOverride: false` — 统一使用全局 mode，设置页可编辑
- `allowUserOverride: true` — 用户可通过 `/response-type` 自行配置，设置页置灰

## 设置页变更

语音回复区域新增：
- 「允许用户自定义」开关（toggle）
- 开关打开时，三个回复模式选项置灰不可点击
- 开关关闭时，三个回复模式选项恢复正常

## 消息处理流程

```
收到私聊消息
    ↓
是 / 开头？
    ├── 是 → 命令处理器
    │       ├── / → 提示输入 /help
    │       ├── /help → 返回命令列表
    │       ├── /response-type → 处理参数
    │       └── /xxx → 未知命令错误
    │
    └── 否 → 检查回复模式
            ├── 全局开关关 → 使用全局 mode
            ├── 全局开关开 → 查询用户配置
            │       ├── 有配置 → 使用用户 mode
            │       └── 无配置 → 使用全局 mode
            └── mode === 'off' → 文本回显
                mode === 'always' → TTS 语音回复
                mode === 'auto' → 暂不处理
```

## 测试用例

### TC-1: 发送 `/`
- 输入：`/`
- 预期：`请输入 /help 查看所有可用命令`

### TC-2: 发送 `/help`
- 输入：`/help`
- 预期：返回命令列表（含 /help 和 /response-type）

### TC-3: `/response-type` 无参数
- 输入：`/response-type`
- 预期：用法说明 + 示例

### TC-4: `/response-type voice`
- 输入：`/response-type voice`
- 预期：`✅ 回复模式已切换为：语音`

### TC-5: `/response-type text`
- 输入：`/response-type text`
- 预期：`✅ 回复模式已切换为：文本`

### TC-6: `/response-type auto`
- 输入：`/response-type auto`
- 预期：`⚠️ 自动模式暂不可用，需要接入 AI 模型`

### TC-7: `/response-type xxx`
- 输入：`/response-type xxx`
- 预期：`❌ 无效参数: xxx` + 用法示例

### TC-8: `/xxx` 未知命令
- 输入：`/xxx`
- 预期：`❌ 未知命令: /xxx` + `/help` 提示

### TC-9: 全局开关关 + 用户配置
- 全局 voiceReply.mode = 'off', allowUserOverride = false
- 用户发送 `/response-type voice`
- 预期：命令执行成功，但实际回复仍使用全局 mode（off = 文本回显）

### TC-10: 全局开关开 + 用户配置
- 全局 allowUserOverride = true
- 用户 A 发送 `/response-type voice`
- 用户 B 发送 `/response-type text`
- 用户 A 发消息 → 语音回复
- 用户 B 发消息 → 文本回复

### TC-11: 导出配置
- 调用导出 API
- 预期：返回 JSON 包含所有用户配置
