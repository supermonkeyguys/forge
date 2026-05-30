import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspaceStore, selectEvents, type AgentCardState } from '../../../store/workspace-store'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { Icons } from '../../../components/ui/icons'
import { cn } from '../../../lib/utils'
import type { AgentEvent } from '@forge/core'

interface AgentDrawerProps {
  card: AgentCardState
  onClose: () => void
}

const AGENT_LABEL: Record<string, string> = {
  pm:        'PM Agent',
  architect: 'Architect',
  schema:    'Schema Agent',
  logic:     'Logic Agent',
  api:       'API Agent',
  ui:        'UI Agent',
  page:      'Page Agent',
  test:      'Test Agent',
}

export function AgentDrawer({ card, onClose }: AgentDrawerProps) {
  const allEvents = useWorkspaceStore(selectEvents)
  const overlayRef = useRef<HTMLDivElement>(null)

  const agentEvents = allEvents.filter((e) => e.agent === card.role)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const elapsed = card.startedAt && card.finishedAt
    ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
    : card.startedAt
    ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
    : null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="agent-drawer-backdrop fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="agent-drawer fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border/40 bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold">{AGENT_LABEL[card.role] ?? card.role}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <StatusDot status={card.status} />
              <span className="text-xs text-muted-foreground capitalize">{card.status}</span>
              {elapsed && (
                <span className="font-mono text-[10px] text-muted-foreground/60">· {elapsed}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Icons.X className="h-4 w-4" />
          </button>
        </div>

        {/* Event timeline */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-4">
            {agentEvents.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground/50 py-8">
                暂无事件记录
              </p>
            ) : (
              <EventTimeline events={agentEvents} filesWritten={card.filesWritten} />
            )}
          </div>
        </ScrollArea>
      </div>
    </>,
    document.body,
  )
}

// ── Event Timeline ────────────────────────────────────────────────

function EventTimeline({ events, filesWritten }: { events: AgentEvent[]; filesWritten: string[] }) {
  return (
    <div className="relative flex flex-col gap-1">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/40" />

      {events.map((event, i) => (
        <EventItem key={i} event={event} />
      ))}

      {/* Files summary at the bottom */}
      {filesWritten.length > 0 && (
        <FilesSummary files={filesWritten} />
      )}
    </div>
  )
}

function EventItem({ event }: { event: AgentEvent }) {
  if (event.type === 'agent_start') {
    return (
      <TimelineRow dot="bg-primary" label="开始执行" time={null}>
        <p className="text-xs text-muted-foreground">{event.message}</p>
      </TimelineRow>
    )
  }

  if (event.type === 'agent_thinking') {
    return (
      <CollapsibleTimelineRow
        dot="bg-muted-foreground/40"
        label="思考"
        preview={truncate(event.content ?? '', 80)}
        fullContent={event.content ?? ''}
      />
    )
  }

  if (event.type === 'agent_tool_use') {
    return (
      <TimelineRow dot="bg-blue-400/60" label={`工具调用 · ${event.tool}`} time={null}>
        <p className="font-mono text-[11px] text-muted-foreground/70">{event.tool}</p>
      </TimelineRow>
    )
  }

  if (event.type === 'agent_file_write') {
    return (
      <TimelineRow dot="bg-green-400/60" label="写入文件" time={null}>
        <p className="font-mono text-[11px] text-green-400/80">
          <span className="text-green-400/50">+</span> {event.file?.split('/').pop()}
          {event.file && <span className="text-muted-foreground/40"> ({event.file})</span>}
        </p>
      </TimelineRow>
    )
  }

  if (event.type === 'agent_done') {
    return (
      <CollapsibleTimelineRow
        dot="bg-green-400"
        label="完成"
        preview={truncate(event.summary ?? '', 80)}
        fullContent={event.summary ?? ''}
        defaultOpen={false}
      />
    )
  }

  if (event.type === 'agent_error') {
    return (
      <TimelineRow dot="bg-destructive" label="错误" time={null}>
        <p className="text-xs text-destructive/80">{event.error}</p>
      </TimelineRow>
    )
  }

  return null
}

function TimelineRow({
  dot,
  label,
  time,
  children,
}: {
  dot: string
  label: string
  time: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="relative flex gap-4 py-2 pl-6">
      {/* Dot */}
      <span className={cn('absolute left-[4px] top-[14px] h-[7px] w-[7px] rounded-full', dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground/70">{label}</span>
          {time && <span className="font-mono text-[10px] text-muted-foreground/40">{time}</span>}
        </div>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
    </div>
  )
}

function CollapsibleTimelineRow({
  dot,
  label,
  preview,
  fullContent,
  defaultOpen = false,
}: {
  dot: string
  label: string
  preview: string
  fullContent: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="relative flex gap-4 py-2 pl-6">
      <span className={cn('absolute left-[4px] top-[14px] h-[7px] w-[7px] rounded-full', dot)} />
      <div className="min-w-0 flex-1">
        <button
          className="flex w-full items-center gap-1.5 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="text-[11px] font-medium text-foreground/70">{label}</span>
          <Icons.ChevronDown className={cn('h-3 w-3 text-muted-foreground/40 transition-transform', open && 'rotate-180')} />
        </button>
        {!open && preview && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/50">{preview}</p>
        )}
        {open && fullContent && (
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/70">{fullContent}</p>
        )}
      </div>
    </div>
  )
}

function FilesSummary({ files }: { files: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex gap-4 py-2 pl-6">
      <span className="absolute left-[4px] top-[14px] h-[7px] w-[7px] rounded-full bg-green-400" />
      <div className="min-w-0 flex-1">
        <button
          className="flex w-full items-center gap-1.5 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="text-[11px] font-medium text-green-400/80">生成文件 ({files.length})</span>
          <Icons.ChevronDown className={cn('h-3 w-3 text-muted-foreground/40 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            {files.map((f) => (
              <p key={f} className="font-mono text-[11px] text-muted-foreground/60">
                <span className="text-green-400/60">+</span> {f}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: AgentCardState['status'] }) {
  const cls = {
    idle:    'bg-muted-foreground/30',
    running: 'bg-primary animate-pulse',
    done:    'bg-green-400',
    error:   'bg-destructive',
  }[status]
  return <span className={cn('h-1.5 w-1.5 rounded-full', cls)} />
}

// ── Utils ─────────────────────────────────────────────────────────

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
