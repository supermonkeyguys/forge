import { useState, useRef } from 'react'
import { useCreateKBEntry, useIngestKB } from '@forge/core'
import { cn } from '../../../lib/utils'

type InputMode = 'text' | 'url' | 'file'

interface Props { projectId: string }

export function KBAddForm({ projectId }: Props) {
  const [mode, setMode] = useState<InputMode>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('spec')
  const fileRef = useRef<HTMLInputElement>(null)
  const createEntry = useCreateKBEntry(projectId)
  const ingestKB = useIngestKB(projectId)

  const handleSubmit = () => {
    if (mode === 'text') {
      createEntry.mutate(
        { title, content, type },
        { onSuccess: () => { setTitle(''); setContent('') } },
      )
    } else if (mode === 'url') {
      ingestKB.mutate({ type: 'url', url }, { onSuccess: () => setUrl('') })
    } else if (mode === 'file' && fileRef.current?.files?.[0]) {
      ingestKB.mutate(
        { type: 'file', file: fileRef.current.files[0] },
        { onSuccess: () => { if (fileRef.current) fileRef.current.value = '' } },
      )
    }
  }

  const isPending = createEntry.isPending || ingestKB.isPending
  const canSubmit = !isPending && (
    (mode === 'text' && title.trim() && content.trim()) ||
    (mode === 'url' && url.trim()) ||
    mode === 'file'
  )

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-1">
        {(['text', 'url', 'file'] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'rounded-[5px] px-3 py-1 text-[11px] transition-colors',
              mode === m
                ? 'border border-violet-500/30 bg-violet-500/15 text-violet-300'
                : 'text-white/30 hover:text-white/50',
            )}
          >
            {m === 'text' ? '文本' : m === 'url' ? '网址' : '文件'}
          </button>
        ))}
        <div className="flex-1" />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-[5px] border border-white/[0.08] bg-[#1a1a1a] px-2 py-1 text-[11px] text-white/60 outline-none"
        >
          <option value="principle">原则</option>
          <option value="spec">设计方案</option>
          <option value="test_asset">测试资产</option>
          <option value="past_output">过往产出</option>
        </select>
      </div>

      {mode === 'text' && (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/15"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容"
            rows={3}
            className="w-full resize-none rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/60 outline-none focus:border-white/15"
          />
        </>
      )}

      {mode === 'url' && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/doc"
          className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/60 outline-none focus:border-white/15"
        />
      )}

      {mode === 'file' && (
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,.mdx"
          className="cursor-pointer text-[12px] text-white/40 file:mr-3 file:cursor-pointer file:rounded-[5px] file:border-0 file:bg-white/[0.06] file:px-3 file:py-1 file:text-[11px] file:text-white/50 file:hover:bg-white/[0.09]"
        />
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
        >
          {isPending ? '处理中…' : mode === 'url' ? '提取摘要' : mode === 'file' ? '上传解析' : '添加'}
        </button>
      </div>
    </div>
  )
}
