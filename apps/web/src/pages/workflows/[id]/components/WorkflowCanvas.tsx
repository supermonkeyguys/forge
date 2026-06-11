import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type NodeMouseHandler,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StepNode } from './StepNode'
import type { StepNodeData } from '../utils/workflowToFlow'
import { wouldCreateCycle } from '../utils/workflowToFlow'

const NODE_TYPES = { step: StepNode }

interface Props {
  nodes:         Node<StepNodeData>[]
  edges:         Edge[]
  onNodesChange: OnNodesChange<Node<StepNodeData>>
  onEdgesChange: OnEdgesChange
  onEdgesSet:    (edges: Edge[]) => void
  onNodeSelect:  (id: string | null) => void
}

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onEdgesSet,
  onNodeSelect,
}: Props) {

  const handleConnect: OnConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return
    if (params.source === params.target) return
    if (wouldCreateCycle(nodes, edges, params.source, params.target)) {
      alert('不能形成循环依赖')
      return
    }
    onEdgesSet(addEdge({ ...params, animated: false }, edges))
  }, [nodes, edges, onEdgesSet])

  const handleNodeClick: NodeMouseHandler<Node<StepNodeData>> = useCallback((_, node) => {
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
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
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
