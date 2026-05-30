import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useDeleteProject, type Project, type ProjectStatus } from '@forge/core'
import { toast } from '../store/toast-store'
import { LoadingState, ErrorState } from '../components/project-card/project-page-states'
import { cn } from '../lib/utils'
import { Icons } from '../components/ui/icons'

// ── Status → column mapping ────────────────────────────────────────────────

type ColKey = 'draft' | 'active' | 'done' | 'failed'

function toColKey(status: ProjectStatus): ColKey {
  if (status === 'idle') return 'draft'
  if (status === 'done') return 'done'
  if (status === 'failed') return 'failed'
  return 'active'
}

const COL_META: Record<ColKey, { label: string; emptyText: string; dotClass: string; laneClass: string }> = {
  draft:  {
    label: '草稿',     emptyText: '暂无草稿项目',
    dotClass: 'bg-white/30',
    laneClass: 'border-white/[0.09]',
  },
  active: {
    label: '进行中',   emptyText: '暂无进行中项目',
    dotClass: 'bg-primary shadow-[0_0_6px_rgba(249,115,22,0.55)] animate-pulse',
    laneClass: 'border-primary/[0.22] bg-primary/[0.015]',
  },
  done:   {
    label: '已完成',   emptyText: '暂无已完成项目',
    dotClass: 'bg-emerald-500',
    laneClass: 'border-emerald-500/[0.20] bg-emerald-500/[0.01]',
  },
  failed: {
    label: '失败',     emptyText: '暂无失败项目',
    dotClass: 'bg-destructive',
    laneClass: 'border-destructive/[0.18] bg-destructive/[0.01]',
  },
}

const COL_ORDER: ColKey[] = ['draft', 'active', 'done', 'failed']

// ── Main component ─────────────────────────────────────────────────────────

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const { mutate: deleteProject } = useDeleteProject()
  const projects = data?.data ?? []

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><LoadingState /></div>
  if (isError)   return <div className="flex flex-1 items-center justify-center"><ErrorState /></div>

  // Group by column
  const columns = Object.fromEntries(
    COL_ORDER.map(k => [k, [] as Project[]])
  ) as Record<ColKey, Project[]>
  for (const p of projects) columns[toColKey(p.status)].push(p)

  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除这个项目？此操作不可撤销。')) return
    deleteProject(id, {
      onSuccess: () => toast.success('项目已删除'),
      onError: () => toast.error('删除失败，请稍后重试'),
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.05] px-7 py-5">
        <div>
          <h1 className="text-[17px] font-bold text-white/88">我的项目</h1>
          <p className="mt-0.5 text-[11.5px] text-white/30">{projects.length} 个项目</p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="rounded-lg bg-gradient-to-br from-primary to-[#ea6d0e] px-4 py-1.5 text-[12.5px] font-semibold text-primary-foreground shadow-[0_2px_10px_rgba(249,115,22,0.28)] transition-opacity hover:opacity-90"
        >
          + 新建项目
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex flex-1 gap-3.5 overflow-x-auto overflow-y-hidden px-7 py-5">
        {COL_ORDER.map(colKey => (
          <KanbanColumn
            key={colKey}
            colKey={colKey}
            projects={columns[colKey]}
            onOpen={id => navigate(`/projects/${id}`)}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ── Column ─────────────────────────────────────────────────────────────────

function KanbanColumn({
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

// ── Card ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Partial<Record<ProjectStatus, string>> = {
  idle: '待机', analyzing: '分析中', planning: '规划中',
  building: '构建中', validating: '验证中', fixing: '修复中',
  waiting: '等待中', done: '已完成', failed: '失败',
}

const ACTIVE_STATUSES = new Set<ProjectStatus>(['analyzing', 'planning', 'building', 'validating', 'fixing', 'waiting'])

function KanbanCard({ project, onOpen, onDelete }: {
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
