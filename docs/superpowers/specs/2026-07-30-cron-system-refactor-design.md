# 定时任务系统重构设计

**日期**: 2026-07-30
**状态**: 待实现
**范围**: 定时任务系统全量迁移至新架构（engine/），废弃旧 scheduler.ts 轮询模式

---

## 1. 背景与目标

### 1.1 当前问题

项目存在两套定时任务架构并存：

1. **旧架构**（`scheduler.ts` + `executor.ts`）：使用 `scheduleType: 'at'|'every'|'cron'` + `repeat: boolean` 区分任务类型。单次任务执行完后 `enabled=false`，与循环任务的"暂停"状态混在一起，前端无法可靠区分。
2. **新架构**（`engine/`）：使用 `ScheduleType: 'oneTime'|'interval'|'cron'` 明确区分，`TaskExecution` 有完整状态机（`pending → running → success/failed/skipped/cancelled`），但尚未完全集成。

### 1.2 目标

- 基于新架构完成全量迁移，废弃旧架构
- 单次任务、循环任务、间隔任务完全分离，各有独立状态语义
- 前端提供完整 CRUD，标签页区分类型，状态清晰可辨
- AI 工具升级，自动判断任务类型，模糊时追问用户
- 间隔任务支持可选截止时间

---

## 2. 类型系统

### 2.1 调度类型

```typescript
// src/lib/cron/engine/types.ts（已有，保持不变）
export type ScheduleType = 'oneTime' | 'cron' | 'interval'
```

| 类型 | 说明 | 对应旧类型 |
|------|------|-----------|
| `oneTime` | 单次执行，指定时间执行一次后结束 | `at` |
| `cron` | 循环执行，按星期/月份/日期+时间循环 | `cron` |
| `interval` | 间隔执行，首次执行后按间隔循环 | `every` |

### 2.2 任务状态（前端展示用）

任务状态由 `enabled` 字段 + 执行记录推断：

**单次任务（oneTime）**：
| 状态 | 条件 | 颜色 |
|------|------|------|
| 待执行 | `enabled=true` 且未执行过 | 蓝色 |
| 执行完成 | `enabled=true` 且已执行成功 | 置灰 |
| 未启用 | `enabled=false`（用户手动关闭） | 置灰 |

**循环/间隔任务（cron/interval）**：
| 状态 | 条件 | 颜色 |
|------|------|------|
| 已启用 | `enabled=true` | 绿色 |
| 已暂停 | `enabled=false` | 黄色 |

### 2.3 执行记录状态机

```typescript
// src/lib/cron/engine/types.ts（已有）
export type ExecutionStatus =
  | 'pending'    // 等待执行
  | 'running'    // 执行中
  | 'success'    // 执行成功
  | 'failed'     // 执行失败（可重试）
  | 'cancelled'  // 已取消
  | 'skipped'    // 已跳过（重试耗尽或错过）
```

状态转换：
```
pending ──CAS抢占──→ running ──成功──→ success
pending ──CAS抢占──→ running ──失败──→ failed ──重试──→ pending
pending ──CAS抢占──→ running ──失败──→ failed ──耗尽──→ skipped
pending ──用户取消──→ cancelled
```

---

## 3. 数据库设计

### 3.1 cron_tasks 表（已有，需扩展）

