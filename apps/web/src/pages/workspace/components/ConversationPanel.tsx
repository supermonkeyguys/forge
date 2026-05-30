import { useWorkspaceStore, selectPhase } from '../../../store/workspace-store'
import { RequirementInput } from './RequirementInput'
import { PMReview } from './PMReview'
import { ConversationHistory } from './ConversationHistory'

export function ConversationPanel() {
  const phase = useWorkspaceStore(selectPhase)

  return (
    <div className="relative z-10 flex h-full flex-col border-r border-border/60 bg-card/60 backdrop-blur-md">
      <div className="h-px bg-gradient-to-r from-transparent via-border/80 to-transparent" />

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
