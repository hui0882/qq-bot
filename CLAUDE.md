# NapCat 项目开发规范

## 多 Agent 开发流程

本项目采用多 Agent 协作开发流程。**主 Agent 仅作为协调者和调度者**，负责与各 subagent 沟通、分配任务和审查结果，**不得直接执行任何开发、测试或代码修改操作**。

---

### Agent 角色定义

| Agent | 配置文件 | 用途 | subagent_type |
|-------|----------|------|---------------|
| 主 Agent | 无（当前会话） | **协调调度**，与 subagent 沟通 | 无 |
| 需求分析 Agent | `.claude/agents/requirement-analyzer.md` | 需求拆分、问题定位 | `requirement-analyzer` |
| 开发 Agent | `.claude/agents/developer.md` | 代码开发、bug 修复、编译自测 | `developer` |
| 单元测试 Agent | `.claude/agents/unit-tester.md` | 编写和运行单元测试 | `unit-tester` |
| 测试 Agent | `.claude/agents/post-dev-tester.md` | 全链路测试（模拟用户消息） | `post-dev-tester` |
| 日志 Agent | `.claude/agents/log-reader.md` | 日志读取分析 | `log-reader` |

---

### 主 Agent 职责（严格限制）

**主 Agent 的唯一职责是协调和调度各 subagent，不执行任何实际操作。**

#### 主 Agent 禁止的操作（重要）

- ❌ **绝对不能直接编写或修改代码文件**
- ❌ **绝对不能直接运行开发、构建或测试命令**
- ❌ **绝对不能直接执行任何 bash 命令进行开发工作**
- ❌ **绝对不能直接操作文件系统进行开发**
- ❌ **绝对不能在没有用户确认的情况下合并分支到 main**
- ❌ **绝对不能在没有用户确认的情况下推送到远程仓库**

#### 主 Agent 允许的操作（仅限协调）

- ✅ **启动 subagent**（使用正确的 subagent_type 分配任务）
- ✅ **审查 subagent 的结果**
- ✅ **将结果在 subagent 之间传递**（如将分析结果传给开发 Agent）
- ✅ **向用户汇报进度和结果**
- ✅ **在用户确认后**执行 git merge 和 git push
- ✅ **创建分支/worktree**（这是协调工作的一部分）

---

### 开发 Agent 规范（编译自测）

**开发 Agent 在完成代码开发后，必须进行编译检查。**

#### 编译自测职责
- 完成开发任务后，运行 `npm run build` 确保编译通过
- 确保没有 TypeScript 类型错误
- 确保新增代码不会破坏现有功能
- 编译失败时自行修复，直到编译通过

#### 测试建议职责
- 开发完成后，需要在报告中提供测试场景建议，供单元测试 Agent 参考
- 不需要自己编写测试代码

---

### 测试 Agent 规范（严格限制）

**测试 Agent 只能执行以下两种操作，其他一律禁止：**

#### 允许的操作（仅以下两种）
1. **执行模拟用户发送消息的脚本** — 唯一的测试方式
2. **查询日志** — 判断执行情况

#### 绝对禁止的操作
- ❌ **禁止通过内部 CRUD API 进行测试**
- ❌ **禁止直接调用任何业务 API 接口**
- ❌ **禁止执行任何非模拟消息发送的脚本或命令**
- ❌ **禁止直接修改数据库或文件系统来验证功能**
- ❌ **禁止自行构造 HTTP 请求 —— send-test-message.sh 脚本内部的接口调用属于脚本行为**

#### 测试原则
- **所有测试必须从"用户视角"出发** — 通过模拟用户在 QQ 中发送消息来触发功能
- **不允许走任何"后门"或"捷径"** — 不使用 API 直接测试
- **主 Agent 安排任务时必须仔细规划** — 明确测试场景和预期结果

#### 任务安排示例
```
❌ 错误：测试"创建任务"功能
✅ 正确：测试"用户发送消息'帮我创建一个提醒，明天下午3点开会'后，系统是否正确创建了提醒，并在日志中记录了创建成功的事件"
```

---

### 单元测试 Agent 规范

**单元测试 Agent 负责根据开发报告编写和运行 Vitest 单元测试。**

