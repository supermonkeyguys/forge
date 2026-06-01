import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Project } from '@forge/core'
import { cn } from '../../../lib/utils'
import { KanbanCard } from './KanbanCard'
import { COL_META, type ColKey } from '../index'

const ITEM_HEIGHT = 104 // estimated card height in px
const OVERSCAN = 3     // extra cards rendered above/below viewport

export function KanbanColumn({
  colKey, projects, onOpen, onDelete,
}: {
  colKey: ColKey
  projects: Project[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const meta = COL_META[colKey]
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: OVERSCAN,
    gap: 8, // matches gap-2 (0.5rem = 8px)
  })

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

      {/* Scrollable lane */}
      <div
        ref={parentRef}
        className={cn(
          'col-lane-inner flex flex-1 flex-col overflow-y-auto rounded-[14px] border-[1.5px] border-dashed p-2.5',
          meta.laneClass,
        )}
      >
        {projects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[11.5px] italic text-white/16">
            {meta.emptyText}
          </div>
        ) : (
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const project = projects[virtualRow.index]
              return (
                <div
                  key={project.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <KanbanCard
                    project={project}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
