# Workflow Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static workflow list editor with a React Flow DAG canvas where users can view, edit, and execute AI-generated workflows visually.

**Architecture:** React Flow (@xyflow/react) renders WorkflowDefinition steps as draggable nodes with edges for depends_on relationships. A bidirectional converter (workflowToFlow.ts) translates between the existing WorkflowDefinition schema and React Flow state — no backend changes needed. Execution runs in-place on the canvas with node status overlays driven by the existing useWorkflowRunEvents polling hook.

**Tech Stack:** React 18, @xyflow/react ^12, dagre ^0.8.5, TanStack Query, TypeScript, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/package.json` | Modify | Add @xyflow/react, dagre, @types/dagre |
| `packages/core/workflow/use-workflows.ts` | Modify | Add useUpdateWorkflow mutation |
| `packages/core/workflow/index.ts` | Modify | Export useUpdateWorkflow |
| `packages/core/index.ts` | Modify | Re-export useUpdateWorkflow |
| `apps/web/src/pages/workflows/[id]/utils/workflowToFlow.ts` | Create | toFlow + toWorkflow converters + dagre layout |
| `apps/web/src/pages/workflows/[id]/components/StepNode.tsx` | Create | Custom React Flow node card |
| `apps/web/src/pages/workflows/[id]/components/StepEditPanel.tsx` | Create | Right-side slide panel for editing a node |
| `apps/web/src/pages/workflows/[id]/components/WorkflowCanvas.tsx` | Create | React Flow wrapper with all interaction handlers |
| `apps/web/src/pages/workflows/[id]/edit.tsx` | Create | Editor page: loads workflow, owns state, toolbar |
| `apps/web/src/routes.tsx` | Modify | Register /workflows/:id/edit route |
| `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx` | Modify | onSuccess → navigate to /workflows/:id/edit |
| `apps/web/src/pages/workflows/components/WorkflowCard.tsx` | Modify | "查看" → /workflows/:id/edit |

---

## Task 1: Install dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install @xyflow/react, dagre, @types/dagre**

```bash
cd apps/web && npm install @xyflow/react dagre @types/dagre
```

Expected: packages added to node_modules, package.json updated.

- [ ] **Step 2: Verify types compile**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "TS5097" | head -5
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/package.json apps/web/package-lock.json
git commit -m "feat(web): add @xyflow/react and dagre dependencies"
```

---

## Task 2: Add useUpdateWorkflow hook to core

**Files:**
- Modify: `packages/core/workflow/use-workflows.ts`
- Modify: `packages/core/workflow/index.ts`
- Modify: `packages/core/index.ts`

The Go API already has `PUT /api/v1/workflows/:id`. This task just adds the client hook.

- [ ] **Step 1: Add useUpdateWorkflow to `packages/core/workflow/use-workflows.ts`**

Append after the existing `useDeleteWorkflow` function:

```typescript
export function useUpdateWorkflow() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      description?: string
      definition?: WorkflowDefinition
      trigger?: WorkflowTrigger
    }) => {
      const { id, ...body } = input
      const res = await api.put<Workflow>(`/api/v1/workflows/${id}`, body, token ?? undefined)
      return res.data!
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}
```

Note: `api.put` already exists in `packages/core/api/client.ts` — no changes needed there.

- [ ] **Step 2: Export from `packages/core/workflow/index.ts`**

Add to existing exports:
```typescript
export { useUpdateWorkflow } from './use-workflows.ts'
```

- [ ] **Step 3: Re-export from `packages/core/index.ts`**

Find the line `export { useWorkflows, useCreateWorkflow, useDeleteWorkflow }` and add `useUpdateWorkflow`:
```typescript
export { useWorkflows, useCreateWorkflow, useDeleteWorkflow, useUpdateWorkflow } from './workflow/index.ts'
```

- [ ] **Step 4: Verify**

```bash
cd packages/core && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/workflow/use-workflows.ts packages/core/workflow/index.ts packages/core/index.ts
git commit -m "feat(core): add useUpdateWorkflow mutation hook"
```

