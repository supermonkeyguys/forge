import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Icons } from '@/components/ui/icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AgentEvent } from '@/store/workspace-store'

interface ThinkingLogProps {
  events: AgentEvent[]
}

export function ThinkingLog({ events }: ThinkingLogProps) {
  const [logOpen, setLogOpen] = useState(false)

  const thinkingEvents = events
    .filter((e) => e.type === 'agent_thinking' || e.type === 'agent_tool_use')
    .slice(-50)

  if (thinkingEvents.length === 0) return null

  return (
    <div className="border-t border-border/40">
      <button
        onClick={() => setLogOpen(!logOpen)}
        className="flex w-full items-center gap-2 px-6 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icons.ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', logOpen && 'rotate-180')}
        />
        <span className="font-mono">AI 思考日志</span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]">
          {thinkingEvents.length}
        </span>
      </button>
      {logOpen && (
        <ScrollArea className="max-h-[200px] border-t border-border/20 bg-background/50 px-6 pb-3 pt-2">
          {thinkingEvents.map((e, i) => (
            <p
              key={i}
              className="mb-0.5 font-mono text-[11px] text-muted-foreground/50"
            >
              <span className="text-muted-foreground/70">[{e.agent}]</span>{' '}
              {e.type === 'agent_thinking'
                ? e.content
                : `tool: ${e.tool}`}
            </p>
          ))}
        </ScrollArea>
      )}
    </div>
  )
}
