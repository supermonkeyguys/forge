# Workflow Canvas Editor — Design Spec

**Date:** 2026-06-11  
**Status:** Approved  
**Scope:** Replace the static workflow preview with a DAG canvas editor using React Flow. Users can edit AI-generated workflows visually before execution, and see per-step execution results on the canvas.

---

## Background

The current workflow system:
- `CreateWorkflowModal` generates a `WorkflowDefinition` with `depends_on` arrays (DAG-capable schema)
- No editing UI — user can only confirm or regenerate
- Run page shows a flat list; no per-step output

The user needs a canvas editor that:
1. Visualises the AI-generated DAG on a canvas after generation
2. Lets users edit nodes (name, capability, instructions), add/remove steps, draw/delete edges
3. Shows live execution state on nodes and per-step output in a side panel

---

## Goals

1. After AI generates a workflow, the user lands on a canvas editor (/workflows/:id/edit)
2. The canvas renders steps as nodes and `depends_on` relationships as edges
3. Users can fully edit the DAG before saving
4. Execution can be triggered from the editor; nodes update in real time
5. Per-step output is accessible by clicking a node after execution

---

## Architecture

### Flow

```
CreateWorkflowModal
  → user describes need
  → AI generates WorkflowDefinition (with depends_on)
  → saves to DB via POST /api/v1/workflows
  → navigates to /workflows/:id/edit  ← NEW (was: close modal)

/workflows/:id/edit  (Canvas Editor page)
  → loads workflow from API
  → converts WorkflowDefinition → React Flow nodes + edges (workflowToFlow.ts)
  → user edits on canvas
  → save: converts back React Flow → WorkflowDefinition → PUT /api/v1/workflows/:id
  → run: POST /api/v1/workflows/:id/runs → polls events → updates node status
```

### Data Mapping

```
WorkflowStep  ─────────────────────────────  React Flow Node
  id          →  id
  name        →  data.name
  capability  →  data.capability
  instructions→  data.instructions
  config      →  data.config
  depends_on  →  [implicit: derived from edges]

depends_on relationship  →  React Flow Edge
  step B depends_on step A  →  edge from A → B
  (A must complete before B starts)
```

`workflowToFlow.ts` handles the bidirectional conversion:
- `toFlow(def: WorkflowDefinition): { nodes, edges }` — for loading
- `toWorkflow(nodes, edges): WorkflowDefinition` — for saving

---

## Canvas Design

### Layout

Auto-layout with **dagre** on initial load:
- Nodes without dependencies on the left
- Downstream nodes further right
- Same "layer" nodes aligned vertically
- Re-layout button available

```
  [🤖 分析邮件]    [🌐 查询汇率]
        ↘               ↙
         [🤖 生成报告]
                ↓
          [🔔 发通知]
```

### Node (StepNode.tsx)

Custom React Flow node — card style:

```
┌─────────────────────────────────────────┐
│ 🤖  生成报告                        [✕] │
│     llm                                 │
│     分析上两步的天气和股价数据，生成…    │
└─────────────────────────────────────────┘
     ○ (source handle — output)
```

Top connection handle (target) and bottom handle (source).  
State colours:
- `idle` — default border `border-border/40`
- `running` — `border-primary/40 bg-primary/5` + spinning indicator top-right
- `done` — `border-green-500/30 bg-green-500/5` + ✓ badge
- `failed` — `border-destructive/30 bg-destructive/5` + ✗ badge

### Side Panel (StepEditPanel.tsx)

Opens on node click. Slides in from the right:

```
┌──────────────────────────────┐
│  步骤配置                [✕] │
├──────────────────────────────┤
│  名称                        │
│  [生成报告___________]       │
│                              │
│  类型                        │
│  [🤖 AI 分析      ▾]         │
│                              │
│  执行指令                    │
│  [分析上两步的天气和股价数    │
│   据，生成一份简洁的日报…]   │
│                              │
│  ── 执行输出（运行后显示）── │
│  生成的报告内容：            │
│  今日天气晴，气温 28°C…      │
└──────────────────────────────┘
```

Fields: name (input), capability (select), instructions (textarea), config (JSON, collapsible), output (read-only, shown after execution).

### Toolbar

Top bar of the canvas page:

```
← 工作流名称    [重新布局]  [添加步骤]  [保存]  [▷ 执行]
```

