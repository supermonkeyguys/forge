import { Component } from 'react'
import type { ReactNode } from 'react'
import { Icons } from './icons'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10">
          <Icons.AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <p className="text-sm font-medium">页面出现错误</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            {error.message || '发生了未知错误'}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          重试
        </button>
      </div>
    )
  }
}
