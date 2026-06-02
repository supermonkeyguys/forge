import { useState } from 'react'
import { useAgents } from '@forge/core'
import { AgentList } from './components/AgentList'
import { SYSTEM_AGENTS } from '../../lib/agent-registry'
import type { SystemAgentDef } from '../../lib/agent-registry'
import type { UserAgent } from '@forge/core'

// Stubs — will be replaced in C3
function AgentCard(_props: {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  onFork: (role: string) => void
  onDelete: (id: string) => void
}) {
  return <div className="p-4 text-white/40 text-sm">Agent card (coming soon)</div>
}

function AgentTabPanel(_props: {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
}) {
  return <div className="p-4 text-white/40 text-sm">Tab panel (coming soon)</div>
}

export function AgentsPage() {
  const { data: agentsPage } = useAgents()
  const customAgents: UserAgent[] = agentsPage?.data ?? []
  const [selectedId, setSelectedId] = useState<string | null>(`system:${SYSTEM_AGENTS[0]!.role}`)
  const [isCreating, setIsCreating] = useState(false)

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setIsCreating(false)
  }

  const handleCreateNew = () => {
    setSelectedId(null)
    setIsCreating(true)
  }

  const selectedSystemAgent = selectedId?.startsWith('system:')
    ? SYSTEM_AGENTS.find((a) => `system:${a.role}` === selectedId) ?? null
    : null

  const selectedCustomAgent = selectedId?.startsWith('custom:')
    ? customAgents.find((a) => `custom:${a.id}` === selectedId) ?? null
    : null

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-40 flex-shrink-0 border-r border-white/[0.06]">
        <AgentList
          customAgents={customAgents}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
        />
      </div>
      <div className="w-[220px] flex-shrink-0 border-r border-white/[0.06]">
        <AgentCard
          systemAgent={selectedSystemAgent}
          customAgent={selectedCustomAgent}
          isCreating={isCreating}
          onFork={(role) => {
            setIsCreating(true)
            setSelectedId(null)
          }}
          onDelete={() => {
            setSelectedId(`system:${SYSTEM_AGENTS[0]!.role}`)
          }}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <AgentTabPanel
          systemAgent={selectedSystemAgent}
          customAgent={selectedCustomAgent}
          isCreating={isCreating}
        />
      </div>
    </div>
  )
}
