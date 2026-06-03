# Project KB Design

> 日期：2026-06-03  
> 状态：已审批

## 目标

将当前 Agent Service 里基于 flat markdown 文件的 `project_context.md` 升级为结构化、按 section 分存的数据库存储，实现版本追踪和精确 upsert。

---

## 问题

现有 `project_context.md` 是 flat markdown，通过字符串操作 upsert section。问题：
- 没有版本追踪，无法回溯哪个 Agent 在哪个 Task 写了什么
- 字符串 diff 脆弱，容易出现内容丢失
- 无法按 section 权限管理
- Goal 结束后无法自动生成摘要

---

## 数据模型

### DB Migration（Go API）

```sql
CREATE TABLE IF NOT EXISTS project_context_sections (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id  TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  heading     TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  agent_role  TEXT        NOT NULL DEFAULT '',
  task_id     TEXT        NOT NULL DEFAULT '',
  version     INT         NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, heading)
);

CREATE INDEX project_context_sections_project_id_idx ON project_context_sections(project_id);
```

---

## API

### Go API 新端点

```
GET  /api/v1/projects/:id/context           → 返回所有 sections（按 heading）
PUT  /api/v1/projects/:id/context/:heading  → upsert 一个 section（version+1）
GET  /api/v1/projects/:id/context/full      → 返回拼接的 markdown（兼容旧接口）
```

### Internal（Agent Service 专用）

```
GET  /internal/projects/:id/context
PUT  /internal/projects/:id/context/:heading
```

---

## Agent Service 改动

### 替换 `upsertContextSection()`

当前：`orchestrator.ts` 里的字符串操作函数。

替换为：调用 `/internal/projects/:id/context/:heading` PUT 接口。

`SandboxInterface` 不再需要 `project_context.md` 的 `readFile`/`writeFile`，改为通过 API 读写。

### `readRelevantContext(role)` 改动

当前：读 `project_context.md` 全文再裁剪。

替换为：`GET /internal/projects/:id/context` → 按 role 过滤 headings → 拼接返回。

---

## 兼容性

- `GET /context/full` 返回拼接 markdown，保持与现有 E2B sandbox 读取兼容
- 迁移期间旧的 `project_context.md` 写入可并行保留，逐步切换

---

## 不在本期范围

- 向量搜索（语义检索）
- Section 的权限控制（哪个 Agent 能写哪个 section）
- Goal 结束后自动生成摘要并写入 Workspace KB
