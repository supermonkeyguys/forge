import { useState } from 'react'
import { useGetSettings, useSaveSettings, useResetApiKey } from '@forge/core'
import { useSettingsStore, THEME_PRESETS } from '../store/settings-store'
import { Icons } from '../components/ui/icons'
import { toast } from '../store/toast-store'
import { cn } from '../lib/utils'

type SettingsSection = 'api' | 'appearance'

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('api')

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <SettingsNav active={activeSection} onSelect={setActiveSection} />
      <div className="flex-1 overflow-y-auto p-10">
        {activeSection === 'api' && <APIConfigSection />}
        {activeSection === 'appearance' && <AppearanceSection />}
      </div>
    </div>
  )
}

function AppSidebar() {
  return (
    <nav
      className="w-[200px] flex-shrink-0 border-r border-white/[0.06] bg-white/[0.025]"
      style={{ backdropFilter: 'blur(24px) saturate(160%)' }}
    >
      <div className="p-3 pt-4">
        <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-widest text-white/25">
          工作区
        </p>
        <SidebarItem icon={<Icons.LayoutGrid className="h-3.5 w-3.5" />} label="项目" href="/projects" />
        <SidebarItem icon={<Icons.MessageSquare className="h-3.5 w-3.5" />} label="对话" href="#" />
        <p className="mb-1 mt-3 px-2 text-[10.5px] font-semibold uppercase tracking-widest text-white/25">
          配置
        </p>
        <SidebarItem icon={<Icons.Cog className="h-3.5 w-3.5" />} label="设置" href="/settings" active />
      </div>
    </nav>
  )
}

function SidebarItem({
  icon, label, href, active,
}: {
  icon: React.ReactNode; label: string; href: string; active?: boolean
}) {
  return (
    <a
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-primary/10 text-foreground'
          : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
      )}
    >
      <span className={cn('opacity-55', active && 'opacity-100')}>{icon}</span>
      {label}
    </a>
  )
}

function SettingsNav({
  active, onSelect,
}: {
  active: SettingsSection; onSelect: (s: SettingsSection) => void
}) {
  return (
    <nav
      className="w-[210px] flex-shrink-0 border-r border-white/[0.06] bg-white/[0.03] py-5"
      style={{ backdropFilter: 'blur(24px) saturate(160%)' }}
    >
      <h2 className="mb-4 px-4 text-[15px] font-semibold text-white/85">设置</h2>

      <NavGroup label="AI 服务">
        <NavItem
          icon={<Icons.KeyRound className="h-3.5 w-3.5" />}
          label="API 配置"
          active={active === 'api'}
          onClick={() => onSelect('api')}
        />
      </NavGroup>

      <NavGroup label="偏好">
        <NavItem
          icon={<Icons.Palette className="h-3.5 w-3.5" />}
          label="外观"
          active={active === 'appearance'}
          onClick={() => onSelect('appearance')}
        />
        <NavItem
          icon={<Icons.Bell className="h-3.5 w-3.5" />}
          label="通知"
          active={false}
          onClick={() => {}}
          disabled
        />
      </NavGroup>
    </nav>
  )
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 px-4 text-[10.5px] font-semibold uppercase tracking-widest text-white/25">
        {label}
      </p>
      {children}
    </div>
  )
}

function NavItem({
  icon, label, active, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-md mx-1.5 px-2.5 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-primary/13 text-white/92'
          : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className={cn('opacity-55', active && 'opacity-100')}>{icon}</span>
      {label}
    </button>
  )
}

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
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

function APIConfigSection() {
  const { data, isLoading } = useGetSettings()
  const { mutate: save, isPending: isSaving } = useSaveSettings()
  const { mutate: resetKey, isPending: isResetting } = useResetApiKey()

  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [initialized, setInitialized] = useState(false)

  if (!isLoading && data && !initialized) {
    setBaseUrl(data.baseUrl)
    setInitialized(true)
  }

  const handleSave = () => {
    save(
      { baseUrl, apiKey },
      {
        onSuccess: () => {
          toast.success('配置已保存')
          setApiKey('')
        },
        onError: () => toast.error('保存失败，请稍后重试'),
      },
    )
  }

  const handleReset = () => {
    resetKey(undefined, {
      onSuccess: () => toast.success('API Key 已清除'),
      onError: () => toast.error('操作失败'),
    })
  }

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[17px] font-semibold text-white/88">API 配置</h1>
      <GlassCard>
        <div className="mb-4">
          <label className="mb-1.5 block text-[11.5px] font-medium text-white/40">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[13px] text-white/65 outline-none focus:border-primary/50"
          />
        </div>

        <div className="mb-1">
          <label className="mb-1.5 block text-[11.5px] font-medium text-white/40">API Key</label>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data?.hasApiKey ? '输入新 Key 以覆盖' : 'sk-...'}
              className="flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[13px] text-white/65 outline-none focus:border-primary/50"
            />
            {data?.hasApiKey && (
              <span className="flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400 whitespace-nowrap">
                <Icons.Check className="h-3 w-3" />
                已配置
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-white/25">
            Key 加密存储于服务器，前端不可读取。如需更换请直接填入新值覆盖。
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.05] pt-5">
          {data?.hasApiKey && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-[13px] text-white/50 transition-colors hover:text-white/75 disabled:opacity-40"
            >
              重置
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-[0_2px_12px] shadow-primary/35 transition-opacity disabled:opacity-40"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </GlassCard>
    </div>
  )
}

function AppearanceSection() {
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
