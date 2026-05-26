import { useNavigate } from 'react-router-dom'
import type { Project, ProjectStatus } from '@forge/core'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  done:       '完成',
  building:   '生成中',
  analyzing:  '生成中',
  planning:   '生成中',
  validating: '生成中',
  fixing:     '生成中',
  failed:     '失败',
  waiting:    '等待',
  idle:       '待机',
}

const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing'])

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

function statusVariant(status: ProjectStatus): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string } {
  if (status === 'done') return { variant: 'outline', className: 'border-green-500 text-green-400' }
  if (status === 'failed') return { variant: 'destructive' }
  if (status === 'waiting') return { variant: 'outline', className: 'border-yellow-500 text-yellow-400' }
  if (IN_PROGRESS.has(status)) return { variant: 'secondary' }
  return { variant: 'outline' }
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate()
  const { variant, className } = statusVariant(project.status)

  return (
    <Card className={cn(
      IN_PROGRESS.has(project.status) && 'border-primary/30'
    )}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1 text-sm font-semibold">{project.name}</div>
          <Badge variant={variant} className={cn('shrink-0 text-[11px]', className)}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>

        <div className="mb-3 text-[11px] text-muted-foreground">
          {new Date(project.createdAt).toLocaleDateString('zh-CN')}
        </div>

        <div className="flex gap-1.5">
          {project.status === 'done' && (
            <>
              {project.previewUrl && (
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => window.open(project.previewUrl!, '_blank')}>
                  预览
                </Button>
              )}
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/projects/${project.id}`)}>
                打开
              </Button>
            </>
          )}
          {IN_PROGRESS.has(project.status) && (
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-primary" onClick={() => navigate(`/projects/${project.id}`)}>
              查看进度
            </Button>
          )}
          {(project.status === 'idle' || project.status === 'waiting') && (
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/projects/${project.id}`)}>
              打开
            </Button>
          )}
          {project.status === 'failed' && (
            <>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/projects/${project.id}`)}>
                重试
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-destructive" onClick={() => onDelete(project.id)}>
                删除
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
