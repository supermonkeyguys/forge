import { useNavigate } from 'react-router-dom'
import { useProjects } from '@forge/core'
import { ProjectCard } from '../components/project-card/project-card.js'

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

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', overflowY: 'auto' }}>
      {children}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingTop: 80,
    }}>
      <div style={{ fontSize: 56, opacity: 0.15 }}>🔨</div>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>还没有项目</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          用自然语言描述你的 App，Agent 团队来生成它
        </p>
      </div>
      <button
        onClick={onNew}
        style={{
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 'var(--radius)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 500,
          padding: '10px 24px',
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        创建第一个项目
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
      加载中...
    </div>
  )
}

function ErrorState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--red)' }}>
      加载失败，请刷新重试
    </div>
  )
}
