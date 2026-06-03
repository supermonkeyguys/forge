import { useState } from 'react'
import { useKBEntries, useCreateKBEntry, useVerifyKBEntry, useDeleteKBEntry } from '@forge/core'
import type { KBEntry } from '@forge/core'
import { cn } from '../../../lib/utils'

export function KBSection() {
  const { data: entries = [] } = useKBEntries()
  const createEntry = useCreateKBEntry()
  const verifyEntry = useVerifyKBEntry()
  const deleteEntry = useDeleteKBEntry()
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const pending = entries.filter((e) => !e.verified)
  const verified = entries.filter((e) => e.verified)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-white/90">公司知识库</h2>
          <p className="mt-0.5 text-[12px] text-white/40">
            所有 Agent 在执行任务时会自动检索相关条目
          </p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-300 hover:bg-violet-500/15"
        >
          + 添加知识
        </button>
      </div>

      {isAdding && (
        <div className="flex flex-col gap-3 rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="标题"
            className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/15"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="内容"
            rows={4}
            className="w-full resize-none rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/60 outline-none focus:border-white/15"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-[12px] text-white/35"
            >
              取消
            </button>
            <button
              onClick={() =>
                createEntry.mutate(
                  { title: newTitle, content: newContent, tags: [] },
                  {
                    onSuccess: () => {
                      setNewTitle('')
                      setNewContent('')
                      setIsAdding(false)
                    },
                  },
                )
              }
              disabled={!newTitle.trim() || !newContent.trim() || createEntry.isPending}
              className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-300 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-amber-400/60">
            待确认（Agent 提交）
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((e) => (
              <KBCard
                key={e.id}
                entry={e}
                onVerify={() => verifyEntry.mutate(e.id)}
                onDelete={() => deleteEntry.mutate(e.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        {verified.length > 0 && (
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/25">
            已验证
          </div>
        )}
        <div className="flex flex-col gap-2">
          {verified.map((e) => (
            <KBCard key={e.id} entry={e} onDelete={() => deleteEntry.mutate(e.id)} />
          ))}
        </div>
        {entries.length === 0 && !isAdding && (
          <div className="py-6 text-center text-[12px] text-white/20">
            还没有知识条目。添加公司背景、规范或操作手册。
          </div>
        )}
      </div>
    </div>
  )
}

function KBCard({
  entry,
  onVerify,
  onDelete,
}: {
  entry: KBEntry
  onVerify?: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-[7px] border p-3',
        entry.verified
          ? 'border-white/[0.06] bg-white/[0.02]'
          : 'border-amber-500/20 bg-amber-500/[0.04]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-[13px] font-medium text-white/80">{entry.title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-white/40">{entry.content}</div>
          {entry.sourceAgent && (
            <div className="mt-1 text-[10px] text-white/20">来源：{entry.sourceAgent}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!entry.verified && onVerify && (
            <button
              onClick={onVerify}
              className="rounded-[4px] border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] text-green-400 hover:bg-green-500/15"
            >
              确认
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-[4px] border border-white/[0.06] bg-transparent px-2 py-1 text-[10px] text-white/30 hover:border-red-500/30 hover:text-red-400"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
