import { useWorkspaceStore, selectPhase } from '../../store/workspace-store'
import { RequirementInput } from './RequirementInput'
import { PMReview } from './PMReview'
import { ConversationHistory } from './ConversationHistory'
import { Separator } from '../ui/separator'

export function ConversationPanel() {
  const phase = useWorkspaceStore(selectPhase)

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="text-lg font-bold tracking-tight">🔨 Forge</span>
      </div>
      <Separator />

      <div className="flex flex-1 flex-col overflow-hidden">
        {phase === 'input' && <RequirementInput />}
        {phase === 'pm-review' && <PMReview />}
        {(phase === 'running' || phase === 'done' || phase === 'waiting' || phase === 'error') && (
          <ConversationHistory />
        )}
      </div>
    </div>
  )
}