```sql
CREATE TABLE IF NOT EXISTS cron_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schedule_raw TEXT NOT NULL,
  schedule_type TEXT NOT NULL,          -- 'oneTime' | 'cron' | 'interval'
  schedule_cron TEXT,                    -- cron 表达式（cron 类型使用）
  schedule_interval INTEGER,             -- 间隔秒数（interval 类型使用）
  schedule_at INTEGER,                   -- 执行时间戳/秒（oneTime 类型使用）
  end_time INTEGER,                      -- 截止时间戳/秒（interval 类型可选）
  prompt TEXT NOT NULL,
  tools TEXT,
  output_format TEXT DEFAULT 'text',
  enabled INTEGER DEFAULT 1,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_run_status TEXT,
  last_run_error TEXT,
  run_count INTEGER DEFAULT 0,
  silent INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**变更说明**：
- `schedule_type` 值从 `'at'|'every'|'cron'` 改为 `'oneTime'|'cron'|'interval'`
- 新增 `end_time` 字段（interval 类型可选截止时间）
- 移除 `repeat` 布尔字段（类型本身已隐含是否重复）

### 3.2 task_executions 表（已有，保持不变）

```sql
CREATE TABLE IF NOT EXISTS task_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  schedule_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  tools TEXT,
  output_format TEXT DEFAULT 'text',
  result TEXT,
  error TEXT,
  duration INTEGER,
  attempts INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES cron_tasks(id)
);
```

### 3.3 数据迁移

旧数据迁移规则：
- `schedule_type='at'` → `'oneTime'`
- `schedule_type='every'` → `'interval'`
- `schedule_type='cron'` → `'cron'`
- `repeat` 字段不再使用，忽略

---

## 4. 引擎核心逻辑

### 4.1 CronEngine 调度引擎

基于现有 `src/lib/cron/engine/scheduler.ts`，核心循环：

```
tick():
  1. peek 查看堆顶 Execution
  2. 如果 scheduledAt > now，等待
  3. CAS 抢占 pending → running
  4. 执行 Execution
  5. 执行完成后：
     - oneTime 类型：不再创建新 Execution（任务结束）
     - cron/interval 类型：计算下次执行时间，创建新 Execution 入堆
       - interval 类型需检查 end_time：如果下次执行时间 > end_time，不再创建
```

### 4.2 关键函数

**computeNextExecutionTime**（已有，需扩展 interval 的截止时间检查）：

```typescript
case 'interval':
  if (!task.schedule.interval || task.schedule.interval <= 0) return null
  const nextTime = (afterSec + task.schedule.interval) * 1000
  // 检查截止时间（Task 接口的 endTime 字段）
  if (task.endTime && nextTime > task.endTime * 1000) return null
  return nextTime
```

**scheduleNextExecution**（已有）：
- 返回 `null` 时表示无下次执行，引擎不再为该任务创建新 Execution
- 对于 oneTime 类型，执行成功后返回 `null`，任务自然结束

### 4.3 任务注册与注销

```typescript
// 创建任务后
engine.registerTask(task)
createFirstExecution(task, scheduleConfig)

// 删除任务后
engine.unregisterTask(taskId)
cancelPendingByTask(taskId)

// 暂停任务（cron/interval）
updateTask(taskId, { enabled: false })
cancelPendingByTask(taskId)  // 取消已调度的 Execution

// 启用任务（cron/interval）
updateTask(taskId, { enabled: true })
// 引擎会在 refillBuffer 时自动为启用的任务创建新 Execution

