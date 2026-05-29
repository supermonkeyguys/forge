import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore, selectUserInput } from '../../store/workspace-store'
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
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)

  const [placeholder, setPlaceholder] = useState(PLACEHOLDER_EXAMPLES[0]!)
  const [isLoading, setIsLoading] = useState(false)
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

  const handleSubmit = async () => {
    if (!userInput.trim() || isLoading) return
    setIsLoading(true)

    try {
      await new Promise((r) => setTimeout(r, 800))

      const mockDraft = {
        title: userInput.length > 20 ? userInput.slice(0, 20) + '...' : userInput,
        description: userInput,
        business_domain: 'custom-app',
        constraints: { auth: true, database: true, file_upload: false, email: false, payments: false },
        clarifying_questions: [],
        features: [
          {
            id: 'F001',
            name: '用户认证',
            confidence: 'high' as const,
            acceptance_criteria: ['支持邮箱+密码登录', '错误提示清晰', '登录成功跳转首页'],
            out_of_scope: [],
            selected: true,
          },
          {
            id: 'F002',
            name: '核心功能',
            confidence: 'high' as const,
            acceptance_criteria: ['用户可以创建记录', '支持编辑和删除', '列表分页展示'],
            out_of_scope: [],
            selected: true,
          },
          {
            id: 'F003',
            name: '数据导出',
            confidence: 'medium' as const,
            acceptance_criteria: ['支持导出为 CSV', '导出范围可筛选'],
            out_of_scope: [],
            selected: true,
          },
          {
            id: 'F004',
            name: '高级分析报表',
            confidence: 'low' as const,
            acceptance_criteria: ['图表展示趋势数据'],
            out_of_scope: [],
            selected: false,
          },
        ],
      }

      setDraftSpec(mockDraft)
      setPhase('pm-review')
    } catch {
      // TODO: error state
    } finally {
      setIsLoading(false)
    }
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
              分析需求中...
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
