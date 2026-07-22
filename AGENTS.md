# NapCat 项目开发规范

## 多 Agent 开发流程

本项目采用多 Agent 协作开发流程，主 Agent 作为协调者，不直接执行开发和测试任务。

### Agent 角色定义

| Agent | 配置文件 | 用途 | subagent_type |
|-------|----------|------|---------------|
| 需求分析 Agent | `.Codex/agents/requirement-analyzer.md` | 需求拆分、问题定位 | `requirement-analyzer` |
| 开发 Agent | `.Codex/agents/developer.md` | 代码开发、bug 修复 | `developer` |
| 测试 Agent | `.Codex/agents/post-dev-tester.md` | 全链路测试 | `post-dev-tester` |
| 日志 Agent | `.Codex/agents/log-reader.md` | 日志读取分析 | `log-reader` |

### 执行规则

#### 必须使用专门 Agent 的操作

| 操作 | 执行者 | 说明 |
|------|--------|------|
| 需求分析 | 需求分析 Agent | 使用 `subagent_type="requirement-analyzer"` |
| 问题定位 | 需求分析 Agent | 结合代码和日志定位问题 |
| 代码开发 | 开发 Agent | 使用 `subagent_type="developer"` |
| Bug 修复 | 开发 Agent | 使用 `subagent_type="developer"` |
| 单元测试/自测 | 开发 Agent | 由开发 Agent 自行决定是否需要 |
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

#### 新功能开发流程

```
用户需求
  → 主 Agent 启动 requirement-analyzer Agent 分析需求
  → 主 Agent 创建分支
  → 主 Agent 启动 developer Agent 开发（包含单元测试/自测）
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
  → 主 Agent 启动 developer Agent 修复（包含单元测试/自测）
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

# 全链路测试
Agent(subagent_type="post-dev-tester", prompt="测试以下功能：...")

# 日志分析
Agent(subagent_type="log-reader", prompt="查看以下日志：...")
```

### 分支保护规则

- ❌ 绝对禁止在 main 分支上直接修改代码
- ✅ 必须创建分支或 worktree 进行开发
- ✅ 用户确认后才能合并到 main 分支
- ✅ 用户确认后才能推送到远程仓库

### Hooks 配置

本项目配置了 pre-write hook，用于防止主 Agent 直接执行开发任务：

- **触发时机**：写入文件之前
- **检查逻辑**：如果当前操作是开发或 bug 修复，且执行者是主 Agent，则阻止写入
- **目的**：确保使用专门的开发 Agent 执行开发任务

详细的 hooks 配置请查看 `.Codex/hooks.json` 文件。
