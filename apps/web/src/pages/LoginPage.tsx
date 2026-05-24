import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@forge/core'

const MOCK_USER = {
  id: 'dev-user',
  email: 'dev@forge.local',
  name: 'Dev User',
  createdAt: new Date().toISOString(),
}

export function LoginPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)

  const handleSkip = () => {
    setToken('dev-token', MOCK_USER)
    navigate('/projects')
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔨</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Forge</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI 应用生成平台</p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            disabled
            placeholder="邮箱（暂不支持）"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-dim)',
              fontSize: 13,
              padding: '10px 14px',
              cursor: 'not-allowed',
            }}
          />
          <input
            disabled
            type="password"
            placeholder="密码（暂不支持）"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-dim)',
              fontSize: 13,
              padding: '10px 14px',
              cursor: 'not-allowed',
            }}
          />
          <button
            onClick={handleSkip}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px dashed var(--accent)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent)',
              fontSize: 13,
              padding: '10px 14px',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            → 跳过登录（开发模式）
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
          真实登录将在后端 auth 完成后启用
        </p>
      </div>
    </div>
  )
}
