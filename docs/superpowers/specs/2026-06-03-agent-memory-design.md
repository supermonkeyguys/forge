# Agent Memory Design

> 日期：2026-06-03  
> 状态：已审批

## 目标

给每个 Agent（系统 Agent 和自定义 Agent）提供跨任务的私有记忆。Agent 可以主动记住信息，并在执行新任务时自动检索相关记忆注入上下文。越用越聪明。

---

## 数据模型

### DB Migration（Go API）

```sql
CREATE TABLE IF NOT EXISTS agent_memories (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_key       TEXT        NOT NULL,   -- "system:logic" 或 custom agent id
  user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_key      TEXT        NOT NULL,   -- 可选的具名 key，便于精确查询
  content         TEXT        NOT NULL,
  weight          FLOAT       NOT NULL DEFAULT 1.0,  -- 相关性权重，随时间衰减
  access_count    INT         NOT NULL DEFAULT 0,
  last_accessed   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_memories_agent_key_idx ON agent_memories(agent_key, user_id);
CREATE INDEX agent_memories_weight_idx    ON agent_memories(weight DESC);
```

---

## API

### Go API

```
GET    /api/v1/agents/:agentKey/memories          → 列出记忆（按 weight DESC）
POST   /api/v1/agents/:agentKey/memories          → 写入新记忆
DELETE /api/v1/agents/:agentKey/memories/:id      → 删除记忆
```

### Internal（Agent Service 专用）

```
GET  /internal/agents/:agentKey/memories?q=<query>&limit=5
POST /internal/agents/:agentKey/memories
```

`GET` 支持 `q` 参数：对 `content` 做 `ILIKE %q%` 过滤（MVP 阶段用全文搜索，后期替换为向量搜索）。

---

## Agent Service 工具扩展

在 `BaseBuilderAgent` 可用工具里新增两个工具，通过 `buildTools()` 注入：

### `remember` 工具

```ts
remember: tool({
  description: '保存一条信息到你的私有记忆，以便在未来的任务中使用。',
  parameters: z.object({
    key:     z.string().describe('记忆的主题标签，例如 "user_preference" 或 "project_constraint"'),
    content: z.string().describe('要记住的内容'),
  }),
  execute: async ({ key, content }) => {
    await fetch(`${FORGE_API_URL}/internal/agents/${role}/memories`, {
      method: 'POST',
      headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryKey: key, content }),
    })
    return { ok: true }
  },
})
```

### `recall` 工具

```ts
recall: tool({
  description: '从你的私有记忆中检索与当前任务相关的信息。',
  parameters: z.object({
    query: z.string().describe('你想检索的内容描述'),
  }),
  execute: async ({ query }) => {
    const res = await fetch(
      `${FORGE_API_URL}/internal/agents/${role}/memories?q=${encodeURIComponent(query)}&limit=5`,
      { headers: { 'X-Internal-Token': token } },
    )
    const { data } = await res.json()
    return { memories: data.map((m: any) => `[${m.memoryKey}] ${m.content}`) }
  },
})
```

---

## 自动记忆注入

在 `BaseBuilderAgent.executeTask()` 开始时，自动检索与当前 task 相关的记忆并注入 system prompt 末尾：

```ts
// 在 buildTools 之前
const memories = await fetchTopMemories(role, input.task.description, 3)
const memoryContext = memories.length > 0
  ? `\n\n## Your relevant memories\n${memories.map(m => `- ${m.content}`).join('\n')}`
  : ''

// 注入到 systemPrompt 末尾
const system = this.systemPrompt() + memoryContext
```

---

## 权重衰减

后台定期任务（或每次 `GET memories` 时）对超过 30 天未访问的记忆降权：

```sql
UPDATE agent_memories
SET weight = weight * 0.9
WHERE last_accessed < now() - interval '30 days'
  AND weight > 0.1;
```

---

## 不在本期范围

- 向量嵌入（语义搜索替代 ILIKE）
- 记忆的共享（Agent 之间互相读取记忆）
- 自动记忆提取（Task 完成后自动分析并写入记忆）
