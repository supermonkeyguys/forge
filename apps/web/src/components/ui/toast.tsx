import { useToastStore } from '../../store/toast-store'
import { Icons } from './icons'
import { cn } from '../../lib/utils'

const VARIANT_STYLES = {
  success: {
    bar: 'bg-green-500',
    icon: 'text-green-400',
    border: 'border-green-500/20',
  },
  error: {
    bar: 'bg-destructive',
    icon: 'text-destructive',
    border: 'border-destructive/20',
  },
  info: {
    bar: 'bg-primary',
    icon: 'text-primary',
    border: 'border-border/60',
  },
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const styles = VARIANT_STYLES[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto relative flex w-80 items-center gap-3 overflow-hidden rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md',
              'animate-toast-in',
              styles.border,
            )}
          >
            {/* Colored left bar */}
            <div className={cn('absolute left-0 inset-y-0 w-1 rounded-l-xl', styles.bar)} />

            {/* Icon */}
            <div className={cn('shrink-0 pl-1', styles.icon)}>
              {t.variant === 'success' && <Icons.CheckCircle className="h-4 w-4" />}
              {t.variant === 'error' && <Icons.AlertTriangle className="h-4 w-4" />}
              {t.variant === 'info' && <Icons.Sparkles className="h-4 w-4" />}
            </div>

            {/* Message */}
            <p className="flex-1 text-sm text-foreground/90">{t.message}</p>

            {/* Close */}
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <Icons.X className="h-3.5 w-3.5" />
            </button>

            {/* Auto-dismiss progress bar */}
            <div className={cn('absolute bottom-0 left-0 h-[2px] animate-toast-progress rounded-full', styles.bar)} />
          </div>
        )
      })}
    </div>
  )
}
