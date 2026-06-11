import { useState } from 'react'
import { useWorkflows } from '@forge/core'
import { WorkflowCard } from './components/WorkflowCard'
import { CreateWorkflowModal } from './components/CreateWorkflowModal'
import { Button } from '../../components/ui/button'

export function WorkflowsPage() {
  const { data: workflows, isLoading } = useWorkflows()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="flex flex-1 overflow-hidden"><div className="flex flex-1 flex-col gap-6 p-8 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">工作流</h1>
          <p className="text-sm text-muted-foreground mt-1">
            创建自动化流程，让 AI 替你完成重复性工作
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 新建工作流</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workflows?.map(wf => (
          <WorkflowCard key={wf.id} workflow={wf} />
        ))}
        {!isLoading && workflows?.length === 0 && (
          <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">还没有工作流</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              描述你的需求，AI 帮你生成流程
            </Button>
          </div>
        )}
      </div>

      {showCreate && <CreateWorkflowModal onClose={() => setShowCreate(false)} />}
    </div>
    </div>
  )
}