import { useNavigate, Link } from 'react-router-dom'
import { useProjects, useDeleteProject } from '@forge/core'
import { toast } from '../store/toast-store'
import { ProjectCard } from '../components/project-card/project-card'
import { PageShell, EmptyState, LoadingState, ErrorState } from '../components/project-card/project-page-states'
import { Button } from '../components/ui/button'
import { Icons } from '../components/ui/icons'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const { mutate: deleteProject } = useDeleteProject()
  const projects = data?.data ?? []


  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除这个项目？此操作不可撤销。')) return
    deleteProject(id, {
      onSuccess: () => toast.success('项目已删除'),
      onError: () => toast.error('删除失败，请稍后重试'),
    })
  }

  if (isLoading) {
    return <PageShell><LoadingState /></PageShell>
  }

  if (isError) {
    return <PageShell><ErrorState /></PageShell>
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[960px] px-8 py-10">
        {/* Header */}
        <div className="animate-fade-in mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              我的项目
            </h1>
            {projects.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {projects.length} 个项目正在由 Agent 团队管理
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
              title="设置"
            >
              <Icons.Cog className="h-5 w-5" />
            </Link>
            <Button onClick={() => navigate('/projects/new')}>
              + 新建项目
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState onNew={() => navigate('/projects/new')} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {projects.map((p, i) => (
              <div key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                <ProjectCard project={p} onDelete={handleDelete} />
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
