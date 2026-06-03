# Knowledge System V2 — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move KB from Settings to a top-level `/knowledge` route. Update hooks to use project-scoped endpoints. Add project selector, type/status filters, URL input, and file upload.

**Architecture:** New `packages/core/kb/` hooks call `/api/v1/projects/:id/kb` (project-scoped). `/knowledge` page shows a project selector + filtered KB list. Remove KBSection from Settings. Ingest form supports text, URL (text input), and file upload (multipart FormData).

**Tech Stack:** React, TypeScript, TanStack Query, Zod, TailwindCSS.

**Prerequisite:** Knowledge V2 API plan must be completed first.

---

## File Map

```
Modified:
  packages/core/kb/use-kb.ts       — update to project-scoped endpoints
  packages/core/kb/index.ts        — add useIngestKB hook
  packages/core/index.ts           — export new hooks

Created:
  apps/web/src/pages/knowledge/index.tsx
  apps/web/src/pages/knowledge/components/KBList.tsx
  apps/web/src/pages/knowledge/components/KBAddForm.tsx

Modified:
  apps/web/src/routes.tsx                         — add /knowledge route
  apps/web/src/components/layout/AppShell.tsx     — add BookOpen nav item
  apps/web/src/pages/settings/index.tsx           — remove 'kb' section
  apps/web/src/pages/settings/components/SettingsNav.tsx  — remove KB nav item
  apps/web/src/pages/settings/components/KBSection.tsx    — delete file
```

---

## Task F1: Update packages/core/kb hooks

**Files:**
- Modify: `packages/core/kb/use-kb.ts`
- Modify: `packages/core/kb/index.ts`
- Modify: `packages/core/index.ts`

- [ ] **Step 1: Rewrite packages/core/kb/use-kb.ts**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'

const KBEntrySchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().optional(),
  userId: z.string(),
  isGlobal: z.boolean(),
  type: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  inputType: z.string(),
  sourceRef: z.string(),
  sourceAgent: z.string(),
  status: z.string(),
  confidence: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type KBEntry = z.infer<typeof KBEntrySchema>
export type KBCreateInput = {
  title: string
  content: string
  type?: string
  tags?: string[]
}

export function useKBEntries(projectId: string, opts?: { type?: string; status?: string }) {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: ['kb', projectId, opts?.type, opts?.status],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (opts?.type) params.set('type', opts.type)
      if (opts?.status) params.set('status', opts.status)
      const path = `/api/v1/projects/${projectId}/kb${params.size ? '?' + params : ''}`
      const raw = await api.getList<KBEntry>(path, token ?? undefined)
      return z.array(KBEntrySchema).parse(raw.data)
    },
    enabled: !!token && !!projectId,
  })
}

export function useCreateKBEntry(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KBCreateInput) =>
      api.post<KBEntry>(`/api/v1/projects/${projectId}/kb`, body, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}

export function useSetKBStatus(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'verify' | 'deprecate' }) =>
      api.put<KBEntry>(`/api/v1/projects/${projectId}/kb/${id}/${action}`, {}, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}

export function useDeleteKBEntry(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/projects/${projectId}/kb/${id}`, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}

export function useIngestKB(projectId: string) {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { type: 'url'; url: string } | { type: 'file'; file: File }) => {
      const formData = new FormData()
      formData.append('inputType', input.type)
      if (input.type === 'url') {
        formData.append('sourceRef', input.url)
        formData.append('title', new URL(input.url).hostname)
      } else {
        formData.append('file', input.file)
        formData.append('title', input.file.name)
      }
      const res = await fetch(`/api/v1/projects/${projectId}/kb/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Ingest failed')
      return res.json()
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb', projectId] }),
  })
}
```

- [ ] **Step 2: Update packages/core/kb/index.ts**

```ts
export {
  useKBEntries,
  useCreateKBEntry,
  useSetKBStatus,
  useDeleteKBEntry,
  useIngestKB,
} from './use-kb.ts'
export type { KBEntry, KBCreateInput } from './use-kb.ts'
```

- [ ] **Step 3: Update packages/core/index.ts exports**

Replace old KB exports:
```ts
// Workspace KB
export {
  useKBEntries, useCreateKBEntry, useSetKBStatus,
  useDeleteKBEntry, useIngestKB,
} from './kb/index.ts'
export type { KBEntry, KBCreateInput } from './kb/index.ts'
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/cookie/project/forge/apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/kb/ packages/core/index.ts
git commit -m "feat(core): update KB hooks to project-scoped endpoints with typed filters and ingest support"
```

---

## Task F2: /knowledge page

**Files:**
- Create: `apps/web/src/pages/knowledge/index.tsx`
- Create: `apps/web/src/pages/knowledge/components/KBList.tsx`
- Create: `apps/web/src/pages/knowledge/components/KBAddForm.tsx`

- [ ] **Step 1: Create KBAddForm.tsx**

```tsx
import { useState, useRef } from 'react'
import { useCreateKBEntry, useIngestKB } from '@forge/core'
import { cn } from '../../../lib/utils'

