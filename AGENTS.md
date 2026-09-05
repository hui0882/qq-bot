# NapCat 项目开发规范

## 多 Agent 开发流程

本项目采用多 Agent 协作开发流程。**需求按规模分级（S/M/L）：小需求（S 级）由主 Agent 直接开发，中大型需求（M/L 级）走子 Agent 流水线。**

### Agent 角色定义

| Agent | 配置文件 | 用途 | subagent_type |
|-------|----------|------|---------------|
| 需求分析 Agent | `.zcode/agents/requirement-analyzer.md` | 需求拆分、问题定位、规模分级建议 | `requirement-analyzer` |
| 开发 Agent | `.zcode/agents/developer.md` | 代码开发、bug 修复 | `developer` |
| 单元测试 Agent | `.zcode/agents/unit-tester.md` | 编写和运行单元测试 | `unit-tester` |
| 测试 Agent | `.zcode/agents/post-dev-tester.md` | 全链路测试 | `post-dev-tester` |
| 日志 Agent | `.zcode/agents/log-reader.md` | 日志读取分析 | `log-reader` |

### 子 Agent 模型说明

子 Agent **不专门配置模型**（各配置文件不写 `model` 字段），统一跟随当前会话使用的模型；主 Agent 模型由用户自行配置，子 Agent 自动与主 Agent 保持一致。

### 全链路测试 Agent 规范（黑盒测试）

post-dev-tester 是**黑盒测试 agent**：它不阅读任何源代码，只知道本次开发的内容。

- 派发任务时，主 Agent 必须把**需求、测试场景、模拟消息、预期结果、日志验证方式**全部写进派发 prompt（模板见「启动子 Agent 示例」）
- post-dev-tester 只做两件事：跑 `scripts/send-test-message.sh` 脚本 + 查 `data/logs/` 日志，然后出具测试报告
- 与 log-reader 的边界：post-dev-tester 只看与本次测试相关的日志并出报告；log-reader 负责一般性的日志读取分析

### 需求规模分级（主 Agent 自判）

主 Agent 收到需求后，**第一轮先按以下清单自判规模**，无需启动额外 agent：

| 级别 | 判定条件 | 开发方式 |
|------|----------|----------|
| **S 级**（快车道） | 同时满足：① 改动 ≤ 2 个文件（不含公共模块/类型定义/配置文件）；② 预估改动 ≤ 100 行；③ 不涉及新依赖、数据库 schema/迁移、路由新增或变更（middleware/route.ts）、公共 API 签名、跨模块影响；④ 需求明确无歧义 | 主 Agent 直接开发 |
| **M 级**（轻量流水线） | 不满足 S 级，但改动局限在单个模块内 | 1 个 developer + 主 Agent 跑相关单测 |
| **L 级**（完整流水线） | 跨模块 / 新功能 / 涉及 DB·路由·依赖 / 需要全链路测试 | 完整子 Agent 流水线 |

判定规则：
- **拿不准时启动 requirement-analyzer** — 由其输出需求拆分 + 规模分级建议（M/L）
- **S 级判定错误**（开发中发现涉及面超预期）→ 立即停下向用户说明，升级为 M/L 流程

### 执行规则

#### 必须使用专门 Agent 的操作（M/L 级适用）

| 操作 | 执行者 | 说明 |
|------|--------|------|
| 需求分析 | 需求分析 Agent | 使用 `subagent_type="requirement-analyzer"` |
| 问题定位 | 需求分析 Agent | 结合代码和日志定位问题 |
| 代码开发（M/L 级） | 开发 Agent | 使用 `subagent_type="developer"` |
| Bug 修复（M/L 级） | 开发 Agent | 使用 `subagent_type="developer"` |
| 单元测试（M/L 级） | 单元测试 Agent | 使用 `subagent_type="unit-tester"` |
| 全链路测试（L 级） | 测试 Agent | 使用 `subagent_type="post-dev-tester"`，黑盒测试（派发须自包含测试要点） |

#### 主 Agent 禁止的操作

