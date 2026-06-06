import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useDeleteProject, type Project, type ProjectStatus } from '@forge/core'
import { Button } from '../../components/ui/button'
import { toast } from '../../store/toast-store'
import { LoadingState, ErrorState } from './components/PageStates'
import { KanbanColumn } from './components/KanbanColumn'
import { ConfirmModal } from '../../components/ui/confirm-modal'

// ── Status → column mapping ────────────────────────────────────────────────

export type ColKey = 'draft' | 'active' | 'done' | 'failed'

export function toColKey(status: ProjectStatus): ColKey {
  if (status === 'idle') return 'draft'
  if (status === 'done') return 'done'
  if (status === 'failed') return 'failed'
  return 'active'
}

export const COL_META: Record<ColKey, { label: string; emptyText: string; dotClass: string; laneClass: string }> = {
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

export const COL_ORDER: ColKey[] = ['draft', 'active', 'done', 'failed']

// ── Main component ─────────────────────────────────────────────────────────

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const { mutate: deleteProject } = useDeleteProject()
  const projects = data?.data ?? []

  // Pending delete — null means modal is closed
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const pendingProject = projects.find(p => p.id === pendingDeleteId)

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><LoadingState /></div>
  if (isError)   return <div className="flex flex-1 items-center justify-center"><ErrorState /></div>

  // Group by column
  const columns = Object.fromEntries(
    COL_ORDER.map(k => [k, [] as Project[]])
  ) as Record<ColKey, Project[]>
  for (const p of projects) columns[toColKey(p.status)].push(p)

  const handleConfirmDelete = () => {
    if (!pendingDeleteId) return
    deleteProject(pendingDeleteId, {
      onSuccess: () => toast.success('项目已删除'),
      onError: () => toast.error('删除失败，请稍后重试'),
    })
    setPendingDeleteId(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.05] px-7 py-5">
        <div>
          <h1 className="text-[17px] font-bold text-white/88">我的项目</h1>
          <p className="mt-0.5 text-[11.5px] text-white/30">{projects.length} 个项目</p>
        </div>
        <Button
          onClick={() => navigate('/projects/new')}
          size="sm"
          className="bg-gradient-to-br from-primary to-[#ea6d0e] px-4 text-[12.5px] shadow-[0_2px_10px_rgba(249,115,22,0.28)] hover:opacity-90"
        >
          + 新建项目
        </Button>
      </div>

      {/* Kanban board */}
      <div className="flex flex-1 gap-3.5 overflow-x-auto overflow-y-hidden px-7 py-5">
        {COL_ORDER.map(colKey => (
          <KanbanColumn
            key={colKey}
            colKey={colKey}
            projects={columns[colKey]}
            onOpen={id => navigate(`/projects/${id}`)}
            onDelete={setPendingDeleteId}
          />
        ))}
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={pendingDeleteId !== null}
        title="删除项目"
        description={
          pendingProject
            ? <>确定删除「<span className="text-white/75">{pendingProject.name}</span>」？此操作不可撤销。</>
            : '确定删除这个项目？此操作不可撤销。'
        }
        confirmLabel="删除"
        cancelLabel="取消"
        dangerous
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}