---

## Task 3: workflowToFlow.ts — bidirectional converter + dagre layout

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/utils/workflowToFlow.ts`

This is a pure utility — no React, no side effects.

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p "apps/web/src/pages/workflows/[id]/utils"
```

File content `apps/web/src/pages/workflows/[id]/utils/workflowToFlow.ts`:

```typescript
import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowDefinition } from '@forge/core'

export interface StepNodeData extends Record<string, unknown> {
  name:         string
  capability:   string
  instructions: string
  config?:      Record<string, unknown>
  depends_on:   string[]   // kept for toWorkflow reconstruction
  // runtime-only (never persisted)
  status?:  'pending' | 'running' | 'done' | 'failed'
  output?:  string
}

const NODE_WIDTH  = 220
const NODE_HEIGHT = 80

/** WorkflowDefinition → React Flow nodes + edges with dagre layout */
export function toFlow(def: WorkflowDefinition): {
  nodes: Node<StepNodeData>[]
  edges: Edge[]
} {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  // Register nodes
  for (const step of def.steps) {
    g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Register edges (A → B: A must complete before B)
  for (const step of def.steps) {
    for (const dep of step.depends_on) {
      g.setEdge(dep, step.id)
    }
  }

  dagre.layout(g)

  const nodes: Node<StepNodeData>[] = def.steps.map(step => {
    const pos = g.node(step.id)
    return {
      id:       step.id,
      type:     'step',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        name:         step.name,
        capability:   step.capability,
        instructions: step.instructions,
        config:       step.config,
        depends_on:   step.depends_on,
      },
    }
  })

  const edges: Edge[] = []
  for (const step of def.steps) {
    for (const dep of step.depends_on) {
      edges.push({
        id:     `${dep}->${step.id}`,
        source: dep,
        target: step.id,
        animated: false,
      })
    }
  }

  return { nodes, edges }
}

/** React Flow nodes + edges → WorkflowDefinition */
export function toWorkflow(
  nodes: Node<StepNodeData>[],
  edges: Edge[],
): WorkflowDefinition {
  // Build depends_on map from edges
  const depsMap: Record<string, string[]> = {}
  for (const node of nodes) depsMap[node.id] = []
  for (const edge of edges) {
    if (!depsMap[edge.target]) depsMap[edge.target] = []
    depsMap[edge.target].push(edge.source)
  }

  return {
    steps: nodes.map(node => ({
      id:           node.id,
      name:         node.data.name,
      capability:   node.data.capability as 'browser' | 'http' | 'llm' | 'notify' | 'code' | 'file',
      instructions: node.data.instructions,
      depends_on:   depsMap[node.id] ?? [],
      config:       node.data.config,
    })),
  }
}

/** Check if adding edge source→target would create a cycle */
export function wouldCreateCycle(
  nodes: Node<StepNodeData>[],
  edges: Edge[],
  source: string,
  target: string,
): boolean {
  // BFS/DFS: can we reach `source` from `target` following existing edges?
  const adj: Record<string, string[]> = {}
  for (const n of nodes) adj[n.id] = []
  for (const e of edges) adj[e.source].push(e.target)

  const visited = new Set<string>()
  const queue = [target]
  while (queue.length > 0) {
    const cur = queue.pop()!
    if (cur === source) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const next of (adj[cur] ?? [])) queue.push(next)
  }
  return false
}

/** Re-run dagre layout on existing nodes/edges, return new positions */
export function reLayout(
  nodes: Node<StepNodeData>[],
  edges: Edge[],
): Node<StepNodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })
  for (const node of nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const edge of edges) g.setEdge(edge.source, edge.target)
  dagre.layout(g)
  return nodes.map(node => {
    const pos = g.node(node.id)
    return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "workflowToFlow" | head -5
```

Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/utils/workflowToFlow.ts"
git commit -m "feat(web): add workflowToFlow bidirectional converter with dagre layout"
```

---

## Task 4: StepNode.tsx — custom React Flow node

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/components/StepNode.tsx`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p "apps/web/src/pages/workflows/[id]/components"
```

File content `apps/web/src/pages/workflows/[id]/components/StepNode.tsx`:

```typescript
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Icons } from '../../../../components/ui/icons'
import type { StepNodeData } from '../utils/workflowToFlow'

