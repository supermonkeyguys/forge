import { useState } from 'react'
import { cn } from '../../../lib/utils'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../lib/agent-registry'
import { InstructionsTab } from './tabs/InstructionsTab'
import { ToolsTab } from './tabs/ToolsTab'
import { WritePathsTab } from './tabs/WritePathsTab'
import { ConfigTab } from './tabs/ConfigTab'

type Tab = '指令' | '工具' | '写入路径' | '配置'
const TABS: Tab[] = ['指令', '工具', '写入路径', '配置']

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  onCreated?: (agent: UserAgent) => void
}

export function AgentTabPanel({ systemAgent, customAgent, isCreating, onCreated }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('指令')
  const [draftName, setDraftName] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [draftInstructions, setDraftInstructions] = useState('')
  const [draftTools, setDraftTools] = useState<string[]>([])
  const [draftPaths, setDraftPaths] = useState<string[]>([])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center border-b border-white/[0.06] px-5">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'border-b-2 px-3.5 py-3 text-[12px] transition-colors',
              activeTab === tab
                ? 'border-violet-400 font-medium text-white/90'
                : 'border-transparent text-white/35 hover:text-white/55',
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {activeTab === '指令' && (
          <InstructionsTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftInstructions={draftInstructions}
            onDraftChange={setDraftInstructions}
          />
        )}
        {activeTab === '工具' && (
          <ToolsTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftTools={draftTools}
            onDraftChange={setDraftTools}
          />
        )}
        {activeTab === '写入路径' && (
          <WritePathsTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftPaths={draftPaths}
            onDraftChange={setDraftPaths}
          />
        )}
        {activeTab === '配置' && (
          <ConfigTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftName={draftName}
            draftDescription={draftDesc}
            draftInstructions={draftInstructions}
            draftTools={draftTools}
            draftPaths={draftPaths}
            onDraftNameChange={setDraftName}
            onDraftDescChange={setDraftDesc}
            onCreated={(agent) => onCreated?.(agent)}
          />
        )}
      </div>
    </div>
  )
}
