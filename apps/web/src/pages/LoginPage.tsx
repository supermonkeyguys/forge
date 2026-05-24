import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin, useDevLogin, ApiError } from '@forge/core'

export function LoginPage() {
  const navigate = useNavigate()
  const { mutate: login, isPending: loginPending } = useLogin()
  const { mutate: devLogin, isPending: devPending } = useDevLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    if (!email || !password) {
      setError('请输入邮箱和密码')
      return
    }
    setError('')
    login(
      { email, password },
      {
        onSuccess: () => navigate('/projects'),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            setError('邮箱或密码错误')
          } else {
            setError('登录失败，请稍后重试')
          }
        },
      },
    )
  }

  const handleDevLogin = () => {
    setError('')
    devLogin(undefined, {
      onSuccess: () => navigate('/projects'),
      onError: () => setError('快速登录失败，请检查后端服务是否启动'),
    })
  }

  const isPending = loginPending || devPending

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔨</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Forge</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI 应用生成平台</p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            type="email"
            disabled={isPending}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${error ? 'var(--red, #ef4444)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 14px',
              outline: 'none',
            }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            type="password"
            disabled={isPending}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${error ? 'var(--red, #ef4444)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 14px',
              outline: 'none',
            }}
          />

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red, #ef4444)', margin: 0 }}>{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={isPending}
            style={{
              width: '100%',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              padding: '10px 14px',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {loginPending ? '登录中...' : '登录'}
          </button>

          <button
            onClick={handleDevLogin}
            disabled={isPending}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px dashed var(--accent)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent)',
              fontSize: 12,
              padding: '8px 14px',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {devPending ? '登录中...' : '→ 快速登录（开发模式）'}
          </button>
        </div>
      </div>
    </div>
  )
}
