import { useNavigate } from 'react-router-dom'
import { useProjects } from '@forge/core'
import { ProjectCard } from '../components/project-card/project-card.js'
import { PageShell, EmptyState, LoadingState, ErrorState } from '../components/project-card/project-page-states.js'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const projects = data?.data ?? []

  const handleDelete = (_id: string) => {
    // TODO: wire up delete mutation when Go API is ready
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
