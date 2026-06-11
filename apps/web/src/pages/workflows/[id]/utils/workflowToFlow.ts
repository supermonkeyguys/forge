import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowDefinition } from '@forge/core'

export interface StepNodeData extends Record<string, unknown> {
  name:         string
  capability:   string
  instructions: string
  config?:      Record<string, unknown>
  depends_on:   string[]
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
  const steps = def?.steps ?? []
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  for (const step of steps) {
    g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const step of steps) {
    for (const dep of step.depends_on) {
      g.setEdge(dep, step.id)
    }
  }

  dagre.layout(g)

  const nodes: Node<StepNodeData>[] = steps.map(step => {
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
  for (const step of steps) {
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
  const depsMap: Record<string, string[]> = {}
  for (const node of nodes) depsMap[node.id] = []
  for (const edge of edges) {
    if (!depsMap[edge.target]) depsMap[edge.target] = []
    ;(depsMap[edge.target] as string[]).push(edge.source)
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

/** Check if adding edge source→target would create a cycle (DFS) */
export function wouldCreateCycle(
  nodes: Node<StepNodeData>[],
  edges: Edge[],
  source: string,
  target: string,
): boolean {
  const adj: Record<string, string[]> = {}
  for (const n of nodes) adj[n.id] = []
  for (const e of edges) (adj[e.source] as string[]).push(e.target)

  const visited = new Set<string>()
  const queue: string[] = [target]
  while (queue.length > 0) {
    const cur = queue.pop()
    if (cur === undefined) continue
    if (cur === source) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const next of (adj[cur] ?? [])) queue.push(next)
  }
  return false
}

/** Re-run dagre layout on existing nodes/edges, return new node positions */
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
