import { useState, useRef } from 'react'
import { useCreateKBEntry, useIngestKB } from '@forge/core'
import { cn } from '../../../lib/utils'
import { toast } from '../../../store/toast-store'
import { Button } from '../../../components/ui/button'
import { DarkInput } from '../../../components/ui/dark-input'
import { Textarea } from '../../../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'

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
        {
          onSuccess: () => { toast.success('知识条目已添加'); setTitle(''); setContent('') },
          onError:   () => toast.error('添加失败，请稍后重试'),
        },
      )
    } else if (mode === 'url') {
      ingestKB.mutate({ type: 'url', url }, {
        onSuccess: () => { toast.success('URL 已提交解析'); setUrl('') },
        onError:   () => toast.error('提交失败，请稍后重试'),
      })
    } else if (mode === 'file' && fileRef.current?.files?.[0]) {
      ingestKB.mutate(
        { type: 'file', file: fileRef.current.files[0] },
        {
          onSuccess: () => { toast.success('文件已上传解析'); if (fileRef.current) fileRef.current.value = '' },
          onError:   () => toast.error('上传失败，请稍后重试'),
        },
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
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-7 w-auto rounded-[5px] border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/60 focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="principle">原则</SelectItem>
            <SelectItem value="spec">设计方案</SelectItem>
            <SelectItem value="test_asset">测试资产</SelectItem>
            <SelectItem value="past_output">过往产出</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'text' && (
        <>
          <DarkInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            className="w-full font-sans text-white/80 focus:border-white/15"
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容"
            rows={3}
            className="resize-none text-[13px] text-white/60 focus-visible:ring-0 focus-visible:border-white/15"
          />
        </>
      )}

      {mode === 'url' && (
        <DarkInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/doc"
          className="w-full font-sans text-white/60 focus:border-white/15"
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
        <Button
          variant="violet"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-4"
        >
          {isPending ? '处理中…' : mode === 'url' ? '提取摘要' : mode === 'file' ? '上传解析' : '添加'}
        </Button>
      </div>
    </div>
  )
}
