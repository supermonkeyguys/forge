import type { Project } from '@forge/core'
import { cn } from '../../../lib/utils'
import { KanbanCard } from './KanbanCard'
import { COL_META, type ColKey } from '../index'

export function KanbanColumn({
  colKey, projects, onOpen, onDelete,
}: {
  colKey: ColKey
  projects: Project[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const meta = COL_META[colKey]

  return (
    <div className="flex w-[236px] flex-shrink-0 flex-col gap-2">
      {/* Column header */}
      <div className="flex flex-shrink-0 items-center gap-1.5 px-0.5">
        <span className={cn('h-[7px] w-[7px] flex-shrink-0 rounded-full', meta.dotClass)} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/38">
          {meta.label}
        </span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-1.5 py-px text-[11px] text-white/20">
          {projects.length}
        </span>
      </div>

      {/* Dashed lane — stretches full height */}
      <div
        className={cn(
          'col-lane-inner flex flex-1 flex-col gap-2 overflow-y-auto rounded-[14px] border-[1.5px] border-dashed p-2.5',
          meta.laneClass,
        )}
      >
        {projects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[11.5px] italic text-white/16">
            {meta.emptyText}
          </div>
        ) : (
          projects.map(p => (
            <KanbanCard
              key={p.id}
              project={p}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
