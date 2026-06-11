import { useSetKBStatus, useDeleteKBEntry } from '@forge/core'
import type { KBEntry } from '@forge/core'
import { cn } from '../../../lib/utils'
import { toast } from '../../../store/toast-store'

const TYPE_LABELS: Record<string, string> = {
  principle: '原则', spec: '设计方案', test_asset: '测试资产', past_output: '过往产出',
}

const TYPE_COLORS: Record<string, string> = {
  principle:   'text-amber-300 border-amber-500/30 bg-amber-500/10',
  spec:        'text-blue-300 border-blue-500/30 bg-blue-500/10',
  test_asset:  'text-red-300 border-red-500/30 bg-red-500/10',
  past_output: 'text-green-300 border-green-500/30 bg-green-500/10',
}

interface Props { projectId: string; entries: KBEntry[] }

export function KBList({ projectId, entries }: Props) {
  const setStatus  = useSetKBStatus(projectId)
  const deleteEntry = useDeleteKBEntry(projectId)

  const pending  = entries.filter((e) => e.status === 'pending' || e.status === 'processing')
  const verified = entries.filter((e) => e.status === 'verified')

  if (entries.length === 0) {
    return <p className="py-8 text-center text-[12px] text-white/20">还没有知识条目</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-amber-400/60">
            待确认（{pending.length}）
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((e) => (
              <KBCard
                key={e.id}
                entry={e}
                onVerify={() => setStatus.mutate({ id: e.id, action: 'verify' }, {
                  onSuccess: () => toast.success('已确认'),
                  onError:   () => toast.error('操作失败'),
                })}
                onDelete={() => deleteEntry.mutate(e.id, {
                  onSuccess: () => toast.success('已删除'),
                  onError:   () => toast.error('删除失败'),
                })}
              />
            ))}
          </div>
        </div>
      )}
      {verified.length > 0 && (
        <div>
          {pending.length > 0 && (
            <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/25">
              已验证（{verified.length}）
            </div>
          )}
          <div className="flex flex-col gap-2">
            {verified.map((e) => (
              <KBCard
                key={e.id}
                entry={e}
                onDeprecate={() => setStatus.mutate({ id: e.id, action: 'deprecate' }, {
                  onSuccess: () => toast.success('已废弃'),
                  onError:   () => toast.error('操作失败'),
                })}
                onDelete={() => deleteEntry.mutate(e.id, {
                  onSuccess: () => toast.success('已删除'),
                  onError:   () => toast.error('删除失败'),
                })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KBCard({ entry, onVerify, onDeprecate, onDelete }: {
  entry: KBEntry
  onVerify?: () => void
  onDeprecate?: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn(
      'rounded-[7px] border p-3',
      entry.status === 'pending' || entry.status === 'processing'
        ? 'border-amber-500/20 bg-amber-500/[0.03]'
        : 'border-white/[0.06] bg-white/[0.02]',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium text-white/80">{entry.title}</span>
            <span className={cn(
              'flex-shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
              TYPE_COLORS[entry.type] ?? 'border-white/10 bg-white/5 text-white/30',
            )}>
              {TYPE_LABELS[entry.type] ?? entry.type}
            </span>
            {entry.status === 'processing' && (
              <span className="text-[9px] text-white/30">处理中…</span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/40">{entry.content}</p>
          {entry.sourceAgent && (
            <p className="mt-1 text-[10px] text-white/20">来源：{entry.sourceAgent}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {onVerify && (
            <button onClick={onVerify} className="rounded-[4px] border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] text-green-400 hover:bg-green-500/15">
              确认
            </button>
          )}
          {onDeprecate && (
            <button onClick={onDeprecate} className="rounded-[4px] border border-white/[0.06] px-2 py-1 text-[10px] text-white/25 hover:text-white/40">
              废弃
            </button>
          )}
          <button onClick={onDelete} className="rounded-[4px] border border-white/[0.06] px-2 py-1 text-[10px] text-white/25 hover:border-red-500/30 hover:text-red-400">
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
