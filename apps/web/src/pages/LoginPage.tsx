import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin, useDevLogin, ApiError } from '@forge/core'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Icons } from '../components/ui/icons'

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
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-1/4 -left-1/4 h-[500px] w-[500px] rounded-full bg-primary/3 blur-[100px]" />
        <div className="noise absolute inset-0" />
      </div>

      {/* Login card */}
      <div className="animate-slide-up relative z-10 w-full max-w-[380px] px-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Icons.Hammer className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gradient">Forge</h1>
              <p className="mt-1 text-sm text-muted-foreground">AI 应用生成平台</p>
            </div>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">邮箱</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                type="email"
                disabled={isPending}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={error ? 'border-destructive/60 focus-visible:ring-destructive/30' : ''}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">密码</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                disabled={isPending}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={error ? 'border-destructive/60 focus-visible:ring-destructive/30' : ''}
              />
            </div>

            {error && (
              <div className="animate-fade-in rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <Button
              onClick={handleLogin}
              disabled={isPending}
              className="mt-2 w-full"
            >
              {loginPending ? '登录中...' : '登录'}
            </Button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-[11px] text-muted-foreground">或</span>
              </div>
            </div>

            <button
              onClick={handleDevLogin}
              disabled={isPending}
              className="group flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 opacity-70 group-hover:opacity-100" />
              {devPending ? '登录中...' : '快速登录（开发模式）'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-muted-foreground/50">
          输入需求 → Agent 协作 → 一键生成应用
        </p>
      </div>
    </div>
  )
}
