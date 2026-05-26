import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin, useDevLogin, ApiError } from '@forge/core'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'

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
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-80">
        <CardContent className="pt-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="text-4xl">🔨</div>
            <h1 className="text-xl font-bold">Forge</h1>
            <p className="text-sm text-muted-foreground">AI 应用生成平台</p>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              type="email"
              disabled={isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={error ? 'border-destructive' : ''}
            />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              type="password"
              disabled={isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={error ? 'border-destructive' : ''}
            />

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <Button
              onClick={handleLogin}
              disabled={isPending}
              className="w-full"
            >
              {loginPending ? '登录中...' : '登录'}
            </Button>

            <Button
              variant="outline"
              onClick={handleDevLogin}
              disabled={isPending}
              className="w-full border-dashed"
            >
              {devPending ? '登录中...' : '→ 快速登录（开发模式）'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
