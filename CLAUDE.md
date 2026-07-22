# NapCat 项目开发规范

## 多 Agent 开发流程

本项目采用多 Agent 协作开发流程。**主 Agent 仅作为协调者和调度者**，负责与各 subagent 沟通、分配任务和审查结果，**不得直接执行任何开发、测试或代码修改操作**。

---

### Agent 角色定义

| Agent | 配置文件 | 用途 | subagent_type |
|-------|----------|------|---------------|
| 主 Agent | 无（当前会话） | **协调调度**，与 subagent 沟通 | 无 |
| 需求分析 Agent | `.claude/agents/requirement-analyzer.md` | 需求拆分、问题定位 | `requirement-analyzer` |
| 开发 Agent | `.claude/agents/developer.md` | 代码开发、bug 修复、单元自测 | `developer` |
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

### 开发 Agent 规范

**开发 Agent 在完成代码开发后，必须自行进行基本的单元测试。**

#### 自测职责
- 完成开发任务后，**必须**进行基本的单元测试
- 自测失败时自行修复，但**严格限制最多 3 次返工**
- 超过 3 次返工后仍有问题，**必须停止并返回错误报告给主 Agent**

#### 重试限制（硬性约束）
```
开发 → 自测 → 失败 → 修复 → 自测 → 失败 → 修复 → 自测 → 失败 → 停止返回
         ↑                ↑                ↑               ↑
       第1次             第2次             第3次           超限，返回
```

**绝对不允许超过 3 次返工，超过必须立即停止并向主 Agent 报告。**

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
- ❌ **禁止使用 curl、fetch 或其他 HTTP 客户端直接调用接口**

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

### 执行规则总览

| 操作 | 执行者 | 说明 |
|------|--------|------|
| 需求分析 | 需求分析 Agent | 使用 `subagent_type="requirement-analyzer"` |
| 问题定位 | 需求分析 Agent | 结合代码和日志定位问题 |
| 代码开发 | 开发 Agent | 使用 `subagent_type="developer"` |
| Bug 修复 | 开发 Agent | 使用 `subagent_type="developer"` |
| 单元测试/自测 | **开发 Agent** | 开发完成后自行测试，最多3次返工 |
| 全链路测试 | 测试 Agent | 使用 `subagent_type="post-dev-tester"`，只能模拟消息 |
| 日志分析 | 日志 Agent | 使用 `subagent_type="log-reader"` |
| 协调调度 | **主 Agent** | 只做协调，不执行实际操作 |

---

### 流程设计

#### 新功能开发流程

```
用户需求
  → 主 Agent 启动 requirement-analyzer Agent 分析需求
  → 主 Agent 创建分支
  → 主 Agent 启动 developer Agent 开发（包含自测，最多3次返工）
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
  → 主 Agent 启动 developer Agent 修复（包含自测，最多3次返工）
  → 主 Agent 启动 post-dev-tester Agent 全链路测试（模拟消息方式）
  → 主 Agent 审查结果，交由用户确认
  → 用户确认后，主 Agent 合并分支并推送
```

#### 测试失败修复循环

```
测试失败
  → 主 Agent 把测试报告提交给 requirement-analyzer Agent 分析
  → 主 Agent 把分析结果提交给 developer Agent 修复（最多3次返工）
  → 主 Agent 启动 post-dev-tester Agent 再次测试
  → 最多3次循环，仍有问题则告知用户
```

---

### 启动子 Agent 示例

```python
# 需求分析
Agent(subagent_type="requirement-analyzer", prompt="分析以下需求：...")

# 代码开发（包含自测）
Agent(subagent_type="developer", prompt="实现以下功能：...\n\n完成后请进行自测，自测失败可自行修复，但最多返工3次。")

# 全链路测试（严格限制：只能模拟用户消息）
Agent(subagent_type="post-dev-tester", prompt="测试以下功能：...\n\n⚠️ 重要：只能通过执行模拟消息脚本进行测试，禁止使用 API 直接测试。")

# 日志分析
Agent(subagent_type="log-reader", prompt="查看以下日志：...")
```

---

### 分支保护规则

- ❌ 绝对禁止在 main 分支上直接修改代码
- ✅ 必须创建分支或 worktree 进行开发
- ✅ 用户确认后才能合并到 main 分支
- ✅ 用户确认后才能推送到远程仓库

---

### Hooks 配置

本项目配置了 hooks，用于防止主 Agent 越权操作：

- **pre-write hook**：主 Agent 不能直接修改代码文件
- **pre-bash hook**：主 Agent 不能直接执行开发相关的 bash 命令

详见 `.claude/hooks.json` 文件。
