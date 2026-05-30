import { useRef, useEffect } from 'react'
import type { Project, ProjectStatus } from '@forge/core'
import { cn } from '../../../lib/utils'
import { Icons } from '../../../components/ui/icons'
import { toColKey, type ColKey } from '../index'

export const STATUS_LABEL: Partial<Record<ProjectStatus, string>> = {
  idle: '待机', analyzing: '分析中', planning: '规划中',
  building: '构建中', validating: '验证中', fixing: '修复中',
  waiting: '等待中', done: '已完成', failed: '失败',
}

export const ACTIVE_STATUSES = new Set<ProjectStatus>(['analyzing', 'planning', 'building', 'validating', 'fixing', 'waiting'])

export function KanbanCard({ project, onOpen, onDelete }: {
  project: Project
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isActive = ACTIVE_STATUSES.has(project.status)
  const colKey = toColKey(project.status)

  // Progress estimate for active projects
  const progressMap: Partial<Record<ProjectStatus, number>> = {
    analyzing: 15, planning: 30, building: 60, validating: 80, fixing: 70, waiting: 50,
  }
  const progress = progressMap[project.status]

  const prevStatusRef = useRef(project.status)
  useEffect(() => {
    if (prevStatusRef.current === project.status) return
    prevStatusRef.current = project.status

    const cardEl = document.querySelector<HTMLElement>(`[data-card-id="${project.id}"]`)
    if (!cardEl) return

    const laneEl = cardEl.closest<HTMLElement>('.col-lane-inner')
    if (!laneEl) return

    // Phase 1: fall out
    cardEl.classList.add('anim-fall-out')
    cardEl.addEventListener('animationend', () => {
      cardEl.classList.remove('anim-fall-out')
      // Phase 3: slide in — React Query refetch will move the card to the new column naturally
      // The card will re-render in its new column; add slide-in class after mount
      requestAnimationFrame(() => {
        const newCardEl = document.querySelector<HTMLElement>(`[data-card-id="${project.id}"]`)
        if (!newCardEl) return
        // Nudge existing siblings in target lane
        const newLane = newCardEl.parentElement
        if (newLane) {
          Array.from(newLane.children).forEach(sib => {
            if (sib !== newCardEl) {
              (sib as HTMLElement).classList.add('anim-nudge-down')
              sib.addEventListener('animationend', () => (sib as HTMLElement).classList.remove('anim-nudge-down'), { once: true })
            }
          })
        }
        newCardEl.classList.add('anim-slide-in')
        newCardEl.addEventListener('animationend', () => newCardEl.classList.remove('anim-slide-in'), { once: true })
      })
    }, { once: true })
  }, [project.status, project.id])

  return (
    <div
      className={cn(
        'project-card group relative flex-shrink-0 cursor-pointer rounded-[9px] border border-white/[0.08] p-3',
        'bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.18)]',
        'transition-colors hover:border-white/[0.15] hover:bg-white/[0.065]',
      )}
      style={{ backdropFilter: 'blur(14px)' }}
      data-card-id={project.id}
      data-col={colKey}
    >
      {/* Delete button — top-right, visible on card hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/[0.1] text-white/30 hover:text-red-400"
        title="删除"
      >
        <Icons.X className="h-3 w-3" />
      </button>

      <p className="mb-2 pr-4 text-[12.5px] font-medium leading-snug text-white/80">{project.name}</p>

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="mb-2 h-[2px] overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-[#fb923c]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-white/22">
          {new Date(project.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
        </span>
        <span className={cn(
          'rounded px-1.5 py-px text-[10px] font-medium',
          colKey === 'draft'  && 'bg-white/[0.06] text-white/38',
          colKey === 'active' && 'bg-primary/[0.14] text-[#fb923c]',
          colKey === 'done'   && 'bg-emerald-500/[0.13] text-emerald-400',
          colKey === 'failed' && 'bg-destructive/[0.13] text-red-400',
        )}>
          {STATUS_LABEL[project.status]}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-2.5 flex gap-1.5">
        {(colKey === 'draft' || isActive || colKey === 'done') && (
          <button
            onClick={() => onOpen(project.id)}
            className="flex-1 rounded-md bg-white/[0.06] py-1 text-[11px] text-white/50 transition-colors hover:bg-white/[0.1] hover:text-white/75"
          >
            {colKey === 'done' ? '查看' : '打开'}
          </button>
        )}
        {colKey === 'failed' && (
          <button
            onClick={() => onOpen(project.id)}
            className="flex-1 rounded-md bg-white/[0.06] py-1 text-[11px] text-white/50 transition-colors hover:bg-white/[0.1] hover:text-white/75"
          >
            重试
          </button>
        )}
      </div>
    </div>
  )
}
