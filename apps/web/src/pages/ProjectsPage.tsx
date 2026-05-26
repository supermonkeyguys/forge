import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useDeleteProject } from '@forge/core'
import { ProjectCard } from '../components/project-card/project-card'
import { PageShell, EmptyState, LoadingState, ErrorState } from '../components/project-card/project-page-states'
import { Button } from '../components/ui/button'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const { mutate: deleteProject } = useDeleteProject()
  const projects = data?.data ?? []
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除这个项目？此操作不可撤销。')) return
    deleteProject(id, {
      onError: () => setDeleteError('删除失败，请稍后重试'),
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
      <div className="mx-auto max-w-[900px] px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">我的项目</h1>
            {projects.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {projects.length} 个项目
              </p>
            )}
          </div>
          <Button onClick={() => navigate('/projects/new')} size="sm">
            + 新建项目
          </Button>
        </div>

        {deleteError && (
          <p className="mb-3 text-sm text-destructive">{deleteError}</p>
        )}

        {projects.length === 0 ? (
          <EmptyState onNew={() => navigate('/projects/new')} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
