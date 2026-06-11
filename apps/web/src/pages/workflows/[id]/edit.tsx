import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useWorkflows,
  useUpdateWorkflow,
  useRunWorkflow,
  useWorkflowRunEvents,
} from '@forge/core'
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Icons } from '../../../components/ui/icons'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { StepEditPanel }   from './components/StepEditPanel'
import { TriggerPanel } from './components/TriggerPanel'
import type { WorkflowTrigger, WorkflowStatus } from '@forge/core'
import { toast } from '../../../store/toast-store'
import { toFlow, toWorkflow, reLayout } from './utils/workflowToFlow'
import type { StepNodeData } from './utils/workflowToFlow'

const CAPABILITY_OPTIONS = ['llm', 'browser', 'http', 'notify', 'file', 'code'] as const

export function WorkflowEditorPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ── Data ──────────────────────────────────────────────────────────
  const { data: workflows }     = useWorkflows()
  const workflow                = workflows?.find(w => w.id === id)
  const { mutateAsync: update } = useUpdateWorkflow()
  const { mutate: startRun }    = useRunWorkflow(id ?? '')

  // ── Canvas state (owned here, passed to WorkflowCanvas) ───────────
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Initialise once workflow loads
  const [initialised, setInitialised] = useState(false)
  useEffect(() => {
    if (workflow && !initialised) {
      const { nodes: n, edges: e } = toFlow(workflow.definition)
      setNodes(n)
      setEdges(e)
      setInitialised(true)
    }
  }, [workflow, initialised, setNodes, setEdges])

  useEffect(() => {
    if (workflow && !initialised) {
      setLocalTrigger(workflow.trigger)
      setLocalStatus(workflow.status)
    }
  }, [workflow, initialised])

  // ── Selected node + edit panel ────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<StepNodeData>) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
    ))
  }, [setNodes])

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedId(null)
  }, [setNodes, setEdges])

  // ── Add step ──────────────────────────────────────────────────────
  const [addingStep, setAddingStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [newStepCap,  setNewStepCap]  = useState('llm')

  const handleAddStep = useCallback(() => {
    const newId = `step_${Date.now()}`
    const newNode: Node<StepNodeData> = {
      id:       newId,
      type:     'step',
      position: { x: 80 + nodes.length * 40, y: 80 + nodes.length * 40 },
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
  }, [nodes.length, newStepName, newStepCap, setNodes])

  // ── Save ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!id) return
    setSaving(true)
    try {
      const definition = toWorkflow(nodes, edges)
      await update({ id, definition })
      toast.success('保存成功')
    } catch {
      toast.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [id, nodes, edges, update])

  // ── Execute ───────────────────────────────────────────────────────
  const [runId,   setRunId]   = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [showTrigger,   setShowTrigger]   = useState(false)
  const [localTrigger,  setLocalTrigger]  = useState<WorkflowTrigger>(
    workflow?.trigger ?? { type: 'manual' }
  )
  const [localStatus,   setLocalStatus]   = useState<WorkflowStatus>(
    workflow?.status ?? 'draft'
  )
  const { data: runEvents }   = useWorkflowRunEvents(runId)

  useEffect(() => {
    if (!runEvents?.events?.length) return

    setNodes(prev => {
      const statusMap: Record<string, StepNodeData['status']>  = {}
      const outputMap: Record<string, string> = {}
      for (const ev of runEvents.events) {
        if (ev.type === 'agent_start') statusMap[ev.agent] = 'running'
        if (ev.type === 'agent_done')  { statusMap[ev.agent] = 'done';   outputMap[ev.agent] = ev.content }
        if (ev.type === 'agent_error') { statusMap[ev.agent] = 'failed'; outputMap[ev.agent] = ev.content }
      }
      return prev.map(n => ({
        ...n,
        data: {
          ...n.data,
          ...(statusMap[n.id] !== undefined ? { status: statusMap[n.id] } : {}),
          ...(outputMap[n.id]  !== undefined ? { output: outputMap[n.id] } : {}),
        },
      }))
    })

    const terminal = runEvents.status === 'done' || runEvents.status === 'failed'
    if (terminal) setRunning(false)
  }, [runEvents, setNodes])

  const handleTriggerSave = useCallback(async (trigger: WorkflowTrigger, status: WorkflowStatus) => {
    if (!id) return
    setLocalTrigger(trigger)
    setLocalStatus(status)
    setShowTrigger(false)
    try {
      await update({ id, trigger, status })
    } catch {
      toast.error('触发设置保存失败')
    }
  }, [id, update])

  const handleExecute = useCallback(async () => {
    if (!id) return
    // Reset node statuses
    setNodes(prev => prev.map(n => ({ ...n, data: { ...n.data, status: 'pending' as const, output: undefined } })))
    await handleSave()
    setRunning(true)
    startRun(undefined, {
      onSuccess: (data) => setRunId(data.runId),
    })
  }, [id, handleSave, setNodes, startRun])

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

        <Button size="sm" variant="ghost" onClick={() => setNodes(reLayout(nodes, edges))}>
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

        <div className="relative">
          <Button
            size="sm"
            variant={localStatus === 'active' ? 'default' : 'ghost'}
            onClick={() => setShowTrigger(v => !v)}
          >
            <Icons.Bell className="h-3.5 w-3.5 mr-1.5" />
            {localStatus === 'active' ? '定时已启用' : '触发'}
          </Button>
          {showTrigger && (
            <TriggerPanel
              trigger={localTrigger}
              status={localStatus}
              onSave={handleTriggerSave}
              onClose={() => setShowTrigger(false)}
            />
          )}
        </div>
      </div>

      {/* Canvas + edit panel */}
      <div className="relative flex-1 overflow-hidden">
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesSet={setEdges}
          onNodeSelect={setSelectedId}
        />
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
