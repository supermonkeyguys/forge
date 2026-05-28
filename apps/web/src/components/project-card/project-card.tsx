import { useNavigate } from 'react-router-dom'
import type { Project, ProjectStatus } from '@forge/core'
import { cn } from '../../lib/utils'

const STATUS_CONFIG: Record<ProjectStatus, { label: string; dot: string; ring: string }> = {
  done:       { label: '完成', dot: 'bg-green-400', ring: 'ring-green-500/20' },
  building:   { label: '生成中', dot: 'bg-primary animate-pulse', ring: 'ring-primary/20' },
  analyzing:  { label: '分析中', dot: 'bg-primary animate-pulse', ring: 'ring-primary/20' },
  planning:   { label: '规划中', dot: 'bg-primary animate-pulse', ring: 'ring-primary/20' },
  validating: { label: '验证中', dot: 'bg-yellow-400 animate-pulse', ring: 'ring-yellow-500/20' },
  fixing:     { label: '修复中', dot: 'bg-yellow-400 animate-pulse', ring: 'ring-yellow-500/20' },
  failed:     { label: '失败', dot: 'bg-destructive', ring: 'ring-destructive/20' },
  waiting:    { label: '等待', dot: 'bg-yellow-400', ring: 'ring-yellow-500/20' },
  idle:       { label: '待机', dot: 'bg-muted-foreground/50', ring: 'ring-border' },
}

const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing'])

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate()
  const config = STATUS_CONFIG[project.status]
  const isActive = IN_PROGRESS.has(project.status)

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm transition-all duration-300',
        'hover:border-border hover:bg-card hover:shadow-lg hover:shadow-black/10',
        isActive && 'border-primary/30 animate-glow',
      )}
    >
      {/* Subtle gradient top accent */}
      {isActive && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      )}
      {project.status === 'done' && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />
      )}

      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="flex-1 truncate text-sm font-semibold leading-snug">{project.name}</h3>
        <div className={cn('flex h-5 items-center gap-1.5 rounded-full px-2 ring-1', config.ring)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
          <span className="text-[10px] font-medium text-muted-foreground">{config.label}</span>
        </div>
      </div>

      {/* Date */}
      <p className="mb-4 font-mono text-[11px] text-muted-foreground/60">
        {new Date(project.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        {project.status === 'done' && (
          <>
            {project.previewUrl && (
              <ActionBtn label="预览" onClick={() => window.open(project.previewUrl!, '_blank')} />
            )}
            <ActionBtn label="打开" primary onClick={() => navigate(`/projects/${project.id}`)} />
          </>
        )}
        {isActive && (
          <ActionBtn label="查看进度" primary onClick={() => navigate(`/projects/${project.id}`)} />
        )}
        {(project.status === 'idle' || project.status === 'waiting') && (
          <ActionBtn label="打开" onClick={() => navigate(`/projects/${project.id}`)} />
        )}
        {project.status === 'failed' && (
          <>
            <ActionBtn label="重试" onClick={() => navigate(`/projects/${project.id}`)} />
            <ActionBtn label="删除" destructive onClick={() => onDelete(project.id)} />
          </>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick, primary, destructive }: {
  label: string
  onClick: () => void
  primary?: boolean
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
        primary
          ? 'bg-primary/10 text-primary hover:bg-primary/20'
          : destructive
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      )}
    >
      {label}
    </button>
  )
}
