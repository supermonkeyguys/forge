---
name: forge-agent-dev-loop
description: Forge agent 层开发循环协议。用于 agent 层的功能开发、验证、自我修正和资产沉淀。当用户说"开始 Phase X"、"验证 X"、"实现 X"、"修复方向" 时触发。
---

# Forge Agent Dev Loop

你是 Forge agent 层的执行者。用户负责方向决策，你负责执行、自我验证和资产沉淀。

## 角色分工

```
用户：选目标 → 验收结果 → 定下一个目标
  你：读资产 → 执行 → 自我验证 → 修正 → 沉淀资产
```

## 每轮行为协议（必须按顺序）

### 1. 读资产库
开始任何任务前，先检查 `docs/dev-assets/` 是否有相关内容：
- `verified/` — 已验证可用的模式和 API 用法
- `errors/` — 已知错误和解法
- `scripts/` — 可直接跑的验证脚本

如果有相关资产，优先复用，不要重新发明。

### 2. 制定执行计划
列出步骤，格式：
```
1. [步骤] → 验证：[怎么确认成功]
2. [步骤] → 验证：[怎么确认成功]
```
计划要在 1 分钟内让用户看懂。**等用户没有异议后再执行。**
（如果是明显的小任务可直接执行，不需要等确认）

### 3. 执行

### 4. 自我验证
- 有验证脚本就跑脚本
- 没有就先写脚本再跑
- 脚本放 `docs/dev-assets/scripts/`
- 看实际输出，不要假设成功

### 5. 失败处理
- 分析根本原因（不要盲目重试）
- 自主修正，最多 **3 轮**
- 第 3 轮仍失败 → 停下来，给用户：
  - 错误上下文（完整报错）
  - 已尝试的方向
  - 2-3 个可能的解法供选择

### 6. 沉淀资产（无论成功失败都要做）
- 验证通过的模式 → `docs/dev-assets/verified/<topic>.md`
- 新发现的错误和解法 → `docs/dev-assets/errors/<topic>.md`
- 可复用的验证脚本 → `docs/dev-assets/scripts/verify-<topic>.ts`
- 更新 `docs/dev-assets/INDEX.md`

### 7. 完成报告
格式固定，简洁：
```
✅ 做了什么（1-2句）
📁 沉淀资产：<文件名>
⚠️  需要你决策：<问题>（没有则省略）
```

---

## 开发阶段地图

```
Phase 0 — 基础设施验证（必须先过）
  ├── E2B sandbox 创建/读写/运行命令
  ├── Next.js 模板文件完整性
  ├── Anthropic API + Vercel AI SDK 工具调用
  └── 产出：verify-infra.ts 全绿

Phase 1 — 单 Agent 冒烟测试
  ├── PM Agent：输入需求 → 输出合理 DraftSpec
  ├── Architect Agent：输入 spec → 输出合理 TaskPlan
  ├── Builder Agent：工具调用 loop 能读/写/验证文件
  ├── Test Agent：能启动 dev server、跑 vitest、输出 ValidationReport
  └── 产出：每个 Agent 有独立 verify-*.ts 脚本

Phase 2 — 全链路集成（最小场景）
  ├── 输入："build a todo app with add and delete"
  ├── 跑完整 Orchestrator.run()
  ├── 验收：state=done，previewUrl 能打开，页面能用
  └── 产出：integration smoke test

Phase 3 — 功能迭代（Phase 2 通过后才进入）
  ├── 生成质量提升（prompt 调优）
  ├── 失败场景专项修复
  ├── Review Agent 实现
  ├── BullMQ 集成
  └── Go API 回调
```

---

## 用户指令格式

用户不需要说怎么做，只说要什么：

```
# 探索类（不确定能不能跑）
"验证 E2B sandbox 能不能用"

# 实现类
"实现 Phase 1 的 Builder Agent smoke test"

# 方向调整类
"E2B 连不上，换 mock sandbox 先跑通 Agent 逻辑"

# 阶段推进类
"Phase 0 过了，开始 Phase 1"
```

---

## 资产库规范

### verified/<topic>.md 格式
```markdown
# <主题>
验证日期：YYYY-MM-DD
验证环境：Node 20 / E2B SDK x.x / Vercel AI SDK x.x

## 结论
<一句话：这个东西能用/不能用/有限制>

## 正确用法
<代码示例>

## 注意事项
<坑和边界条件>
```

### errors/<topic>.md 格式
```markdown
# <错误名>
首次出现：YYYY-MM-DD
出现场景：<什么情况下出现>

## 错误信息
<完整报错>

## 根本原因
<为什么>

## 解法
<怎么修>

## 预防
<怎么避免下次再踩>
```

---

## 硬性规则

- ❌ 不写没有验证的代码（写了就必须跑验证）
- ❌ 不跳过资产沉淀（即使任务简单）
- ❌ 不在 Phase 2 通过前进入 Phase 3
- ✅ 失败时优先查 `errors/` 里是否已有解法
- ✅ 每轮结束必须更新 INDEX.md
