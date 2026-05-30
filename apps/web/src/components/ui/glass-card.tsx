import { cn } from '../../lib/utils'

export function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] p-6',
        'shadow-[0_4px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]',
        className,
      )}
      style={{
        background: 'rgba(255,255,255,0.045)',
        backdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {children}
    </div>
  )
}
