import { useState } from 'react'
import { useProjects, useKBEntries } from '@forge/core'
import { KBList } from './components/KBList'
import { KBAddForm } from './components/KBAddForm'
import { cn } from '../../lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'

const TYPE_FILTERS = [
  { value: '', label: '全部' },
  { value: 'principle', label: '原则' },
  { value: 'spec', label: '设计方案' },
  { value: 'test_asset', label: '测试资产' },
  { value: 'past_output', label: '过往产出' },
]

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'verified', label: '已验证' },
]

export function KnowledgePage() {
  const { data: projectsPage } = useProjects()
  const projects = projectsPage?.data ?? []
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const effectiveProjectId = selectedProjectId || projects[0]?.id || ''
  const { data: entries = [] } = useKBEntries(effectiveProjectId, {
    type: typeFilter || undefined,
    status: statusFilter || undefined,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div>
          <h1 className="text-[15px] font-semibold text-white/90">知识库</h1>
          <p className="mt-0.5 text-[12px] text-white/35">Agent 执行任务时自动检索相关知识</p>
        </div>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-300 hover:bg-violet-500/15"
        >
          {isAdding ? '收起' : '+ 添加知识'}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 1 && (
            <Select value={effectiveProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-8 w-auto rounded-[6px] border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white/70 focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[11px] transition-colors',
                  typeFilter === f.value ? 'bg-white/[0.08] text-white/80' : 'text-white/30 hover:text-white/50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[11px] transition-colors',
                  statusFilter === f.value ? 'bg-white/[0.08] text-white/80' : 'text-white/30 hover:text-white/50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isAdding && effectiveProjectId && (
          <KBAddForm projectId={effectiveProjectId} />
        )}

        <KBList projectId={effectiveProjectId} entries={entries} />
      </div>
    </div>
  )
}
