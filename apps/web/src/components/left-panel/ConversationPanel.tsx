import { useWorkspaceStore, selectPhase } from '../../store/workspace-store'
import { RequirementInput } from './RequirementInput'
import { PMReview } from './PMReview'
import { ConversationHistory } from './ConversationHistory'
import { Icons } from '../ui/icons'

export function ConversationPanel() {
  const phase = useWorkspaceStore(selectPhase)

  return (
    <div className="relative z-10 flex h-full flex-col border-r border-border/60 bg-card/60 backdrop-blur-md">
      {/* Brand header */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Icons.Hammer className="h-4 w-4 text-primary" />
        </div>
        <span className="text-lg font-bold tracking-tight text-gradient">Forge</span>
      </div>

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
