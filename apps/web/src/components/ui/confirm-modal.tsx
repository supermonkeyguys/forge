import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ConfirmModalProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  dangerous?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  dangerous = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Two-phase animation: 'entering' | 'visible' | 'leaving' | 'hidden'
  const [phase, setPhase] = useState<'entering' | 'visible' | 'leaving' | 'hidden'>('hidden')
  const prevOpen = useRef(open)

  useEffect(() => {
    if (open && !prevOpen.current) {
      // open → enter
      setPhase('entering')
      const t = requestAnimationFrame(() => setPhase('visible'))
      prevOpen.current = open
      return () => cancelAnimationFrame(t)
    }
    if (!open && prevOpen.current) {
      // close → leave
      setPhase('leaving')
      const t = setTimeout(() => setPhase('hidden'), 260)
      prevOpen.current = open
      return () => clearTimeout(t)
    }
    prevOpen.current = open
  }, [open])

  if (phase === 'hidden') return null

  const isIn = phase === 'visible'

  return (
    /* Backdrop */
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-200',
        isIn ? 'bg-black/50 backdrop-blur-[2px]' : 'bg-black/0 backdrop-blur-none',
      )}
      onClick={onCancel}
    >
      {/* Panel */}
      <div
        className={cn(
          'w-full max-w-[360px] rounded-2xl border border-white/[0.09] p-6',
          'shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]',
          'transition-all duration-[260ms]',
          isIn
            ? 'translate-y-0 scale-100 opacity-100'
            : 'translate-y-4 scale-95 opacity-0',
        )}
        style={{
          background: 'rgba(18,20,28,0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h2 className="mb-2 text-[15px] font-semibold text-white/90">{title}</h2>

        {/* Description */}
        {description && (
          <p className="mb-6 text-[13px] leading-relaxed text-white/45">{description}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 text-[13px] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/75"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors',
              dangerous
                ? 'bg-red-500/80 text-white hover:bg-red-500'
                : 'bg-primary/80 text-primary-foreground hover:bg-primary',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