const CAPABILITY_ICON: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  browser: Icons.Monitor,
  http:    Icons.Plug,
  llm:     Icons.Bot,
  notify:  Icons.Bell,
  code:    Icons.Blocks,
  file:    Icons.Database,
}

const CAPABILITY_LABEL: Record<string, string> = {
  browser: '浏览器',
  http:    'HTTP',
  llm:     'AI 分析',
  notify:  '通知',
  code:    '代码生成',
  file:    '文件',
}

const STATUS_CLASS: Record<string, string> = {
  running: 'border-primary/50 bg-primary/5',
  done:    'border-green-500/40 bg-green-500/5',
  failed:  'border-destructive/40 bg-destructive/5',
}

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<StepNodeData>) {
  const Icon = CAPABILITY_ICON[data.capability] ?? Icons.Zap
  const statusClass = data.status ? (STATUS_CLASS[data.status] ?? '') : ''

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-border" />

      <div
        className={`
          relative w-[220px] rounded-lg border bg-card px-3 py-2.5 shadow-sm cursor-pointer
          transition-colors select-none
          ${selected ? 'border-primary ring-1 ring-primary/30' : 'border-border/60'}
          ${statusClass}
        `}
      >
        {/* Status badge */}
        {data.status === 'running' && (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
        {data.status === 'done' && (
          <Icons.CheckCircle className="absolute top-2 right-2 h-3.5 w-3.5 text-green-500" />
        )}
        {data.status === 'failed' && (
          <Icons.X className="absolute top-2 right-2 h-3.5 w-3.5 text-destructive" />
        )}

        {/* Capability + name */}
        <div className="flex items-center gap-2 pr-5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{data.name || '未命名步骤'}</span>
        </div>

        {/* Capability label */}
        <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">
          {CAPABILITY_LABEL[data.capability] ?? data.capability}
        </p>

        {/* Instructions preview */}
        {data.instructions && (
          <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
            {data.instructions}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-border" />
    </>
  )
})
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "StepNode" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/components/StepNode.tsx"
git commit -m "feat(web): add StepNode custom React Flow node component"
```

---

## Task 5: StepEditPanel.tsx — right-side edit panel

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/components/StepEditPanel.tsx`

- [ ] **Step 1: Create file**

`apps/web/src/pages/workflows/[id]/components/StepEditPanel.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { Icons } from '../../../../components/ui/icons'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import type { StepNodeData } from '../utils/workflowToFlow'

const CAPABILITIES = [
  { value: 'llm',     label: '🤖 AI 分析' },
  { value: 'browser', label: '🌐 浏览器' },
  { value: 'http',    label: '🔌 HTTP' },
  { value: 'notify',  label: '🔔 通知' },
  { value: 'file',    label: '🗂 文件' },
  { value: 'code',    label: '🧱 代码生成' },
]

interface Props {
  nodeId:   string | null
  data:     StepNodeData | null
  onClose:  () => void
  onUpdate: (id: string, patch: Partial<StepNodeData>) => void
  onDelete: (id: string) => void
}

export function StepEditPanel({ nodeId, data, onClose, onUpdate, onDelete }: Props) {
  const [name,         setName]         = useState('')
  const [capability,   setCapability]   = useState('llm')
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    if (data) {
      setName(data.name)
      setCapability(data.capability)
      setInstructions(data.instructions)
    }
  }, [nodeId, data])

  if (!nodeId || !data) return null

  const handleSave = () => {
    onUpdate(nodeId, { name, capability, instructions })
  }

  return (
    <div className="absolute right-0 top-0 h-full w-72 border-l border-border bg-background flex flex-col z-10 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold">步骤配置</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">名称</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="步骤名称"
          />
        </div>

        {/* Capability */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">类型</label>
          <select
            value={capability}
            onChange={e => setCapability(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CAPABILITIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Instructions */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">执行指令</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={6}
            placeholder="描述这个步骤要做什么…"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Execution output (read-only) */}
        {data.output && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">执行输出</label>
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
              {data.output}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <Button
          size="sm" variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => { onDelete(nodeId); onClose() }}
        >
          <Icons.Trash2 className="h-3.5 w-3.5 mr-1.5" />
          删除步骤
        </Button>
        <Button size="sm" onClick={handleSave}>保存</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "StepEditPanel" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/components/StepEditPanel.tsx"
git commit -m "feat(web): add StepEditPanel slide-in editor component"
```

---

## Task 6: WorkflowCanvas.tsx — React Flow wrapper

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/components/WorkflowCanvas.tsx`

- [ ] **Step 1: Create file**

`apps/web/src/pages/workflows/[id]/components/WorkflowCanvas.tsx`:

```typescript
import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StepNode } from './StepNode'
import type { StepNodeData } from '../utils/workflowToFlow'
import { wouldCreateCycle } from '../utils/workflowToFlow'

const NODE_TYPES = { step: StepNode }

interface Props {
  initialNodes: Node<StepNodeData>[]
  initialEdges: Edge[]
  onNodesChange:   (nodes: Node<StepNodeData>[]) => void
  onEdgesChange:   (edges: Edge[]) => void
  onNodeSelect:    (id: string | null) => void
}

export function WorkflowCanvas({
  initialNodes,
  initialEdges,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
}: Props) {
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<StepNodeData>(initialNodes)
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges)

  // Expose current state to parent whenever it changes
  const syncNodes = useCallback((updater: Parameters<typeof setNodes>[0]) => {
    setNodes(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      onNodesChange(next)
      return next
    })
  }, [setNodes, onNodesChange])

  const syncEdges = useCallback((updater: Parameters<typeof setEdges>[0]) => {
    setEdges(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      onEdgesChange(next)
      return next
    })
  }, [setEdges, onEdgesChange])

  const handleConnect: OnConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return
    if (params.source === params.target) return
    if (wouldCreateCycle(nodes, edges, params.source, params.target)) {
      alert('不能形成循环依赖')
      return
    }
    syncEdges(prev => addEdge({ ...params, animated: false }, prev))
  }, [nodes, edges, syncEdges])

  const handleNodeClick: NodeMouseHandler<StepNodeData> = useCallback((_, node) => {
    onNodeSelect(node.id)
  }, [onNodeSelect])

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null)
  }, [onNodeSelect])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={changes => {
        onNodesChangeInternal(changes)
        // sync deletions and position changes
        setNodes(prev => { onNodesChange(prev); return prev })
      }}
      onEdgesChange={changes => {
        onEdgesChangeInternal(changes)
        setEdges(prev => { onEdgesChange(prev); return prev })
      }}
      onConnect={handleConnect}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      fitView
      deleteKeyCode="Delete"
      className="bg-muted/10"
    >
      <Background gap={20} color="hsl(var(--border))" />
      <Controls />
      <MiniMap nodeStrokeWidth={2} zoomable pannable />
    </ReactFlow>
  )
}
```

Note: React Flow requires a wrapper with explicit dimensions. The edit page will provide `height: 100%` via flex layout.

- [ ] **Step 2: Import React Flow CSS in the edit page (will be done in Task 7)**

The `@xyflow/react/dist/style.css` import in WorkflowCanvas.tsx handles the required styles.

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "WorkflowCanvas" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/components/WorkflowCanvas.tsx"
git commit -m "feat(web): add WorkflowCanvas React Flow wrapper component"
```