type InputMode = 'text' | 'url' | 'file'

interface Props { projectId: string }

export function KBAddForm({ projectId }: Props) {
  const [mode, setMode] = useState<InputMode>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('spec')
  const fileRef = useRef<HTMLInputElement>(null)
  const createEntry = useCreateKBEntry(projectId)
  const ingestKB = useIngestKB(projectId)

  const handleSubmit = () => {
    if (mode === 'text') {
      createEntry.mutate(
        { title, content, type },
        { onSuccess: () => { setTitle(''); setContent('') } },
      )
    } else if (mode === 'url') {
      ingestKB.mutate({ type: 'url', url }, { onSuccess: () => setUrl('') })
    } else if (mode === 'file' && fileRef.current?.files?.[0]) {
      ingestKB.mutate({ type: 'file', file: fileRef.current.files[0] }, {
        onSuccess: () => { if (fileRef.current) fileRef.current.value = '' },
      })
    }
  }

  const isPending = createEntry.isPending || ingestKB.isPending

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-4">
      {/* Mode selector */}
      <div className="flex gap-1">
        {(['text', 'url', 'file'] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'rounded-[5px] px-3 py-1 text-[11px] transition-colors',
              mode === m
                ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                : 'text-white/30 hover:text-white/50',
            )}
          >
            {m === 'text' ? '文本' : m === 'url' ? '网址' : '文件'}
          </button>
        ))}
        <div className="flex-1" />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-[5px] border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/60 outline-none"
        >
          <option value="principle">原则</option>
          <option value="spec">设计方案</option>
          <option value="test_asset">测试资产</option>
          <option value="past_output">过往产出</option>
        </select>
      </div>

      {mode === 'text' && (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/15"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容"
            rows={3}
            className="w-full resize-none rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/60 outline-none focus:border-white/15"
          />
        </>
      )}

      {mode === 'url' && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/doc"
          className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/60 outline-none focus:border-white/15"
        />
      )}

      {mode === 'file' && (
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,.mdx"
          className="text-[12px] text-white/40 file:mr-3 file:rounded-[5px] file:border-0 file:bg-white/[0.06] file:px-3 file:py-1 file:text-[11px] file:text-white/50"
        />
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isPending || (mode === 'text' && (!title.trim() || !content.trim())) || (mode === 'url' && !url.trim())}
          className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
        >
          {isPending ? '处理中…' : mode === 'url' ? '提取摘要' : mode === 'file' ? '上传解析' : '添加'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create KBList.tsx**

```tsx
import { useSetKBStatus, useDeleteKBEntry } from '@forge/core'
import type { KBEntry } from '@forge/core'
import { cn } from '../../../lib/utils'

const TYPE_LABELS: Record<string, string> = {
  principle: '原则',
  spec: '设计方案',
  test_asset: '测试资产',
  past_output: '过往产出',
}

const TYPE_COLORS: Record<string, string> = {
  principle: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  spec: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  test_asset: 'text-red-300 border-red-500/30 bg-red-500/10',
  past_output: 'text-green-300 border-green-500/30 bg-green-500/10',
}

interface Props { projectId: string; entries: KBEntry[] }

export function KBList({ projectId, entries }: Props) {
  const setStatus = useSetKBStatus(projectId)
  const deleteEntry = useDeleteKBEntry(projectId)

  const pending  = entries.filter((e) => e.status === 'pending' || e.status === 'processing')
  const verified = entries.filter((e) => e.status === 'verified')

  if (entries.length === 0) {
    return <div className="py-8 text-center text-[12px] text-white/20">还没有知识条目</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-amber-400/60">
            待确认 ({pending.length})
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((e) => (
              <KBCard
                key={e.id}
                entry={e}
                onVerify={() => setStatus.mutate({ id: e.id, action: 'verify' })}
                onDelete={() => deleteEntry.mutate(e.id)}
              />
            ))}
          </div>
        </div>
      )}
      {verified.length > 0 && (
        <div>
          {pending.length > 0 && (
            <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/25">
              已验证 ({verified.length})
            </div>
          )}
          <div className="flex flex-col gap-2">
            {verified.map((e) => (
              <KBCard
                key={e.id}
                entry={e}
                onDeprecate={() => setStatus.mutate({ id: e.id, action: 'deprecate' })}
                onDelete={() => deleteEntry.mutate(e.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KBCard({ entry, onVerify, onDeprecate, onDelete }: {
  entry: KBEntry
  onVerify?: () => void
  onDeprecate?: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn(
      'rounded-[7px] border p-3',
      entry.status === 'pending' || entry.status === 'processing'
        ? 'border-amber-500/20 bg-amber-500/[0.03]'
        : 'border-white/[0.06] bg-white/[0.02]',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-white/80 truncate">{entry.title}</span>
            <span className={cn('rounded-[4px] border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide flex-shrink-0', TYPE_COLORS[entry.type] ?? 'text-white/30 border-white/10 bg-white/5')}>
              {TYPE_LABELS[entry.type] ?? entry.type}
            </span>
            {entry.status === 'processing' && (
              <span className="text-[9px] text-white/30">处理中…</span>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] text-white/40 leading-relaxed">{entry.content}</div>
          {entry.sourceAgent && (
            <div className="mt-1 text-[10px] text-white/20">来源：{entry.sourceAgent}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onVerify && (
            <button onClick={onVerify} className="rounded-[4px] border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] text-green-400 hover:bg-green-500/15">
              确认
            </button>
          )}
          {onDeprecate && (
            <button onClick={onDeprecate} className="rounded-[4px] border border-white/[0.06] px-2 py-1 text-[10px] text-white/25 hover:text-white/40">
              废弃
            </button>
          )}
          <button onClick={onDelete} className="rounded-[4px] border border-white/[0.06] px-2 py-1 text-[10px] text-white/25 hover:border-red-500/30 hover:text-red-400">
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create knowledge/index.tsx**

```tsx
import { useState } from 'react'
import { useProjects } from '@forge/core'
import { useKBEntries } from '@forge/core'
import { KBList } from './components/KBList'
import { KBAddForm } from './components/KBAddForm'
import { cn } from '../../lib/utils'

const TYPE_FILTERS = [
  { value: '', label: '全部' },
  { value: 'principle', label: '原则' },
  { value: 'spec', label: '设计方案' },
  { value: 'test_asset', label: '测试资产' },
  { value: 'past_output', label: '过往产出' },
]

export function KnowledgePage() {
  const { data: projectsPage } = useProjects()
  const projects = projectsPage?.data ?? []
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const effectiveProjectId = selectedProjectId || projects[0]?.id || ''
  const { data: entries = [] } = useKBEntries(effectiveProjectId, {
    type: typeFilter || undefined,
    status: statusFilter || undefined,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-white/90">知识库</h1>
          <p className="mt-0.5 text-[12px] text-white/35">Agent 执行任务时自动检索相关知识</p>
        </div>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-300 hover:bg-violet-500/15"
        >
          {isAdding ? '收起' : '+ 添加知识'}
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4 gap-4">
        {/* Project selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={effectiveProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Type filters */}
          <div className="flex gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[11px] transition-colors',
                  typeFilter === f.value
                    ? 'bg-white/[0.08] text-white/80'
                    : 'text-white/30 hover:text-white/50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 ml-auto">
            {[{ value: '', label: '全部' }, { value: 'pending', label: '待确认' }, { value: 'verified', label: '已验证' }].map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[11px] transition-colors',
                  statusFilter === f.value
                    ? 'bg-white/[0.08] text-white/80'
                    : 'text-white/30 hover:text-white/50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isAdding && effectiveProjectId && (
          <KBAddForm projectId={effectiveProjectId} />
        )}

        <KBList projectId={effectiveProjectId} entries={entries} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/cookie/project/forge/apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/knowledge/
git commit -m "feat(web): add /knowledge page with typed KB list, text/URL/file add form"
```

---

## Task F3: Wire routes + nav + remove from Settings

**Files:**
- Modify: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/pages/settings/index.tsx`
- Modify: `apps/web/src/pages/settings/components/SettingsNav.tsx`
- Delete: `apps/web/src/pages/settings/components/KBSection.tsx`

- [ ] **Step 1: Add /knowledge route to routes.tsx**

```ts
const KnowledgePage = lazy(() => import('./pages/knowledge').then(m => ({ default: m.KnowledgePage })))
```

Add route inside ProtectedRoute + AppShell:
```tsx
<Route path="/knowledge" element={<KnowledgePage />} />
```

- [ ] **Step 2: Add BookOpen nav item to AppShell.tsx**

Add prefetch:
```ts
const prefetchKnowledge = () => import('../../pages/knowledge')
```

Add NavItem between `/agents` and the spacer:
```tsx
<NavItem
  to="/knowledge"
  icon={<Icons.BookOpen className="h-[17px] w-[17px]" />}
  label="知识库"
  onPrefetch={prefetchKnowledge}
/>
```

Check `Icons.BookOpen` exists in `apps/web/src/components/ui/icons.tsx`. If not, add it (Lucide `book-open` icon).

- [ ] **Step 3: Remove KB from Settings**

In `apps/web/src/pages/settings/index.tsx`:
- Remove `'kb'` from `SettingsSection` type
- Remove `{activeSection === 'kb' && <KBSection />}`
- Remove `KBSection` import

In `apps/web/src/pages/settings/components/SettingsNav.tsx`:
- Remove the KB nav entry

Delete the file:
```bash
rm /Users/cookie/project/forge/apps/web/src/pages/settings/components/KBSection.tsx
```

- [ ] **Step 4: Final TypeScript check**

```bash
cd /Users/cookie/project/forge/apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS"
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): wire /knowledge route, add nav icon, remove KB from Settings"
```
