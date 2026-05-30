import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface DarkInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const DarkInput = forwardRef<HTMLInputElement, DarkInputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2',
        'font-mono text-[13px] text-white/65',
        'outline-none focus:border-primary/50',
        className,
      )}
      {...props}
    />
  ),
)
DarkInput.displayName = 'DarkInput'