// 重新激活单次任务（编辑后）
updateTask(taskId, { enabled: true, scheduleAt: newTime })
createExecution(...)  // 创建新的 Execution
```

---

## 5. 前端设计

### 5.1 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│  ⏰ 定时任务管理                              [+ 新建任务]   │
├─────────────────────────────────────────────────────────────┤
│  主标签: [全部] [单次任务] [循环任务] [间隔任务]             │
│  子标签:                                                     │
│    单次: [待执行] [执行完成] [未启用]                        │
│    循环/间隔: [已启用] [已暂停]                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ 🟦 任务名称       │  │ 🟩 任务名称       │                 │
│  │ ⏰ 执行时间       │  │ ⏰ 下次执行时间   │                 │
│  │ 📝 提示词预览     │  │ 📝 提示词预览     │                 │
│  │ [开关] [编辑]     │  │ [开关] [编辑]     │                 │
│  └──────────────────┘  └──────────────────┘                 │
│  ┌──────────────────┐                                       │
│  │ ⬜ 已完成任务(灰) │                                       │
│  │ ⏰ 执行时间       │                                       │
│  │ [开关-锁定] [编辑]│                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 颜色规则

| 状态 | 背景色 | 文字色 | 开关状态 |
|------|--------|--------|----------|
| 待执行（单次） | 蓝色 | 蓝色 | 可操作 |
| 执行完成 | 灰色 | 灰色 | 锁定（不可操作） |
| 未启用 | 灰色 | 灰色 | 可操作 |
| 已启用（循环/间隔） | 绿色 | 绿色 | 可操作 |
| 已暂停 | 黄色 | 黄色 | 可操作 |

### 5.3 新建/编辑表单

根据任务类型动态切换表单字段：

**单次执行（oneTime）**：
- 任务名称（文本）
- 执行时间（日期时间选择器，精确到分钟）
- 提示词（文本域）
- 静默模式（开关）

**循环执行（cron）**：
- 任务名称（文本）
- 执行时间（时间选择器）
- 星期选择（多选：周一~周日）
- 月份选择（多选：1~12月，可选）
- 日期选择（多选：1~31日，可选）
- 提示词（文本域）
- 静默模式（开关）

**间隔执行（interval）**：
- 任务名称（文本）
- 首次执行时间（日期时间选择器）
- 间隔（数值 + 单位：分钟/小时/天）
- 截止时间（日期时间选择器，**选填**）
- 提示词（文本域）
- 静默模式（开关）

### 5.4 开关行为

| 任务类型 | 开关 ON | 开关 OFF | 特殊状态 |
|----------|---------|----------|----------|
| 单次-待执行 | 保持待执行 | 标记未启用 | — |
| 单次-执行完成 | 锁定（不可操作） | — | 置灰 |
| 循环/间隔 | 已启用，正常调度 | 已暂停，停止调度 | — |

---

## 6. AI 工具升级

### 6.1 工具定义

```typescript
// create_scheduled_task 参数变更
{
  name: string,                    // 任务名称
  schedule_type: 'oneTime' | 'cron' | 'interval',  // 任务类型
  schedule_config: {               // 调度配置（根据类型不同）
    // oneTime:
    at: string,                    // "2026-08-01T15:30" 或 "15:30"
    // cron:
    time: string,                  // "08:00"
    weekdays: number[],            // [1,2,3,4,5] 周一~周五
    months: number[],              // [1,2,3,...,12]
    days: number[],                // [1,15] 每月1号和15号
    // interval:
    first_run: string,             // 首次执行时间
    interval_value: number,        // 间隔数值
    interval_unit: 'm' | 'h' | 'd',// 间隔单位
    end_time: string | null,       // 截止时间（选填）
  },
  prompt: string,                  // 任务提示词
  silent: boolean,                 // 静默模式
  output_format: 'text' | 'voice'  // 输出格式
}
```

### 6.2 系统提示词

```
## 定时任务管理

### 创建定时任务
当用户要求创建定时任务时：
1. 解析用户意图，提取任务名称、执行类型、执行时间/频率、任务内容
2. 自动判断任务类型：
   - 单次执行（oneTime）：用户说"N分钟后提醒我"、"明天早上8点叫我"、"提醒我一次"
   - 循环执行（cron）：用户说"每天早上8点"、"每周一"、"每月1号"
   - 间隔执行（interval）：用户说"每隔10分钟"、"每2小时"
3. 如果用户意图模糊（如只说"定时提醒我"未说时间或类型），必须追问确认
4. 创建前必须得到用户明确确认，不得自行猜测执行
5. 调用 create_scheduled_task 工具
6. 确认创建成功，告知用户任务详情

### 时间处理规则
- 每次请求时会附带当前系统时间：[系统时间: YYYY-MM-DD HH:mm:ss]
- 所有时间计算基于此系统时间
- 单次任务的时间如果已过，询问用户是否调整为明天

