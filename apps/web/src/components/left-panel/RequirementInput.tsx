import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProject, useAuthStore, selectToken, api } from '@forge/core'
import { useWorkspaceStore, selectUserInput } from '../../store/workspace-store'
import { toast } from '../../store/toast-store'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

const PLACEHOLDER_EXAMPLES = [
  '我需要一个报销申请系统',
  '做一个任务管理 App',
  '我想要一个预约系统',
  '帮我做一个简单的电商后台',
]

export function RequirementInput() {
  const userInput = useWorkspaceStore(selectUserInput)
  const setUserInput = useWorkspaceStore((s) => s.setUserInput)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const token = useAuthStore(selectToken)
  const { mutate: createProject, isPending: isCreating } = useCreateProject()
  const navigate = useNavigate()

  const [placeholder, setPlaceholder] = useState(PLACEHOLDER_EXAMPLES[0]!)
  const [isStarting, setIsStarting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % PLACEHOLDER_EXAMPLES.length
      setPlaceholder(PLACEHOLDER_EXAMPLES[i]!)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [userInput])

  const isLoading = isCreating || isStarting

  const handleSubmit = () => {
    if (!userInput.trim() || isLoading) return
    setIsStarting(true)

    const name = userInput.length > 40 ? userInput.slice(0, 40) + '...' : userInput

    createProject(name, {
      onSuccess: async (result) => {
        const projectId = result?.data?.id
        if (!projectId) {
          setIsStarting(false)
          toast.error('创建项目失败，请重试')
          return
        }
        try {
          await api.post(`/api/v1/projects/${projectId}/tasks`, { prompt: userInput }, token ?? undefined)
        } catch {
          setIsStarting(false)
          toast.error('启动 Agent 失败，请重试')
          return
        }
        startGeneration(projectId)
        navigate(`/projects/${projectId}`)
      },
      onError: () => {
        setIsStarting(false)
        toast.error('创建项目失败，请检查网络后重试')
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6">
      <div className="animate-fade-in">
        <h2 className="mb-2 text-xl font-semibold tracking-tight">描述你想做的 App</h2>
        <p className="text-sm text-muted-foreground">AI 会帮你补全细节，再由 Agent 团队协作生成</p>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Textarea
          ref={textareaRef}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={4}
          className="min-h-[120px] resize-none border-border/60 bg-background/50 text-sm leading-relaxed focus-visible:ring-primary/30"
        />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
        <Button
          onClick={handleSubmit}
          disabled={!userInput.trim() || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              启动中...
            </span>
          ) : (
            <span>生成应用 <kbd className="ml-1.5 rounded bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] font-mono">⌘↵</kbd></span>
          )}
        </Button>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">示例</p>
        <div className="flex flex-col gap-1">
          {PLACEHOLDER_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setUserInput(ex)}
              className="group flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            >
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary" />
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
