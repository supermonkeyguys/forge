import { Icons } from '../../../components/ui/icons'
import { cn } from '../../../lib/utils'

type SettingsSection = 'api' | 'appearance' | 'kb'

export function SettingsNav({
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

      <NavGroup label="知识">
        <NavItem
          icon={<Icons.Database className="h-3.5 w-3.5" />}
          label="知识库"
          active={active === 'kb'}
          onClick={() => onSelect('kb')}
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
