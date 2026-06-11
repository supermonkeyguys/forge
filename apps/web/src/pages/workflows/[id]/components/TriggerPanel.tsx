import { useState } from 'react'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { Icons } from '../../../../components/ui/icons'
import type { WorkflowTrigger, WorkflowStatus } from '@forge/core'

const TIMEZONES = [
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'UTC',
  'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin',
]

function cronHint(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return ''
  const min  = parts[0] as string
  const hour = parts[1] as string
  const dow  = parts[4] as string
  if (min === '*' && hour === '*') return '每分钟'
  if (min.startsWith('*/')) return `每 ${min.slice(2)} 分钟`
  if (hour !== '*' && min !== '*' && dow === '*') return `每天 ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  if (hour !== '*' && min !== '*' && dow === '1-5') return `工作日 ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  return expr
}

interface Props {
  trigger:  WorkflowTrigger
  status:   WorkflowStatus
  onSave:   (trigger: WorkflowTrigger, status: WorkflowStatus) => void
  onClose:  () => void
}

export function TriggerPanel({ trigger, status, onSave, onClose }: Props) {
  const [type,       setType]       = useState<'manual' | 'schedule'>(
    trigger.type === 'schedule' ? 'schedule' : 'manual'
  )
  const [cronExpr,   setCronExpr]   = useState<string>(
    (trigger.config?.['cron'] as string) ?? '0 8 * * *'
  )
  const [tz,         setTz]         = useState<string>(
    (trigger.config?.['tz'] as string) ?? 'Asia/Shanghai'
  )
  const [active,     setActive]     = useState(status === 'active')

  const hint = type === 'schedule' ? cronHint(cronExpr) : ''

  const handleSave = () => {
    const newTrigger: WorkflowTrigger =
      type === 'schedule'
        ? { type: 'schedule', config: { cron: cronExpr, tz } }
        : { type: 'manual' }
    onSave(newTrigger, active ? 'active' : 'draft')
  }

  return (
    <div className="absolute right-0 top-10 z-20 w-80 rounded-xl border border-border bg-background shadow-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">触发设置</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">触发方式</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="manual" checked={type === 'manual'} onChange={() => setType('manual')} />
            手动
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="schedule" checked={type === 'schedule'} onChange={() => setType('schedule')} />
            定时
          </label>
        </div>
      </div>

      {type === 'schedule' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cron 表达式</label>
            <Input
              value={cronExpr}
              onChange={e => setCronExpr(e.target.value)}
              placeholder="0 8 * * *"
              className="font-mono text-sm"
            />
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">时区</label>
            <select
              value={tz}
              onChange={e => setTz(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">状态</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={!active} onChange={() => setActive(false)} />
                草稿（不自动触发）
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={active} onChange={() => setActive(true)} />
                启用
              </label>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
        <Button size="sm" onClick={handleSave}>保存触发设置</Button>
      </div>
    </div>
  )
}
