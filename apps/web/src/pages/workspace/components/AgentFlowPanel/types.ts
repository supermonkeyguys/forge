import type { AgentCardState } from '@/store/workspace-store'
import type { TaskStep } from '@forge/core'

export interface StepDef {
  id: string
  name: string
  subtitle: string
}

export interface AgentMeta {
  label: string
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement
  description: string
}

export interface AgentCardProps {
  card: AgentCardState
  step?: TaskStep
  isSelected: boolean
  onClick: () => void
  labelOverride?: string
  descriptionOverride?: string
}

export interface OrchestratorBarProps {
  state: string | null
  phase: string
  onMock?: () => void
}

export interface IdleStateProps {
  onMock: () => void
}

export interface ProgressBarProps {
  status: AgentCardState['status']
}