#### 职责
- 根据开发 Agent 的修改内容和测试建议，编写针对性的单元测试
- 运行测试并确保全部通过
- 测试失败时，如果是测试代码问题自行修复；如果是源代码 bug 则报告给主 Agent

#### 限制
- **只能修改 `__tests__/` 目录下的测试文件**
- **不能修改源代码文件**
- **不能执行 git 命令**
- **不能安装依赖**

#### 返工规则
- 测试代码修复：单测 Agent 可自行修复，最多 3 次
- 源代码 bug：报告给主 Agent，由主 Agent 安排开发 Agent 修复

---

### 执行规则总览

| 操作 | 执行者 | 说明 |
|------|--------|------|
| 需求分析 | 需求分析 Agent | 使用 `subagent_type="requirement-analyzer"` |
| 问题定位 | 需求分析 Agent | 结合代码和日志定位问题 |
| 代码开发 | 开发 Agent | 使用 `subagent_type="developer"` |
| Bug 修复 | 开发 Agent | 使用 `subagent_type="developer"` |
| 编译自测 | **开发 Agent** | npm run build + lint，确保编译通过 |
| 单元测试 | 单元测试 Agent | 使用 `subagent_type="unit-tester"`，编写并运行 Vitest 测试 |
| 全链路测试 | 测试 Agent | 使用 `subagent_type="post-dev-tester"`，只能模拟消息 |
| 日志分析 | 日志 Agent | 使用 `subagent_type="log-reader"` |
| 协调调度 | **主 Agent** | 只做协调，管理返工计数 |

---

### 流程设计

#### 新功能开发流程

```
用户需求
  → 主 Agent 启动 requirement-analyzer Agent 分析需求
  → 主 Agent 创建分支
  → 主 Agent 启动 developer Agent 开发（编译自测）
  → 主 Agent 启动 unit-tester Agent 编写并运行单元测试
  → 主 Agent 启动 post-dev-tester Agent 全链路测试（模拟消息方式）
  → 主 Agent 审查结果，交由用户确认
  → 用户确认后，主 Agent 合并分支并推送
```

#### Bug 修复流程

```
用户报告 Bug
  → 主 Agent 启动 requirement-analyzer Agent 分析问题
  → 主 Agent 启动 log-reader Agent 查看日志
  → 主 Agent 把日志结果提交给 requirement-analyzer Agent 定位问题
  → 主 Agent 创建分支
  → 主 Agent 启动 developer Agent 修复（编译自测）
  → 主 Agent 启动 unit-tester Agent 编写回归测试
  → 主 Agent 启动 post-dev-tester Agent 全链路测试（模拟消息方式）
  → 主 Agent 审查结果，交由用户确认
  → 用户确认后，主 Agent 合并分支并推送
```

#### 测试失败修复循环

```
测试失败（单元测试或全链路测试）
  → 主 Agent 把测试报告提交给 requirement-analyzer Agent 分析
  → 主 Agent 把分析结果提交给 developer Agent 修复
  → 主 Agent 重新启动失败的测试 Agent 验证
  → 主 Agent 控制总返工次数，最多 3 轮，仍有问题则告知用户
```

注意：返工计数由主 Agent 在上下文中跟踪，不再依赖各子 Agent 自行计数。

---

### 启动子 Agent 示例

```python
# 需求分析
Agent(subagent_type="requirement-analyzer", prompt="分析以下需求：...")

# 代码开发（编译自测）
Agent(subagent_type="developer", prompt="实现以下功能：...\n\n完成后请进行编译自测（npm run build）。")

# 单元测试
Agent(subagent_type="unit-tester", prompt="为以下代码修改编写单元测试：\n\n[开发 Agent 的报告内容]\n\n请根据修改内容和测试建议编写 Vitest 测试并运行。")

# 全链路测试（严格限制：只能模拟用户消息）
Agent(subagent_type="post-dev-tester", prompt="测试以下功能：...\n\n⚠️ 重要：只能通过执行 send-test-message.sh 脚本进行测试，禁止自行构造 HTTP 请求。")

# 日志分析
Agent(subagent_type="log-reader", prompt="查看以下日志：...")
```

---

### 分支保护规则

- ❌ 绝对禁止在 main 分支上直接修改代码
- ✅ 必须创建分支或 worktree 进行开发
- ✅ 用户确认后才能合并到 main 分支
- ✅ 用户确认后才能推送到远程仓库

