# SQLite 存储架构设计

> 创建时间：2026-06-27
> 状态：规划中

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

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js App                        │
├─────────────────────────────────────────────────────────┤
│  src/lib/db/                                            │
│  ├── index.ts          # 数据库连接和初始化              │
│  ├── schema.ts         # 表结构定义（注释形式）          │
│  ├── queries/          # 查询封装                       │
│  │   ├── users.ts      # 用户配置查询                   │
│  │   ├── ai.ts         # AI 上下文查询                  │
│  │   └── logs.ts       # 日志查询                       │
│  └── migrations/       # 迁移脚本                       │
├─────────────────────────────────────────────────────────┤
│  better-sqlite3 (原生 C++ 绑定)                          │
├─────────────────────────────────────────────────────────┤
│  data/napcat.db  (SQLite 数据库文件)                     │
└─────────────────────────────────────────────────────────┘
```

## 内存优化策略

### 1. 数据库配置

```typescript
import Database from 'better-sqlite3'

const db = new Database('data/napcat.db', {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
})

// WAL 模式 — 并发读性能更好
db.pragma('journal_mode = WAL')

// 限制缓存大小 — 默认 2MB
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

// ✅ 好：只查需要的字段
const user = db.prepare(
  'SELECT qq_id, response_type FROM users WHERE qq_id = ?'
).get(qqId)
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
// 建议每周执行一次
db.exec('VACUUM')
```

## 表结构设计

### users — 用户配置表

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qq_id TEXT NOT NULL UNIQUE,
  response_type TEXT DEFAULT 'text',  -- text | voice
  ai_enabled INTEGER DEFAULT 0,      -- 0 | 1
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_users_qq_id ON users(qq_id);
```

### ai_conversations — AI 上下文表

```sql
CREATE TABLE ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,          -- user | assistant
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_ai_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_timestamp ON ai_conversations(timestamp);
```

### ai_settings — AI 配置表

```sql
CREATE TABLE ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### logs — 日志表

```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,          -- request | event | system | ai
  action TEXT NOT NULL,
  data TEXT,                   -- JSON 格式
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_logs_type ON logs(type);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
```

## 数据迁移

### 从 JSON 迁移到 SQLite

```typescript
// 1. 读取现有 JSON 文件
const userConfigs = JSON.parse(readFileSync('data/user-configs.json', 'utf-8'))
const aiContext = JSON.parse(readFileSync('data/ai-context.json', 'utf-8'))

// 2. 插入到 SQLite
const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (qq_id, response_type, created_at, updated_at) VALUES (?, ?, ?, ?)'
)

for (const [qqId, config] of Object.entries(userConfigs.users)) {
  insertUser.run(qqId, config.responseType, Date.now(), Date.now())
}

// 3. 迁移 AI 上下文
const insertMessage = db.prepare(
  'INSERT INTO ai_conversations (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
)

for (const [userId, conversation] of Object.entries(aiContext.conversations)) {
  for (const msg of conversation.messages) {
    insertMessage.run(userId, msg.role, msg.content, msg.timestamp)
  }
}
```

## 依赖清单

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

## 预期收益

| 指标 | 迁移前 (JSON) | 迁移后 (SQLite) |
|---|---|---|
| 内存占用 | 50-100MB | 20-30MB |
| 查询速度 | O(n) 遍历 | O(log n) 索引 |
| 并发支持 | ❌ 不安全 | ✅ WAL 模式 |
| 数据完整性 | ⚠️ 可能损坏 | ✅ ACID 事务 |
| 存储效率 | 低 | 高（压缩） |

## 实施计划

- [ ] Phase 1: 安装依赖，创建数据库封装
- [ ] Phase 2: 设计表结构，创建迁移工具
- [ ] Phase 3: 迁移现有数据
- [ ] Phase 4: 替换现有 JSON 调用
- [ ] Phase 5: 性能测试和优化
- [ ] Phase 6: 部署到生产环境

## 参考资料

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [SQLite 官方文档](https://www.sqlite.org/docs.html)
- [SQLite 性能优化](https://www.sqlite.org/optimization.html)
