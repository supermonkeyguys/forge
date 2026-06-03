# Workspace KB Design

> 日期：2026-06-03  
> 状态：已审批

## 目标

为整个 Workspace（用户账户级别）提供持久化的共享知识库。所有 Agent 可以查询，有权限的 Agent 可以写入。用于存放公司背景、操作手册、历史项目摘要等跨项目通用知识。

---

## 数据模型

### DB Migration（Go API）

```sql
CREATE TABLE IF NOT EXISTS workspace_kb (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  source_agent TEXT        NOT NULL DEFAULT '',   -- 写入的 Agent key 或 'human'
  source_task  TEXT        NOT NULL DEFAULT '',   -- 关联的 task id（可选）
  verified     BOOLEAN     NOT NULL DEFAULT false, -- 人工确认过
  confidence   FLOAT       NOT NULL DEFAULT 0.8,
  stale_at     TIMESTAMPTZ,                        -- NULL 表示永不过期
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX workspace_kb_user_id_idx ON workspace_kb(user_id);
CREATE INDEX workspace_kb_tags_idx    ON workspace_kb USING GIN(tags);
```

---

## API

### Go API（用户可访问）

```
GET    /api/v1/kb                → 列出知识条目（支持 ?q=&tags= 过滤）
POST   /api/v1/kb                → 创建知识条目（human 写入，直接 verified=true）
PUT    /api/v1/kb/:id            → 更新知识条目
DELETE /api/v1/kb/:id            → 删除知识条目
PATCH  /api/v1/kb/:id/verify     → 标记 verified=true
```

### Internal（Agent Service 专用）

```
GET  /internal/kb?q=<query>&limit=5    → 全文检索返回相关条目
POST /internal/kb                      → Agent 写入（verified=false，需人工确认）
```

Agent 写入的条目默认 `verified=false`，在前端 KB 管理页显示"待确认"状态，人工点 verify 后生效（或直接在 system prompt 注入时过滤只用 `verified=true` 的条目）。

---

## Agent Service 工具扩展

在 `BaseBuilderAgent` 可用工具里新增（需 Level 2+ 权限的 Agent 才能调用）：

### `search_kb` 工具

```ts
search_kb: tool({
  description: '在公司知识库中搜索相关信息。',
  parameters: z.object({
    query: z.string().describe('你想了解的内容'),
  }),
  execute: async ({ query }) => {
    const res = await fetch(
      `${FORGE_API_URL}/internal/kb?q=${encodeURIComponent(query)}&limit=5`,
      { headers: { 'X-Internal-Token': token } },
    )
    const { data } = await res.json()
    return {
      results: data.map((e: any) => ({
        title: e.title,
        content: e.content,
        verified: e.verified,
        tags: e.tags,
      })),
    }
  },
})
```

### `save_to_kb` 工具（需权限）

```ts
save_to_kb: tool({
  description: '将重要信息保存到公司知识库，供所有 Agent 查询使用。',
  parameters: z.object({
    title:   z.string(),
    content: z.string(),
    tags:    z.array(z.string()),
  }),
  execute: async ({ title, content, tags }) => {
    await fetch(`${FORGE_API_URL}/internal/kb`, {
      method: 'POST',
      headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags, sourceAgent: role }),
    })
    return { ok: true, note: 'Entry submitted for human verification.' }
  },
})
```

---

## 前端：KB 管理页

路由：`/settings/kb`（挂在现有 Settings 页面下新增一个 tab）。

功能：
- 知识条目列表（按 verified / stale 状态分组）
- 待确认条目（Agent 提交的，`verified=false`）→ 一键 verify 或删除
- 手动新增/编辑/删除条目
- 标签过滤

---

## 知识注入策略

Agent 执行任务时，系统自动在 system prompt 末尾注入最相关的 Workspace KB 条目（只注入 `verified=true` 且未过期的）：

```ts
const kbEntries = await searchKB(userID, task.description, 3)
const kbContext = kbEntries.length > 0
  ? `\n\n## Company Knowledge\n${kbEntries.map(e => `### ${e.title}\n${e.content}`).join('\n\n')}`
  : ''
```

---

## 不在本期范围

- pgvector 向量嵌入（用全文搜索 MVP）
- 知识条目的版本历史
- 跨 Workspace 的知识共享（公开知识模板）
- 知识自动从已完成 Project KB 提取
