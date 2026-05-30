import type { ReactNode } from 'react'

interface SettingSectionProps {
  title: string
  children: ReactNode
}

export function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[17px] font-semibold text-white/88">{title}</h1>
      {children}
    </div>
  )
}