### 其他操作
- 查看任务：调用 list_scheduled_tasks
- 修改任务：调用 update_scheduled_task
- 删除任务：调用 delete_scheduled_task
- 暂停/恢复：调用 pause_scheduled_task / resume_scheduled_task
```

### 6.3 平台级系统提示词注入

在每次 AI 请求的 prompt 末尾追加：

```
[系统时间: YYYY-MM-DD HH:mm:ss]
```

此逻辑在 `src/lib/ai/` 的消息构建层统一实现，确保所有 AI 请求都能感知当前时间。

---

## 7. API 路由设计

### 7.1 路由结构

```
GET    /api/cron-engine/tasks              → 任务列表（支持筛选）
POST   /api/cron-engine/tasks              → 创建任务
PUT    /api/cron-engine/tasks/[id]         → 更新任务
DELETE /api/cron-engine/tasks/[id]         → 删除任务
POST   /api/cron-engine/tasks/[id]/toggle  → 启用/暂停切换
POST   /api/cron-engine/tasks/[id]/run     → 手动触发执行
GET    /api/cron-engine/tasks/[id]/logs    → 执行日志
```

### 7.2 筛选参数

```
GET /api/cron-engine/tasks?type=oneTime&status=pending
```

- `type`: `oneTime` | `cron` | `interval`（按类型筛选）
- `status`: `pending` | `completed` | `disabled` | `enabled` | `paused`（按状态筛选）

---

## 8. 实施计划

### 8.1 阶段一：数据层

1. 修改 `cron_tasks` 表结构（新增 `end_time`，迁移 `schedule_type` 值）
2. 更新 `store.ts` 适配新类型系统
3. 编写数据迁移脚本

### 8.2 阶段二：引擎层

1. 扩展 `CronEngine` 支持 interval 的 `end_time` 检查
2. 更新 `computeNextExecutionTime` 逻辑
3. 实现任务注册/注销/暂停/启用完整生命周期
4. 移除旧 `scheduler.ts` 的依赖

### 8.3 阶段三：API 层

1. 实现 `/api/cron-engine/tasks` 路由
2. 实现 `/api/cron-engine/tasks/[id]` CRUD
3. 实现 toggle/run/logs 子路由
4. 移除旧 `/api/cron` 路由

### 8.4 阶段四：前端

1. 重构 `cron/page.tsx`，实现标签页+子标签筛选
2. 实现动态表单（根据类型切换字段）
3. 实现开关逻辑和颜色状态
4. 实现新建/编辑模态框

### 8.5 阶段五：AI 工具

1. 更新 `tools.ts` 工具定义
2. 更新系统提示词
3. 实现平台级时间注入

### 8.6 阶段六：清理

1. 移除旧 `scheduler.ts`、`executor.ts`、`queue.ts`
2. 移除旧 `commands.ts`（如不再需要）
3. 更新 `index.ts` 导出
4. 更新测试

---

## 9. 文件变更清单

### 新增文件
- `src/app/api/cron-engine/tasks/route.ts`
- `src/app/api/cron-engine/tasks/[id]/route.ts`
- `src/app/api/cron-engine/tasks/[id]/toggle/route.ts`
- `src/app/api/cron-engine/tasks/[id]/run/route.ts`
- `src/app/api/cron-engine/tasks/[id]/logs/route.ts`

### 修改文件
- `src/lib/cron/engine/types.ts` — 扩展 `Task` 接口增加 `endTime?: number` 字段
- `src/lib/cron/engine/scheduler.ts` — 扩展引擎逻辑
- `src/lib/cron/engine/processor.ts` — 扩展 `computeNextExecutionTime`
- `src/lib/cron/store.ts` — 适配新类型系统，数据迁移
- `src/lib/cron/tools.ts` — 更新 AI 工具定义和系统提示词
- `src/lib/cron/index.ts` — 更新导出
- `src/lib/ai/` 相关文件 — 实现时间注入
- `src/app/(authenticated)/cron/page.tsx` — 重构前端

### 废弃文件
- `src/lib/cron/scheduler.ts`（旧调度器）
- `src/lib/cron/executor.ts`（旧执行器）
- `src/lib/cron/queue.ts`（旧并发队列）
- `src/app/api/cron/route.ts`（旧 API 路由）

---

## 10. 风险与注意事项

1. **数据迁移**：旧数据 `at/every/cron` → `oneTime/interval/cron` 需要一次性迁移脚本
2. **引擎切换**：从旧调度器切换到新引擎时，需要确保已调度的任务不丢失
3. **向后兼容**：AI 工具的参数变更需要同步更新系统提示词
4. **前端状态**：新架构下任务状态由 `enabled` + 执行记录推断，前端需要正确处理各种组合
