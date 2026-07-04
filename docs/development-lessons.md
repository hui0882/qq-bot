# 定时任务系统开发经验总结

## 1. 循环依赖问题

### 问题描述
在修改定时任务工具路由时，`ai/tools.ts` 直接导入 `cron/tools.ts` 的 `CRON_TOOLS` 常量，导致循环依赖：
```
ai/tools.ts → cron/tools.ts → (可能间接依赖 ai 模块)
```

### 错误表现
```
ReferenceError: Cannot access 'CRON_TOOLS' before initialization
```

### 解决方案
**方案一：将常量定义移到使用方文件中**
```typescript
// ai/tools.ts - 直接定义工具，不导入
const CRON_TOOLS: ToolDefinition[] = [
  { type: 'function', function: { name: 'create_scheduled_task', ... } },
  // ...
]
```

**方案二：使用动态导入**
```typescript
// 需要调用时再导入
case 'create_scheduled_task': {
  const { executeCronToolCall } = await import('@/lib/cron/tools')
  return await executeCronToolCall(toolName, args, userId)
}
```

### 预防措施
- 避免模块间直接导入常量/变量
- 使用动态导入 `await import()` 处理可能产生循环的依赖
- 将类型定义（`type`）和实现分离，类型导入不会导致循环依赖

---

## 2. 工具未定义/未知工具问题

### 问题描述
AI 调用工具时返回"未知工具"错误。

### 原因分析
1. **工具路由缺失**：`switch` 语句中只处理了部分工具
2. **工具定义未注册**：工具定义数组未包含所有工具
3. **循环依赖导致初始化失败**：模块加载顺序错误

### 解决方案
```typescript
// 确保所有工具都在 switch 中有对应的 case
case 'create_scheduled_task':
case 'list_scheduled_tasks':      // ← 必须添加
case 'get_scheduled_task_detail': // ← 必须添加
case 'update_scheduled_task':     // ← 必须添加
case 'delete_scheduled_task':     // ← 必须添加
case 'pause_scheduled_task':      // ← 必须添加
case 'resume_scheduled_task':     // ← 必须添加
  return await executeCronToolCall(toolName, args, userId)
```

### 预防措施
- 添加新工具时，同时更新：
  1. 工具定义数组（`CRON_TOOLS`）
  2. 执行路由（`executeToolCall` 的 switch）
  3. 具体实现函数
- 使用枚举或常量管理工具名称，避免拼写错误

---

## 3. React useEffect 竞态条件

### 问题描述
页面数据先显示后消失，抓包发现有两次 API 请求，第二次返回空数据覆盖了第一次。

### 原因分析
```typescript
// 问题代码：两个独立的 useEffect
useEffect(() => {
  fetchLoginInfo().then(data => setUserId(data.userId)) // ← 更新 userId
}, [])

useEffect(() => {
  fetchTasks(userId) // ← userId 变化时重新执行
}, [userId])
```

执行顺序：
1. 第一次渲染：`userId = 'default'`，执行 `fetchTasks` → 获取到数据
2. `fetchLoginInfo` 完成，`setUserId('real')` 触发重新渲染
3. `userId` 变化，再次执行 `fetchTasks('real')` → 返回空数据覆盖

### 解决方案
**合并为单个 useEffect，串行执行**
```typescript
useEffect(() => {
  const init = async () => {
    // 1. 先获取 userId
    const uid = await fetchLoginInfo()
    setUserId(uid)

    // 2. 用确定的 userId 查询
    const tasks = await fetchTasks(uid)
    setTasks(tasks)
  }
  init()
}, []) // 空依赖数组，只执行一次
```

### 预防措施
- 避免多个 useEffect 之间有数据依赖
- 如果 B 依赖 A 的结果，应该在同一个 useEffect 中串行执行
- 使用 `useCallback` 时注意依赖项变化会创建新函数

---

## 4. SSR 与客户端状态不一致

### 问题描述
服务端渲染（SSR）显示"加载中"，但客户端 JavaScript 应该接管并显示数据。

### 注意事项
- `'use client'` 组件在 SSR 时会执行一次，但 `useEffect` 只在客户端执行
- 测试时 `curl` 只能看到 SSR 输出，看不到客户端 JavaScript 的效果
- 真正的测试需要在浏览器中进行

---

## 5. 中间件与 API 认证

### 问题描述
前端页面能访问，但客户端 JavaScript 调用 API 时被重定向到登录页。

### 原因
Next.js 中间件对所有请求生效，包括客户端的 `fetch` 请求。

### 解决方案
```typescript
// middleware.ts
const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron'] // ← 添加公开路径
```

### 预防措施
- 区分需要认证的页面和公开的 API
- 前端页面可以需要认证，但某些 API 可能需要公开访问

---

## 6. 调度规则类型区分

### 问题描述
用户说"一分钟后提醒我"，系统创建为 `every 1m`（间隔执行）而非 `at`（单次执行）。

### 解决方案
1. **优化 AI 提示词**：明确区分单次任务和重复任务
   ```
   单次任务："N分钟后提醒我" → at 格式，repeat=false
   重复任务："每隔N分钟" → every 格式，repeat=true
   ```

2. **前端显示逻辑**：
   - `scheduleType === 'at' || !repeat` → 单次任务
   - 单次任务执行后显示"已执行完成"，而非"暂停"

---

## 7. 开发检查清单

### 添加新工具时
- [ ] 在工具定义数组中添加工具定义
- [ ] 在执行路由的 switch 中添加 case
- [ ] 实现具体的执行函数
- [ ] 测试工具调用是否正常

### 修改 React 组件时
- [ ] 检查 useEffect 依赖项是否正确
- [ ] 避免多个 useEffect 之间的数据竞争
- [ ] 测试页面加载和数据刷新逻辑

### 修改 API 时
- [ ] 检查中间件是否需要更新 PUBLIC_PATHS
- [ ] 测试客户端 fetch 是否能正常访问
- [ ] 验证返回数据格式是否正确

### 遇到模块错误时
- [ ] 检查是否有循环依赖
- [ ] 尝试使用动态导入 `await import()`
- [ ] 检查模块初始化顺序

---

## 8. 调试技巧

### 查看日志
```bash
# 实时查看服务器日志
tail -f /tmp/nextjs.log

# 查看结构化日志
cat data/logs/$(date +%Y-%m-%d).jsonl | jq .

# 过滤特定类型的日志
grep "tool" data/logs/*.jsonl
```

### 测试 API
```bash
# 测试 GET 请求
curl "http://localhost:8090/api/cron?userId=123"

# 测试 POST 请求
curl -X POST "http://localhost:8090/api/cron" \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","taskId":"xxx"}'
```

### 清理缓存
```bash
# 清理 Next.js 编译缓存
rm -rf .next
npm run build
```
