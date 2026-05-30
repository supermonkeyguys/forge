import { useSettingsStore, THEME_PRESETS } from '../../../store/settings-store'
import { cn } from '../../../lib/utils'
import { GlassCard } from './GlassCard'

export function AppearanceSection() {
  const { themeColor, setThemeColor } = useSettingsStore()

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[17px] font-semibold text-white/88">外观</h1>
      <GlassCard>
        <p className="mb-3 text-[11.5px] font-medium text-white/40">主题色</p>
        <div className="flex gap-5">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              onClick={() => setThemeColor(preset.hex)}
              className="flex flex-col items-center gap-2"
              title={preset.label}
            >
              <span
                className={cn(
                  'block h-8 w-8 rounded-full transition-transform hover:scale-110',
                  themeColor === preset.hex &&
                    'ring-2 ring-white/60 ring-offset-2 ring-offset-background',
                )}
                style={{ background: preset.hex }}
              />
              <span className="text-[11px] text-white/30">{preset.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-white/25">
          选择后立即生效，通过修改 CSS 变量{' '}
          <code className="text-white/40">--primary</code> 应用到全站，刷新保留。
        </p>
      </GlassCard>
    </div>
  )
}
