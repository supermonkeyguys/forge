# DEF-001: Agent Service 内存状态不持久化

**记录日期：** 2026-06-06  
**严重级别：** P2（影响用户体验，不影响构建正确性）  
**状态：** 已知缺陷，暂缓，分阶段修复

---

## 问题描述

Agent service 的所有运行时状态存储在进程内存（`jobStore`）中，进程重启后全部丢失。

### 受影响的数据

| 数据 | 存储位置 | 重启后 |
|---|---|---|
| job 状态（analyzing/building/done） | `jobStore` 内存 | 丢失 |
| 全量 agent events 数组 | `jobStore.events[]` | 丢失 |
| PM draft spec（等待用户确认） | `jobStore.draft` | 丢失 |
| per-task events（step 功能新增） | 任务执行期间内存 | 丢失 |

---

## 触发场景

### 场景 1：Agent service 进程重启（最常见）
**触发条件：** `tsx --watch` 因文件变动重启、手动重启、进程 crash  
**表现：** 正在构建的任务在 DB 中停留在 `building`/`validating` 状态，前端进度条永远不动  
**用户感知：** 刷新页面后任务"卡住"，无法继续也无法看到已完成的步骤  
**恢复方式：** 无法自动恢复，需用户重新发起任务

### 场景 2：Step 写入窗口期进程崩溃
**触发条件：** `commitTask` 完成后、`onTaskComplete` HTTP 调用成功前，进程崩溃  
**表现：** 该 task 的 `task_steps` 记录丢失，前端对应 agent 卡片不展示  
**用户感知：** 构建完成但某个 agent 的执行记录缺失  
**恢复方式：** 无法恢复，step 记录永久缺失（不影响构建结果）

### 场景 3：step 写入时 Go API 暂时不可达
**触发条件：** `POST /internal/tasks/:id/steps` 因网络或 Go API 重启失败  
**表现：** 同场景 2  
**缓解：** 第一版实现加入 3 次重试，覆盖瞬时故障

---

## 当前缓解措施（已实现）

- `useAgentEvents` 在 agent service 无活跃 job 时自动 fallback 到 `restoreFromDB()`，从 tasks 表的 `events_json` 恢复历史 events（仅 terminal 状态有数据）
- Step 写入使用 fire-and-forget + retry 3 次

---

## 根本原因

Agent service 设计为无状态化目标，但实际 `jobStore` 承担了运行时状态的角色，没有持久化层支撑。

---

## 后续修复方向（按优先级）

### 短期（P2）：改善刷新体验
- 修复 `restoreFromDB()` 在 done/failed 任务时不设置 `phase` 的 bug（一行代码）
- 让完成/失败的任务刷新后能正确展示 preview 和状态

### 中期（P1）：step 数据可靠写入
- Step 写入失败时写入本地 retry buffer，服务重启后补偿写入
- 需要在 agent service 侧维护一个轻量的持久化 buffer（SQLite 或文件）

### 长期（P0）：jobStore 持久化
- 将 `jobStore` 状态迁移到 Redis 或 DB，agent service 重启后可恢复 job 执行上下文
- 前提：需要 job 执行本身支持断点续跑（orchestrator 状态机持久化）
- 工作量大，适合生产化阶段

---

## 不在修复范围内的场景

- E2B sandbox 状态（沙箱本身有超时机制，重建成本可接受）
- `events_json` blob 过大问题（随 task_steps 功能落地后会弃用）
