# SQLite 存储架构设计

> 创建时间：2026-06-27
> 最后更新：2026-06-27
> 状态：实施中

## 背景

当前项目使用 JSON 文件存储数据（`data/*.json`），存在以下问题：

1. **并发性能差** — 多进程同时读写可能导致数据损坏
2. **内存占用高** — 需要全量加载到内存
3. **查询效率低** — 无法索引，只能遍历查找
4. **数据量受限** — 文件过大时读写变慢

## 选型要求

### 服务器配置

| 项目 | 配置 |
|---|---|
| CPU | 2 核 |
| 内存 | 2 GB |
| 存储 | SSD |
| 操作系统 | Linux |

### 核心要求

| 要求 | 说明 |
|---|---|
| **内存占用低** | 2GB 内存需要精打细算，不能使用重型 ORM |
| **性能好** | 同步 API 优先，减少异步开销 |
| **零依赖进程** | 不能需要额外的数据库服务进程 |
| **Node.js 原生** | 必须能直接在 Node.js 中运行 |
| **类型安全** | TypeScript 支持，减少运行时错误 |
| **可扩展性** | 新增功能无需改动表结构 |

## 方案对比

| 方案 | 类型安全 | 内存占用 | 性能 | 依赖 | 适用场景 |
|---|---|---|---|---|---|
| **better-sqlite3** | ❌ 手写 SQL | ⭐⭐⭐⭐⭐ 最低 | ⭐⭐⭐⭐⭐ 最快 | 零 | 性能敏感场景 |
| **Drizzle ORM** | ✅ TS 推断 | ⭐⭐⭐⭐ 低 | ⭐⭐⭐⭐⭐ | 2 个 | 需要类型安全 |
| **Prisma** | ✅ TS 推断 | ⭐⭐ 高 | ⭐⭐⭐ | 引擎进程 | 大型项目 |
| **TypeORM** | ✅ TS 推断 | ⭐⭐⭐ 中 | ⭐⭐⭐ | 多个 | Java 背景开发者 |

## 最终选型

### ✅ 选择：better-sqlite3 原生 + 轻量封装

**理由：**

1. **内存占用最小** — 适合 2c2g 配置
2. **性能最优** — 同步 API，无异步开销
3. **零依赖** — 不需要额外进程或服务
4. **Node.js 原生** — C++ 编译模块，直接可用
5. **SQLite 本身轻量** — 数据库文件小，查询快

**不选择 ORM 的原因：**

- Drizzle ORM 虽然轻量，但仍增加约 5-10MB 内存
- 项目规模较小，手写 SQL 更直观
- 减少依赖，降低维护成本

---

## 表结构设计（v2 - 可扩展架构）

### 设计原则

1. **固定结构** — 字段固定、查询频繁的使用固定表
2. **EAV 模式** — 需要无限扩展的使用 Entity-Attribute-Value 模式
3. **内存缓存** — 频繁读写的使用内存缓存 + 延迟持久化
4. **优先级回退** — 用户配置 > 全局配置 > 默认值

### 完整表结构

```
┌─────────────────────────────────────────────────────────────┐
│                        数据库结构                            │
├─────────────────────────────────────────────────────────────┤
│  users (用户基础信息)                                        │
│  ├── qq_id TEXT PRIMARY KEY                                 │
│  ├── created_at INTEGER                                     │
│  └── updated_at INTEGER                                     │
├─────────────────────────────────────────────────────────────┤
│  user_settings (用户设置 - EAV 模式，无限扩展)               │
│  ├── user_id TEXT                                           │
│  ├── key TEXT                                               │
│  ├── value TEXT                                             │
│  └── updated_at INTEGER                                     │
├─────────────────────────────────────────────────────────────┤
│  user_ai_configs (用户 AI 配置 - 固定结构)                   │
│  ├── user_id TEXT PRIMARY KEY                               │
│  ├── enabled INTEGER                                        │
│  ├── base_url, api_key, model, ...                         │
│  └── created_at, updated_at                                │
├─────────────────────────────────────────────────────────────┤
│  ai_conversations (AI 对话上下文 - 内存缓存 + 延迟持久化)    │
│  ├── id INTEGER PRIMARY KEY                                 │
│  ├── user_id TEXT                                           │
│  ├── role, content, timestamp                              │
├─────────────────────────────────────────────────────────────┤
│  ai_settings (全局 AI 配置 - KV 存储)                        │
│  ├── key TEXT PRIMARY KEY                                   │
│  └── value TEXT                                             │
├─────────────────────────────────────────────────────────────┤
│  logs (日志)                                                │
│  ├── id INTEGER PRIMARY KEY                                 │
│  ├── type, action, data, timestamp                         │
└─────────────────────────────────────────────────────────────┘
```