- ❌ **S 级以外**不能直接编写或修改代码文件（必须使用开发 Agent）
- ❌ **S 级以外**不能直接执行开发或 bug 修复任务
- ❌ 不能直接运行测试脚本进行全链路测试（任何级别）
- ❌ **绝对禁止在没有用户确认的情况下合并分支到 main**
- ❌ **绝对禁止在没有用户确认的情况下推送到远程仓库**

#### 主 Agent 允许的操作

- ✅ 创建分支/worktree
- ✅ 启动子 Agent（使用正确的 subagent_type）
- ✅ 审查子 Agent 的结果
- ✅ **S 级需求：直接编写/修改代码**（按上述清单判定）
- ✅ **S 级需求：运行 `bun run build` 和相关单测验证**（vitest 指定文件）
- ✅ 合并分支（用户确认后）
- ✅ 推送到远程仓库（用户确认后）

### 流程设计

#### 并行调度规则（主 Agent 自主决策）

主 Agent 根据需求规模自主决定启动的 Agent 数量，不必局限于串行执行：

| 场景 | 并行度 |
|------|--------|
| S 级小改动 | 主 Agent 直接开发，不启动 developer |
| 单一功能点/M 级 | 1 个 developer，串行 |
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

#### 新功能开发流程（按规模分级）

```
用户需求
  → 主 Agent 按规模清单自判
    ├─ S 级：建分支 → 主 Agent 直接开发 → bun run build + 相关单测 → 用户确认 → 合并推送
    ├─ M 级：requirement-analyzer 出拆分与规模建议 → 建分支
    │        → 1 个 developer 开发（含编译自测）→ 主 Agent 跑相关单测（必要时 unit-tester 补测试）
    │        → 用户确认 → 合并推送
    └─ L 级：requirement-analyzer 分析需求 → 建分支
             → 一个或多个 developer 并行开发（含编译自测，遵循并行调度规则）
             → unit-tester 编写并运行单元测试 → post-dev-tester 全链路测试
             → 用户确认 → 合并推送
```

#### Bug 修复流程（按规模分级）

```
用户报告 Bug
  → 主 Agent 按规模清单自判
    ├─ S 级：建分支 → 主 Agent 直接修复 → bun run build + 相关单测 → 用户确认 → 合并推送
    ├─ M 级：log-reader 查看日志（必要时）→ requirement-analyzer 定位问题 → 建分支
    │        → 1 个 developer 修复（含编译自测）→ 主 Agent 跑相关单测（必要时 unit-tester 补回归测试）
    │        → 用户确认 → 合并推送
    └─ L 级：log-reader 查看日志 → requirement-analyzer 定位问题 → 建分支
             → 一个或多个 developer 并行修复（含编译自测，多个独立 bug 可并行）
             → unit-tester 编写回归测试 → post-dev-tester 全链路测试
             → 用户确认 → 合并推送
```

#### 测试失败修复循环

```
测试失败
  → S 级：主 Agent 直接修复（最多 3 次，仍有问题则告知用户）
  → M/L 级：
      主 Agent 把测试报告提交给 requirement-analyzer Agent 分析
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

# 全链路测试（黑盒：必须自包含全部测试要点，测试 agent 不读代码）
Agent(subagent_type="post-dev-tester", prompt="请按以下测试任务执行黑盒测试（只跑 scripts/send-test-message.sh + 查 data/logs/ 日志，禁止读源码）：

## 测试任务

### 测试功能
[本次开发/修复的功能名称]

### 测试场景1
- **模拟消息：** [发送的消息内容]
- **预期结果：** [系统的预期行为]
- **日志验证：** [通过日志中的哪些字段验证]

### 测试场景2
- **模拟消息：** [发送的消息内容]
- **预期结果：** [系统的预期行为]
- **日志验证：** [通过日志中的哪些字段验证]")

# 日志分析
Agent(subagent_type="log-reader", prompt="查看以下日志：...")

# 并行：主 Agent 可同时启动多个同类型 Agent（如多个 developer 并行开发不同模块）
# S 级需求无需启动任何子 Agent：主 Agent 直接开发
```

### 分支保护规则

- ❌ 绝对禁止在 main 分支上直接修改代码
- ✅ 必须创建分支或 worktree 进行开发
- ✅ 用户确认后才能合并到 main 分支
- ✅ 用户确认后才能推送到远程仓库

