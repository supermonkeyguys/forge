export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', overflowY: 'auto' }}>
      {children}
    </div>
  )
}

export function EmptyState({ onNew }: { onNew: () => void }) {
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

export function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)' }}>
      加载中...
    </div>
  )
}

export function ErrorState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--red)' }}>
      加载失败，请刷新重试
    </div>
  )
}