### 1. users — 用户基础信息表

```sql
CREATE TABLE users (
  qq_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 2. user_settings — 用户设置表（EAV 模式）

**设计理由**：支持无限扩展，新增配置无需改表结构

```sql
CREATE TABLE user_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
```

**存储内容示例**：

| key | value | 说明 |
|---|---|---|
| `response_type` | `"voice"` | 回复模式 |
| `theme` | `"dark"` | 主题偏好 |
| `language` | `"zh-CN"` | 语言偏好 |
| `notification` | `"true"` | 通知开关 |
| `custom_prompt` | `"请用简洁风格回复"` | 用户自定义提示词 |

### 3. user_ai_configs — 用户 AI 配置表

**设计理由**：字段固定，便于查询和索引

```sql
CREATE TABLE user_ai_configs (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  base_url TEXT,
  api_key TEXT,
  model TEXT,
  max_tokens INTEGER DEFAULT 2048,
  temperature REAL DEFAULT 0.7,
  max_context_rounds INTEGER DEFAULT 10,
  default_reply_type TEXT DEFAULT 'text',
  custom_system_prompt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**使用逻辑**：

```typescript
// 获取用户自定义 AI 配置
const userAiConfig = db.prepare(
  'SELECT * FROM user_ai_configs WHERE user_id = ? AND enabled = 1'
).get(userId)

// 优先级回退：用户配置 > 全局配置 > 默认值
const aiConfig = userAiConfig || globalAiConfig || defaultAiConfig
```

### 4. ai_conversations — AI 对话上下文表

**设计理由**：频繁读写，使用内存缓存 + 延迟持久化

```sql
CREATE TABLE ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_ai_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_timestamp ON ai_conversations(timestamp);
```

### 5. ai_settings — 全局 AI 配置表

```sql
CREATE TABLE ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 6. logs — 日志表

```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_logs_type ON logs(type);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
```

---

## AI 上下文存储策略

### 问题分析

AI 上下文的使用特点：

| 特点 | 说明 |
|---|---|
| **频繁读取** | 每次用户消息都要读取上下文 |
| **频繁写入** | 每次 AI 回复都要保存上下文 |
| **生命周期短** | 只保留最近 10 轮（20 条消息） |
| **数据量小** | 每个用户几十 KB |

### 方案对比

| 方案 | 读写性能 | 持久化 | 内存占用 | 适合 2c2g |
|---|---|---|---|---|
| **纯 SQLite** | ⭐⭐⭐ 中等 | ✅ | 低 | ⚠️ 频繁 IO |
| **纯内存 Map** | ⭐⭐⭐⭐⭐ 最快 | ❌ 重启丢失 | 中 | ✅ |
| **Redis** | ⭐⭐⭐⭐⭐ | ✅ | 高 | ❌ 额外服务 |
| **内存缓存 + SQLite** | ⭐⭐⭐⭐ | ✅ | 中 | ✅ 推荐 |

### ✅ 最终方案：内存缓存 + 延迟持久化

```
┌─────────────────────────────────────────────────────────┐
│                    AI 上下文存储架构                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   用户消息 ──► 内存缓存 (Map) ──► AI 模型               │
│                    │                                    │
│                    │ 标记 dirty                          │
│                    ▼                                    │
│              定时批量写入 (30s)                          │
│                    │                                    │
│                    ▼                                    │
│               SQLite 持久化                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**工作流程：**

1. **读取**：先查内存缓存，未命中再读 SQLite
2. **写入**：只写内存，标记为 dirty
3. **持久化**：每 30 秒批量写入 dirty 数据到 SQLite
4. **恢复**：重启时从 SQLite 加载到内存

**实现示例：**

```typescript
class AIContextManager {
  private cache = new Map<string, ConversationEntry[]>()
  private dirty = new Set<string>()
  private flushTimer: NodeJS.Timeout

  constructor() {
    this.loadFromDB()  // 启动时加载
    this.flushTimer = setInterval(() => this.flush(), 30000)
  }

  getContext(userId: string, maxRounds: number = 10): ConversationEntry[] {
    const context = this.cache.get(userId) || []
    return context.slice(-maxRounds * 2)
  }

  saveContext(userId: string, userMsg: string, assistantMsg: string): void {
    const context = this.cache.get(userId) || []
    const now = Date.now()

    context.push(
      { role: 'user', content: userMsg, timestamp: now },
      { role: 'assistant', content: assistantMsg, timestamp: now + 1 }
    )

    // 裁剪到最大轮数
    if (context.length > 20) {
      context.splice(0, context.length - 20)
    }

    this.cache.set(userId, context)
    this.dirty.add(userId)  // 标记需要持久化
  }

  private flush(): void {
    if (this.dirty.size === 0) return

    const transaction = db.transaction(() => {
      for (const userId of this.dirty) {
        const context = this.cache.get(userId)
        if (!context) continue

        db.prepare('DELETE FROM ai_conversations WHERE user_id = ?').run(userId)

        const insert = db.prepare(
          'INSERT INTO ai_conversations (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
        )
        for (const msg of context) {
          insert.run(userId, msg.role, msg.content, msg.timestamp)
        }
      }
    })

    transaction()
    this.dirty.clear()
  }

  private loadFromDB(): void {
    const rows = db.prepare(
      'SELECT * FROM ai_conversations ORDER BY user_id, timestamp'
    ).all()

    for (const row of rows) {
      const context = this.cache.get(row.user_id) || []
      context.push({
        role: row.role,
        content: row.content,
        timestamp: row.timestamp
      })
      this.cache.set(row.user_id, context)
    }
  }
}
```

### 内存占用估算

| 项目 | 计算 | 内存 |
|---|---|---|
| 每条消息 | ~500 字节 | - |
| 每用户 10 轮 | 20 条 × 500B | ~10 KB |
| 100 用户 | 100 × 10KB | ~1 MB |
| 1000 用户 | 1000 × 10KB | ~10 MB |

**结论**：2c2g 服务器完全够用

---

## 存储策略总结

| 组件 | 存储方式 | 理由 |
|---|---|---|
| **AI 上下文** | 内存缓存 + SQLite | 频繁读写，需要高性能 |
| **用户设置** | SQLite (EAV) | 读写不频繁，需要持久化，无限扩展 |
| **用户 AI 配置** | SQLite (固定表) | 读写不频繁，结构固定 |
| **全局 AI 配置** | SQLite (KV) | 读写不频繁 |
| **日志** | SQLite | 追加写入，查询为主 |

---

## 扩展性设计

### 添加新功能示例

**场景1：用户自定义系统提示词**

```typescript
// 只需在 user_ai_configs 表中已有 custom_system_prompt 字段
db.prepare(
  'UPDATE user_ai_configs SET custom_system_prompt = ? WHERE user_id = ?'
).run(prompt, userId)
```

**场景2：用户自定义回复模板**

```typescript
// 使用 user_settings 表（EAV 模式）
db.prepare(
  'INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'
).run(userId, 'reply_template', '你好，{name}！{reply}', Date.now())
```

**场景3：用户主题偏好**

```typescript
// 使用 user_settings 表（EAV 模式）
db.prepare(
  'INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'
).run(userId, 'theme', 'dark', Date.now())
```

---

## 内存优化策略

### 1. 数据库配置

```typescript
import Database from 'better-sqlite3'

const db = new Database('data/napcat.db')

// WAL 模式 — 并发读性能更好
db.pragma('journal_mode = WAL')

// 限制缓存大小 — 2MB
db.pragma('cache_size = -2000')

// 同步模式 — 平衡性能和安全
db.pragma('synchronous = NORMAL')

// 临时表存储在内存
db.pragma('temp_store = MEMORY')
```

### 2. 查询优化

```typescript
// ✅ 好：按需查询
const user = db.prepare('SELECT * FROM users WHERE qq_id = ?').get(qqId)

// ❌ 坏：全表扫描
const users = db.prepare('SELECT * FROM users').all()

// ✅ 好：分页查询
const logs = db.prepare(
  'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?'
).all(50, 0)
```

### 3. 定期清理

```typescript
// 清理 30 天前的 AI 上下文
db.prepare(
  'DELETE FROM ai_conversations WHERE timestamp < ?'
).run(thirtyDaysAgo)

// 清理 7 天前的日志
db.prepare(
  'DELETE FROM logs WHERE timestamp < ?'
).run(sevenDaysAgo)

// 定期执行 VACUUM 释放空间
db.exec('VACUUM')
```

---

## 数据迁移

### 从 JSON 迁移到 SQLite

```typescript
// 1. 迁移用户配置
const userConfigs = JSON.parse(readFileSync('data/user-configs.json', 'utf-8'))
for (const [qqId, config] of Object.entries(userConfigs.users)) {
  // 插入 users 表
  db.prepare('INSERT OR IGNORE INTO users (qq_id, created_at, updated_at) VALUES (?, ?, ?)')
    .run(qqId, Date.now(), Date.now())

  // 插入 user_settings 表
  db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
    .run(qqId, 'response_type', config.responseType, Date.now())
}

// 2. 迁移 AI 上下文
const aiContext = JSON.parse(readFileSync('data/ai-context.json', 'utf-8'))
for (const [userId, conversation] of Object.entries(aiContext.conversations)) {
  for (const msg of conversation.messages) {
    db.prepare('INSERT INTO ai_conversations (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)')
      .run(userId, msg.role, msg.content, msg.timestamp)
  }
}
```

---

## 预期收益

| 指标 | 迁移前 (JSON) | 迁移后 (SQLite) |
|---|---|---|
| 内存占用 | 50-100MB | 20-30MB |
| 查询速度 | O(n) 遍历 | O(log n) 索引 |
| 并发支持 | ❌ 不安全 | ✅ WAL 模式 |
| 数据完整性 | ⚠️ 可能损坏 | ✅ ACID 事务 |
| 存储效率 | 低 | 高（压缩） |
| 扩展性 | ❌ 需改代码 | ✅ EAV 模式 |

---

## 实施计划

- [x] Phase 1: 安装依赖，创建数据库封装
- [x] Phase 2: 设计表结构（v2 可扩展架构）
- [ ] Phase 3: 实现 AI 上下文内存缓存
- [ ] Phase 4: 迁移现有数据
- [ ] Phase 5: 替换现有 JSON 调用
- [ ] Phase 6: 实现用户自定义 AI 配置
- [ ] Phase 7: 性能测试和优化
- [ ] Phase 8: 部署到生产环境

---

## 未来扩展方向

| 功能 | 实现方式 | 是否需要改表 |
|---|---|---|
| 用户自定义提示词 | user_ai_configs.custom_system_prompt | ❌ 已预留 |
| 用户主题偏好 | user_settings (EAV) | ❌ 无需改 |
| 用户语言偏好 | user_settings (EAV) | ❌ 无需改 |
| 用户通知设置 | user_settings (EAV) | ❌ 无需改 |
| 用户自定义回复模板 | user_settings (EAV) | ❌ 无需改 |

---

## 参考资料

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [SQLite 官方文档](https://www.sqlite.org/docs.html)
- [SQLite 性能优化](https://www.sqlite.org/optimization.html)
- [EAV 模式设计](https://en.wikipedia.org/wiki/Entity–attribute–value_model)