---

## Task 7: edit.tsx — editor page

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/edit.tsx`

This is the main page that ties everything together. It owns:
- React Flow node/edge state
- Selected node state
- Save (PUT workflow)
- Execute (POST runs + poll events)
- Add step modal

- [ ] **Step 1: Create file**

`apps/web/src/pages/workflows/[id]/edit.tsx`:

```typescript
import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { randomUUID } from 'crypto'
import {
  useWorkflows,
  useUpdateWorkflow,
  useRunWorkflow,
  useWorkflowRunEvents,
} from '@forge/core'
import type { Node, Edge } from '@xyflow/react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Icons } from '../../../components/ui/icons'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { StepEditPanel }   from './components/StepEditPanel'
import { toFlow, toWorkflow, reLayout } from './utils/workflowToFlow'
import type { StepNodeData } from './utils/workflowToFlow'

const CAPABILITY_OPTIONS = ['llm', 'browser', 'http', 'notify', 'file', 'code'] as const

export function WorkflowEditorPage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()

  // ── Data ──────────────────────────────────────────────────────────
  const { data: workflows }        = useWorkflows()
  const workflow                   = workflows?.find(w => w.id === id)
  const { mutateAsync: update }    = useUpdateWorkflow()
  const { mutate: startRun }       = useRunWorkflow(id ?? '')

  // ── Canvas state ─────────────────────────────────────────────────
  const [nodes, setNodes] = useState<Node<StepNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  // Initialise from workflow once loaded
  useEffect(() => {
    if (workflow) {
      const { nodes: n, edges: e } = toFlow(workflow.definition)
      setNodes(n)
      setEdges(e)
    }
  }, [workflow?.id]) // only on initial load

  // ── Selection + edit panel ────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<StepNodeData>) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
    ))
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedId(null)
  }, [])

  // ── Add step ─────────────────────────────────────────────────────
  const [addingStep, setAddingStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [newStepCap,  setNewStepCap]  = useState<string>('llm')

  const handleAddStep = () => {
    const newId = `step_${Date.now()}`
    const newNode: Node<StepNodeData> = {
      id:       newId,
      type:     'step',
      position: { x: 100 + nodes.length * 40, y: 100 + nodes.length * 40 },
      data: {
        name:         newStepName || '新步骤',
        capability:   newStepCap,
        instructions: '',
        depends_on:   [],
      },
    }
    setNodes(prev => [...prev, newNode])
    setAddingStep(false)
    setNewStepName('')
    setNewStepCap('llm')
    setSelectedId(newId)
  }

  // ── Save ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      const definition = toWorkflow(nodes, edges)
      await update({ id, definition })
    } catch {
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  // ── Execute ───────────────────────────────────────────────────────
  const [runId,    setRunId]    = useState<string | null>(null)
  const [running,  setRunning]  = useState(false)
  const { data: runEvents }     = useWorkflowRunEvents(runId)

  // Apply events to node statuses
  useEffect(() => {
    if (!runEvents?.events) return
    const statusMap: Record<string, 'pending' | 'running' | 'done' | 'failed'> = {}
    const outputMap: Record<string, string> = {}

    for (const ev of runEvents.events) {
      if (ev.type === 'agent_start') statusMap[ev.agent] = 'running'
      if (ev.type === 'agent_done')  { statusMap[ev.agent] = 'done';   outputMap[ev.agent] = ev.content }
      if (ev.type === 'agent_error') { statusMap[ev.agent] = 'failed'; outputMap[ev.agent] = ev.content }
    }

    if (Object.keys(statusMap).length > 0) {
      setNodes(prev => prev.map(n => ({
        ...n,
        data: {
          ...n.data,
          status: statusMap[n.id] ?? n.data.status,
          output: outputMap[n.id]  ?? n.data.output,
        },
      })))
    }

    const terminal = runEvents.status === 'done' || runEvents.status === 'failed'
    if (terminal) setRunning(false)
  }, [runEvents])

  const handleExecute = async () => {
    if (!id) return
    // Reset node statuses
    setNodes(prev => prev.map(n => ({ ...n, data: { ...n.data, status: 'pending' as const, output: undefined } })))
    await handleSave()
    setRunning(true)
    startRun(undefined, { onSuccess: (data) => setRunId(data.runId) })
  }

  // ── Render ────────────────────────────────────────────────────────
  if (!workflow) {
    return <div className="p-8 text-sm text-muted-foreground">加载中...</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
        <button
          onClick={() => navigate('/workflows')}
          className="text-muted-foreground hover:text-foreground mr-1"
        >
          <Icons.ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold truncate max-w-[200px]">{workflow.name}</span>

        <div className="flex-1" />

        <Button
          size="sm" variant="ghost"
          onClick={() => {
            const relaid = reLayout(nodes, edges)
            setNodes(relaid)
          }}
        >
          <Icons.Zap className="h-3.5 w-3.5 mr-1.5" />
          重新布局
        </Button>

        <Button size="sm" variant="outline" onClick={() => setAddingStep(true)}>
          <Icons.Plus className="h-3.5 w-3.5 mr-1.5" />
          添加步骤
        </Button>

        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>

        <Button size="sm" onClick={handleExecute} disabled={running || saving}>
          {running ? (
            <>
              <div className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
              执行中…
            </>
          ) : (
            <>
              <Icons.Play className="h-3.5 w-3.5 mr-1.5" />
              执行
            </>
          )}
        </Button>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <WorkflowCanvas
          initialNodes={nodes}
          initialEdges={edges}
          onNodesChange={setNodes}
          onEdgesChange={setEdges}
          onNodeSelect={setSelectedId}
        />

        {/* Edit panel overlay */}
        <StepEditPanel
          nodeId={selectedId}
          data={selectedNode?.data ?? null}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdateNode}
          onDelete={handleDeleteNode}
        />
      </div>

      {/* Add step modal */}
      {addingStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-xl border border-border bg-background p-5 shadow-xl">
            <h2 className="text-sm font-semibold mb-4">添加步骤</h2>
            <div className="flex flex-col gap-3">
              <Input
                placeholder="步骤名称"
                value={newStepName}
                onChange={e => setNewStepName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStep()}
                autoFocus
              />
              <select
                value={newStepCap}
                onChange={e => setNewStepCap(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CAPABILITY_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={() => setAddingStep(false)}>取消</Button>
              <Button onClick={handleAddStep}>添加</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Note:** `randomUUID` from Node crypto isn't available in the browser. Replace the `const newId = \`step_${Date.now()}\`` line — `Date.now()` is sufficient as a unique ID for new steps.

- [ ] **Step 2: Check Icons.Plus exists**

```bash
grep -n "Plus\b" apps/web/src/components/ui/icons.tsx | head -3
```

If `Icons.Plus` is missing, add it:
```typescript
function Plus(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
// and add `Plus,` to the Icons export
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "TS5097" | grep "edit.tsx" | head -10
```

Fix any type errors before committing. The most common:
- `randomUUID` import: remove it, `Date.now()` is already used
- `api.put` missing: handled in Task 2

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/edit.tsx"
git commit -m "feat(web): add WorkflowEditorPage with canvas, toolbar, and execution"
```

---

## Task 8: Wire routes, CreateWorkflowModal, WorkflowCard

**Files:**
- Modify: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx`
- Modify: `apps/web/src/pages/workflows/components/WorkflowCard.tsx`

- [ ] **Step 1: Register route in `routes.tsx`**

Add lazy import after `WorkflowRunPage`:
```typescript
const WorkflowEditorPage = lazy(() =>
  import('./pages/workflows/[id]/edit').then(m => ({ default: m.WorkflowEditorPage }))
)
```

Add route inside AppShell group (after `/workflows/:id/run`):
```tsx
<Route path="/workflows/:id/edit" element={<WorkflowEditorPage />} />
```

- [ ] **Step 2: Update `CreateWorkflowModal.tsx` — navigate after save**

Add `useNavigate` import:
```typescript
import { useNavigate } from 'react-router-dom'
```

Add inside the component:
```typescript
const navigate = useNavigate()
```

Replace the `onSuccess: onClose` in `handleConfirm`:
```typescript
const handleConfirm = () => {
  if (!generatedDef) return
  create(
    { name: input.slice(0, 40), description: input, definition: generatedDef },
    { onSuccess: (workflow) => {
        onClose()
        navigate(`/workflows/${workflow.id}/edit`)
      }
    },
  )
}
```

- [ ] **Step 3: Update `WorkflowCard.tsx` — "查看" → editor**

Find:
```typescript
onClick={() => navigate(`/workflows/${workflow.id}`)}
```
Change to:
```typescript
onClick={() => navigate(`/workflows/${workflow.id}/edit`)}
```

- [ ] **Step 4: Build check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "TS5097" | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/src/routes.tsx \
        apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx \
        apps/web/src/pages/workflows/components/WorkflowCard.tsx
git commit -m "feat(web): wire canvas editor route and navigation"
```

---

## Task 9: Smoke test

- [ ] **Step 1: Start services**

```bash
# Terminal 1
cd apps/api && go run ./cmd/server

# Terminal 2
cd apps/agent && node --env-file=.env --import tsx/esm src/index.ts

# Terminal 3
cd apps/web && npm run dev
```

- [ ] **Step 2: New workflow → canvas**

1. Open `http://localhost:5173/workflows`
2. Click "+ 新建工作流"
3. Type "每天早上获取天气和新闻，生成日报发给我"
4. Click "生成流程" — should show real AI-generated steps
5. Click "确认创建" — should navigate to `/workflows/:id/edit`
6. Verify canvas shows nodes with dagre layout (parallel steps side by side)

- [ ] **Step 3: Edit a node**

1. Click a node → right panel slides in
2. Change the instructions text
3. Click "保存"
4. Verify node instructions preview updates on the canvas

- [ ] **Step 4: Add a step**

1. Click "添加步骤"
2. Enter name, pick capability, click "添加"
3. New node appears on canvas (disconnected)
4. Drag from source handle of one node to target handle of new node
5. Edge appears — verify it doesn't allow cycles

- [ ] **Step 5: Execute**

1. Click "执行"
2. Verify nodes turn blue/spinning as they run
3. Verify nodes turn green/red as they complete
4. Click a completed node → output visible in right panel

- [ ] **Step 6: Final commit**

```bash
cd /Users/cookie/project/forge
git add -A
git commit -m "feat: complete workflow canvas editor (DAG edit + execution)"
```

---

## Self-Review

- [x] **Spec: canvas with DAG nodes/edges** → Task 6 (WorkflowCanvas.tsx)
- [x] **Spec: toFlow + toWorkflow conversion** → Task 3 (workflowToFlow.ts)
- [x] **Spec: dagre layout** → Task 3 (`reLayout` + initial layout in `toFlow`)
- [x] **Spec: cycle detection** → Task 3 (`wouldCreateCycle`), Task 6 (`onConnect` guard)
- [x] **Spec: node edit panel** → Task 5 (StepEditPanel.tsx)
- [x] **Spec: add/delete nodes** → Task 7 (edit.tsx: `handleAddStep`, `handleDeleteNode`)
- [x] **Spec: execution on canvas with node status overlay** → Task 7 (useEffect on runEvents)
- [x] **Spec: per-step output in panel** → Task 5 (output section), Task 7 (outputMap stored on node.data)
- [x] **Spec: CreateWorkflowModal → navigate to edit** → Task 8
- [x] **Spec: WorkflowCard "查看" → edit page** → Task 8
- [x] **Spec: @xyflow/react + dagre deps** → Task 1
- [x] **Type consistency**: `StepNodeData` defined in Task 3, used identically in Tasks 4, 5, 6, 7
- [x] **No placeholders**: all code blocks are complete and runnable
