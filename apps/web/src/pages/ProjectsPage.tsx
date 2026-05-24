import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useDeleteProject } from '@forge/core'
import { ProjectCard } from '../components/project-card/project-card.js'
import { PageShell, EmptyState, LoadingState, ErrorState } from '../components/project-card/project-page-states.js'

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
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>我的项目</h1>
            {projects.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {projects.length} 个项目
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            + 新建项目
          </button>
        </div>

        {deleteError && (
          <p style={{ fontSize: 13, color: 'var(--red, #ef4444)', marginBottom: 12 }}>{deleteError}</p>
        )}

        {projects.length === 0 ? (
          <EmptyState onNew={() => navigate('/projects/new')} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
