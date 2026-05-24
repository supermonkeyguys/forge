/**
 * RequirementInput — the first thing the user sees.
 * A textarea + send button. On submit, calls the API to create a project
 * and transitions to pm-review phase.
 */

import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore, selectUserInput } from '../../store/workspace-store.js'
import { useCreateProject } from '@forge/core'

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

  // Cycle placeholder examples
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % PLACEHOLDER_EXAMPLES.length
      setPlaceholder(PLACEHOLDER_EXAMPLES[i]!)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // Auto-resize textarea
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
      // In Phase 1 (no Go API yet): mock the PM draft response
      // This will be replaced with a real API call once Go API is ready
      await new Promise((r) => setTimeout(r, 800)) // simulate network

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 20px', gap: 24 }}>
      {/* Hero text */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          描述你想做的 App
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          AI 会帮你补全细节，再由 Agent 团队协作生成
        </p>
      </div>

      {/* Textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={4}
          style={{
            width: '100%',
            minHeight: 120,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: 14,
            lineHeight: 1.6,
            padding: '12px 14px',
            resize: 'none',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!userInput.trim() || isLoading}
        style={{
          background: userInput.trim() && !isLoading ? 'var(--accent)' : 'var(--bg-card)',
          color: userInput.trim() && !isLoading ? '#fff' : 'var(--text-muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'all 0.15s',
          cursor: userInput.trim() && !isLoading ? 'pointer' : 'not-allowed',
        }}
      >
        {isLoading ? (
          <>
            <Spinner /> 分析需求中...
          </>
        ) : (
          <>生成应用 <kbd style={{ fontSize: 11, opacity: 0.6 }}>⌘↵</kbd></>
        )}
      </button>

      {/* Examples */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>试试这些：</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PLACEHOLDER_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setUserInput(ex)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 12,
                textAlign: 'left',
                padding: '4px 0',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              → {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      width: 14,
      height: 14,
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