- **← 工作流名称** — back to /workflows list
- **重新布局** — re-runs dagre auto-layout
- **添加步骤** — opens a small modal to pick capability type + name, adds a disconnected node
- **保存** — calls `toWorkflow()` then PUT /api/v1/workflows/:id, shows toast
- **▷ 执行** — saves then triggers POST /api/v1/workflows/:id/runs, starts polling

### Edge Interaction

- Drag from source handle → target handle to create an edge (`depends_on`)
- Click edge → shows delete button
- React Flow `onConnect` / `onEdgesDelete` update local state

---

## Execution on Canvas

When "执行" is clicked:
1. Save first (PUT workflow)
2. POST /api/v1/workflows/:id/runs → get `runId`
3. Poll GET /api/v1/workflow-runs/:runId/events every 500ms
4. Parse events and update each node's `data.status` via `setNodes`
5. On `agent_done` event, store `output` on the node's `data.output`
6. Polling stops when status is `done` or `failed`
7. User can click any node to see its output in the side panel

No navigation away from the canvas — execution happens in-place.

---

## Files

### New files (5)

| File | Purpose |
|------|---------|
| `apps/web/src/pages/workflows/[id]/edit.tsx` | Canvas editor page — layout + state management |
| `apps/web/src/pages/workflows/[id]/components/WorkflowCanvas.tsx` | React Flow wrapper — renders nodes/edges, handles interactions |
| `apps/web/src/pages/workflows/[id]/components/StepNode.tsx` | Custom React Flow node component |
| `apps/web/src/pages/workflows/[id]/components/StepEditPanel.tsx` | Slide-in right panel for editing a selected node |
| `apps/web/src/pages/workflows/[id]/utils/workflowToFlow.ts` | Bidirectional conversion: WorkflowDefinition ↔ React Flow nodes/edges + dagre layout |

### Modified files (4)

| File | Change |
|------|--------|
| `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx` | `onSuccess` after create → `navigate(/workflows/${id}/edit)` instead of `onClose()` |
| `apps/web/src/pages/workflows/components/WorkflowCard.tsx` | "查看" button → navigate to `/workflows/:id/edit` |
| `apps/web/src/routes.tsx` | Add `<Route path="/workflows/:id/edit" element={<WorkflowEditorPage />} />` |
| `apps/web/package.json` | Add `@xyflow/react` and `dagre` + `@types/dagre` dependencies |

---

## Dependencies

```json
"@xyflow/react": "^12.x",
"dagre": "^0.8.5",
"@types/dagre": "^0.8.x"
```

React Flow v12 (`@xyflow/react`) uses a provider-based API; nodes and edges are controlled state passed to `<ReactFlow>`.

---

## workflowToFlow.ts Detail

```typescript
// toFlow: WorkflowDefinition → nodes + edges (with dagre layout)
export function toFlow(def: WorkflowDefinition): {
  nodes: Node<StepNodeData>[]
  edges: Edge[]
}

// toWorkflow: nodes + edges → WorkflowDefinition
export function toWorkflow(
  nodes: Node<StepNodeData>[],
  edges: Edge[],
): WorkflowDefinition

// StepNodeData mirrors WorkflowStep + runtime fields
export interface StepNodeData {
  id: string
  name: string
  capability: string
  instructions: string
  config?: Record<string, unknown>
  // runtime only (not persisted)
  status?: 'pending' | 'running' | 'done' | 'failed'
  output?: string
}
```

Dagre layout runs inside `toFlow`:
```typescript
const g = new dagre.graphlib.Graph()
g.setDefaultEdgeLabel(() => ({}))
g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 })
// add nodes + edges then layout
dagre.layout(g)
// read back x/y positions
```

---

## Error Handling

- **Save fails**: toast error, canvas state unchanged
- **Generation timeout** (from existing 90s client fix): modal shows retry
- **Cycle detection**: when user draws an edge that would create a cycle, reject the connection with a tooltip "不能形成循环"
- **Execution step failure**: node turns red, side panel shows error message

---

## Out of Scope

- Undo/redo (future)
- Multi-select / bulk delete (future)
- Workflow versioning (future)
- Trigger configuration (schedule/webhook) — WorkflowTrigger field exists in DB but not wired
- Mobile/touch interactions
