# NapCat 项目开发规范

## 多 Agent 开发流程

本项目采用多 Agent 协作开发流程，主 Agent 作为协调者，不直接执行开发和测试任务。

### Agent 角色定义

| Agent | 配置文件 | 用途 | subagent_type |
|-------|----------|------|---------------|
| 需求分析 Agent | `.claude/agents/requirement-analyzer.md` | 需求拆分、问题定位 | `requirement-analyzer` |
| 开发 Agent | `.claude/agents/developer.md` | 代码开发、bug 修复 | `developer` |
| 单元测试 Agent | `.claude/agents/unit-tester.md` | 编写和运行单元测试 | `unit-tester` |
| 测试 Agent | `.claude/agents/post-dev-tester.md` | 全链路测试 | `post-dev-tester` |
| 日志 Agent | `.claude/agents/log-reader.md` | 日志读取分析 | `log-reader` |

### 执行规则

#### 必须使用专门 Agent 的操作

| 操作 | 执行者 | 说明 |
|------|--------|------|
| 需求分析 | 需求分析 Agent | 使用 `subagent_type="requirement-analyzer"` |
| 问题定位 | 需求分析 Agent | 结合代码和日志定位问题 |
| 代码开发 | 开发 Agent | 使用 `subagent_type="developer"` |
| Bug 修复 | 开发 Agent | 使用 `subagent_type="developer"` |
| 单元测试 | 单元测试 Agent | 使用 `subagent_type="unit-tester"` |
| 全链路测试 | 测试 Agent | 使用 `subagent_type="post-dev-tester"` |

#### 主 Agent 禁止的操作

- ❌ 不能直接编写或修改代码文件（必须使用开发 Agent）
- ❌ 不能直接执行开发或 bug 修复任务
- ❌ 不能直接运行测试脚本进行全链路测试
- ❌ **绝对禁止在没有用户确认的情况下合并分支到 main**
- ❌ **绝对禁止在没有用户确认的情况下推送到远程仓库**

#### 主 Agent 允许的操作

- ✅ 创建分支/worktree
- ✅ 启动子 Agent（使用正确的 subagent_type）
- ✅ 审查子 Agent 的结果
- ✅ 合并分支（用户确认后）
- ✅ 推送到远程仓库（用户确认后）

### 流程设计

#### 并行调度规则（主 Agent 自主决策）

主 Agent 根据需求规模自主决定启动的 Agent 数量，不必局限于串行执行：

| 场景 | 并行度 |
|------|--------|
| 单一功能点/小改动 | 1 个 developer，串行 |
| 多个独立模块（文件不重叠） | 按模块并行多个 developer |
| 多个独立 bug | 并行修复 |
| 单元测试 | 按模块并行多个 unit-tester |
| 全链路测试 | 串行（共享运行环境） |

并行必须同时满足以下条件：
1. requirement-analyzer 报告已明确拆分边界（互不依赖的子任务）
2. 文件所有权不重叠 — 主 Agent 启动时为每个 agent 划定文件范围，禁止越界
3. 依赖模块先启动，或接口先行约定

主 Agent 协调职责：
- 为每个 agent 划定文件范围，禁止越界修改
- 汇总各 agent 报告；文件冲突时后完成者适配先完成者
- 统一编译自测与合并测试在最后完成的 agent 之后执行

#### 新功能开发流程

```
用户需求
  → 主 Agent 启动 requirement-analyzer Agent 分析需求
  → 主 Agent 创建分支
  → 主 Agent 启动一个或多个 developer Agent 并行开发（包含编译自测，遵循并行调度规则）
  → 主 Agent 启动 unit-tester Agent 编写并运行单元测试
  → 主 Agent 启动 post-dev-tester Agent 全链路测试
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
  → 主 Agent 启动一个或多个 developer Agent 并行修复（包含编译自测，多个独立 bug 可并行）
  → 主 Agent 启动 unit-tester Agent 编写回归测试
  → 主 Agent 启动 post-dev-tester Agent 全链路测试
  → 主 Agent 审查结果，交由用户确认
  → 用户确认后，主 Agent 合并分支并推送
```

#### 测试失败修复循环

```
测试失败
  → 主 Agent 把测试报告提交给 requirement-analyzer Agent 分析
  → 主 Agent 把分析结果提交给 developer Agent 修复
  → 主 Agent 启动 post-dev-tester Agent 再次测试
  → 最多3次循环，仍有问题则告知用户
```

### 启动子 Agent 示例

```python
# 需求分析
Agent(subagent_type="requirement-analyzer", prompt="分析以下需求：...")

# 代码开发
Agent(subagent_type="developer", prompt="实现以下功能：...")

# 单元测试
Agent(subagent_type="unit-tester", prompt="为以下代码修改编写单元测试：...")

# 全链路测试
Agent(subagent_type="post-dev-tester", prompt="测试以下功能：...")

# 日志分析
Agent(subagent_type="log-reader", prompt="查看以下日志：...")

# 并行：主 Agent 可同时启动多个同类型 Agent（如多个 developer 并行开发不同模块）
```

### 分支保护规则

- ❌ 绝对禁止在 main 分支上直接修改代码
- ✅ 必须创建分支或 worktree 进行开发
- ✅ 用户确认后才能合并到 main 分支
- ✅ 用户确认后才能推送到远程仓库

